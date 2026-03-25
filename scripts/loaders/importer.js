


window.importFiles = async function(fileList){
  let filesArray = [];
  if (!fileList) return;
  if (fileList instanceof File) filesArray = [fileList];
  else if (fileList instanceof FileList) filesArray = Array.from(fileList);
  else if (Array.isArray(fileList)) filesArray = fileList.slice();
  else if (fileList.items) {
    for (let i = 0; i < fileList.items.length; i++) {
      const it = fileList.items[i];
      if (it?.kind === 'file') {
        const f = it.getAsFile(); if (f) filesArray.push(f);
      }
    }
  } else if (fileList.files) filesArray = Array.from(fileList.files);
  if (!filesArray.length) return;
  showLoadingOverlay();
  const results = [];
  let hasSuccessful = false, hasInvalid = false;
  for (const f of filesArray) {
    if (f.name.toLowerCase().endsWith('.osz')) {
      const result = await importOsz(f);
      results.push(result);
      if (result) hasSuccessful = true;
    } else {
      hasInvalid = true;
    }
  }
  hideLoadingOverlay();
  if (hasInvalid) {
    let warningDiv = document.getElementById('importWarning');
    if (!warningDiv) {
      warningDiv = document.createElement('div');
      warningDiv.id = 'importWarning';
      warningDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,0.9);color:#000;padding:20px;border-radius:10px;z-index:1000;font-size:18px;text-align:center';
      document.body.appendChild(warningDiv);
    }
    warningDiv.innerText = 'Please import only .osz format files.';
    warningDiv.style.display = 'block';
    setTimeout(() => { warningDiv.style.display = 'none'; }, 5000);
  }
  if (hasSuccessful) {
    const beatmapBrowser = document.getElementById('beatmapBrowser');
    if (beatmapBrowser) { beatmapBrowser.hidden = false; document.body.classList.add('view-beatmaps'); }
    await renderAllMaps();
    let lastImportedMap = null;
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];
      if (result?.duplicate) { lastImportedMap = result.map; break; }
      if (result) { lastImportedMap = result; break; }
    }
    if (lastImportedMap?.audioBlob) {
      const url = URL.createObjectURL(lastImportedMap.audioBlob);
      fadeBgm(url, lastImportedMap.previewTime ? lastImportedMap.previewTime / 1000 : 0);
      window.currentPlayingMap = lastImportedMap;
      setTimeout(() => {
        const newestItem = document.querySelector(`.beatmapItem[data-id="${lastImportedMap.id}"]`);
        if (newestItem) newestItem.click();
      }, 100);
    }
  }
};


async function importOsz(file){
  try {
    if (!window.zip?.fs) throw new Error('zip.fs not available');
    const fs = new window.zip.fs.FS();
    await new Promise((resolve, reject)=>{ fs.root.importBlob(file, resolve, reject); });
    const entries = {};
    collectZipEntries(fs.root, entries);

    const osuNames = Object.keys(entries).filter(n=>n.toLowerCase().endsWith('.osu'));
    let audioName = null, imgName = null, title = '', artist = '';
    for (const name of osuNames){
      const txt = await entryGetText(entries[name]);
      const meta = parseOsuMeta(txt||'');
      if (!audioName && meta.audio) audioName = meta.audio;
      if (!imgName && meta.bg) imgName = meta.bg;
      if (!title && meta.title) title = meta.title;
      if (!artist && meta.artist) artist = meta.artist;
      if (audioName && imgName && title && artist) break;
    }
    if (!title) title = file.name.replace(/\.osz$/i,'');

    let beatmapSetID = '', beatmapID = '', previewTime = 0;
    const difficulties = [];
    for (const name of osuNames) {
      const osuText = await entryGetText(entries[name]);
      if (!osuText) continue;
      const generalMatch = osuText.match(/\[General\]([\s\S]*?)(?:\[|$)/i);
      if (generalMatch) {
        const previewMatch = generalMatch[1].match(/PreviewTime\s*:\s*(.*)/i);
        if (previewMatch) previewTime = parseInt(previewMatch[1].trim()) || 0;
      }
      const metaMatch = osuText.match(/\[Metadata\]([\s\S]*?)(?:\[|$)/i);
      let diffBeatmapID = '';
      if (metaMatch) {
        const m = metaMatch[1];
        const beatmapIDMatch = m.match(/BeatmapID\s*:\s*(.*)/i);
        const beatmapSetIDMatch = m.match(/BeatmapSetID\s*:\s*(.*)/i);
        if (beatmapIDMatch) diffBeatmapID = beatmapIDMatch[1].trim();
        if (beatmapSetIDMatch) beatmapSetID = beatmapSetIDMatch[1].trim();
        if (diffBeatmapID && !beatmapID) beatmapID = diffBeatmapID;
      }
      let ar = 0, cs = 0, hp = 0, od = 0;
      const diffMatch = osuText.match(/\[Difficulty\]([\s\S]*?)(?:\[|$)/i);
      if (diffMatch) {
        const d = diffMatch[1];
        const arMatch = d.match(/ApproachRate\s*:\s*(.*)/i);
        const csMatch = d.match(/CircleSize\s*:\s*(.*)/i);
        const hpMatch = d.match(/HPDrainRate\s*:\s*(.*)/i);
        const odMatch = d.match(/OverallDifficulty\s*:\s*(.*)/i);
        if (arMatch) ar = parseFloat(arMatch[1].trim()) || 0;
        if (csMatch) cs = parseFloat(csMatch[1].trim()) || 0;
        if (hpMatch) hp = parseFloat(hpMatch[1].trim()) || 0;
        if (odMatch) od = parseFloat(odMatch[1].trim()) || 0;
      }
      const versionMatch = osuText.match(/Version\s*:\s*(.*)/i);
      const diffName = versionMatch ? versionMatch[1].trim() : 'Unknown';
      difficulties.push({ name: diffName, stars: 0, starsRounded: 0, bid: diffBeatmapID || beatmapID, ar, cs, hp, od });
    }

    const nameMatch = String(file.name || '').match(/^(\d+)\b/);
    if (nameMatch) beatmapSetID = nameMatch[1];

    if (beatmapSetID) {
      const starData = await fetchStarsFromAPI(beatmapSetID);
      if (starData && Array.isArray(starData)) {
        for (let diff of difficulties) {
          let apiEntry = starData.find(d => d.bid == diff.bid || d.beatmap_id == diff.bid);
          if (!apiEntry && diff.name) {
            const lowerName = String(diff.name).trim().toLowerCase();
            apiEntry = starData.find(d => d.version && String(d.version).trim().toLowerCase() === lowerName);
          }
          if (apiEntry?.star !== undefined) {
            diff.stars = Number(apiEntry.star);
            diff.starsRounded = Math.round(Number(apiEntry.star) * 10) / 10;
          }
        }
      }
    }
    difficulties.sort((a, b) => a.stars - b.stars);

    const findEntry = (name) => {
      if (!name) return null;
      const normalized = String(name).replace(/\\/g, '/');
      if (entries[normalized]) return entries[normalized];
      
      const lower = normalized.toLowerCase();
      const key = Object.keys(entries).find(k => {
        const kl = k.toLowerCase();
        return kl.endsWith('/'+lower) || kl.endsWith(lower) || kl === lower;
      });
      return key ? entries[key] : null;
    };
    let audioBlob = null, coverBlob = null;
    const audioEntry = findEntry(audioName);
    if (audioEntry) audioBlob = await entryGetBlob(audioEntry).catch(()=>null);
    const imgEntry = findEntry(imgName);
    if (imgEntry) coverBlob = await entryGetBlob(imgEntry).catch(()=>null);

    const allMaps = await getAllMapsFromDB();
    const existing = allMaps.find(m => 
      (beatmapSetID && (String(m.id) === String(beatmapSetID) || String(m.beatmapSetID) === String(beatmapSetID))) ||
      (beatmapID && (String(m.id) === String(beatmapID) || String(m.beatmapID) === String(beatmapID)))
    );
    if (existing) return { duplicate: true, map: existing };

    const map = {
      id: beatmapSetID || beatmapID || (title + '-' + Date.now()).replace(/\s+/g,'_'),
      beatmapSetID, beatmapID, title, artist, audioBlob, coverBlob,
      oszBlob: file, difficulties, previewTime
    };
    await saveMapToDB(map);

    const pBeatmapList = document.querySelector('.beatmapListContainer');
    if (pBeatmapList) pBeatmapList.insertBefore(createBeatmapElementFromMap(map), pBeatmapList.firstChild);
    const beatmapBrowser = document.getElementById('beatmapBrowser');
    if (beatmapBrowser) { beatmapBrowser.hidden = false; document.body.classList.add('view-beatmaps'); }

    if (map.audioBlob && window.registerImportedTrack) {
      const audioUrl = URL.createObjectURL(map.audioBlob);
      const idx = window.registerImportedTrack({ src: audioUrl, artist: map.artist, title: map.title });
      if (typeof idx === 'number' && window.playTrackByIndex) window.playTrackByIndex(idx);
    }
    return map;
  } catch(err) {
    console.error('import error for', file.name, err);
    return null;
  }
}


const mapStore = window.osuMapStore || null;
if (!mapStore) console.error('osuMapStore not available');

let loadingOverlay = null;
let currentlyExtendedBeatmap = null;
let currentlyExtendedDiff = null;


const escapeAttr = (v) => String(v == null ? '' : v).replace(/"/g, '\\"');

function getStarClass(stars){
  if (stars >= 8.71) return 'sr-8-71';
  if (stars >= 8.0) return 'sr-8';
  if (stars >= 6.5) return 'sr-6-5';
  if (stars >= 5.3) return 'sr-5-3';
  if (stars >= 4.0) return 'sr-4';
  if (stars >= 2.7) return 'sr-2-7';
  if (stars >= 2.0) return 'sr-2';
  return 'sr-0';
}


function collectZipEntries(entry, out){
  if (!entry) return;
  entry.children.forEach(child => {
    if (child.directory) collectZipEntries(child, out);
    else out[child.getFullname()] = child;
  });
}

const entryGetText = (entry) => new Promise((resolve, reject) => {
  try { entry.getText((text) => resolve(text)); } catch (err) { reject(err); }
});

const entryGetBlob = (entry) => new Promise((resolve, reject) => {
  try { entry.getBlob('application/octet-stream', (blob) => resolve(blob)); } catch (err) { reject(err); }
});


function parseOsuMeta(text){
  const sec = (name)=>{
    const m = text.match(new RegExp('\\['+name+'\\]([\\s\\S]*?)(?:\\n\\[|$)','i')); return m? m[1]: '';
  };
  const get = (block, key)=>{
    const m = (block||'').match(new RegExp('^\\s*'+key+'\\s*:\\s*(.*)$','mi')); return m? m[1].trim(): '';
  };
  const gen = sec('General'), meta = sec('Metadata'), ev = sec('Events');
  const audio = get(gen, 'AudioFilename');
  let bg = '';
  if (ev){
    const lines = ev.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    for (const L of lines){
      if (/^Video/i.test(L)) continue;
      const m = L.match(/\,\s*\"([^\"]+)\"/);
      if (m && m[1]) { bg = m[1]; break; }
    }
  }
  const title = get(meta,'Title'), titleU = get(meta,'TitleUnicode');
  const artist = get(meta,'Artist'), artistU = get(meta,'ArtistUnicode');
  const preferAscii = (a,b)=>{
    const ascii = /^[\x00-\x7F]+$/;
    if (a && ascii.test(a)) return a; if (a && !b) return a; if (b && ascii.test(b)) return b; return b||a||'';
  };
  return { title: preferAscii(title,titleU), artist: preferAscii(artist,artistU), audio, bg };
}


async function fetchStarsFromAPI(beatmapSetID) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://api.sayobot.cn/beatmapinfo?1=" + beatmapSetID);
    xhr.responseType = 'text';
    xhr.onload = ()=>{
      try {
        const info = JSON.parse(xhr.response);
        resolve(info.status == 0 ? info.data : null);
      } catch(e) { resolve(null); }
    };
    xhr.onerror = ()=>resolve(null);
    xhr.send();
  });
}

const saveMapToDB = (map) => mapStore.saveMap(map);
const getAllMapsFromDB = () => mapStore.getAllMaps();


function showLoadingOverlay(){
  if (loadingOverlay) return;
  loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'importLoadingOverlay';
  loadingOverlay.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:9999;font-family:Quicksand,sans-serif;color:#fff';
  const inner = document.createElement('div'); inner.style.textAlign = 'center';
  const spinner = document.createElement('div'); spinner.className = 'importer-spinner';
  const txt = document.createElement('div'); txt.innerText = 'Importing maps...'; txt.style.fontSize = '18px';
  inner.appendChild(spinner); inner.appendChild(txt);
  loadingOverlay.appendChild(inner);
  document.body.appendChild(loadingOverlay);
  if (!document.getElementById('importer-spinner-style')){
    const s = document.createElement('style'); s.id = 'importer-spinner-style';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}} .importer-spinner{border:4px solid rgba(255,255,255,0.12);border-top:4px solid #fff;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 12px;}';
    document.head.appendChild(s);
  }
}

function hideLoadingOverlay(){
  if (loadingOverlay) { loadingOverlay.remove(); loadingOverlay = null; }
  const s = document.getElementById('importer-spinner-style');
  if (s) s.remove();
}

function fadeBgm(newSrc, seekTime) {
  const bgm = document.getElementById('bgm');
  if (!bgm) return;
  const maxVolume = 0.3;
  if (newSrc === bgm.src) {
    if (seekTime && Math.abs(bgm.currentTime - seekTime) > 0.1) bgm.currentTime = seekTime;
    return;
  }
  if (bgm.src && !bgm.paused) {
    const fadeOut = setInterval(() => {
      bgm.volume = Math.max(0, bgm.volume - 0.1);
      if (bgm.volume <= 0) {
        clearInterval(fadeOut);
        bgm.pause();
        bgm.src = newSrc;
        if (seekTime) bgm.currentTime = seekTime;
        bgm.volume = 0;
        const fadeIn = setInterval(() => {
          bgm.volume = Math.min(maxVolume, bgm.volume + 0.1);
          if (bgm.volume >= maxVolume) clearInterval(fadeIn);
        }, 25);
        bgm.play().catch(() => {});
      }
    }, 25);
  } else {
    bgm.src = newSrc;
    if (seekTime) bgm.currentTime = seekTime;
    bgm.volume = maxVolume;
    bgm.play().catch(() => {});
  }
}

function animateDiffGroupSlideOut(diffGroup, duration = 220) {
  diffGroup.style.transition = `transform ${duration}ms cubic-bezier(.4,1.2,.6,1), opacity ${duration}ms`;
  diffGroup.style.transform = 'translateX(-40px)';
  diffGroup.style.opacity = '0';
  setTimeout(() => {
    diffGroup.classList.remove('open');
    diffGroup.style.transition = '';
    diffGroup.style.transform = '';
    diffGroup.style.opacity = '';
  }, duration);
}


function getPendingSelection() {
  try {
    const raw = sessionStorage.getItem('osu:autoSelectMap');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.mapId ? data : null;
  } catch { return null; }
}

const clearPendingSelection = () => sessionStorage.removeItem('osu:autoSelectMap');

function applyPendingSelection() {
  const pending = getPendingSelection();
  if (!pending || !document.body.classList.contains('view-beatmaps')) return false;
  const item = document.querySelector(`.beatmapItem[data-id="${escapeAttr(pending.mapId)}"]`);
  if (!item) return false;
  try { item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
  item.click();
  const trySelectDifficulty = () => {
    const diffGroup = item.nextElementSibling?.classList?.contains('difficultyGroup') ? item.nextElementSibling : null;
    if (!diffGroup) { clearPendingSelection(); return; }
    let target = null;
    if (pending.diffBid) target = diffGroup.querySelector(`.difficultyBox[data-bid="${escapeAttr(String(pending.diffBid))}"]`);
    if (!target && pending.diffName) {
      const lowerTarget = String(pending.diffName || '').trim().toLowerCase();
      target = Array.from(diffGroup.querySelectorAll('.difficultyBox')).find((box) => {
        const nameEl = box.querySelector('.difficultyName');
        return nameEl?.textContent?.trim().toLowerCase() === lowerTarget;
      });
    }
    if (!target) target = diffGroup.querySelector('.difficultyBox');
    if (target) target.click();
    clearPendingSelection();
  };
  if (pending.diffBid || pending.diffName) setTimeout(trySelectDifficulty, 140);
  else clearPendingSelection();
  return true;
}


async function renderLeaderboard(mapId, diffName, diffBid) {
  const container = document.getElementById('leaderboardList');
  if (!container) return;
  container.innerHTML = '';
  if (!window.osuMapStore?.getMap) {
    container.innerHTML = '<div class="scoreEntry placeholder"><div class="playerInfo"><div class="playerName">No scores</div></div></div>';
    return;
  }
  const map = await window.osuMapStore.getMap(mapId);
  if (!map?.leaderboard?.length) {
    container.innerHTML = '<div class="scoreEntry placeholder"><div class="playerInfo"><div class="playerName">No scores</div></div></div>';
    return;
  }
  const targetBid = diffBid ? String(diffBid) : null;
  const targetName = String(diffName || '').trim().toLowerCase();
  let items = map.leaderboard.filter(e => 
    (targetBid && String(e.diffBid || '') === targetBid) || 
    (!targetBid && targetName && String(e.diffName || '').trim().toLowerCase() === targetName)
  );
  items = items.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20);
  if (!items.length) {
    container.innerHTML = '<div class="scoreEntry placeholder"><div class="playerInfo"><div class="playerName">No scores for this difficulty</div></div></div>';
    return;
  }
  items.forEach((it, idx) => {
    const row = document.createElement('div'); row.className = 'scoreEntry';
    const left = document.createElement('div'); left.className = 'entryLeft';
    const rankEl = document.createElement('div'); rankEl.className = 'rankNum'; rankEl.textContent = `#${idx + 1}`;
    const pfp = document.createElement('img'); pfp.className = 'entryPfp'; pfp.src = it.pfp || 'assets/pfp.png'; pfp.alt = it.player || 'player';
    left.append(rankEl, pfp);
    const middle = document.createElement('div'); middle.className = 'entryMiddle';
    const nameEl = document.createElement('div'); nameEl.className = 'playerName'; nameEl.textContent = it.player || 'osuPlayer1';
    const meta = document.createElement('div'); meta.className = 'playerMeta';
    const comboMeta = document.createElement('div'); comboMeta.className = 'metaItem';
    comboMeta.innerHTML = `<div class="metaLabel">MAX COMBO</div><div class="metaValue">${it.combo || 0}x</div>`;
    const accMeta = document.createElement('div'); accMeta.className = 'metaItem';
    accMeta.innerHTML = `<div class="metaLabel">ACCURACY</div><div class="metaValue">${(Number(it.accuracy) || 0).toFixed(2)}%</div>`;
    meta.append(comboMeta, accMeta);
    middle.append(nameEl, meta);
    const right = document.createElement('div'); right.className = 'entryRight';
    const scorePill = document.createElement('div'); scorePill.className = 'scorePill';
    scorePill.textContent = (Number(it.score) || 0).toLocaleString('en-US');
    const rankImg = document.createElement('img'); rankImg.className = 'entryRankImg';
    const rankName = (it.rank || '').toUpperCase();
    if (rankName) { rankImg.src = `assets/rank-${rankName}.png`; rankImg.alt = rankName; }
    else rankImg.style.display = 'none';
    right.append(scorePill, rankImg);
    row.append(left, middle, right);
    container.appendChild(row);
  });
}


function createBeatmapElementFromMap(map) {
  const title = map.title || 'Unknown', artist = map.artist || '';
  const coverUrl = map.coverBlob ? URL.createObjectURL(map.coverBlob) : null;
  
  const audioUrl = (window._beatmapAudioUrls && window._beatmapAudioUrls.get(map.id)) || (map.audioBlob ? URL.createObjectURL(map.audioBlob) : null);
  const item = document.createElement('div');
  item.className = 'beatmapItem';
  item.oszblob = map.oszBlob || map.oszblob || null;
  item._beatmapData = map;
  item.dataset.id = map.id;
  const bg = document.createElement('div'); bg.className = 'beatmapItemBg';
  if (coverUrl) { bg.style.backgroundImage = `url("${coverUrl}")`; bg.style.backgroundSize = 'cover'; bg.style.backgroundPosition = 'center'; }
  const content = document.createElement('div'); content.className = 'beatmapContent';
  const songTitle = document.createElement('div'); songTitle.className = 'songTitle'; songTitle.innerText = title;
  const artistName = document.createElement('div'); artistName.className = 'artistName'; artistName.innerText = artist;
  content.append(songTitle, artistName);
  item.append(bg, content);

  const diffGroup = document.createElement('div');
  diffGroup.className = 'difficultyGroup';

  (map.difficulties || []).forEach((d) => {
    const dbox = document.createElement('div');
    dbox.className = 'difficultyBox';
    if (d.bid != null) dbox.setAttribute('data-bid', String(d.bid));
    if (d.name) dbox.setAttribute('data-diffname', String(d.name).trim());
    const stars = (typeof d.stars === 'number') ? d.stars : parseFloat(d.stars) || 0;
    dbox.classList.add(getStarClass(stars));
    const starTag = document.createElement('span');
    starTag.className = 'starTag';
    starTag.innerHTML = (typeof d.stars === 'number') ? `${d.stars.toFixed(1)} <svg class="star-icon" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:middle;margin-left:6px;fill:currentColor;"><path d="M12 .587l3.668 7.431L24 9.748l-6 5.847L19.335 24 12 20.201 4.665 24 6 15.595 0 9.748l8.332-1.73z"></path></svg>` : `${String(d.stars)} <svg class="star-icon" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:middle;margin-left:6px;fill:currentColor;"><path d="M12 .587l3.668 7.431L24 9.748l-6 5.847L19.335 24 12 20.201 4.665 24 6 15.595 0 9.748l8.332-1.73z"></path></svg>`;
    const dname = document.createElement('span');
    dname.className = 'difficultyName';
    dname.innerText = d.name || 'Unknown';
    dbox.append(starTag, dname);

    dbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!dbox.classList.contains('extended')) {
        if (currentlyExtendedDiff && currentlyExtendedDiff !== dbox) currentlyExtendedDiff.classList.remove('extended');
        dbox.classList.add('extended', 'clicked');
        setTimeout(()=>dbox.classList.remove('clicked'), 300);
        currentlyExtendedDiff = dbox;
        return;
      }
      if (e.isTrusted) {
        const version = d.name || d.version || 'Unknown';
        const beatmapId = d.bid || map.beatmapID || map.id || version;
        window.location.href = `game.html?${new URLSearchParams({ map: map.id, diff: version, bid: beatmapId ? String(beatmapId) : '' }).toString()}`;
      } else {
        dbox.classList.add('clicked');
        setTimeout(()=>dbox.classList.remove('clicked'), 200);
        currentlyExtendedDiff = dbox;
      }
    });

    dbox.addEventListener('click', () => {
      const infoBox = document.getElementById('beatmapInfoBox');
      if (!infoBox) return;
      const stars = d.starsRounded || d.stars || 0;
      const srClass = getStarClass(stars);
      infoBox.querySelector('.infoTitle').textContent = map.title || 'Unknown';
      infoBox.querySelector('.infoArtist').textContent = map.artist || '';
      const starTag = infoBox.querySelector('.infoStarTag');
      starTag.innerHTML = `${stars.toFixed(1)} <svg class="star-icon" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:middle;margin-left:6px;fill:currentColor;"><path d="M12 .587l3.668 7.431L24 9.748l-6 5.847L19.335 24 12 20.201 4.665 24 6 15.595 0 9.748l8.332-1.73z"></path></svg>`;
      starTag.style.background = `var(--${srClass})`;
      starTag.style.color = (srClass === 'sr-8' || srClass === 'sr-8-71') ? 'gold' : '#000';
      infoBox.querySelector('.infoHP').textContent = (d.hp || 5).toFixed(1);
      infoBox.querySelector('.infoOD').textContent = (d.od || 5).toFixed(1);
      infoBox.querySelector('.infoAR').textContent = (d.ar || 5).toFixed(1);
      infoBox.querySelector('.infoCS').textContent = (d.cs || 4).toFixed(1);
      infoBox.style.display = 'block';
      try { renderLeaderboard(map.id, d.name, d.bid); } catch {}
    });

    diffGroup.appendChild(dbox);
  });

  item.addEventListener('click', ()=>{
    item.classList.add('clicked');
    setTimeout(() => item.classList.remove('clicked'), 300);
    const pPageBackground = document.querySelector('.pageBackground');
    if (pPageBackground && coverUrl) {
      pPageBackground.style.opacity = '0';
      setTimeout(() => {
        pPageBackground.style.backgroundImage = `url("${coverUrl}")`;
        pPageBackground.style.backgroundSize = 'cover';
        pPageBackground.style.backgroundPosition = 'center';
        pPageBackground.style.opacity = '1';
      }, 200);
    }
    if (!window.currentPlayingMap || window.currentPlayingMap.id !== map.id) {
      
      if (window._beatmapPlaylistIndices && window._beatmapPlaylistIndices.has(map.id) && window.playTrackByIndex) {
        const playlistIndex = window._beatmapPlaylistIndices.get(map.id);
        window.playTrackByIndex(playlistIndex);
      } else if (audioUrl) {
        
        fadeBgm(audioUrl, map.previewTime ? map.previewTime / 1000 : 0);
      }
    }
    window.currentPlayingMap = map;
    const topTitle = document.getElementById('songTitle');
    if (topTitle) topTitle.textContent = (map.artist || '') + (map.artist && map.title ? ' - ' : '') + (map.title || 'Unknown');
    const infoBox = document.getElementById('beatmapInfoBox');
    if (infoBox && map.difficulties?.length) {
      const firstDiff = map.difficulties[0];
      const stars = firstDiff.starsRounded || firstDiff.stars || 0;
      const srClass = getStarClass(stars);
      infoBox.querySelector('.infoTitle').textContent = map.title || 'Unknown';
      infoBox.querySelector('.infoArtist').textContent = map.artist || '';
      const starTag = infoBox.querySelector('.infoStarTag');
      starTag.innerHTML = `${stars.toFixed(1)} <svg class="star-icon" width="11" height="11" viewBox="0 0 24 24" style="vertical-align:middle;margin-left:6px;fill:currentColor;"><path d="M12 .587l3.668 7.431L24 9.748l-6 5.847L19.335 24 12 20.201 4.665 24 6 15.595 0 9.748l8.332-1.73z"></path></svg>`;
      starTag.style.background = `var(--${srClass})`;
      starTag.style.color = (srClass === 'sr-8' || srClass === 'sr-8-71') ? 'gold' : '#000';
      infoBox.querySelector('.infoHP').textContent = (firstDiff.hp || 5).toFixed(1);
      infoBox.querySelector('.infoOD').textContent = (firstDiff.od || 5).toFixed(1);
      infoBox.querySelector('.infoAR').textContent = (firstDiff.ar || 5).toFixed(1);
      infoBox.querySelector('.infoCS').textContent = (firstDiff.cs || 4).toFixed(1);
      infoBox.style.display = 'block';
      try { renderLeaderboard(map.id, firstDiff.name, firstDiff.bid); } catch {}
    }
    const beatmapBrowser = document.getElementById('beatmapBrowser');
    if (beatmapBrowser) { beatmapBrowser.hidden = false; document.body.classList.add('view-beatmaps'); }
    if (currentlyExtendedBeatmap && currentlyExtendedBeatmap !== item) {
      currentlyExtendedBeatmap.classList.remove('extended');
      const prevDiffGroup = currentlyExtendedBeatmap.nextSibling;
      if (prevDiffGroup?.classList?.contains('difficultyGroup')) animateDiffGroupSlideOut(prevDiffGroup, 220);
    }
    item.classList.add('extended');
    currentlyExtendedBeatmap = item;
    document.querySelectorAll('.difficultyGroup.open').forEach(g => {
      if (g !== diffGroup) {
        g.querySelectorAll('.difficultyBox.extended').forEach(b=>b.classList.remove('extended'));
        animateDiffGroupSlideOut(g, 200);
      }
    });
    diffGroup.classList.add('open');
    setTimeout(() => { try { diffGroup.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {} }, 40);
    const firstDiff = diffGroup.querySelector('.difficultyBox');
    if (firstDiff) {
      if (currentlyExtendedDiff && currentlyExtendedDiff !== firstDiff) currentlyExtendedDiff.classList.remove('extended');
      firstDiff.classList.add('extended');
      currentlyExtendedDiff = firstDiff;
    }
  });

  const wrapperFragment = document.createDocumentFragment();
  wrapperFragment.append(item, diffGroup);
  return wrapperFragment;
}


function handleKeydown(e) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (currentlyExtendedBeatmap) {
    const diffGroup = currentlyExtendedBeatmap.nextElementSibling;
    if (diffGroup?.classList?.contains('difficultyGroup')) {
      const diffs = diffGroup.querySelectorAll('.difficultyBox');
      if (diffs.length > 0) {
        let currentDiffIndex = Array.from(diffs).indexOf(currentlyExtendedDiff);
        if (currentDiffIndex === -1) currentDiffIndex = 0;
        currentDiffIndex = e.key === 'ArrowDown' ? (currentDiffIndex + 1) % diffs.length : (currentDiffIndex - 1 + diffs.length) % diffs.length;
        diffs[currentDiffIndex]?.click();
        return;
      }
    }
  }
  const items = document.querySelectorAll('.beatmapItem:not(.filter-hidden)');
  let currentIndex = Array.from(items).indexOf(currentlyExtendedBeatmap);
  if (currentIndex === -1) currentIndex = 0;
  currentIndex = e.key === 'ArrowDown' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
  items[currentIndex]?.click();
}


function setupBeatmapSearchFiltering(){
  const input = document.querySelector('.searchBox');
  const list = document.querySelector('.beatmapListContainer');
  if (!input || !list) return;
  const normalize = (s) => (s || '').toString().toLowerCase();
  function applyFilter(){
    const q = normalize(input.value.trim());
    const items = Array.from(list.querySelectorAll('.beatmapItem'));
    let anyVisible = false;
    items.forEach(item => {
      const map = item._beatmapData || {};
      const title = normalize(map.title), artist = normalize(map.artist);
      const diffs = (map.difficulties || []).map(d => normalize(d?.name || d?.version)).filter(Boolean);
      const match = !q || title.includes(q) || artist.includes(q) || diffs.some(n => n.includes(q));
      const diffGroup = item.nextElementSibling?.classList?.contains('difficultyGroup') ? item.nextElementSibling : null;
      if (match) {
        item.classList.remove('filter-hidden');
        if (diffGroup) diffGroup.classList.remove('filter-hidden');
        anyVisible = true;
      } else {
        if (currentlyExtendedBeatmap === item) {
          item.classList.remove('extended');
          if (diffGroup) {
            diffGroup.classList.remove('open');
            diffGroup.querySelectorAll('.difficultyBox.extended').forEach(b=>b.classList.remove('extended'));
          }
          currentlyExtendedBeatmap = null;
          currentlyExtendedDiff = null;
        }
        item.classList.add('filter-hidden');
        if (diffGroup) diffGroup.classList.add('filter-hidden');
      }
    });
    if ((!currentlyExtendedBeatmap || currentlyExtendedBeatmap.classList.contains('filter-hidden')) && anyVisible) {
      list.querySelector('.beatmapItem:not(.filter-hidden)')?.click();
    }
  }
  input.addEventListener('input', applyFilter);
  applyFilter();
}


async function renderAllMaps(){
  try {
    const all = await getAllMapsFromDB();
    const pBeatmapList = document.querySelector('.beatmapListContainer');
    if (!pBeatmapList) return;
    Array.from(pBeatmapList.querySelectorAll('.beatmapItem, .difficultyGroup')).forEach(n=>n.remove());
    window._registeredMapIds = window._registeredMapIds || new Set();
    window._beatmapAudioUrls = window._beatmapAudioUrls || new Map();
    window._beatmapPlaylistIndices = window._beatmapPlaylistIndices || new Map();
    for (const m of all){
      try {
        if (m.audioBlob && window.registerImportedTrack && !window._registeredMapIds.has(m.id)) {
          const url = URL.createObjectURL(m.audioBlob);
          window._beatmapAudioUrls.set(m.id, url);
          const playlistIndex = window.registerImportedTrack({ 
            src: url, 
            artist: m.artist, 
            title: m.title,
            previewTime: m.previewTime ? m.previewTime / 1000 : 0
          });
          window._beatmapPlaylistIndices.set(m.id, playlistIndex);
          window._registeredMapIds.add(m.id);
        }
      } catch {}
      pBeatmapList.appendChild(createBeatmapElementFromMap(m));
    }
    document.addEventListener('keydown', handleKeydown);
    let scrollVelocity = 0, isScrolling = false, lastTime = 0;
    const friction = 0.9, sensitivity = 0.9;
    function smoothScroll(timestamp) {
      if (!isScrolling) return;
      scrollVelocity *= friction;
      pBeatmapList.scrollTop += scrollVelocity * (timestamp - lastTime) * 0.01;
      lastTime = timestamp;
      if (Math.abs(scrollVelocity) > 0.1) requestAnimationFrame(smoothScroll);
      else isScrolling = false;
    }
    pBeatmapList.addEventListener('wheel', (e) => {
      e.preventDefault();
      scrollVelocity += e.deltaY * sensitivity;
      if (!isScrolling) { isScrolling = true; lastTime = performance.now(); requestAnimationFrame(smoothScroll); }
    });
    setTimeout(applyPendingSelection, 0);
  } catch {}
}


document.addEventListener('DOMContentLoaded', () => {
  renderAllMaps();
  setupBeatmapSearchFiltering();
});

document.addEventListener('osu:beatmaps-opened', () => {
  setTimeout(applyPendingSelection, 90);
});

