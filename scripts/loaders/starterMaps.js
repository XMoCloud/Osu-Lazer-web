(() => {
  // Keep the requested difficulty IDs so tutorial/curated selections are deterministic.
  const STARTERS = [
    ['1011011', '2116202'], ['1627313', '3322385'], ['1859697', '4146526'],
    ['2385328', '5158600'], ['2047602', '4766904'],
    ['199535', '484890'], ['936345', '1956104'], ['2184140', '4645432'],
    ['874602', '1827879'], ['576030', '1467098'], ['998953', '2514221'],
    ['1317896', '2732626'], ['50763', '155912'], ['375201', '921985'],
    ['444632', '955216'], ['59345', '187413'], ['1201974', '2736506'],
    ['1207609', '2514778'], ['52361', '160565'], ['1857663', '3818017'],
    ['404269', '879476'], ['714225', '1513195'], ['993369', '2104708'],
    ['1596341', '3260429'], ['21949', '75980'], ['748273', '1576396'],
    ['1839623', '4130935'], ['31419', '105037'], ['1242183', '2584036'],
    ['501992', '1071369'], ['1079970', '3512544']
  ];
  const status = document.getElementById('starterStatus');
  const text = document.getElementById('starterText');
  const detail = document.getElementById('starterDetail');
  const progress = document.getElementById('starterProgress');
  const retry = document.getElementById('starterRetry');
  const dismiss = document.getElementById('starterDismiss');
  let running = false, paused = false, currentId = null, hideTimer = null;
  const missingMaps = () => STARTERS.filter(([id]) => !window.osuLibrary.maps.has(id));
  function report(state, message, currentFraction = 0) {
    const completed = STARTERS.length - missingMaps().length;
    status.hidden = false;
    status.dataset.state = state;
    text.textContent = `${completed}/${STARTERS.length} downloaded`;
    detail.textContent = message;
    progress.value = Math.min(1, (completed + currentFraction) / STARTERS.length);
    dismiss.setAttribute('aria-label', running ? 'Pause default beatmap downloads' : 'Dismiss default beatmap progress');
    document.dispatchEvent(new CustomEvent('osu:starter-progress', { detail: {
      state, message: `${text.textContent} · ${message}`, completed, total: STARTERS.length,
      fraction: progress.value, active: running
    } }));
  }
  async function seed() {
    if (running) return;
    running = true; paused = false;
    clearTimeout(hideTimer);
    retry.hidden = true;
    await window.osuLibrary.ready;
    const missing = missingMaps();
    if (!missing.length) { running = false; status.hidden = true; return; }
    for (const [id, bid] of missing) {
      if (paused) break;
      if (window.osuLibrary.maps.has(id)) continue;
      currentId = id;
      report('downloading', `Preparing beatmap ${id}…`);
      try {
        await window.osuDownloads.install(id, { preferredBid: bid, background: true, includeVideo: id === '1011011', onProgress: state => {
          if (!['queued', 'downloading', 'importing'].includes(state.state)) return;
          const importing = state.state === 'importing';
          const fraction = importing ? .95 : Math.min(.95, Math.max(0, state.fraction || 0) * .95);
          const percent = state.fraction != null ? ` · ${Math.round(state.fraction * 100)}%` : '';
          report(importing ? 'importing' : 'downloading', `${importing ? 'Importing' : state.state === 'queued' ? 'Queued' : 'Downloading'} beatmap ${id}${importing ? '' : percent}`, fraction);
        } });
        report('downloading', `Beatmap ${id} is ready. Getting the next map…`);
      } catch (error) {
        // An unavailable old map must not prevent newly added maps from downloading.
        // Keep going while online; the final Retry button handles anything missing.
        if (paused || !navigator.onLine) break;
        report('downloading', `Could not add beatmap ${id}. Continuing with the remaining maps…`);
      }
    }
    currentId = null; running = false;
    const remaining = missingMaps().length;
    if (remaining) {
      const message = paused ? 'Downloads paused. Resume whenever you’re ready.' : `${remaining} map${remaining === 1 ? '' : 's'} still missing. Retry to continue downloading.`;
      report(paused ? 'paused' : 'error', message);
      window.osuToast(`${STARTERS.length - remaining}/${STARTERS.length} default beatmaps downloaded. ${message}`, !paused, { quiet: true });
      retry.textContent = paused ? 'Resume downloads' : 'Retry missing maps';
      retry.hidden = false;
    } else {
      const readyMessage = `All ${STARTERS.length} default beatmaps are downloaded and ready to play!`;
      report('complete', readyMessage);
      window.osuToast(readyMessage, false, { quiet: true });
      hideTimer = setTimeout(() => { status.hidden = true; }, 10000);
    }
  }
  retry.onclick = seed;
  dismiss.onclick = () => {
    if (running) {
      paused = true;
      if (currentId) window.osuDownloads.cancel(currentId);
    } else status.hidden = true;
  };
  document.getElementById('tutorialTile').onclick = async () => {
    const button = document.getElementById('tutorialTile');
    button.disabled = true;
    button.querySelector('.tutorialHint').textContent = 'Preparing the tutorial…';
    try {
      const map = await window.osuDownloads.install('1011011', { preferredBid: '2116202' });
      const diff = map.difficulties.find(d => String(d.bid) === '2116202');
      if (!diff) throw new Error('The tutorial difficulty is missing from this archive.');
      await window.osuApp.play(map,diff);
    } catch (error) { window.osuToast('Could not prepare the tutorial. ' + error.message, true); }
    finally { button.disabled = false; button.querySelector('.tutorialHint').textContent = 'Learn to tap, slide and spin. Click here to get started.'; }
  };
  // Start as soon as the menu is available; the player never waits for the whole pack.
  document.addEventListener('osu:menu-ready', () => seed(), { once: true });
  if (document.getElementById('main').classList.contains('active')) seed();
  window.osuStarterMaps = { maps: STARTERS, retry: seed };
})();
