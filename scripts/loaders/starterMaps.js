(() => {
  // Keep the requested difficulty IDs so tutorial/curated selections are deterministic.
  const STARTERS = [
    ['1011011', '2116202'], ['1627313', '3322385'], ['1859697', '4146526'],
    ['2385328', '5158600'], ['2047602', '4766904'], ['2443120', '5330948'],
    ['199535', '484890'], ['936345', '1956104'], ['2184140', '4645432'],
    ['874602', '1827879'], ['576030', '1467098'], ['998953', '2514221'],
    ['1317896', '2732626'], ['50763', '155912'], ['375201', '921985'],
    ['444632', '955216'], ['59345', '187413'], ['1201974', '2736506']
  ];
  const status = document.getElementById('starterStatus');
  const text = document.getElementById('starterText');
  const progress = document.getElementById('starterProgress');
  const retry = document.getElementById('starterRetry');
  let running = false, paused = false, currentId = null;
  async function seed() {
    if (running) return;
    running = true; paused = false;
    retry.hidden = true;
    await window.osuLibrary.ready;
    const missing = STARTERS.filter(([id]) => !window.osuLibrary.maps.has(id));
    if (!missing.length) { running = false; status.hidden = true; return; }
    status.hidden = false;
    let completed = STARTERS.length - missing.length, failures = 0;
    for (const [id, bid] of missing) {
      if (paused) break;
      currentId = id;
      text.textContent = `Getting your starter maps · ${completed}/${STARTERS.length}`;
      progress.removeAttribute('value');
      try {
        await window.osuDownloads.install(id, { preferredBid: bid, background: true, includeVideo: id === '1011011', onProgress: state => {
          if (state.fraction != null) progress.value = state.fraction;
          if (state.state === 'importing') text.textContent = `Adding starter map · ${completed}/${STARTERS.length}`;
        } });
        completed++;
      } catch (error) {
        if (error.name !== 'AbortError') failures++;
        // Do not hold up the menu if the visitor is offline; Retry resumes missing maps only.
        if (!navigator.onLine || failures >= 2) break;
      }
    }
    currentId = null; running = false;
    const remaining = STARTERS.filter(([id]) => !window.osuLibrary.maps.has(id)).length;
    if (remaining) {
      status.hidden = false;
      text.textContent = paused ? 'Starter downloads paused.' : `${STARTERS.length - remaining}/${STARTERS.length} starter maps ready. Remaining maps can be retried.`;
      retry.hidden = false;
    } else {
      const readyMessage = `All ${STARTERS.length} starter maps are ready. Have fun!`;
      window.osuToast(readyMessage);
      text.textContent = readyMessage; progress.value = 1;
      setTimeout(() => { status.hidden = true; }, 4500);
    }
  }
  retry.onclick = seed;
  document.getElementById('starterDismiss').onclick = () => {
    paused = true;
    if (currentId) window.osuDownloads.cancel(currentId);
    status.hidden = true;
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
