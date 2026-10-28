/* A single document owns the menu, loader, gameplay and results lifecycles. */
(() => {
  const main=document.getElementById('main'),area=document.getElementById('game-area'),top=document.getElementById('topBar');
  // The persistent toolbar is shared by song selection and results, outside the hidden menu.
  document.body.append(top,document.getElementById('musicPopover'));
  let phase='menu',generation=0,frame=0,enginePromise=null,contextmenu=null,quitPromise=null,cancelReady=null;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function loadEngine(){return enginePromise ||= import('./initgame.js').catch(error=>{enginePromise=null;throw error;});}
  function setPhase(next){phase=next;document.body.dataset.scene=next;document.dispatchEvent(new CustomEvent('osu:scene-changed',{detail:{scene:next}}));}
  window.showGameError=message=>{window.osuToast(String(message),true);void quit();};
  async function play(map,diff){
    if(phase!=='menu')return;
    const token=++generation;setPhase('loading');
    window.osuShell.close();window.osuMusicPlayer.close();window.osuBrowse.close();
    window.osuLibrary.selectSet(map.id,diff.bid,{silent:true});
    window.osuMenuAudio.suspend();window.osuMenu.suspend();main.inert=true;
    try{
      const out=document.body.classList.contains('view-beatmaps')?window.osuTransitions.selection(false):delay(reduced.matches?0:300);
      await out;if(token!==generation)return;
      main.hidden=true;top.hidden=true;window.osuTransitions.clear();
      window.osuTransitions.showLoader(map,diff);const shownAt=performance.now();
      await loadEngine();if(token!==generation)return;
      window.osuSettings.applyToGame(window.game);window.game.masterVolume=window.osuVolume.value;window.game.finished=false;window.game.paused=false;
      window.currentGameSession={mapId:String(map.id),diffName:diff.name,diffBid:String(diff.bid||''),title:map.title,artist:map.artist,creator:diff.creator||map.creator||'',tutorial:String(map.id)==='1011011'&&String(diff.bid)==='2116202'};
      sessionStorage.setItem('osu:lastSession',JSON.stringify(window.currentGameSession));
      window.game.prepareGameplay=async()=>{
        await delay(reduced.matches?0:Math.max(0,1800-(performance.now()-shownAt)));
        if(token!==generation)return;
        document.body.classList.add('gaming');area.hidden=false;
        const enter=window.osuTransitions.gameIn();await window.osuTransitions.hideLoader();await enter;
        if(token!==generation)return;
        window.game.prepareGameplay=null;setPhase('playing');
      };
      await launchGame(map.oszBlob,diff.bid,diff.name,token);
    }catch(error){if(token===generation){window.osuToast('Could not start this beatmap. '+error.message,true);await quit();}}
  }
  async function launchGame(blob,beatmapId,version,token=generation){
    if(!blob||!window.zip?.fs)throw new Error('Beatmap loading is unavailable.');
    await Promise.all([window.osuSoundReady,new Promise(resolve=>{const poll=()=>window.skinReady&&window.Playback?resolve():setTimeout(poll,20);poll();})]);
    if(token!==generation)return;
    const fs=new window.zip.fs.FS();await new Promise((resolve,reject)=>fs.root.importBlob(blob,resolve,reject));
    const osu=new window.Osu(fs.root);await new Promise((resolve,reject)=>{osu.onerror=error=>reject(new Error(String(error)));osu.ondecoded=resolve;osu.load();});
    if(token!==generation)return;
    const track=osu.tracks.find(track=>Number(track.general.Mode||0)===0&&(Number(beatmapId)>0?String(track.metadata.BeatmapID)===String(beatmapId):String(track.metadata.Version)===String(version)));
    if(!track)throw new Error('No playable standard difficulty was found.');
    window.__osuRunning__=true;area.hidden=false;area.style.opacity='0';
    area.classList.remove('showhwmousemedium','shownomouse');area.classList.add(window.game.showhwmouse?'showhwmousemedium':'shownomouse');
    contextmenu=event=>event.preventDefault();document.addEventListener('contextmenu',contextmenu);
    const playback=new window.Playback(window.game,osu,track);window.game.scene=playback;
    let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    cancelReady=()=>resolveReady(null);
    osu.onerror=message=>{cancelReady=null;rejectReady(new Error(String(message)));if(phase==='playing')window.showGameError(message);};
    playback.onload=()=>{cancelReady=null;resolveReady(playback);};
    playback.load();
    function tick(){if(token!==generation||!window.game?.scene)return;window.game.scene.render();frame=requestAnimationFrame(tick);}
    frame=requestAnimationFrame(tick);await ready;return playback;
  }
  async function quit(){
    if(quitPromise)return quitPromise;if(phase==='menu')return;
    ++generation;setPhase('returning');
    cancelReady?.();cancelReady=null;
    quitPromise=(async()=>{
      window.osuShell.close();window.osuMusicPlayer.close();
      window.game?.scene?.osu?.audio?.pause?.();
      if(!area.hidden)await window.osuTransitions.gameOut();
      cancelAnimationFrame(frame);frame=0;
      const playback=window.playback;
      if(playback&&!playback.destroyed)playback.destroy();
      playback?.osu?.audio?.gain?.disconnect?.();
      if(window.game){window.game.scene=null;window.game.prepareGameplay=null;window.game.paused=false;}
      window.playback=null;window.__osuRunning__=false;
      if(contextmenu)document.removeEventListener('contextmenu',contextmenu);contextmenu=null;
      document.querySelector('#results-overlay')?.dispatchEvent(new Event('osu:dispose'));
      document.getElementById('results-overlay')?.remove();
      for(const id of['pause-menu','fail-menu']){const node=document.getElementById(id);node.hidden=true;node.getAnimations().forEach(a=>a.cancel());}
      document.body.classList.remove('gaming','results-visible');area.hidden=true;area.style.opacity='';
      window.osuTransitions.cancelLoader();window.osuTransitions.clear();
      main.hidden=false;main.inert=false;top.hidden=false;
      await window.osuLibrary.refresh();
      window.osuMenuAudio.setMode('selection');
      window.osuMenu.resume();await window.osuMenu.openSelection();
      const session=window.currentGameSession;
      if(session){window.osuLibrary.selectSet(session.mapId,session.diffBid,{silent:true,center:true});await window.osuMenuAudio.playMap(session.mapId,{seek:true,reason:'return'});}
      setPhase('menu');void window.osuTransitions.selection(true);
    })().finally(()=>{quitPromise=null;});
    return quitPromise;
  }
  window.osuApp={play,quit,get phase(){return phase;},get busy(){return phase!=='menu';}};
  window.quitGame=quit;window.launchGame=launchGame;
  document.addEventListener('osu:results-shown',()=>{setPhase('results');top.hidden=false;top.classList.add('active');});
  document.addEventListener('osu:results-retry',()=>{top.hidden=true;setPhase('playing');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&phase==='loading'){event.preventDefault();event.stopImmediatePropagation();void quit();}},true);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);window.game?.scene?.osu?.audio?.pause?.();});
})();
