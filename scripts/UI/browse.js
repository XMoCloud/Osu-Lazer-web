(() => {
  const root = document.getElementById('onlineBrowser');
  const results = document.getElementById('browseResults');
  const input = document.getElementById('browseSearch');
  const message = document.getElementById('browseMessage');
  const more = document.getElementById('browseMore');
  const retry = document.getElementById('browseRetry');
  const states = new Map();
  let category = 'ranked', sort = 'ranked', page = 0, controller, sequence = 0, debounce, focusBefore, populated = false;
  function el(tag, name, text) {
    const node = document.createElement(tag);
    node.className = name;
    if (text != null) node.textContent = text;
    return node;
  }
  function updateCard(id, state) {
    states.set(String(id), state);
    const card = results.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
    if (!card) return;
    const button = card.querySelector('.cardDownload');
    const progress = card.querySelector('progress');
    card.classList.toggle('installed', state.state === 'installed');
    progress.hidden = !['queued', 'downloading', 'importing'].includes(state.state);
    if (state.fraction != null) progress.value = state.fraction;
    else progress.removeAttribute('value');
    button.disabled = state.state === 'importing';
    button.textContent = {
      queued: 'Cancel', downloading: state.total ? `${Math.round(state.loaded / state.total * 100)}% · Cancel` : 'Downloading · Cancel',
      importing: 'Importing…', installed: '✓ Installed', error: 'Retry download', cancelled: '↓ Download'
    }[state.state] || '↓ Download';
  }
  function card(set) {
    const node = el('article', 'onlineMapCard');
    node.dataset.id = set.id;
    const image = el('img', 'cardCover');
    image.src = set.cover; image.alt = ''; image.loading = 'lazy';
    image.onerror = () => { image.src = 'assets/background.png'; image.onerror = null; };
    const body = el('div', 'onlineCardBody');
    body.style.backgroundImage = `linear-gradient(90deg, rgba(53,65,72,.93), rgba(53,65,72,.78)), url("${set.cover}")`;
    const title = el('h2', 'cardTitle', set.title); title.title = set.title;
    const artist = el('div', 'cardArtist', 'by ' + set.artist);
    const mapper = el('div', 'cardMapper', 'mapped by ' + set.creator);
    const meta = el('div', 'cardMeta');
    meta.append(el('span', 'statusTag status-' + set.status, set.status), el('span', 'modeTag', '◎'));
    for (const diff of set.beatmaps.slice().sort((a, b) => a.difficulty_rating - b.difficulty_rating)) {
      const pip = el('i', 'difficultyPip ' + window.osuStarClass(diff.difficulty_rating));
      window.osuDifficulty.apply(pip,diff.difficulty_rating);
      pip.title = `${diff.version} · ${Number(diff.difficulty_rating).toFixed(2)}★`;
      meta.append(pip);
    }
    const actions = el('div', 'cardActions');
    const preview = el('button', 'cardPreview', '▷');
    preview.type = 'button'; preview.title = 'Preview ' + set.title; preview.setAttribute('aria-label', preview.title);
    preview.onclick = () => window.osuMenuAudio.playPreview(set);
    const download = el('button', 'cardDownload', '↓ Download');
    download.type = 'button';
    download.onclick = async () => {
      if (window.osuDownloads.isActive(set.id)) { window.osuDownloads.cancel(set.id); return; }
      if (window.osuLibrary.maps.has(set.id)) {
        close();
        await window.osuMenu.openSelection();
        window.osuLibrary.selectSet(set.id, null, { center: true });
        return;
      }
      try {
        await window.osuDownloads.install(set.id, { metadata: set });
        updateCard(set.id, { state: 'installed' });
        window.osuToast(set.title + ' added to your library.');
      } catch (error) { if (error.name !== 'AbortError') window.osuToast(error.message + ' You can retry the download.', true); }
    };
    const progress = el('progress', 'cardProgress'); progress.max = 1; progress.hidden = true;
    actions.append(preview, download);
    body.append(title, artist, mapper, meta, actions, progress);
    node.append(image, body);
    const state = window.osuLibrary.maps.has(set.id) ? { state: 'installed' } : states.get(set.id);
    // State is applied after the card has been attached to the grid.
    if (state) node._downloadState = state;
    return node;
  }
  async function search(append = false) {
    controller?.abort();
    controller = new AbortController();
    const token = ++sequence;
    if (!append) page = 0;
    more.hidden = true; retry.hidden = true;
    message.hidden = false;
    message.textContent = 'Searching beatmaps…';
    results.setAttribute('aria-busy', 'true');
    window.osuMenuAudio.stopPreview();
    try {
      const data = await window.osuBeatmaps.search({ query: input.value.trim(), category, sort, page, signal: controller.signal });
      if (token !== sequence) return;
      if (!append) results.replaceChildren();
      const existing = new Set([...results.children].map(node => node.dataset.id));
      for (const set of data.maps) {
        if (existing.has(set.id)) continue;
        const node = card(set); results.append(node);
        if (node._downloadState) updateCard(set.id, node._downloadState);
      }
      populated = true;
      message.textContent = results.children.length ? '' : 'No matching standard beatmaps. Try another title, artist, or paste a beatmap set link.';
      message.hidden = !!results.children.length;
      more.hidden = !data.more;
      const first = data.maps[0];
      if (first) root.style.setProperty('--browse-cover', `url("${first.cover}")`);
    } catch (error) {
      if (token !== sequence || error.name === 'AbortError') return;
      message.textContent = 'The beatmap server is unavailable. ' + error.message;
      retry.hidden = false;
      if (append) page = Math.max(0, page - 1);
    } finally { if (token === sequence) results.setAttribute('aria-busy', 'false'); }
  }
  function open() {
    if (root.classList.contains('open')) return;
    focusBefore = document.activeElement;
    root.hidden = false;
    document.body.classList.add('browse-open');
    document.getElementById('main').inert = true;
    requestAnimationFrame(() => root.classList.add('open'));
    input.focus({ preventScroll: true });
    if (!populated) search();
  }
  function close() {
    if (root.hidden) return;
    controller?.abort(); clearTimeout(debounce); sequence++;
    root.classList.remove('open');
    document.body.classList.remove('browse-open');
    document.getElementById('main').inert = false;
    window.osuMenuAudio.stopPreview();
    setTimeout(() => { if (!root.classList.contains('open')) root.hidden = true; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360);
    focusBefore?.focus?.({ preventScroll: true });
  }
  document.getElementById('browseClose').onclick = close;
  root.querySelector('[data-close-browser]').onclick = close;
  document.getElementById('browseSearchForm').onsubmit = event => { event.preventDefault(); clearTimeout(debounce); search(); };
  input.oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => search(), 350); };
  document.getElementById('browseCategories').onclick = event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    category = button.dataset.category;
    root.querySelectorAll('[data-category]').forEach(node => node.classList.toggle('active', node === button));
    search();
  };
  root.querySelector('.browseSort').onclick = event => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    sort = button.dataset.sort;
    root.querySelectorAll('[data-sort]').forEach(node => node.classList.toggle('active', node === button));
    search();
  };
  more.onclick = () => { page++; search(true); };
  retry.onclick = () => search();
  document.addEventListener('osu:download-progress', event => updateCard(event.detail.id, event.detail));
  document.addEventListener('osu:preview-changed', event => {
    const node = results.querySelector(`[data-id="${CSS.escape(String(event.detail.id))}"] .cardPreview`);
    if (node) { node.textContent = event.detail.playing ? 'Ⅱ' : '▷'; node.setAttribute('aria-pressed', String(event.detail.playing)); }
  });
  document.addEventListener('keydown', event => {
    if (!root.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const nodes = [...root.querySelectorAll('button:not([disabled]),input,a[href]')].filter(node => !node.hidden && node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    }
  });
  window.osuBrowse = { open, close };
})();
