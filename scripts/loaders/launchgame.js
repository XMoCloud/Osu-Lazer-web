
(function attachURLLauncher(){
  function createStatusBanner(){
    const div = document.createElement('div');
    Object.assign(div.style,{
      position:'fixed', top:'16px', left:'50%', transform:'translateX(-50%)',
      padding:'12px 18px', background:'rgba(0,0,0,0.7)', color:'#fff',
      fontFamily:'Quicksand, sans-serif', letterSpacing:'0.04em', textTransform:'uppercase',
      fontSize:'14px', borderRadius:'999px', display:'none', zIndex:'2000'
    });
    document.body.appendChild(div); return div;
  }
  async function startFromURL(){
    try{
      const params = new URLSearchParams(window.location.search);
      const mapId = params.get('map');
      const diffName = params.get('diff');
      const diffBid = params.get('bid');
      if (!mapId || !diffName) return; 

      const statusEl = createStatusBanner();
      const show = (m)=>{ statusEl.textContent=m; statusEl.style.display='block'; };
      const hide = ()=>{ statusEl.style.display='none'; };

      show('Loading beatmap...');
      if (!window.osuMapStore){
        show('Beatmap storage unavailable.'); return;
      }
      const map = await window.osuMapStore.getMap(mapId);
      if (!map || !map.oszBlob){ show('Beatmap data not found. Please re-import the map.'); return; }

      const difficulty = (map.difficulties || []).find((d)=>{
        if (diffBid && d.bid) return String(d.bid) === String(diffBid);
        return (d.name || '').toLowerCase() === (diffName || '').toLowerCase();
      }) || (map.difficulties && map.difficulties[0]);

      const version = difficulty ? difficulty.name : diffName;
      const beatmapId = (difficulty && difficulty.bid) ? difficulty.bid : (diffBid || map.beatmapID || map.id || version);

      const sessionInfo = {
        mapId,
        diffName: version,
        diffBid: beatmapId ? String(beatmapId) : null,
        title: map.title || 'Unknown',
        artist: map.artist || '',
        creator: map.difficulties && map.difficulties.length ? (map.difficulties[0].creator || '') : '',
        coverBlob: Boolean(map.coverBlob)
      };
      try { sessionStorage.setItem('osu:lastSession', JSON.stringify(sessionInfo)); } catch(_) {}
      window.currentGameSession = sessionInfo;

      hide();

      const oszBlob = map.oszBlob;
      const bidStr = beatmapId ? String(beatmapId) : version;
      await window.launchGame(oszBlob, bidStr, version);
    }catch(_){ }
  }
  window.addEventListener('DOMContentLoaded', startFromURL);
})();


async function launchGame(osublob, beatmapid, version) {
  if (!osublob) throw new Error("No beatmap data provided.");
  if (!window.zip || !window.zip.fs) throw new Error("zip.fs is not available.");

  await waitForSkinReady().catch(() => {});

  
  const fs = new zip.fs.FS();
  await new Promise((resolve, reject) => {
    fs.root.importBlob(osublob, () => resolve(), (err) => reject(err || new Error("unzip failed")));
  }).catch((err) => { throw err; });

  const osu = new Osu(fs.root);
  osu.ondecoded = function () {
    createOsuMap(osu, beatmapid, version); 
  };
  osu.onerror = function () {};
  osu.load();
}


function createOsuMap(osu, beatmapid, version) {
  
  let trackid = -1;
  for (let i = 0; i < osu.tracks.length; ++i) {
    if (
      osu.tracks[i].metadata.BeatmapID == beatmapid ||
      (!osu.tracks[i].mode && osu.tracks[i].metadata.Version == version)
    ) {
      trackid = i;
    }
  }
  if (trackid === -1) return;

  
  if (window.__osuRunning__) return;
  window.__osuRunning__ = true;

  
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); return false; });
  document.body.classList.add("gaming");

  
  if (window.gamesettings) {
    window.gamesettings.refresh();
    window.gamesettings.loadToGame();
  }

  
  let pGameArea = document.getElementById("game-area");
  if (!pGameArea) {
    pGameArea = document.createElement("div");
    pGameArea.id = "game-area";
    pGameArea.hidden = true;
    document.body.appendChild(pGameArea);
  }
  const pMainPage = document.getElementById("main-page") || document.getElementById("main");
  const pNav = document.getElementById("main-nav") || document.getElementById("topBar");

  
  if (game.showhwmouse) {
    pGameArea.classList.remove("shownomouse");
    pGameArea.classList.remove("showhwmousemedium", "showhwmousesmall", "showhwmousetiny");
    if (game.cursorSize < 0.65) pGameArea.classList.add("showhwmousetiny");
    else if (game.cursorSize < 0.95) pGameArea.classList.add("showhwmousesmall");
    else pGameArea.classList.add("showhwmousemedium");
  } else {
    pGameArea.classList.add("shownomouse");
    pGameArea.classList.remove("showhwmousemedium", "showhwmousesmall", "showhwmousetiny");
  }

  
  if (pMainPage) pMainPage.setAttribute("hidden", "");
  if (pNav) pNav.setAttribute("style", "display: none");
  pGameArea.removeAttribute("hidden");

  
  try {
    if (!window.__launchSfxPlayedOnce__) {
      const sfx = new Audio('hitsounds/beatmapLaunch.mp3');
      sfx.volume = 0.6;
      sfx.play().catch(() => {});
      window.__launchSfxPlayedOnce__ = true;
    }
  } catch(_) {}

  
  var gameLoop = null;
  window.quitGame = function () {
    
    pGameArea.setAttribute("hidden", "");
    if (pMainPage) pMainPage.removeAttribute("hidden");
    if (pNav) pNav.removeAttribute("style");
    document.body.classList.remove("gaming");

    
    if (gameLoop) {
      cancelAnimationFrame(gameLoop);
      gameLoop = null;
    }
    window.animationRequestID && cancelAnimationFrame(window.animationRequestID);

    
    window.__osuRunning__ = false;
    window.game.scene = null;

    
    sessionStorage.setItem("osu:autoOpenBeatmaps", "1");
    try {
      const sessionInfo = window.currentGameSession || JSON.parse(sessionStorage.getItem('osu:lastSession') || '{}');
      if (sessionInfo && sessionInfo.mapId) {
        const payload = {
          mapId: String(sessionInfo.mapId)
        };
        if (sessionInfo.diffName) payload.diffName = String(sessionInfo.diffName);
        if (sessionInfo.diffBid) payload.diffBid = String(sessionInfo.diffBid);
        sessionStorage.setItem('osu:autoSelectMap', JSON.stringify(payload));
      } else {
        sessionStorage.removeItem('osu:autoSelectMap');
      }
    } catch (_) {
    }
    window.location.href = "index.html";
  };

  
  var playback = new Playback(window.game, osu, osu.tracks[trackid]);
  game.scene = playback;

  
  playback.onload = function () {
    let audios = document.getElementsByTagName("audio");
    for (let i = 0; i < audios.length; ++i) {
      const el = audios[i];
      if (!el) continue;
  if (typeof el.softstop === "function") el.softstop();
  else { try { el.pause(); } catch (_) {} }
    }
  };
  playback.load(); 

  
  function tick(ts) {
    if (game.scene) game.scene.render(ts);
    gameLoop = requestAnimationFrame(tick);
    window.animationRequestID = gameLoop;
  }
  gameLoop = requestAnimationFrame(tick);
}



function waitForSkinReady(timeoutMs = 8000) {
  if (window.skinReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = performance.now();
    (function poll() {
      if (window.skinReady) return resolve();
      if (performance.now() - start > timeoutMs) return reject(new Error("Skin assets failed to load in time."));
      requestAnimationFrame(poll);
    })();
  });
}

