/* The master dial controls music only; UI sounds and gameplay effects are separate. */
(() => {
  // This setting has a different scope from the former combined master volume.
  const key = 'osu:musicVolume';
  let value = .15, lastAudible = .15;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null && Number.isFinite(Number(saved))) value = Math.max(0,Math.min(1,Number(saved)));
  } catch { /* Private browser sessions can still adjust volume in memory. */ }
  if (value > 0) lastAudible = value;
  function set(next) {
    value = Math.round(Math.max(0,Math.min(1,Number(next) || 0))*100)/100;
    if (value > 0) lastAudible = value;
    try { localStorage.setItem(key,String(value)); } catch {}
    if (window.game) window.game.musicVolume = value;
    const gameplayGain = window.game?.scene?.osu?.audio?.gain?.gain;
    if (gameplayGain) gameplayGain.value = value;
    window.dispatchEvent(new CustomEvent('osu:volume-changed',{detail:{value}}));
    return value;
  }
  window.osuVolume = { get value() { return value; }, set, reset() { return set(.15); }, toggleMute() { set(value > 0 ? 0 : lastAudible); } };
  const overlay = document.getElementById('volumeOverlay');
  if (!overlay) return;
  const meter = document.getElementById('volumeMeter');
  const mute = document.getElementById('volumeMute');
  let timeout, wheelDelta = 0;
  function render() {
    const percent = Math.round(value*100);
    document.getElementById('volumeValue').textContent = percent === 100 ? 'MAX' : String(percent);
    document.getElementById('volumeArc').setAttribute('stroke-dasharray',`${75*value} 100`);
    meter.setAttribute('aria-valuenow',String(percent));
    mute.setAttribute('aria-pressed',String(value === 0));
    mute.setAttribute('aria-label',value === 0 ? 'Unmute master volume' : 'Mute master volume');
  }
  function show() {
    render(); overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('visible'));
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(() => { if (!overlay.classList.contains('visible')) overlay.hidden = true; },220);
    },1800);
  }
  window.osuVolume.show = show;
  window.addEventListener('osu:volume-changed',() => { render(); if (!overlay.hidden) show(); });
  document.addEventListener('wheel',event => {
    if (!document.getElementById('main')?.classList.contains('active') || document.body.classList.contains('view-beatmaps') || document.body.classList.contains('browse-open') || document.body.classList.contains('shell-open') || event.target.closest('#musicPopover,#starterStatus,input,textarea,select')) return;
    event.preventDefault();
    wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    const steps = Math.trunc(wheelDelta/40);
    if (steps) { set(value - steps*.01); wheelDelta -= steps*40; }
    show();
  },{passive:false});
  meter.addEventListener('keydown',event => {
    const delta = {ArrowUp:.01,ArrowRight:.01,ArrowDown:-.01,ArrowLeft:-.01,PageUp:.1,PageDown:-.1}[event.key];
    if (delta !== undefined) { event.preventDefault(); set(value+delta); show(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); set(event.key === 'Home' ? 0 : 1); show(); }
  });
  mute.onclick = () => { window.osuVolume.toggleMute(); show(); };
  render();
})();
