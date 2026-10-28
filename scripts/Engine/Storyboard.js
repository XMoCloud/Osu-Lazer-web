// Native DOM playback for beatmap video and the tutorial's authored storyboard.
const csv = line => (line.match(/"[^"]*"|[^,]+|(?<=,)(?=,)/g) || []).map(value => value.replace(/^"|"$/g, '').trim());
const blobFrom = (entry, type) => new Promise((resolve, reject) => entry.getBlob(type, blob => blob ? resolve(blob) : reject(new Error('Missing media')), reject));
const textFrom = entry => new Promise((resolve, reject) => entry.getText(resolve, reject));
const entriesIn = directory => directory.children.flatMap(entry => entry.directory ? entriesIn(entry) : [entry]);
const clamp = value => Math.max(0, Math.min(1, value));
function easing(type, t) {
  if (type === 1 || type === 4) return 1 - (1 - t) ** 2;
  if (type === 2 || type === 3) return t * t;
  if (type === 5) return t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  if (type === 6) return t ** 3;
  if (type === 7) return 1 - (1 - t) ** 3;
  if (type === 15) return 1 - Math.cos(t * Math.PI / 2);
  if (type === 16) return Math.sin(t * Math.PI / 2);
  if (type === 30) { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }
  if (type === 31) { const c = 1.70158 * 1.525; return t < .5 ? (2*t)**2*((c+1)*2*t-c)/2 : ((2*t-2)**2*((c+1)*(2*t-2)+c)+2)/2; }
  return t;
}
export default class Storyboard {
  constructor(playback, host) {
    this.pb = playback;
    this.root = document.createElement('div');
    this.root.className = 'storyboard-stage';
    host.appendChild(this.root);
    this.sprites = []; this.samples = []; this.sources = new Set(); this.urls = new Map();
    this.endTime = 0; this.destroyed = false;
    this.resize = () => { this.root.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 640, innerHeight / 480)})`; };
    this.resize(); window.addEventListener('resize', this.resize);
  }
  async url(name, mime = 'image/png') {
    const normalized = name.replace(/\\/g, '/');
    if (!this.urls.has(normalized)) {
      const task = (async () => {
        const entry = this.pb.osu.zip.getChildByName(normalized);
        if (!entry) return null;
        const blob = await blobFrom(entry, mime);
        if (this.destroyed) return null;
        return URL.createObjectURL(blob);
      })();
      this.urls.set(normalized, task);
    }
    return this.urls.get(normalized);
  }
  parse(source) {
    const variables = new Map();
    let sprite = null, loop = null, trigger = null;
    const finishLoop = () => {
      if (!loop || !sprite) return;
      const duration = Math.max(0, ...loop.commands.map(command => command.end));
      for (let repeat = 0; repeat < Math.min(loop.count, 256); repeat++) {
        for (const command of loop.commands) sprite.commands.push({ ...command, start: command.start + loop.start + duration * repeat, end: command.end + loop.start + duration * repeat });
      }
      loop = null;
    };
    for (let raw of source.replace(/\r/g, '').split('\n')) {
      const clean = raw.trim();
      if (!clean || clean.startsWith('//') || clean.startsWith('[')) continue;
      if (clean.startsWith('$') && clean.includes('=')) { const at = clean.indexOf('='); variables.set(clean.slice(0, at), clean.slice(at + 1)); continue; }
      for (const [key, value] of variables) raw = raw.split(key).join(value);
      const depth = raw.match(/^[ _]*/)[0].length;
      const parts = csv(raw.trim());
      const type = parts[0];
      if (type === 'Sprite' || type === 'Animation') {
        finishLoop(); trigger = null;
        sprite = { layer: parts[1], origin: parts[2], file: parts[3], x: Number(parts[4]), y: Number(parts[5]), commands: [], frames: type === 'Animation' ? Number(parts[6]) : 0, frameDelay: Number(parts[7]) || 30 };
        this.sprites.push(sprite); continue;
      }
      if (type === 'Sample') { finishLoop(); this.samples.push({ time: Number(parts[1]), file: parts[3], volume: Number(parts[4] ?? 100) / 100, played: false }); continue; }
      if (!sprite || !depth) continue;
      if (trigger && depth <= trigger.depth) trigger = null;
      if (type === 'T') {
        finishLoop();
        trigger = { name: parts[1], start: Number(parts[2] || 0), end: Number(parts[3] || Infinity), depth, commands: [] };
        (sprite.triggers ||= []).push(trigger);
        continue;
      }
      if (loop && depth <= loop.depth) finishLoop();
      if (type === 'L') { finishLoop(); loop = { start: Number(parts[1]), count: Number(parts[2]), depth, commands: [] }; continue; }
      if (!['F','M','MX','MY','S','V','R','C','P'].includes(type)) continue;
      const start = Number(parts[2]), end = parts[3] === '' || parts[3] == null ? start : Number(parts[3]);
      const command = { type, ease: Number(parts[1]), start, end, values: parts.slice(4).map(value => Number.isFinite(Number(value)) ? Number(value) : value) };
      (trigger ? trigger.commands : loop ? loop.commands : sprite.commands).push(command);
    }
    finishLoop();
  }
  async load() {
    try {
      const track = this.pb.track;
      this.parse(track.track.match(/\[Events\]([\s\S]*?)(?=\n\[|$)/)?.[1] || '');
      // Full storyboard rendering is used for the tutorial; other maps still get video support.
      if (this.pb.tutorial) {
        for (const file of entriesIn(this.pb.osu.zip).filter(entry => /\.osb$/i.test(entry.name))) this.parse(await textFrom(file));
      }
      const videoEvent = track.events.find(event => /^(Video|1)$/i.test(event[0]?.trim()));
      if (videoEvent) await this.loadVideo(videoEvent);
      const origins = { TopLeft: [0,0], TopCentre: [.5,0], TopRight: [1,0], CentreLeft: [0,.5], Centre: [.5,.5], CentreRight: [1,.5], BottomLeft: [0,1], BottomCentre: [.5,1], BottomRight: [1,1] };
      await Promise.all(this.sprites.map(async sprite => {
        if (!sprite.commands.length || sprite.layer === 'Fail') return;
        sprite.commands.sort((a,b) => a.start - b.start);
        sprite.start = Math.min(...sprite.commands.map(command => command.start));
        sprite.end = Math.max(...sprite.commands.map(command => command.end));
        // Long idle rotation loops must not extend the song past its final visible fade.
        const fades = sprite.commands.filter(command => command.type === 'F');
        this.endTime = Math.max(this.endTime, ...(fades.length ? fades.map(command => command.end) : [0]));
        const first = types => sprite.commands.find(command => types.includes(command.type));
        const moveX = first(['M','MX']), moveY = first(['M','MY']), scale = first(['S','V']);
        const fade = first(['F']), rotation = first(['R']), color = first(['C']);
        sprite.initial = {
          x: moveX ? moveX.values[0] : sprite.x, y: moveY ? moveY.values[moveY.type === 'M' ? 1 : 0] : sprite.y,
          sx: scale ? scale.values[0] : 1, sy: scale ? scale.values[scale.type === 'V' ? 1 : 0] : 1,
          opacity: fade ? fade.values[0] : 1, rotation: rotation ? rotation.values[0] : 0,
          color: color ? color.values.slice(0,3) : [255,255,255], additive: false, flip: 1, flipY: 1
        };
        const image = document.createElement('img');
        sprite.node = image;
        image.className = 'storyboard-sprite'; image.alt = ''; image.draggable = false;
        const origin = origins[sprite.origin] || [.5,.5];
        image.style.transformOrigin = `${origin[0]*100}% ${origin[1]*100}%`;
        sprite.originOffset = `translate(${-origin[0]*100}%,${-origin[1]*100}%)`;
        image.style.zIndex = sprite.layer === 'Foreground' ? '3' : '1';
        image.style.display = 'none';
        if (!this.destroyed) this.root.appendChild(image);
        if (sprite.frames) {
          sprite.frameUrls = await Promise.all(Array.from({ length: Math.min(100,sprite.frames) }, (_, frame) => this.url(sprite.file.replace(/(\.[^.]+)$/, `${frame}$1`))));
          image.src = sprite.frameUrls[0] || '';
        } else image.src = await this.url(sprite.file) || '';
      }));
      await Promise.all(this.samples.map(async sample => {
        try {
          const entry = this.pb.osu.zip.getChildByName(sample.file);
          if (entry) sample.buffer = await this.pb.osu.audio.audio.decodeAudioData(await (await blobFrom(entry, 'audio/mpeg')).arrayBuffer());
        } catch (error) { console.warn('Storyboard sound unavailable:', sample.file, error); }
      }));
    } catch (error) { console.warn('Beatmap background media could not be loaded:', error); }
  }
  async loadVideo(event) {
    const file = event[2].replace(/^"|"$/g, '');
    const type = /\.webm$/i.test(file) ? 'video/webm' : /\.og[gv]$/i.test(file) ? 'video/ogg' : /\.avi$/i.test(file) ? 'video/x-msvideo' : 'video/mp4';
    const url = await this.url(file, type);
    if (!url || this.destroyed) return;
    const video = document.createElement('video');
    video.className = 'beatmap-video'; video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
    this.video = video; this.videoOffset = Number(event[1]) || 0;
    this.root.parentNode.prepend(video);
  }
  update(time) {
    if (this.destroyed) return;
    if (this.video) {
      const target = (time - this.videoOffset) / 1000;
      const playing = target >= 0 && !this.pb.game.paused && (!Number.isFinite(this.video.duration) || target < this.video.duration);
      this.video.style.opacity = playing ? String(1 - this.pb.game.backgroundDimRate) : '0';
      if (playing) {
        if (Math.abs(this.video.currentTime - target) > .15) this.video.currentTime = target;
        if (this.video.paused) this.video.play().catch(() => {});
      } else this.video.pause();
    }
    for (const sprite of this.sprites) {
      if (!sprite.node) continue;
      const visible = time >= sprite.start && time <= sprite.end;
      if (!visible) { if (sprite.visible) sprite.node.style.display = 'none'; sprite.visible = false; continue; }
      if (!sprite.visible) sprite.node.style.display = 'block';
      sprite.visible = true;
      const state = { ...sprite.initial };
      const active = sprite.activeTrigger;
      if (active && time > active.time + active.duration) sprite.activeTrigger = null;
      const commands = sprite.activeTrigger ? sprite.commands.concat(sprite.activeTrigger.commands.map(command => ({ ...command, start: command.start + sprite.activeTrigger.time, end: command.end + sprite.activeTrigger.time }))) : sprite.commands;
      for (const command of commands) {
        if (time < command.start) continue;
        const count = { M: 2, V: 2, C: 3 }[command.type] || 1;
        const f = command.end === command.start ? 1 : easing(command.ease, clamp((time - command.start) / (command.end - command.start)));
        const values = command.values.slice(0, count).map((value,index) => value + ((command.values[index+count] ?? value) - value) * f);
        switch (command.type) {
          case 'F': state.opacity = values[0]; break;
          case 'M': [state.x,state.y] = values; break;
          case 'MX': state.x = values[0]; break;
          case 'MY': state.y = values[0]; break;
          case 'S': state.sx = state.sy = values[0]; break;
          case 'V': [state.sx,state.sy] = values; break;
          case 'R': state.rotation = values[0]; break;
          case 'C': state.color = values; break;
          case 'P': if (time <= command.end || command.start === command.end) { state.additive ||= command.values[0] === 'A'; if (command.values[0] === 'H') state.flip = -1; if (command.values[0] === 'V') state.flipY = -1; } break;
        }
      }
      const image = sprite.node;
      image.style.left = state.x + 'px'; image.style.top = state.y + 'px';
      image.style.transform = `${sprite.originOffset} rotate(${state.rotation}rad) scale(${state.sx * state.flip},${state.sy * state.flipY})`;
      image.style.opacity = String(clamp(state.opacity));
      image.style.mixBlendMode = state.additive ? 'screen' : 'normal';
      if (state.color.some(value => value !== 255)) {
        if (!sprite.tint) {
          const ns = 'http://www.w3.org/2000/svg';
          if (!this.filters) {
            this.filters = document.createElementNS(ns, 'svg');
            this.filters.setAttribute('width', '0'); this.filters.setAttribute('height', '0');
            this.root.appendChild(this.filters);
          }
          const filter = document.createElementNS(ns, 'filter');
          filter.id = 'sb-tint-' + this.sprites.indexOf(sprite);
          filter.setAttribute('color-interpolation-filters', 'sRGB');
          sprite.tint = document.createElementNS(ns, 'feColorMatrix');
          filter.appendChild(sprite.tint); this.filters.appendChild(filter);
          image.style.filter = `url(#${filter.id})`;
        }
        const [r,g,b] = state.color.map(value => clamp(value/255));
        sprite.tint.setAttribute('values', `${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0`);
      } else if (sprite.tint) sprite.tint.setAttribute('values','1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
      if (sprite.frameUrls) {
        const index = Math.max(0, Math.floor((time - sprite.start) / sprite.frameDelay)) % sprite.frameUrls.length;
        if (sprite.frame !== index && sprite.frameUrls[index]) { image.src = sprite.frameUrls[index]; sprite.frame = index; }
      }
    }
    for (const sample of this.samples) {
      if (sample.played || time < sample.time || !sample.buffer) continue;
      sample.played = true;
      const offset = Math.max(0,(time - sample.time)/1000);
      if ((!sample.resume && time - sample.time > 500) || offset >= sample.buffer.duration) continue;
      sample.resume = false;
      const context = this.pb.osu.audio.audio;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = sample.buffer;
      gain.gain.value = sample.volume * this.pb.game.effectVolume;
      source.connect(gain).connect(context.destination);
      source.start(0, offset);
      this.sources.add({ source, gain, sample, start: time });
      source.onended = () => { for (const item of this.sources) if (item.source === source) { this.sources.delete(item); gain.disconnect(); source.disconnect(); } };
    }
  }
  pause() {
    this.video?.pause();
    // Voice samples resume at the audio clock position after an ordinary pause.
    for (const item of this.sources) { item.sample.played = false; item.sample.resume = true; item.source.onended = null; try { item.source.stop(); } catch {} item.source.disconnect(); item.gain.disconnect(); }
    this.sources.clear();
  }
  trigger(name, time) {
    for (const sprite of this.sprites) {
      const trigger = sprite.triggers?.find(trigger => trigger.name === name && time >= trigger.start && time <= trigger.end);
      if (trigger) sprite.activeTrigger = { time, commands: trigger.commands, duration: Math.max(0,...trigger.commands.map(command => command.end)) };
    }
  }
  destroy() {
    this.destroyed = true;
    this.pause(); this.video?.remove(); this.root.remove();
    window.removeEventListener('resize', this.resize);
    for (const task of this.urls.values()) task.then(url => { if (url) URL.revokeObjectURL(url); });
    this.urls.clear();
  }
}
