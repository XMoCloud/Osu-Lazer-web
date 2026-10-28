(() => {
  const audio = window.osuMenuAudio;
  const toggle = document.getElementById('musicToggle');
  const popover = document.getElementById('musicPopover');
  const seek = document.getElementById('musicSeek');
  function close() { popover.hidden = true; toggle.setAttribute('aria-expanded','false'); }
  toggle.onclick = () => {
    popover.hidden = !popover.hidden;
    toggle.setAttribute('aria-expanded',String(!popover.hidden));
  };
  document.addEventListener('pointerdown',event => { if (!popover.hidden && !popover.contains(event.target) && !toggle.contains(event.target)) close(); });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !popover.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(); toggle.focus(); }
  });
  document.getElementById('ctrlShuffle').onclick = () => {
    audio.shuffle = !audio.shuffle;
    document.getElementById('ctrlShuffle').setAttribute('aria-pressed',String(audio.shuffle));
  };
  document.getElementById('ctrlPlaylist').onclick = () => { close(); window.osuMenu.openSelection(); };
  seek.addEventListener('input',() => {
    if (Number.isFinite(audio.audio.duration) && audio.audio.duration > 0) audio.audio.currentTime = audio.audio.duration*Number(seek.value)/1000;
  });
  function updateArtwork(track) {
    document.getElementById('songTitle').textContent = track.title || 'Unknown track';
    document.getElementById('songArtist').textContent = track.artist || '';
    document.getElementById('musicArtwork').style.backgroundImage = `linear-gradient(180deg,#17121955,#170e1990),url("${track.cover || 'assets/background.png'}")`;
  }
  document.addEventListener('osu:track-changed',event => updateArtwork(event.detail));
  audio.audio.addEventListener('timeupdate',() => {
    const duration = audio.audio.duration;
    const fraction = Number.isFinite(duration) && duration > 0 ? audio.audio.currentTime/duration : 0;
    document.getElementById('progressFill').style.transform = `scaleX(${fraction})`;
    if (document.activeElement !== seek) seek.value = String(Math.round(fraction*1000));
    const left = Math.max(0,duration-audio.audio.currentTime);
    document.getElementById('timeLeft').textContent = Number.isFinite(left) ? `-${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}` : '';
  });
  window.osuMusicPlayer = { close };
})();
