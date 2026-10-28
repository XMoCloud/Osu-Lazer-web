export default (function () {
  
  function predictStartOffset(filename, decodedSampleRate) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    if (ext && ext !== 'mp3') {
      
      return 19; 
    }
    
    const sr = decodedSampleRate || 44100;
    if (sr === 32000) return 89 - 1152000 / sr; 
    if (sr === 44100) return 68 - 1152000 / sr; 
    if (sr === 48000) return 68 - 1152000 / sr; 
    return 22; 
  }

  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    document.body.addEventListener(
      "touchstart",
      (event) => {
        audioContext.resume();
      },
      {
        once: true,
      }
    );
  }

  function OsuAudio(filename, buffer, callback, onerror) {
    var self = this;
    this.decoded = null;
    this.source = null;
    this.started = 0;
    this.position = 0;
    this.playing = false;
    this.audio = audioContext;
    this.gain = this.audio.createGain();
    this.gain.connect(this.audio.destination);
    this.playbackRate = 1.0;
  this.posoffset = 0;

    function decode(node) {
      self.audio.decodeAudioData(
        node.buf,
        function (decoded) {
          self.decoded = decoded;
          
          let baseOffsetMs = predictStartOffset(filename, decoded.sampleRate);
          const globalOffset = (window && window.game && typeof window.game.globalOffset === 'number') ? window.game.globalOffset : 0;
          self.posoffset = baseOffsetMs + globalOffset;
          if (typeof callback !== "undefined") {
            callback(self);
          }
        },
        function (err) {
          if (onerror) onerror(err || new Error('Audio decoding failed.'));
        }
      );
    }
    decode({ buf: buffer, sync: 0, retry: 0 });

    this.getPosition = function () {
      return this._getPosition() - this.posoffset / 1000;
    };

    this._getPosition = function _getPosition() {
      if (!self.playing) {
        return self.position;
      } else {
        return (
          self.position +
          (self.audio.currentTime - self.started) * self.playbackRate
        );
      }
    };

    this.play = function play(wait = 0) {
      if (self.playing || !self.decoded) return;
      if (self.audio.state === "suspended") {
        console.warn("Audio suspended. Waiting for touchstart.");
        self.audio.resume();
      }
      self.playing = true;
      self.source = self.audio.createBufferSource();
      self.source.playbackRate.value = self.playbackRate;
      self.source.buffer = self.decoded;
      self.source.connect(self.gain);
      self.started = self.audio.currentTime;
      if (wait > 0) {
        self.position = -wait / 1000;
        self.source.start(
          self.audio.currentTime + wait / 1000 / self.playbackRate,
          0
        );
      } else {
        if (self.position < 0) self.source.start(self.audio.currentTime - self.position / self.playbackRate, 0);
        else self.source.start(0, Math.min(self.position, self.decoded.duration));
      }
    };

    
    this.pause = function pause() {
      if (!self.playing) return false;
      self.position +=
        (self.audio.currentTime - self.started) * self.playbackRate;
      self.source.stop();
      self.playing = false;
      return true;
    };
  }

  
  
  
  OsuAudio.loadSfx = function(urls, onProgress) {
    urls = urls || [];
    let loaded = 0;
    const total = urls.length;
    const results = Object.create(null);

    function report(u){
      loaded += 1;
      if (typeof onProgress === 'function') {
        try { onProgress(100 * loaded / Math.max(1,total), { url: u }); } catch(_) {}
      }
    }

    function makeSfx(buffer) {
      const gain = audioContext.createGain();
      gain.connect(audioContext.destination);
      let vol = 1;
      Object.defineProperty(gain, '_volume', { value: true });
      return {
        get volume(){ return vol; },
        set volume(v){ vol = Math.max(0, Number(v)||0); gain.gain.value = vol; },
        play(){
          try {
            if (audioContext.state === 'suspended') audioContext.resume();
          } catch(_){}
          const src = audioContext.createBufferSource();
          src.buffer = buffer;
          src.connect(gain);
          src.start(0);
        }
      };
    }

    return Promise.all(urls.map(function(u){
      
      return fetch(u, { signal: AbortSignal.timeout(10000) }).then(function(r){ if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer(); })
        .then(function(ab){ return audioContext.decodeAudioData(ab); })
        .then(function(decoded){ results[u] = makeSfx(decoded); report(u); })
        .catch(function(err){ console.warn('SFX load failed:', u, err); report(u); });
    })).then(function(){ return results; });
  };

  return OsuAudio;
})();

