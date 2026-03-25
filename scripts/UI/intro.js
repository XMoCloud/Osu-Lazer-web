(function() {
  const audio = document.getElementById('bgm');
  const video = document.getElementById('introVideo');
  const startOverlay = document.getElementById('startOverlay');
  const whiteFade = document.getElementById('whiteFade');
  const main = document.getElementById('main');
  const logo = document.getElementById('logo');
  const logoStable = document.getElementById('logo-stable-sibling');
  const menuStrip = document.getElementById('menuStrip');
  let firstPlay = true;
  const sfxOpen = document.getElementById('sfxOpen');
  const sfxBack = document.getElementById('sfxBack');
  const sfxHover = document.getElementById('sfxHover');
  const sfxPlayClick = document.getElementById('sfxPlayClick');
  const menuRight = document.querySelector('#menuStrip .menuRight');
  const topBar = document.getElementById('topBar');
  const songTitleEl = document.getElementById('songTitle');
  const ctrlPrev = document.getElementById('ctrlPrev');
  const ctrlToggle = document.getElementById('ctrlToggle');
  const ctrlNext = document.getElementById('ctrlNext');
  const clockEl = document.getElementById('clock');
  const progressFillEl = document.getElementById('progressFill');
  const timeLeftEl = document.getElementById('timeLeft');
  const beatmapBrowser = document.getElementById('beatmapBrowser');
  const selectionFade = document.getElementById('selectionFade');
  const autoOpenBeatmaps = (() => {
    const flag = sessionStorage.getItem('osu:autoOpenBeatmaps');
    if (flag === '1') {
      sessionStorage.removeItem('osu:autoOpenBeatmaps');
      return true;
    }
    return false;
  })();

  let audioReady = false;
  let videoReady = false;
  let rafId = 0;
  let mainRevealed = false;
  let parallaxHandler = null;

  
  const playlist = [
    { src: 'hitsounds/Trinagles.mp3', artist: 'cYsmix', title: 'Triangles' }
  ];
  let currentTrackIndex = 0;

  
  
  window.registerImportedTrack = function(track) {
    if (!track || !track.src) return -1;
    playlist.push(track);
    return playlist.length - 1; 
  };

  window.playTrackByIndex = function(idx) {
    if (typeof idx !== 'number' || idx < 0 || idx >= playlist.length) return;
    setTrack(idx, true);
  };

  function updateSongTitle() {
    if (!songTitleEl) return;
    
    try {
      const m = window.currentPlayingMap;
      if (m && (m.title || m.artist)) {
        const artist = m.artist || '';
        const title = m.title || '';
        songTitleEl.textContent = artist + (artist && title ? ' - ' : '') + title;
        return;
      }
    } catch(_) {}
    
    const t = playlist[currentTrackIndex] || { artist: '', title: '' };
    songTitleEl.textContent = `${t.artist}${t.artist && t.title ? ' - ' : ''}${t.title}`;
  }

  function setTrack(index, autoplay = true) {
    if (index < 0) index = (playlist.length + (index % playlist.length)) % playlist.length;
    if (playlist.length > 0) index = index % playlist.length;
    currentTrackIndex = index;
    const t = playlist[currentTrackIndex];
    const desired = t.src;
    const seekTime = t.previewTime || 0;
    
    
    try { audio.pause(); } catch(e) {}
    
    
    audio.src = desired;
    
    if (seekTime > 0) {
      
      const seek = () => {
        if (audio.readyState >= 1) {
          audio.currentTime = seekTime;
        } else {
          audio.addEventListener('loadedmetadata', () => {
            audio.currentTime = seekTime;
          }, { once: true });
        }
      };
      seek();
    }
    
    prevSpec = null;
    fluxHistory = [];
    fluxSum = 0; fluxSumSq = 0;
    lastKickTime = -Infinity;
    kickPulse = 0;
    
    try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch(e) {}
    updateSongTitle();
    if (autoplay) {
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          
          if (e.name !== 'AbortError') console.warn('Audio play error:', e);
        });
      }
    }
    
    if (ctrlToggle) ctrlToggle.classList.toggle('paused', audio.paused);
  }

  
  let audioCtx = null, analyser = null, freqData = null;
  
  let clickBuffer = null;
  
  let prevSpec = null;              
  let fluxHistory = [];             
  let fluxSum = 0, fluxSumSq = 0;   
  const fluxWindow = 48;            
  
  let kickPulse = 0;
  let lastKickTime = -Infinity;
  const kickConfig = {
    minHz: 55,
    maxHz: 130,
    thresholdK: 2.2,       
    refractory: 0.16,      
    decayPerSec: 7.5,      
    amp: 0.03,             
    gamma: 0.85            
  };

  

  
  let hoverTarget = 0;   
  let hoverX = 0;        
  let hoverV = 0;        
  const spring = { k: 72, c: 4 }; 

  
  let menuTarget = 1.0;  
  let menuScale = 1.0;
  let menuV = 0;
  const menuSpring = { k: 32, c: 5 };

  
  let viewBeatmaps = false;
  const beatmapsScale = 0.72; 

  
  let menuShiftTarget = 0; 
  let menuShiftX = 0;
  let menuShiftV = 0;
  const shiftSpring = { k: 28, c: 5 };

  function tryAutoplay() {
    
    if (!isFinite(audio.duration)) audio.currentTime = 0;
    if (!isFinite(video.duration)) video.currentTime = 0;
    const aPlay = audio.play();
    const vPlay = video.play();

    
    Promise.allSettled([aPlay, vPlay]).then(results => {
      const audioOK = results[0].status === 'fulfilled';
      const videoOK = results[1].status === 'fulfilled';
      if (!audioOK || !videoOK) {
        startOverlay.classList.add('active');
      }
    });
  }

  function begin() {
    startOverlay.classList.remove('active');
    tryAutoplay();
    
    setupAudioAnalysis();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function bothReady() {
    return audioReady && videoReady;
  }

  function setupAudioAnalysis() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024; 
      analyser.smoothingTimeConstant = 0.2; 
      
      src.connect(analyser);
      src.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      
      preloadClickBuffer();
    } catch (e) {
      console.warn('Audio analysis unavailable:', e);
    }
  }

  async function preloadClickBuffer(){
    try {
      const res = await fetch('hitsounds/PlayClick.mp3');
      
      if (!res || !res.ok) { clickBuffer = null; return; }
      const arr = await res.arrayBuffer();
      
      clickBuffer = await new Promise((resolve, reject) => {
        try {
          audioCtx.decodeAudioData(arr, b => resolve(b), err => reject(err));
        } catch (e) { reject(e); }
      }).catch(() => null);
    } catch (e) {
      
      clickBuffer = null;
    }
  }

  function playClickSfx(){
    try {
      if (audioCtx && clickBuffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = clickBuffer;
        const gain = audioCtx.createGain();
        gain.gain.value = 0.9;
        src.connect(gain).connect(audioCtx.destination);
        src.start(0);
        return;
      }
    } catch(e) {}
    
    try { if (sfxPlayClick) { sfxPlayClick.currentTime = 0; sfxPlayClick.play(); } } catch(e) {}
  }

  function updateBassKick(dt) {
    if (!analyser || !freqData) return;
    analyser.getByteFrequencyData(freqData);
    const sampleRate = audioCtx.sampleRate;
    const nyquist = sampleRate / 2;
    const binHz = nyquist / freqData.length;

    
    const minBin = Math.max(0, Math.floor(kickConfig.minHz / binHz));
    const maxBin = Math.min(freqData.length - 1, Math.floor(kickConfig.maxHz / binHz));

    
    if (!prevSpec || prevSpec.length !== freqData.length) {
      prevSpec = new Float32Array(freqData.length);
      for (let i = 0; i < prevSpec.length; i++) prevSpec[i] = 0;
    }

    
    let flux = 0;
    for (let i = minBin; i <= maxBin; i++) {
      const cur = freqData[i] / 255;       
      const diff = cur - prevSpec[i];
      if (diff > 0) flux += diff;
      prevSpec[i] = cur;
    }

    
    
    fluxHistory.push(flux);
    fluxSum += flux;
    fluxSumSq += flux * flux;
    if (fluxHistory.length > fluxWindow) {
      const old = fluxHistory.shift();
      fluxSum -= old;
      fluxSumSq -= old * old;
    }
    const n = fluxHistory.length;
    const mean = n > 0 ? fluxSum / n : 0;
    const variance = Math.max(0, (n > 0 ? (fluxSumSq / n) - mean * mean : 0));
    const std = Math.sqrt(variance);
    const threshold = mean + kickConfig.thresholdK * std;

    
    const now = audio.currentTime || 0;
    const canTrigger = (now - lastKickTime) >= kickConfig.refractory;
    if (canTrigger && flux > threshold && flux > 0.001) {
      lastKickTime = now;
      kickPulse = 1; 
    } else {
      
      kickPulse = Math.max(0, kickPulse - kickConfig.decayPerSec * dt);
    }
  }

  

  function updateSpring(dt, x, v, target, K, C) {
    
    const a = -K * (x - target) - C * v;
    v += a * dt;
    x += v * dt;
    return [x, v];
  }

  function applyLogoTransform(scale, stableScale) {
    const tx = menuShiftX | 0; 
    
    let shiftX = 0, shiftY = 0;
    if (viewBeatmaps) {
      const margin = 16;
      const bottomBar = 56; 
      const scaleNow = scale;
      const lw = logo.offsetWidth || 400;
      const lh = logo.offsetHeight || lw;
      const halfW = (lw * scaleNow) / 2;
      const halfH = (lh * scaleNow) / 2;
      shiftX = Math.max(0, (window.innerWidth / 2) - margin - halfW);
      shiftY = Math.max(0, (window.innerHeight / 2) - bottomBar - margin - halfH);
    }
    const extraScale = viewBeatmaps ? beatmapsScale : 1;
    logo.style.transform = `translate3d(${(tx + (shiftX|0))}px,${(shiftY|0)}px,0) scale(${(scale * extraScale).toFixed(4)})`;
    if (logoStable) {
      logoStable.style.transform = `translate3d(${(tx + (shiftX|0))}px,${(shiftY|0)}px,0) scale(${(stableScale * extraScale).toFixed(4)})`;
    }
    
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    
    frame.prev = frame.prev || now;
    const dt = Math.min(0.05, (now - frame.prev) / 1000); 
    frame.prev = now;

  updateBassKick(dt);

    
    [hoverX, hoverV] = updateSpring(dt, hoverX, hoverV, hoverTarget, spring.k, spring.c);
    const hoverScale = 1 + 0.22 * hoverX; 

    
  [menuScale, menuV] = updateSpring(dt, menuScale, menuV, menuTarget, menuSpring.k, menuSpring.c);
  [menuShiftX, menuShiftV] = updateSpring(dt, menuShiftX, menuShiftV, menuShiftTarget, shiftSpring.k, shiftSpring.c);

    
    const pulse = Math.pow(Math.min(1, Math.max(0, kickPulse)), kickConfig.gamma);
    const beatScale = 1 - kickConfig.amp * pulse;
    const menuAndHoverScale = hoverScale * menuScale;
    const finalScale = beatScale * menuAndHoverScale;
    applyLogoTransform(finalScale, menuAndHoverScale);

    

    
    if (menuStrip.classList.contains('open') && menuRight && logoStable) {
      const stripRect = menuStrip.getBoundingClientRect();
      const logoRect = logoStable.getBoundingClientRect(); 
      
      const overlap = 12; 
      const left = Math.max(0, Math.round(logoRect.right - stripRect.left - overlap));
      menuRight.style.left = left + 'px';
    }

    
    if (progressFillEl) {
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      const cur = audio.currentTime || 0;
      const frac = dur > 0 ? Math.min(1, Math.max(0, cur / dur)) : 0;
      progressFillEl.style.width = (frac * 100).toFixed(2) + '%';
      if (timeLeftEl && dur > 0) {
        const remain = Math.max(0, dur - cur);
        const mins = Math.floor(remain / 60);
        const secs = Math.floor(remain % 60).toString().padStart(2, '0');
        timeLeftEl.textContent = `-${mins}:${secs}`;
      }
    }
  }

  
  audio.addEventListener('canplay', () => { audioReady = true; if (bothReady()) tryAutoplay(); }, { once: true });
  video.addEventListener('canplay', () => { videoReady = true; if (bothReady()) tryAutoplay(); }, { once: true });

  
  if (audio.readyState >= 2) audioReady = true;
  if (video.readyState >= 2) videoReady = true;
  if (bothReady()) {
    
    tryAutoplay();
  } else {
    
    setTimeout(() => { if (bothReady()) tryAutoplay(); }, 500);
  }

  
  
  if (autoOpenBeatmaps) {
    
    setTimeout(() => {
      
      whiteFade.classList.add('active');
      
      revealMainAndOpenBeatmaps();
    }, 60);
  }

  
  startOverlay.addEventListener('click', begin);

  function revealMainAndOpenBeatmaps() {
    if (mainRevealed) return; 
    mainRevealed = true;
    
    document.body.style.overflow = 'hidden';
    document.getElementById('intro').style.display = 'none';
    main.classList.add('active');
    
    setTimeout(() => { whiteFade.classList.remove('active'); }, 80);
    
    setupAudioAnalysis();
    if (audioCtx && audioCtx.state === 'suspended') {
      const resume = () => { audioCtx.resume(); window.removeEventListener('click', resume); };
      window.addEventListener('click', resume);
    }
  
    if (!rafId) rafId = requestAnimationFrame(frame);
    if (autoOpenBeatmaps) {
      
      try {
        if (window.__openBeatmapBrowserNow) {
          window.__openBeatmapBrowserNow();
        } else {
          
          const playBtn = document.querySelector("#menuStrip .menuBtn.play");
          if (playBtn) playBtn.click();
        }
      } catch (_) {}
    }
  }

  
  video.addEventListener('ended', () => {
    if (mainRevealed) return;
    whiteFade.classList.add('active');
    
    whiteFade.addEventListener('transitionend', () => {
      if (!mainRevealed) revealMainAndOpenBeatmaps();
    }, { once: true });
  });

  
  logo.addEventListener('mouseenter', () => { hoverTarget = 1; hoverV += 4; });
  logo.addEventListener('mouseleave', () => { hoverTarget = 0; hoverV -= 4; });

  
  function openMenu(opts = {}) {
    const { suppressSfx = false } = opts;
    if (menuStrip.classList.contains('open')) return;
    
    try { menuStrip.inert = false; } catch(_) {}
    menuStrip.classList.add('open');
    menuTarget = 0.68; 
    
    const target = -Math.min(320, Math.round(window.innerWidth * 0.18));
    menuShiftTarget = target;
    
    if (!suppressSfx) {
      try { if (sfxOpen) { sfxOpen.currentTime = 0; sfxOpen.play(); } } catch(e) {}
    }
    if (topBar) {
      updateSongTitle();
      topBar.classList.add('active');
    }
  }
  function closeMenu() {
    if (!menuStrip.classList.contains('open')) return;
    menuStrip.classList.remove('open');
    
    try {
      menuStrip.inert = true;
      const active = document.activeElement;
      if (active && menuStrip.contains(active)) {
        try { active.blur(); } catch(_) {}
        
        try { document.body.focus({ preventScroll: true }); } catch(_) {}
      }
    } catch(_) {}
    menuTarget = 1.0;
    menuShiftTarget = 0;
    
    menuStrip.classList.remove('hover-play','hover-import');
    
    try { if (sfxBack) { sfxBack.currentTime = 0; sfxBack.play(); } } catch(e) {}
    if (topBar) topBar.classList.remove('active');
  }
  
  logo.addEventListener('click', () => {
    
    logo.classList.remove('flash');
    void logo.offsetWidth; 
    logo.classList.add('flash');

    if (menuStrip.classList.contains('open')) closeMenu(); else openMenu();
  });
  
  logo.addEventListener('animationend', (e) => {
    if (e.animationName === 'logoFlash') {
      logo.classList.remove('flash');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (viewBeatmaps) {
        
        leaveBeatmapBrowser();
      } else {
        closeMenu();
      }
    }
  });

  
  window.addEventListener('resize', () => {
    if (menuStrip.classList.contains('open')) {
      menuShiftTarget = -Math.min(320, Math.round(window.innerWidth * 0.18));
    }
  });

  

  
  (function setupMenuButtons(){
    const btnPlay = document.querySelector('#menuStrip .menuBtn.play');
    const btnImport = document.querySelector('#menuStrip .menuBtn.import');
    const btnExit = document.querySelector('#menuStrip .menuBtn.exit');
  if (!btnPlay || !btnImport || !btnExit) return;

    const enterPlay = () => {
      menuStrip.classList.add('hover-play');
      menuStrip.classList.remove('hover-import');
      try { if (sfxHover) { sfxHover.currentTime = 0; sfxHover.play(); } } catch(e) {}
    };
    const leavePlay = () => {
      menuStrip.classList.remove('hover-play');
    };
    const enterImport = () => {
      menuStrip.classList.add('hover-import');
      menuStrip.classList.remove('hover-play');
      try { if (sfxHover) { sfxHover.currentTime = 0; sfxHover.play(); } } catch(e) {}
    };
    const leaveImport = () => {
      menuStrip.classList.remove('hover-import');
    };

    btnPlay.addEventListener('mouseenter', enterPlay);
    btnPlay.addEventListener('mouseleave', leavePlay);
    btnImport.addEventListener('mouseenter', enterImport);
    btnImport.addEventListener('mouseleave', leaveImport);

    const enterExit = () => {
      menuStrip.classList.add('hover-exit');
      menuStrip.classList.remove('hover-play','hover-import');
      try { if (sfxHover) { sfxHover.currentTime = 0; sfxHover.play(); } } catch(e) {}
    };
    const leaveExit = () => {
      menuStrip.classList.remove('hover-exit');
    };
    btnExit.addEventListener('mouseenter', enterExit);
    btnExit.addEventListener('mouseleave', leaveExit);

    
    function clickFlash(el){
      if (!el) return;
      el.classList.remove('flash');
      
      void el.offsetWidth;
      el.classList.add('flash');
      playClickSfx();
    }

    
    function showNoMapsOverlay() {
      let ov = document.getElementById('noMapsOverlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'noMapsOverlay';
        Object.assign(ov.style, {
          position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
          background: 'rgba(0,0,0,0.82)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: '99999',
          fontFamily: 'Quicksand, sans-serif', letterSpacing: '0.04em'
        });
        const box = document.createElement('div');
        Object.assign(box.style, {
          textAlign: 'center',
          padding: '28px 32px',
          maxWidth: '720px', width: 'min(90vw, 720px)'
        });
        const title = document.createElement('div');
        title.textContent = 'NO BEATMAPS FOUND';
        Object.assign(title.style, {
          fontSize: 'clamp(22px, 4vw, 36px)',
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: '12px'
        });
        const msg = document.createElement('div');
        msg.textContent = 'Go to Import on the Start Menu to add maps (.osz).';
        Object.assign(msg.style, {
          fontSize: 'clamp(14px, 2.4vw, 18px)',
          opacity: '0.9'
        });
        const hint = document.createElement('div');
        hint.textContent = 'Click anywhere to return.';
        Object.assign(hint.style, {
          fontSize: '12px',
          opacity: '0.7',
          marginTop: '16px'
        });
        box.appendChild(title); box.appendChild(msg); box.appendChild(hint);
        ov.appendChild(box);

        
        ov.addEventListener('click', () => { try { ov.remove(); } catch(e){} });
        ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { try { ov.remove(); } catch(_){} } });
        document.body.appendChild(ov);
        try { ov.tabIndex = -1; ov.focus(); } catch(_) {}
      }
    }

    async function hasAnyBeatmaps() {
      try {
        if (window.osuMapStore && typeof window.osuMapStore.getAllMaps === 'function') {
          const all = await window.osuMapStore.getAllMaps();
          return Array.isArray(all) && all.length > 0;
        }
      } catch(_) {}
      
      try {
        const items = document.querySelectorAll('.beatmapItem');
        return items && items.length > 0;
      } catch(_) { return false; }
    }

    
    window.__openBeatmapBrowserNow = async () => {
      
      if (!(await hasAnyBeatmaps())) {
        showNoMapsOverlay();
        return;
      }
      
      try {
        const sb = document.querySelector('.searchBox');
        if (sb) { sb.value = ''; sb.dispatchEvent(new Event('input', { bubbles: true })); }
      } catch(_) {}
      
      closeMenu();
      if (selectionFade) {
        selectionFade.classList.remove('anim');
        void selectionFade.offsetWidth;
        selectionFade.classList.add('anim');
      }
      
      viewBeatmaps = true;
      document.body.classList.add('view-beatmaps');
      if (topBar) topBar.classList.add('active');
      if (beatmapBrowser) beatmapBrowser.hidden = false;
      setupLeaderboardPushdown();
      if (!parallaxHandler) {
        parallaxHandler = (e) => {
          const bg = document.querySelector('.pageBackground');
          if (!bg || !bg.style.backgroundImage) return;
          const rect = bg.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const deltaX = (e.clientX - centerX) / centerX * 5;
          const deltaY = (e.clientY - centerY) / centerY * 5;
          bg.style.backgroundPosition = `calc(50% + ${-deltaX}px) calc(50% + ${-deltaY}px)`;
        };
        document.addEventListener('mousemove', parallaxHandler);
      }
      document.dispatchEvent(new CustomEvent('osu:beatmaps-opened'));
      
      setTimeout(() => {
        const pendingSelection = sessionStorage.getItem('osu:autoSelectMap');
        const chooseFallbackBeatmap = () => {
          const items = document.querySelectorAll('.beatmapItem');
          if (items.length > 0) {
            if (firstPlay) {
              const randomIndex = Math.floor(Math.random() * items.length);
              items[randomIndex].click();
              firstPlay = false;
            } else if (window.currentPlayingMap) {
              const currentItem = document.querySelector(`.beatmapItem[data-id="${window.currentPlayingMap.id}"]`);
              if (currentItem) {
                currentItem.scrollIntoView({ behavior: 'smooth' });
                currentItem.click();
              } else {
                const randomIndex = Math.floor(Math.random() * items.length);
                items[randomIndex].click();
              }
            } else {
              const randomIndex = Math.floor(Math.random() * items.length);
              items[randomIndex].click();
            }
          }
        };
        if (pendingSelection) {
          
          setTimeout(() => {
            if (sessionStorage.getItem('osu:autoSelectMap')) {
              sessionStorage.removeItem('osu:autoSelectMap');
              chooseFallbackBeatmap();
            }
          }, 600);
          return;
        }
        chooseFallbackBeatmap();
      }, 80);
    };

    
    btnPlay.addEventListener('click', async () => {
      clickFlash(btnPlay);
      window.__openBeatmapBrowserNow && window.__openBeatmapBrowserNow();
    });
    btnImport.addEventListener('click', () => {
      clickFlash(btnImport);
      
      let picker = document.getElementById('importPicker');
      if (!picker) {
        picker = document.createElement('input');
        picker.type = 'file';
        picker.id = 'importPicker';
        picker.multiple = true;
  picker.accept = '.osz,.osu,application/zip,audio/*,image/*';
  
  
        picker.style.display = 'none';
        document.body.appendChild(picker);
        picker.addEventListener('change', (ev) => {
          const files = ev.target.files;
          if (files && files.length && window.importFiles) {
            window.importFiles(files);
          }
          
          picker.value = null;
        });
      }
      picker.click();
    });
  btnExit.addEventListener('click', () => {
      
      closeMenu();
      const blackFade = document.getElementById('blackFade');
      const outro = document.getElementById('outro');
      const outroVideo = document.getElementById('outroVideo');
      try { audio.pause(); } catch (e) {}
      if (blackFade) blackFade.classList.add('active');

      const runOutro = () => {
        if (outro) outro.classList.add('active');
        if (blackFade) blackFade.classList.remove('active');
        if (outroVideo) {
          try {
            outroVideo.currentTime = 0;
            const p = outroVideo.play();
            if (p && typeof p.then === 'function') {
              p.catch(() => finishAndClose());
            }
            outroVideo.addEventListener('ended', finishAndClose, { once: true });
          } catch (e) {
            finishAndClose();
          }
        } else {
          finishAndClose();
        }
      };

      const finishAndClose = () => {
        let closed = false;
        try { window.close(); closed = true; } catch(e) {}
        
        try { if (!closed) { window.open('', '_self'); window.close(); closed = true; } } catch(e) {}
        
        if (!closed) {
          try { window.location.replace('about:blank'); } catch(e) {}
        }
      };

      
      if (blackFade) {
        blackFade.addEventListener('transitionend', runOutro, { once: true });
      }
      
      setTimeout(runOutro, 260);
    });
  })();

  
  let _lbPushdownInit = false;
  let _lbRo = null;
  function applyLbPushdown() {
    const info = document.getElementById('beatmapInfoBox');
    const rect = info ? info.getBoundingClientRect() : { bottom: 220 };
    const bottom = Math.max(0, Math.round(rect.bottom));
    document.documentElement.style.setProperty('--beatmapInfoBottom', bottom + 'px');
  }
  function setupLeaderboardPushdown() {
    if (_lbPushdownInit) { applyLbPushdown(); return; }
    const info = document.getElementById('beatmapInfoBox');
    const lb = document.querySelector('.leaderboardContainer');
    if (!info || !lb) return;
    _lbPushdownInit = true;
    try {
      _lbRo = new ResizeObserver(applyLbPushdown);
      _lbRo.observe(info);
    } catch (_) {}
    window.addEventListener('resize', applyLbPushdown);
    applyLbPushdown();
  }

  
  document.addEventListener('osu:beatmaps-opened', () => {
    setupLeaderboardPushdown();
  });

  
  function leaveBeatmapBrowser(){
    
    try { if (sfxBack) { sfxBack.currentTime = 0; sfxBack.play(); } } catch(e) {}
    viewBeatmaps = false;
    
    if (parallaxHandler) {
      document.removeEventListener('mousemove', parallaxHandler);
      parallaxHandler = null;
      const bg = document.querySelector('.pageBackground');
      if (bg) bg.style.backgroundPosition = 'center';
    }
    document.body.classList.remove('view-beatmaps');
    
    openMenu({ suppressSfx: true });
    
    setTimeout(() => { if (beatmapBrowser) beatmapBrowser.hidden = true; }, 320);
  }

  function launchSelectedDifficulty() {
    if (!viewBeatmaps) return false;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return false;
    }
    const diffBox = document.querySelector('.difficultyGroup.open .difficultyBox.extended');
    if (!diffBox) return false;
    const diffGroup = diffBox.closest('.difficultyGroup');
    if (!diffGroup) return false;
    let beatmapItem = diffGroup.previousElementSibling;
    while (beatmapItem && !(beatmapItem.classList && beatmapItem.classList.contains('beatmapItem'))) {
      beatmapItem = beatmapItem.previousElementSibling;
    }
    if (!beatmapItem) return false;

    const mapData = beatmapItem._beatmapData || null;
    const mapId = mapData && mapData.id ? String(mapData.id) : (beatmapItem.dataset && beatmapItem.dataset.id ? String(beatmapItem.dataset.id) : '');
    if (!mapId) return false;

    const diffBidAttr = diffBox.dataset && diffBox.dataset.bid ? String(diffBox.dataset.bid) : '';
    const diffNameAttr = diffBox.dataset && diffBox.dataset.diffname ? diffBox.dataset.diffname.trim() : '';
    const diffNameEl = diffBox.querySelector('.difficultyName');
    const diffNameText = diffNameEl && diffNameEl.textContent ? diffNameEl.textContent.trim() : '';
    const lookupName = diffNameAttr || diffNameText;

    let diffInfo = null;
    if (mapData && Array.isArray(mapData.difficulties)) {
      const targetName = lookupName.toLowerCase();
      diffInfo = mapData.difficulties.find((d) => {
        const byBid = diffBidAttr && String(d.bid || '') === diffBidAttr;
        const byName = targetName && String(d.name || '').trim().toLowerCase() === targetName;
        return byBid || byName;
      }) || null;
    }

    const version = diffInfo && (diffInfo.name || diffInfo.version) ? String(diffInfo.name || diffInfo.version) : (lookupName || 'Unknown');
    const beatmapId = diffInfo && diffInfo.bid ? String(diffInfo.bid) : (diffBidAttr || String((mapData && (mapData.beatmapID || mapData.id)) || version));
    const params = new URLSearchParams({
      map: mapId,
      diff: version,
      bid: beatmapId
    });
    window.location.href = `game.html?${params.toString()}`;
    return true;
  }

  
  (function setupBack(){
    if (!beatmapBrowser) return;
    const backBtn = beatmapBrowser.querySelector('.backButton');
    if (!backBtn) return;
    backBtn.addEventListener('click', () => {
      leaveBeatmapBrowser();
    });
  })();

  
  (function setupTopBar(){
    if (!topBar) return;
    updateSongTitle();
  const onPlay = () => { if (ctrlToggle) ctrlToggle.classList.remove('paused'); };
  const onPause = () => { if (ctrlToggle) ctrlToggle.classList.add('paused'); };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    if (ctrlPrev) ctrlPrev.addEventListener('click', () => {
      const wasPlaying = !audio.paused;
      
      try { window.currentPlayingMap = null; } catch(_) {}
      setTrack(currentTrackIndex - 1, wasPlaying);
    });
    if (ctrlNext) ctrlNext.addEventListener('click', () => {
      const wasPlaying = !audio.paused;
      try { window.currentPlayingMap = null; } catch(_) {}
      setTrack(currentTrackIndex + 1, wasPlaying);
    });
    if (ctrlToggle) ctrlToggle.addEventListener('click', () => {
      if (audio.paused) {
        try { audio.play(); } catch(e) {}
      } else {
        audio.pause();
      }
    });

    
    function updateClock(){
      if (!clockEl) return;
      const d = new Date();
      let h = d.getHours();
      const m = d.getMinutes().toString().padStart(2,'0');
      const s = d.getSeconds().toString().padStart(2,'0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      clockEl.textContent = `${h}:${m}:${s} ${ampm}`;
    }
    updateClock();
    setInterval(updateClock, 1000);
  })();

  
  updateSongTitle();

  

  

  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const browserActive = viewBeatmaps || document.body.classList.contains('view-beatmaps');
      if (!browserActive) return;
      const backBtn = document.querySelector('.backButton');
      if (backBtn) backBtn.click();
    } else if (e.key === 'Enter') {
      if (launchSelectedDifficulty()) {
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft') {
      
      const items = Array.from(document.querySelectorAll('.beatmapItem:not(.filter-hidden)'));
      if (items.length === 0) return;
      
      let currentIndex = items.findIndex(el => el.classList.contains('extended'));
      if (currentIndex === -1 && window.currentPlayingMap) {
        const currentItem = document.querySelector(`.beatmapItem:not(.filter-hidden)[data-id="${window.currentPlayingMap.id}"]`);
        if (currentItem) currentIndex = items.indexOf(currentItem);
      }
      if (currentIndex <= 0) currentIndex = items.length - 1; else currentIndex--;
      const next = items[currentIndex];
      if (next) { next.click(); try { next.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(_) {} }
    } else if (e.key === 'ArrowRight') {
      
      const items = Array.from(document.querySelectorAll('.beatmapItem:not(.filter-hidden)'));
      if (items.length === 0) return;
      let currentIndex = items.findIndex(el => el.classList.contains('extended'));
      if (currentIndex === -1 && window.currentPlayingMap) {
        const currentItem = document.querySelector(`.beatmapItem:not(.filter-hidden)[data-id="${window.currentPlayingMap.id}"]`);
        if (currentItem) currentIndex = items.indexOf(currentItem);
      }
      if (currentIndex < 0 || currentIndex >= items.length - 1) currentIndex = 0; else currentIndex++;
      const next = items[currentIndex];
      if (next) { next.click(); try { next.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(_) {} }
    }
  });

  
  
  document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.querySelector('.backButton');
    if (backBtn && !document.getElementById('intro')) {
      
      backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }
  });

})();


