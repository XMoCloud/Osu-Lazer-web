/* Public metadata and selectable full/no-video archives. No account or API secret. */
(() => {
  const cache = new Map();
  const active = new Map();
  let queue = Promise.resolve();
  const MAX_BYTES = 350 * 1024 * 1024;
  const positiveId = value => {
    const id = String(value);
    if (!/^\d+$/.test(id) || Number(id) <= 0) throw new Error('Invalid beatmap set ID.');
    return id;
  };
  async function request(url, { signal, timeout = 18000, headerTimeout = timeout, ...options } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    const timedOut = () => controller.abort(new Error('The map server took too long to respond.'));
    let timer = setTimeout(timedOut, headerTimeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(response.status === 429 ? 'The map server is busy. Please try again shortly.' : `Map server returned ${response.status}.`);
      clearTimeout(timer);timer = setTimeout(timedOut, timeout);
      // Keep timeout/cancellation alive while the response body is being consumed.
      return { response, close() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
    } catch (error) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      throw error;
    }
  }
  async function json(url, options) {
    const result = await request(url, options);
    try { return await result.response.json(); } finally { result.close(); }
  }
  function normalize(set) {
    const beatmaps = (set.beatmaps || []).filter(b => !b.convert && (b.mode === 'osu' || b.mode_int === 0 || b.mode === 0));
    return { ...set, id: String(set.id), beatmaps,
      // Official clips omit CORS headers, so they cannot feed a Web Audio graph.
      preview_url: `https://mirror.hinamizawa.ai/v3/osu/music/preview/${set.id}`,
      preview_fallback: `https://b.ppy.sh/preview/${set.id}.mp3`,
      cover: set.covers?.['card@2x'] || set.covers?.card || `https://assets.ppy.sh/beatmaps/${set.id}/covers/card.jpg`,
      status: set.status || 'pending' };
  }
  async function getSet(id, { signal } = {}) {
    id = positiveId(id);
    if (cache.has(id)) return cache.get(id);
    let lastError;
    for (const base of ['https://osu.direct', 'https://catboy.best']) {
      try {
        const data = await json(`${base}/api/v2/s/${id}`, { signal });
        if (!data?.id) throw new Error('This map is unavailable from the mirror.');
        const set = normalize(data);
        cache.set(id, set);
        return set;
      } catch (error) { if (signal?.aborted) throw error; lastError = error; }
    }
    throw lastError;
  }
  async function search({ query = '', category = 'ranked', sort = 'ranked', page = 0, signal } = {}) {
    const directId = query.trim().match(/^(?:https:\/\/osu\.ppy\.sh\/beatmapsets\/)?(\d+)(?:#.*)?$/);
    if (directId) return { maps: [await getSet(directId[1], { signal })], more: false };
    const params = new URLSearchParams({ query, mode: '0', amount: '24', limit: '24', offset: String(page * 24), sort: `${sort === 'ranked' ? 'ranked_date' : sort}:desc` });
    if (category !== 'any') params.set('status', { ranked: '1', loved: '4', pending: '0', graveyard: '-2' }[category] || '1');
    let lastError;
    for (const base of ['https://osu.direct', 'https://catboy.best']) {
      try {
        const result = await json(`${base}/api/v2/search?${params}`, { signal });
        const raw = Array.isArray(result) ? result : result.beatmapsets;
        if (!Array.isArray(raw)) throw new Error('The map server returned an invalid search result.');
        const maps = raw.map(normalize).filter(set => set.beatmaps.length && !set.nsfw);
        maps.forEach(set => cache.set(set.id, set));
        return { maps, more: raw.length >= 24 };
      } catch (error) { if (signal?.aborted) throw error; lastError = error; }
    }
    throw lastError;
  }
  async function download(id, { signal, onProgress, includeVideo = true } = {}) {
    let lastError;
    // Both no-video providers strip video before transfer; don't fall back to a
    // full archive for this mode. Artwork, music and storyboard assets remain.
    const urls = [`https://mirror.hinamizawa.ai/api/v1/hinai/d/${id}${includeVideo?'':'n'}`];
    if(includeVideo)urls.push(`https://osu.direct/api/d/${id}`);
    urls.push(`https://dl.sayobot.cn/beatmaps/download/${includeVideo?'full':'novideo'}/${id}`);
    for (const url of urls) {
      let result;
      try {
        result = await request(url, { signal, headerTimeout: 12000, timeout: 180000 });
        const total = Number(result.response.headers.get('content-length')) || 0;
        if (total > MAX_BYTES) throw new Error('This beatmap is too large for the browser (350 MB limit).');
        const reader = result.response.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.byteLength;
          if (loaded > MAX_BYTES) { await reader.cancel(); throw new Error('This beatmap exceeds the 350 MB download limit.'); }
          chunks.push(value);
          onProgress?.({ loaded, total, fraction: total ? Math.min(1, loaded / total) : null });
        }
        const file = new File(chunks, `${id}.osz`, { type: 'application/zip' });
        const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (signature[0] !== 80 || signature[1] !== 75 || file.size < 22) throw new Error('The server did not return a beatmap archive.');
        return file;
      } catch (error) { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); lastError = error; }
      finally { result?.close(); }
    }
    throw lastError || new Error('This beatmap could not be downloaded.');
  }
  function install(id, { metadata, onProgress, signal, preferredBid, background = false, includeVideo = true } = {}) {
    id = positiveId(id);
    if (active.has(id)) return active.get(id).promise;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const notify = progress => {
      onProgress?.(progress);
      document.dispatchEvent(new CustomEvent('osu:download-progress', { detail: { id, background, ...progress } }));
    };
    const promise = queue.catch(() => {}).then(async () => {
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const existing = await window.osuMapStore.getMap(id);
      if (existing?.oszBlob) return existing;
      notify({ state: 'downloading', loaded: 0, total: 0 });
      const set = metadata || await getSet(id, { signal: controller.signal }).catch(() => null);
      const file = await download(id, { signal: controller.signal, includeVideo, onProgress: p => notify({ state: 'downloading', ...p }) });
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      notify({ state: 'importing' });
      const map = await window.osuImportOsz(file, { metadata: set, preferredBid, signal: controller.signal });
      notify({ state: 'installed' });
      return map;
    }).catch(error => { notify({ state: error.name === 'AbortError' ? 'cancelled' : 'error', message: error.message }); throw error; })
      .finally(() => { active.delete(id); signal?.removeEventListener('abort', abort); });
    active.set(id, { promise, controller });
    queue = promise;
    notify({ state: 'queued' });
    return promise;
  }
  window.osuBeatmaps = { getSet, search, normalize, json };
  window.osuDownloads = { install, cancel: id => active.get(String(id))?.controller.abort(), isActive: id => active.has(String(id)) };
})();
