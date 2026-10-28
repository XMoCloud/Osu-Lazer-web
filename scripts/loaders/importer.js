/* Import once, then render from the in-memory library. UI never owns archive parsing. */
(() => {
  const maps = new Map();
  const urls = new Map();
  let selectedId = null, selectedBid = null, query = '', renderFrame = 0;
  const list = document.querySelector('.beatmapListContainer');
  const text = (block, key) => block.match(new RegExp('^\\s*' + key + '\\s*:\\s*(.*)$', 'mi'))?.[1]?.trim() || '';
  const section = (source, name) => source.match(new RegExp('\\[' + name + '\\]([\\s\\S]*?)(?=\\n\\[|$)', 'i'))?.[1] || '';
  const number = (value, fallback) => value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
  const positive = value => Number(value) > 0 ? String(value) : '';
  const entryText = entry => new Promise((resolve, reject) => entry.getText(resolve, reject));
  const entryBlob = (entry, mime) => new Promise((resolve, reject) => {
    if (!entry) return resolve(null);
    entry.getBlob(mime, blob => blob ? resolve(blob) : reject(new Error('Could not extract ' + entry.name)), reject);
  });
  function filesIn(dir) { return dir.children.flatMap(entry => entry.directory ? filesIn(entry) : [entry]); }
  function getStarClass(stars) {
    if (stars >= 8.71) return 'sr-8-71';
    if (stars >= 8) return 'sr-8';
    if (stars >= 6.5) return 'sr-6-5';
    if (stars >= 5.3) return 'sr-5-3';
    if (stars >= 4) return 'sr-4';
    if (stars >= 2.7) return 'sr-2-7';
    if (stars >= 2) return 'sr-2';
    return 'sr-0';
  }
  window.osuStarClass = getStarClass;
  window.osuImportOsz = async (file, { metadata, preferredBid, signal } = {}) => {
    if (file.size > 350 * 1024 * 1024) throw new Error('This archive exceeds the 350 MB import limit.');
    const fs = new window.zip.fs.FS();
    await new Promise((resolve, reject) => fs.root.importBlob(file, resolve, reject));
    const entries = filesIn(fs.root).filter(entry => /\.osu$/i.test(entry.name));
    if (!entries.length) throw new Error('This archive does not contain any .osu maps.');
    const difficulties = [];
    let first = null;
    for (const entry of entries) {
      const source = (await entryText(entry)).replace(/\r/g, '');
      const general = section(source, 'General'), meta = section(source, 'Metadata');
      if (number(text(general, 'Mode'), 0) !== 0) continue;
      const difficulty = section(source, 'Difficulty');
      const objects = section(source, 'HitObjects').split('\n').filter(line => /^\d+,/.test(line));
      if (!objects.length) continue;
      const events = section(source, 'Events');
      const background = events.match(/^\s*0\s*,\s*-?\d+\s*,\s*"([^"]+)"/m)?.[1] || '';
      const od = number(text(difficulty, 'OverallDifficulty'), 5);
      const rawTiming = section(source, 'TimingPoints').split('\n').map(line => line.split(',').map(Number));
      const effects = rawTiming.filter(parts => parts.length >= 8).map(parts => ({ offset: parts[0], kiai: !!(parts[7] & 1) }));
      const times = rawTiming
        .filter(parts => parts.length >= 2 && parts[1] > 0)
        .map(parts => ({ offset: parts[0], beatLength: parts[1], meter: parts[2] || 4, kiai: !!(parts[7] & 1) }));
      const data = {
        name: text(meta, 'Version') || 'Unknown', bid: positive(text(meta, 'BeatmapID')),
        creator: text(meta, 'Creator'), ar: number(text(difficulty, 'ApproachRate'), od),
        cs: number(text(difficulty, 'CircleSize'), 4), hp: number(text(difficulty, 'HPDrainRate'), od), od,
        stars: null, mode: 0, circles: 0, sliders: 0, spinners: 0,
        length: Math.round(Number(objects.at(-1).split(',')[2]) / 1000), timingPoints: times, effectPoints: effects,
        audioName: text(general, 'AudioFilename'), background,
        previewTime: Math.max(0, number(text(general, 'PreviewTime'), 0)),
        hasVideo: /^\s*(?:Video|1)\s*,/m.test(events)
      };
      for (const object of objects) {
        const type = Number(object.split(',')[3]);
        if (type & 1) data.circles++;
        else if (type & 2) data.sliders++;
        else if (type & 8) data.spinners++;
      }
      difficulties.push(data);
      first ||= { general, meta, data, setId: positive(text(meta, 'BeatmapSetID')) };
    }
    if (!first) throw new Error('Only osu!standard maps are supported. No playable standard difficulty was found.');
    const setId = positive(metadata?.id) || first.setId || positive(file.name.match(/^(\d+)\b/)?.[1]);
    const existing = setId ? await window.osuMapStore.getMap(setId) : null;
    if (existing?.oszBlob) return existing;
    // Metadata is optional; failed providers must not stop local imports.
    let starData = metadata?.beatmaps;
    if (!starData && setId) {
      try {
        const result = await window.osuBeatmaps.json(`https://api.sayobot.cn/beatmapinfo?1=${setId}`, { signal, timeout: 5000 });
        starData = result.status === 0 && Array.isArray(result.data) ? result.data : [];
      } catch { starData = []; }
    }
    for (const diff of difficulties) {
      const remote = starData?.find(item => String(item.id || item.bid) === diff.bid || item.version === diff.name);
      const stars = remote?.difficulty_rating ?? remote?.star;
      if (stars != null && Number.isFinite(Number(stars))) diff.stars = Number(stars);
    }
    difficulties.sort((a, b) => (a.stars ?? 99) - (b.stars ?? 99));
    const preferred = difficulties.find(d => d.bid === String(preferredBid)) || first.data;
    const audioEntry = fs.root.getChildByName(preferred.audioName);
    if (!audioEntry) throw new Error('The map archive is missing its audio file.');
    const audioBlob = await entryBlob(audioEntry, /\.ogg$/i.test(audioEntry.name) ? 'audio/ogg' : 'audio/mpeg');
    const coverBlob = await entryBlob(fs.root.getChildByName(preferred.background), /\.png$/i.test(preferred.background) ? 'image/png' : 'image/jpeg');
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const map = {
      id: setId || crypto.randomUUID(), beatmapSetID: setId, title: text(first.meta, 'Title') || text(first.meta, 'TitleUnicode') || file.name,
      artist: text(first.meta, 'Artist') || text(first.meta, 'ArtistUnicode'), creator: text(first.meta, 'Creator'),
      beatmapID: first.data.bid, audioBlob, coverBlob, oszBlob: file, difficulties,
      previewTime: preferred.previewTime, timingPoints: preferred.timingPoints, effectPoints: preferred.effectPoints, preferredBid: String(preferredBid || ''),
      status: metadata?.status || 'local', bpm: metadata?.bpm || (preferred.timingPoints[0] ? 60000 / preferred.timingPoints[0].beatLength : 0),
      hasVideo: difficulties.some(d => d.hasVideo), hasStoryboard: filesIn(fs.root).some(e => /\.osb$/i.test(e.name)), importedAt: Date.now()
    };
    await window.osuMapStore.saveMap(map);
    document.dispatchEvent(new CustomEvent('osu:map-installed', { detail: map }));
    return map;
  };
  function element(tag, className, value) {
    const node = document.createElement(tag);
    node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }
  function media(map) {
    if (!urls.has(map.id)) urls.set(map.id, {
      cover: map.coverBlob ? URL.createObjectURL(map.coverBlob) : '',
      audio: map.audioBlob ? URL.createObjectURL(map.audioBlob) : ''
    });
    return urls.get(map.id);
  }
  function starsLabel(diff) { return diff.stars == null ? '—' : Number(diff.stars).toFixed(2); }
  function createSet(map) {
    const wrapper = element('div', 'mapSet');
    wrapper.dataset.id = String(map.id);
    const item = element('button', 'beatmapItem');
    item.type = 'button';
    item.dataset.id = String(map.id);
    item.setAttribute('aria-expanded', 'false');
    const bg = element('span', 'beatmapItemBg');
    const cover = media(map).cover;
    if (cover) bg.style.backgroundImage = `url("${cover}")`;
    const content = element('span', 'beatmapContent');
    content.append(element('span', 'songTitle', map.title), element('span', 'artistName', map.artist));
    const tags = element('span', 'mapTags');
    tags.append(element('span', 'statusTag status-' + (map.status || 'local'), map.status || 'local'), element('span', 'modeTag', '◎'));
    for (const diff of map.difficulties) tags.append(window.osuDifficulty.apply(element('i', 'difficultyPip ' + getStarClass(diff.stars)),diff.stars));
    content.append(tags);
    item.append(bg, content);
    item.onclick = () => selectSet(map.id, null, { center: true });
    const group = element('div', 'difficultyGroup');
    const inner = element('div', 'difficultyGroupInner');
    for (const diff of map.difficulties) {
      const box = element('button', 'difficultyBox ' + getStarClass(diff.stars));
      window.osuDifficulty.apply(box,diff.stars);
      box.type = 'button';
      box.dataset.bid = String(diff.bid || diff.name);
      const name = element('span', 'difficultyName', diff.name);
      name.append(element('span', 'mapperName', ' mapped by ' + (diff.creator || map.creator || 'Unknown')));
      const details = element('span', 'difficultyDetails');
      const stars=element('span','difficultyStars');
      for(let i=0;i<10;i++){
        const star=element('span','miniStar','★');
        if((diff.stars||0)<i+1)star.classList.add('unfilled');
        stars.append(star);
      }
      details.append(element('span', 'starTag', '★ ' + starsLabel(diff)),stars);
      box.append(name, details);
      box.onclick = () => {
        if (selectedId === String(map.id) && selectedBid === String(diff.bid || diff.name)) return launch(map, diff);
        selectDifficulty(map, diff);
      };
      inner.append(box);
    }
    group.append(inner);
    wrapper.append(item, group);
    return wrapper;
  }
  function launch(map, diff) {
    window.osuMenuAudio?.stopPreview(false);
    return window.osuApp.play(map,diff);
  }
  function updateInfo(map, diff) {
    const box = document.getElementById('beatmapInfoBox');
    if (!box) return;
    box.querySelector('.infoTitle').textContent = map.title;
    box.querySelector('.infoArtist').textContent = map.artist;
    box.querySelector('.infoStarTag').textContent = '★ ' + starsLabel(diff);
    box.querySelector('.infoStarTag').className = 'infoStarTag ' + getStarClass(diff.stars);
    window.osuDifficulty.apply(box.querySelector('.infoStarTag'),diff.stars);
    for (const [cls, value] of [['HP', diff.hp], ['OD', diff.od], ['AR', diff.ar], ['CS', diff.cs]]) box.querySelector('.info' + cls).textContent = Number(value ?? 0).toFixed(1);
    const status = box.querySelector('.infoStatus');
    if (status) status.textContent = map.status || 'local';
    const version = box.querySelector('.infoVersion');
    if (version) version.textContent = diff.name + ' mapped by ' + (diff.creator || map.creator || 'Unknown');
    const summary = box.querySelector('.infoSummary');
    for(const [cls,value] of [['Circles',diff.circles],['Sliders',diff.sliders],['Spinners',diff.spinners]]) box.querySelector('.info'+cls).textContent=value??'\u2014';
    if (summary) summary.textContent = `\u25f7 ${Math.floor((diff.length || 0) / 60)}:${String((diff.length || 0) % 60).padStart(2, '0')}   \u2669 ${Math.round(map.bpm || 0)} BPM`;
    document.documentElement.style.setProperty('--selection-info-bottom',box.getBoundingClientRect().bottom+'px');
    const scores = document.getElementById('leaderboardList');
    scores.replaceChildren();
    const entries = (map.leaderboard || []).filter(score => diff.bid && score.diffBid ? String(score.diffBid) === String(diff.bid) : score.diffName === diff.name).sort((a, b) => b.score - a.score).slice(0, 20);
    if (!entries.length) scores.append(element('div', 'scoreEntry placeholder', 'No scores yet. Be the first!'));
    entries.forEach((score, index) => {
      const row = element('div', 'scoreEntry');
      const rank = element('span', 'rankNum', '#' + (index + 1));
      const avatar = element('img', 'entryPfp'); avatar.src = 'assets/pfp.png'; avatar.alt = '';
      const middle=element('div','entryMiddle');
      middle.append(element('span','entryDate',score.timestamp?new Date(score.timestamp).toLocaleDateString():'Local play'),element('span','playerName',score.player||'osuPlayer1'));
      const combo=element('span','entryMetric');combo.append(element('small','','MAX COMBO'),element('span','',`${score.combo||0}x`));
      const accuracy=element('span','entryMetric');accuracy.append(element('small','','ACCURACY'),element('span','',`${Number(score.accuracy||0).toFixed(2)}%`));
      const right=element('div','entryRight');right.append(element('span','scorePill',Number(score.score||0).toLocaleString()));
      const rankName=['SS','S','A','B','C','D','F'].includes(score.rank)?score.rank:'D';
      const grade=element('span','entryRank grade-'+rankName),gradeImage=element('img','entryGrade');
      gradeImage.src=`assets/grades/GradeWhite-${rankName}.svg`;gradeImage.alt=rankName;grade.append(gradeImage);
      row.append(rank,avatar,middle,combo,accuracy,right,grade);scores.append(row);
    });
  }
  function revealSelectedDifficulty(){
    requestAnimationFrame(()=>{
      if(!document.body.classList.contains('view-beatmaps')||document.body.classList.contains('gaming'))return;
      const row=list.querySelector('.mapSet.selected .difficultyBox.extended');if(!row)return;
      const bounds=list.getBoundingClientRect(),rect=row.getBoundingClientRect();
      const delta=rect.top<bounds.top+12?rect.top-bounds.top-12:rect.bottom>bounds.bottom-12?rect.bottom-bounds.bottom+12:0;
      if(delta)list.scrollTo({top:list.scrollTop+delta,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
  }
  function selectDifficulty(map, diff) {
    selectedBid = String(diff.bid || diff.name);
    list.querySelectorAll('.difficultyBox').forEach(box => {
      const selected = box.closest('.mapSet').dataset.id === String(map.id) && box.dataset.bid === selectedBid;
      box.classList.toggle('extended', selected);
      box.setAttribute('aria-pressed', String(selected));
    });
    updateInfo(map, diff);
    revealSelectedDifficulty();
  }
  function selectSet(id, bid, { center = false, silent = false } = {}) {
    const map = maps.get(String(id));
    if (!map) return;
    const changed = selectedId !== String(id);
    selectedId = String(id);
    const oldPositions = new Map([...list.children].map(node => [node, node.getBoundingClientRect().top]));
    list.querySelectorAll('.mapSet').forEach(node => {
      const active = node.dataset.id === selectedId;
      node.classList.toggle('selected', active);
      node.querySelector('.beatmapItem').setAttribute('aria-expanded', String(active));
    });
    for (const [node, top] of oldPositions) {
      const delta = top - node.getBoundingClientRect().top;
      if (delta && !matchMedia('(prefers-reduced-motion: reduce)').matches) node.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    const diff = map.difficulties.find(d => String(d.bid || d.name) === String(bid)) || map.difficulties.find(d => d.bid === map.preferredBid) || map.difficulties[0];
    selectDifficulty(map, diff);
    window.currentPlayingMap = map;
    if (changed && !silent && media(map).audio) window.osuMenuAudio?.playMap(map.id,{seek:document.body.classList.contains('view-beatmaps')});
    const background = document.querySelector('.pageBackground');
    if (changed && background && media(map).cover) {
      background.style.backgroundImage = `url("${media(map).cover}")`;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) background.animate([{ opacity: .2, transform: 'scale(1.035)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 500, easing: 'ease-out' });
    }
    if (center) setTimeout(() => list.querySelector(`.mapSet[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }), 80);
    positionCarousel();
  }
  function positionCarousel() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      if (list.hidden || !document.body.classList.contains('view-beatmaps')) return;
      const bounds = list.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      const positions = [...list.querySelectorAll('.beatmapItem')].map(item => ({ item, rect: item.getBoundingClientRect() }));
      for (const { item, rect } of positions) item.style.setProperty('--carousel-shift', Math.min(78, Math.abs(rect.top + rect.height / 2 - center) * .12) + 'px');
    });
  }
  function filter() {
    let count = 0;
    for (const node of list.children) {
      const map = maps.get(node.dataset.id);
      node.hidden = ![map.title, map.artist, map.creator, ...map.difficulties.map(d => d.name)].join(' ').toLowerCase().includes(query);
      if (!node.hidden) count++;
    }
    const label = document.getElementById('localMapCount');
    if (label) label.textContent = `${count} beatmap${count === 1 ? '' : 's'}`;
    positionCarousel();
  }
  function add(map) {
    maps.set(String(map.id), map);
    window.osuMenuAudio?.registerTrack(map.id, { src: media(map).audio, cover: media(map).cover, artist: map.artist, title: map.title, previewTime: Math.max(0, map.previewTime || 0) / 1000, timingPoints: map.timingPoints?.length ? map.timingPoints : map.difficulties[0]?.timingPoints || [], effectPoints: map.effectPoints?.length ? map.effectPoints : map.difficulties[0]?.effectPoints || [] });
    const previous = list.querySelector(`.mapSet[data-id="${CSS.escape(String(map.id))}"]`);
    if (previous) previous.replaceWith(createSet(map));
    else list.append(createSet(map));
    filter();
  }
  const ready = window.osuMapStore.getAllMaps().then(all => { all.forEach(add); return all; }).catch(error => { window.osuToast?.('Your map library could not be opened: ' + error.message); return []; });
  window.osuLibrary = {
    ready, maps, selectSet,
    async refresh(){const all=await window.osuMapStore.getAllMaps();all.forEach(add);return all;},
    get selection(){const map=maps.get(selectedId);return map?{map,diff:map.difficulties.find(d=>String(d.bid||d.name)===selectedBid)}:null;},
    playSelection() { const map = maps.get(selectedId); const diff = map?.difficulties.find(d => String(d.bid || d.name) === selectedBid); if (diff) launch(map, diff); },
    random() { const visible = [...list.children].filter(node => !node.hidden); if (visible.length) selectSet(visible[Math.floor(Math.random() * visible.length)].dataset.id, null, { center: true }); },
    async restore() {
      await ready;
      let pending;
      try { pending = JSON.parse(sessionStorage.getItem('osu:autoSelectMap') || 'null'); } catch { /* ignore obsolete navigation state */ }
      sessionStorage.removeItem('osu:autoSelectMap');
      const id = pending?.mapId || window.osuMenuAudio?.current?.mapId || selectedId || maps.keys().next().value;
      if (id) selectSet(id, pending?.diffBid, { center: true });
      else list.replaceChildren(element('div', 'libraryEmpty', 'Your starter maps are downloading. You can also Browse or Import your own maps.'));
    }
  };
  document.addEventListener('osu:track-changed',event=>{const id=event.detail.mapId;if(id&&String(id)!==selectedId&&maps.has(String(id))&&window.osuMenuAudio.mode!=='gameplay')selectSet(id,null,{silent:true,center:document.body.classList.contains('view-beatmaps')});});
  document.addEventListener('osu:map-installed', event => {
    list.querySelector('.libraryEmpty')?.remove();
    add(event.detail);
    if (!selectedId && document.body.classList.contains('view-beatmaps')) selectSet(event.detail.id);
  });
  document.querySelector('.searchBox')?.addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); filter(); });
  list.addEventListener('scroll', positionCarousel, { passive: true });
  window.addEventListener('resize',()=>{positionCarousel();if(document.body.classList.contains('view-beatmaps'))document.documentElement.style.setProperty('--selection-info-bottom',document.getElementById('beatmapInfoBox').getBoundingClientRect().bottom+'px');});
  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('view-beatmaps') || document.body.classList.contains('browse-open') || document.body.classList.contains('shell-open') || document.body.classList.contains('results-visible') || document.body.classList.contains('gaming') || window.osuApp?.busy || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'Enter') { event.preventDefault(); window.osuLibrary.playSelection(); return; }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const map = maps.get(selectedId);
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && map) {
      const index = map.difficulties.findIndex(d => String(d.bid || d.name) === selectedBid);
      const diff = map.difficulties[(index + (event.key === 'ArrowDown' ? 1 : -1) + map.difficulties.length) % map.difficulties.length];
      selectDifficulty(map, diff);
    } else {
      const visible = [...list.children].filter(node => !node.hidden);
      const index = visible.findIndex(node => node.dataset.id === selectedId);
      const next = visible[(index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
      if (next) selectSet(next.dataset.id, null, { center: true });
    }
  });
  window.addEventListener('pagehide', () => { for (const value of urls.values()) { if (value.audio) URL.revokeObjectURL(value.audio); if (value.cover) URL.revokeObjectURL(value.cover); } });
  window.importFiles = async files => {
    const input = files instanceof File ? [files] : Array.from(files || []);
    const button = document.querySelector('.menuBtn.import');
    button.disabled = true;
    let last;
    try {
      for (const file of input) {
        if (!/\.osz$/i.test(file.name)) { window.osuToast('Please select .osz beatmap archives.'); continue; }
        window.osuToast('Importing ' + file.name + '…');
        try { last = await window.osuImportOsz(file); } catch (error) { window.osuToast(error.message, true); }
      }
      if (last) { await window.osuMenu.openSelection(); selectSet(last.id, null, { center: true }); }
    } finally { button.disabled = false; }
  };
})();
