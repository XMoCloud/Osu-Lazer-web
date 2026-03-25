import setPlayerActions from "./playerActions.js";
import SliderMesh from "./SliderMesh.js";
import ScoreOverlay from "../overlay/score.js";
import LoadingMenu from "../overlay/loading.js";
import BreakOverlay from "../overlay/break.js";

"use strict";

    function clamp01(a) { return Math.min(1, Math.max(0, a)); }
    function repeatclamp(a) { a %= 2; return a > 1 ? 2 - a : a; }

    
    const FILL_ALPHA_CIRCLE = 0.7;        
    const SLIDER_BODY_ALPHA_FACTOR = 0.7; 

    const SVG_NS = "http://www.w3.org/2000/svg";
    const XLINK_NS = "http://www.w3.org/1999/xlink";
    
    let cursorPortal = null, cursorNode = null;

    function ensureCursorPortal() {
      if (cursorPortal) return cursorPortal;

      cursorPortal = document.createElement("div");
      Object.assign(cursorPortal.style, {
        position: "fixed",
        left: "0", top: "0",
        width: "100vw", height: "100vh",
        pointerEvents: "none",
        zIndex: "2147483647",
        isolation: "isolate" 
      });
      document.body.appendChild(cursorPortal);

      
      const img = new Image();
      img.src = "assets/cursor.png"; 
      img.id = "cursor";
      img.decoding = "async";
      img.loading = "eager";
      cursorNode = img;
      
      
      try {
        const mul = (window.game && typeof window.game.cursorSize === 'number') ? Math.max(0.5, Math.min(2.0, window.game.cursorSize)) : 1;
        const visualPx = Math.round(64 * mul * 2.3); 
        cursorNode.style.width = visualPx + 'px';
        cursorNode.style.height = visualPx + 'px';
        
        cursorNode.dataset.logicalSize = String(Math.round(64 * mul));
      } catch (_) {}

      
      Object.assign(cursorNode.style, {
        position: "absolute",
        left: "0", top: "0",
        transform: "translate(-9999px, -9999px)",
        willChange: "transform",
        pointerEvents: "none",
        zIndex: "auto"
      });
      cursorPortal.appendChild(cursorNode);
      return cursorPortal;
    }

    function pxHalf(node) {
      
      const ow = node.offsetWidth || parseFloat(node.style.width) || node.width || 64;
      return ow / 2;
    }

    function osuToViewportPx(x, y, gfx) {
      return {
        x: gfx.xoffset + (x / 512) * gfx.width,
        y: gfx.yoffset + (y / 384) * gfx.height
      };
    }

    function updateCursorPortal(game, gfx) {
      if (!cursorPortal || !cursorNode) return;
      const p = osuToViewportPx(game.mouseX, game.mouseY, gfx);
      const half = pxHalf(cursorNode);
      cursorNode.style.transform = `translate(${(p.x - half).toFixed(2)}px, ${(p.y - half).toFixed(2)}px)`;
    }

    function svgEl(tag, attrs = {}, parent) {
      const e = document.createElementNS(SVG_NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
    function setHref(img, url) {
      img.setAttributeNS(XLINK_NS, "xlink:href", url);
      img.setAttribute("href", url);
    }

    
    function makeSpriteImage(parentGroup, url, x, y, diameter, opacity = 0) {
      const g = svgEl("g", {}, parentGroup);
      const img = svgEl("image", {}, g);
      setHref(img, url);

      img._diam0 = Math.max(1, diameter);
      img._scale = 1;
      img._alpha = opacity;
      img._x = x; img._y = y;
      img._rot = 0;

      function apply() {
        const s = Math.max(0, Number.isFinite(img._scale) ? img._scale : 0);
        const d = img._diam0 * s;
        img.setAttribute("width", d.toString());
        img.setAttribute("height", d.toString());
        const cx = img._x, cy = img._y;
        img.setAttribute(
          "transform",
          `translate(${(cx - d * 0.5)},${(cy - d * 0.5)}) rotate(${(img._rot * 180 / Math.PI).toFixed(3)},${d/2},${d/2})`
        );
        img.setAttribute("opacity", String(Math.max(0, Math.min(1, img._alpha))));
      }
      img._apply   = apply;
      img._setAlpha= (a) => { img._alpha = a; apply(); };
      img._setScale= (s) => { img._scale = s; apply(); };
      img._setXY   = (nx, ny) => { img._x = nx; img._y = ny; apply(); };
      img._setRot  = (r) => { img._rot = r; apply(); };
      img._hide    = () => { img._alpha = 0; apply(); };
      img._show    = () => { img._alpha = 1; apply(); };

      apply();
      return { g, img };
    }

    
    function sendToBack(parent, node) {
      if (parent.firstChild) parent.insertBefore(node, parent.firstChild);
      else parent.appendChild(node);
    }

  function Playback(game, osu, track) {
      const self = this;
      window.playback = this;

      self.game = game; self.osu = osu; self.track = track;

      
      const host = document.getElementById("game-area") || document.body;
      host.style.position = "relative";
      host.style.overflow = "visible";

      
      
      const bgLayer = document.createElement("div");
      Object.assign(bgLayer.style, {
        position: "absolute", inset: "0",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        zIndex: "1", pointerEvents: "none"
      });
      host.appendChild(bgLayer);

      

      
      const svg = svgEl("svg", {
        id: "svg-layer", viewBox: "0 0 512 384", preserveAspectRatio: "xMidYMid meet"
      }, host);
      Object.assign(svg.style, { overflow: "visible", position: "absolute", zIndex: "3", pointerEvents: "none" });

      const world = svgEl("g", { id: "world" }, svg);

      
      const hud = document.createElement("div");
      Object.assign(hud.style, {
        position: "absolute", inset: "0", pointerEvents: "none", zIndex: "99998"
      });
      host.appendChild(hud);

      
      const gfx = (window.gfx = {});
      self.calcSize = function () {
        const W = game.window.innerWidth, H = game.window.innerHeight;
        let gw = W, gh = H;
        if (gw / 512 > gh / 384) gw = (gh / 384) * 512; else gh = (gw / 512) * 384;
        gw *= 0.8; gh *= 0.8;
        gfx.width = gw; gfx.height = gh;
        gfx.xoffset = (W - gw) / 2; gfx.yoffset = (H - gh) / 2;

        Object.assign(svg.style, { left: `${gfx.xoffset}px`, top: `${gfx.yoffset}px`, width: `${gw}px`, height: `${gh}px` });
        Object.assign(hud.style, { left: `${gfx.xoffset}px`, top: `${gfx.yoffset}px`, width: `${gw}px`, height: `${gh}px` });

        
        ensureCursorPortal();
        updateCursorPortal(self.game, gfx);
      };
      self.calcSize();

      
      self.started = false;
      
      self.upcomingHits = [];
      
      self.hits = track.hitObjects.map(o => Object.assign({}, o));
      self.offset = 0;
      self.currentHitIndex = 0;
      
      self.nextHitToSpawn = 0;
      self.ended = false;
      self.audioReady = false;

   
      self.playbackRate = 1.0;
      self.endTime = self.hits[self.hits.length - 1].endTime + 1500;
      self.wait = Math.max(0, 1500 - self.hits[0].time);

      
      self.OD = track.difficulty.OverallDifficulty;
      self.CS = track.difficulty.CircleSize;
      self.AR = track.difficulty.ApproachRate;
      self.HP = track.difficulty.HPDrainRate;

      
      self.circleRadius = (109 - 9 * self.CS) / 2;
  

      self.MehTime   = 200 - 10 * self.OD;
      self.GoodTime  = 140 - 8  * self.OD;
      self.GreatTime =  80 - 6  * self.OD;
      self.approachTime       = (self.AR < 5) ? 1800 - 120 * self.AR : 1950 - 150 * self.AR;
      self.approachFadeInTime = Math.min(800, self.approachTime);
      self.approachScale = 3;

      
      for (let i = 0; i < self.hits.length; i++) {
        const hit = self.hits[i];
        hit.objectFadeInTime   = Math.min(400, self.approachTime);
        hit.circleFadeOutTime  = 100;
        hit.objectFadeOutOffset= self.MehTime;
        if (hit.type === "slider") {
          hit.fadeOutOffset   = hit.sliderTimeTotal;
          hit.fadeOutDuration = 300;
        }
      }

      
  self.loadingMenu  = new LoadingMenu({ width: window.innerWidth, height: window.innerHeight }, track);
  self.breakOverlay = new BreakOverlay({ width: window.innerWidth, height: window.innerHeight });
  
  self.scoreOverlay = new ScoreOverlay({ width: window.innerWidth, height: window.innerHeight }, self.HP, 1.0, self.endTime);

      
      self.loadingMenu._root.style.zIndex = "99990";
      self.breakOverlay._root.style.zIndex = "99990";
      self.scoreOverlay._root.style.zIndex = "99990";
      self.loadingMenu._root.style.pointerEvents = "none";
      self.breakOverlay._root.style.pointerEvents = "none";
      self.scoreOverlay._root.style.pointerEvents = "none";

      host.appendChild(self.loadingMenu._root);
      host.appendChild(self.scoreOverlay._root);
      self.breakOverlay.mount(host); 

      
      
      
      
      try {
        const br = self.breakOverlay._root;
        if (br && br.style) {
          br.style.position = 'fixed';
          br.style.left = '50%';
          br.style.top = '50%';
          br.style.transform = 'translate(-50%, -50%)';
          br.style.zIndex = '99990';
          br.style.pointerEvents = 'none';
        }
      } catch (e) {  }

      
      game.mouseX = 256; game.mouseY = 192;
      setPlayerActions(self);

      
      self.osu.onready = function () {
        self.loadingMenu.hide();
        self.audioReady = true;
        if (self.onload) self.onload();
        self.start();

        
        ensureCursorPortal();
        updateCursorPortal(self.game, gfx);
      };
      self.load = function () { self.osu.load_mp3(self.track); };

      
      self.game.paused = false;
      this.pause = function () {
        if (self.osu.audio.pause()) {
          self.game.paused = true;
          const menu = document.getElementById("pause-menu");
          if (menu) {
            menu.removeAttribute("hidden");
            const btnc = document.getElementById("pausebtn-continue");
            const btnr = document.getElementById("pausebtn-retry");
            const btnq = document.getElementById("pausebtn-quit");
            if (btnc) btnc.onclick = () => { self.resume(); btnc.onclick = btnr.onclick = btnq.onclick = null; };
            if (btnr) btnr.onclick = () => { self.game.paused = false; menu.setAttribute("hidden",""); self.retry(); };
            if (btnq) btnq.onclick = () => { self.game.paused = false; menu.setAttribute("hidden",""); self.quit(); };
          }
        }
      };
      this.resume = function () {
        self.osu.audio.play();
        self.game.paused = false;
        try { document.getElementById("pause-menu").setAttribute("hidden",""); } catch (e) {}
        ensureCursorPortal();
        updateCursorPortal(self.game, gfx);
      };
      this.fadeOutEasing = function (t) { if (t <= 0) return 1; if (t > 1) return 0; return 1 - Math.sin((t * Math.PI) / 2); };

      
      (function setBackgroundFromEvents() {
        
        let bgName = null;
        if (self.track.events && self.track.events.length) {
          let f = self.track.events[0][2];
          if (self.track.events[0][0] === "Video" && self.track.events.length > 1) f = self.track.events[1][2];
          if (typeof f === "string") {
            
            const m = f.match(/^"(.*)"$/);
            if (m) bgName = m[1];
            else bgName = f;
          }
        }
        if (bgName) {
          const entry = self.osu.zip.getChildByName(bgName);
          if (entry) {
            const mime = /\.png$/i.test(bgName) ? "image/png" : (/\.webp$/i.test(bgName) ? "image/webp" : "image/jpeg");
            entry.getBlob(mime, function (blob) {
              const url = URL.createObjectURL(blob);
              
              try { if (self._bgObjectUrl && self._bgObjectUrl !== url) URL.revokeObjectURL(self._bgObjectUrl); } catch (e) {}
              self._bgObjectUrl = url;
              document.body.dataset.bgUrl = url;
              const fade = (typeof self.game?.backgroundDimRate === 'number') ? self.game.backgroundDimRate : 0.9;
              const effectiveFade = Math.min(Math.max(0, fade), 1); 
              document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${effectiveFade}), rgba(0,0,0,${effectiveFade})), url("${url}")`;
              document.body.style.backgroundSize = 'cover';
              document.body.style.backgroundRepeat = 'no-repeat';
              document.body.style.backgroundPosition = 'center';
              
            }, function () {
            });
            return;
          }
        }
        
        try {
          document.body.style.backgroundImage = '';
          if (document.body && document.body.dataset) document.body.dataset.bgUrl = '';
        } catch (e) {  }
      })();

      
      function osuToCss(x, y) {
        return { left: (x / 512) * gfx.width, top:  (y / 384) * gfx.height };
      }

      function createJudge(x, y, finalTime) {
        const div = document.createElement("div");
        
        const diameterPx = (2 * self.circleRadius) * (gfx.height / 384);
        const fontPx = Math.max(9, Math.min(diameterPx * 0.18, 20)); 

        Object.assign(div.style, {
          position: "absolute",
          transform: "translate(-50%, -50%)",
          fontFamily: "Quicksand, sans-serif",
          fontWeight: "700",
          fontSize: `${Math.round(fontPx)}px`,
          lineHeight: "1",
          whiteSpace: "nowrap",
          color: "#fff",
          textShadow: "0 0 5px rgba(0,0,0,.6)",
          opacity: "0",
          pointerEvents: "none",
          zIndex: "99997",
          maxWidth: `${Math.round(diameterPx * 0.9)}px`,
          textAlign: "center"
        });

        div._x = x; div._y = y;
        div._points = -1;
        div._finalTime = finalTime;
        div._t0 = 0;

        const pos = osuToCss(x, y);
        div.style.left = `${pos.left}px`;
        div.style.top  = `${pos.top}px`;

        div._updatePos = () => {
          const p = osuToCss(div._x, div._y);
          div.style.left = `${p.left}px`;
          div.style.top  = `${p.top}px`;
        };

        hud.appendChild(div);
        return div;
      }

      function judgementText(points) {
        switch (points) { case 0: return "MISS"; case 50: return "MEH"; case 100: return "GOOD"; case 300: return "GREAT"; default: return ""; }
      }

      this.invokeJudgement = function (div, points, time, x, y) {
        if (!div) return;
        if (Number.isFinite(x) && Number.isFinite(y)) { div._x = x; div._y = y; div._updatePos(); }
        div._points = points; div._t0 = time;
        div.textContent = judgementText(points);
        div.style.color = (points === 0) ? "#ed1121" : (points === 50) ? "#ffcc22" : (points === 100) ? "#88b300" : "#66ccff";
        div.style.opacity = "1";
      };

      this.updateJudgement = function (div, time) {
        if (!div) return;
        if (div._points < 0 && time >= div._finalTime) {
          self.scoreOverlay.hit(0, 300, time);
          self.invokeJudgement(div, 0, time, div._x, div._y);
          return;
        }
        if (div._points < 0) return;

        const t = time - div._t0;
        if (div._points === 0) {
          if (t > 800) { div.style.opacity = "0"; return; }
          const a = (t < 100) ? t / 100 : (t < 600) ? 1 : 1 - (t - 600) / 200;
          div.style.opacity = String(a);
          div._y = div._y + 100 * Math.pow(t / 800, 5) * (self.circleRadius / 60);
          div._updatePos();
        } else {
          if (t > 500) { div.style.opacity = "0"; return; }
          const a = (t < 100) ? t / 100 : 1 - (t - 100) / 400;
          div.style.opacity = String(a);
          const u = Math.min(1, Math.max(0, t / 250));
          div.style.letterSpacing = `${(2 * u).toFixed(2)}px`;
        }
      };

      
      function ensureContainer(hit) {
        if (!hit._container) {
          hit._container = svgEl("g", { class: "hitobj" }, world);
          sendToBack(world, hit._container); 
        }
        return hit._container;
      }

      
      this.createHitCircle = function (hit) {
        ensureContainer(hit);
        hit.objects = hit.objects || [];
        hit.judgements = hit.judgements || [];

        const circleDiam = 2 * self.circleRadius;

        const base = makeSpriteImage(hit._container, `assets/disc.png`, hit.x, hit.y, circleDiam, 0);
        const over = makeSpriteImage(hit._container, `assets/hitcircleoverlay.png`, hit.x, hit.y, circleDiam, 0);
        hit.base = base.img; hit.circle = over.img;
        hit.objects.push(base.g, over.g);

        
        const appr = makeSpriteImage(hit._container, `assets/approachcircle.png`, hit.x, hit.y, circleDiam, 0);
        hit.approach = appr.img;
        hit.objects.push(appr.g);

        
        hit.numbers = [];
        const idx = hit.index + 1;
        if (idx <= 9) {
          const n = makeSpriteImage(hit._container, `assets/score-${idx}.png`, hit.x, hit.y, circleDiam * 0.42, 0);
          hit.numbers.push(n.img);
          hit.objects.push(n.g);
        } else if (idx <= 99) {
          const d0 = String(idx % 10), d1 = String(Math.floor(idx / 10));
          const n0 = makeSpriteImage(hit._container, `assets/score-${d0}.png`, hit.x + circleDiam * 0.10, hit.y - circleDiam * 0.04, circleDiam * 0.36, 0);
          const n1 = makeSpriteImage(hit._container, `assets/score-${d1}.png`, hit.x - circleDiam * 0.10, hit.y - circleDiam * 0.04, circleDiam * 0.36, 0);
          hit.numbers.push(n0.img, n1.img);
          hit.objects.push(n0.g, n1.g);
        }

        
        hit.judgements.push(createJudge(hit.x, hit.y, hit.time + self.MehTime));
      };

      
      this.createSlider = function (hit) {
        ensureContainer(hit);
        hit.lastrep = 0;
        hit.nexttick = 0;

        
        hit.body = new SliderMesh(hit.curve, self.circleRadius, 0, hit._container);
        hit.body.alpha = 0; 
        hit.objects = hit.objects || [];
        hit.objects.push(hit.body.g);

        
        if (hit.repeat > 1) {
          const p = hit.curve.curve[hit.curve.curve.length - 1];
          
          const prev = hit.curve.curve[Math.max(0, hit.curve.curve.length - 2)];
          const dirX = prev.x - p.x;
          const dirY = prev.y - p.y;
          const angle = Math.atan2(dirY, dirX);
          
          const ra = makeSpriteImage(hit._container, `assets/reversearrow.png`, p.x, p.y, 0.45 * 2 * self.circleRadius, 0);
          ra.img._setRot(angle);
          hit.reverse = ra.img; hit.objects.push(ra.g);
        }
        if (hit.repeat > 2) {
          const p = hit.curve.curve[0];
          
          const next = hit.curve.curve[Math.min(hit.curve.curve.length - 1, 1)];
          const dirX = next.x - p.x;
          const dirY = next.y - p.y;
          const angle = Math.atan2(dirY, dirX);
          const rb = makeSpriteImage(hit._container, `assets/reversearrow.png`, p.x, p.y, 0.45 * 2 * self.circleRadius, 0);
          rb.img._setRot(angle);
          hit.reverse_b = rb.img; hit.objects.push(rb.g);
          hit.reverse_b._setAlpha(0);
        }

        
        const follow = makeSpriteImage(hit._container, `assets/sliderfollowcircle.png`, hit.x, hit.y, 0.9 * 2 * self.circleRadius, 0);
        const ball   = makeSpriteImage(hit._container, `assets/sliderb.png`,            hit.x, hit.y, 2 * self.circleRadius,       0);
        hit.follow = follow.img; hit.followSize = 1;
        hit.ball   = ball.img;
        hit.objects.push(follow.g, ball.g);

        
        self.createHitCircle(hit);

        
        const endPoint = hit.curve.curve[hit.curve.curve.length - 1];
        for (let i = 1; i <= hit.repeat; ++i) {
          const x = (i % 2 === 1) ? endPoint.x : hit.x;
          const y = (i % 2 === 1) ? endPoint.y : hit.y;
          hit.judgements.push(createJudge(x, y, hit.time + i * hit.sliderTime));
        }
      };

      this.createSpinner = function (hit) {
        ensureContainer(hit);
        hit.approachTime = self.approachTime + 300;
        hit.x = 256; hit.y = 192;
        hit.rotation = 0; hit.rotationProgress = 0; hit.clicked = false;

        const spinRequiredPerSec = (self.OD < 5 ? 3 + 0.4 * self.OD : 2.5 + 0.5 * self.OD) * 0.7;
        hit.rotationRequired = 2 * Math.PI * spinRequiredPerSec * (hit.endTime - hit.time) / 1000;

        function make(name, diamMul) {
          const s = makeSpriteImage(hit._container, `assets/${name}`, hit.x, hit.y, diamMul * 2 * self.circleRadius, 0);
          return s;
        }
        const baseObj = make("spinnerbase.png", 7.0);
        hit.base = baseObj.img;
        sendToBack(hit._container, baseObj.g);
        const progressObj = make("spinnerprogress.png", 7.0);
        hit.progress = progressObj.img;
  const topObj = make("spinnertop.png", 1.0);
  hit.top = topObj.img;

        hit.judgements = hit.judgements || [];
        hit.judgements.push(createJudge(hit.x, hit.y, hit.endTime + 233));
      };

      
      this.populateHit = function (hit) {
        
        if (hit.isSpawned) return;

        self.currentHitIndex += 1;
        hit.hitIndex = self.currentHitIndex;
        hit.objects = [];
        hit.judgements = [];
        hit.score = -1;
        if (hit.type === "circle")  self.createHitCircle(hit);
        if (hit.type === "slider")  self.createSlider(hit);
        if (hit.type === "spinner") self.createSpinner(hit);

        
        hit.isSpawned = true;
      };

      
      self.curtimingid = 0;
      this.playTicksound = function (hit, time) {
        while (self.curtimingid + 1 < self.track.timingPoints.length && self.track.timingPoints[self.curtimingid + 1].offset <= time) self.curtimingid++;
        while (self.curtimingid > 0 && self.track.timingPoints[self.curtimingid].offset > time) self.curtimingid--;
        const timing = self.track.timingPoints[self.curtimingid];
        const volume = self.game.masterVolume * self.game.effectVolume * (hit.hitSample.volume || timing.volume) / 100;
        const defSet = timing.sampleSet || self.game.sampleSet;
        self.game.sample[defSet].slidertick.volume = volume;
        self.game.sample[defSet].slidertick.play();
      };
      this.playHitsound = function (hit, id, time) {
        while (self.curtimingid + 1 < self.track.timingPoints.length && self.track.timingPoints[self.curtimingid + 1].offset <= time) self.curtimingid++;
        while (self.curtimingid > 0 && self.track.timingPoints[self.curtimingid].offset > time) self.curtimingid--;
        const timing = self.track.timingPoints[self.curtimingid];
        const volume = self.game.masterVolume * self.game.effectVolume * (hit.hitSample.volume || timing.volume) / 100;
        const defSet = timing.sampleSet || self.game.sampleSet;
        function playHit(bitmask, normalSet, additionSet) {
          self.game.sample[normalSet].hitnormal.volume = volume; self.game.sample[normalSet].hitnormal.play();
          if (bitmask & 2) { self.game.sample[additionSet].hitwhistle.volume = volume; self.game.sample[additionSet].hitwhistle.play(); }
          if (bitmask & 4) { self.game.sample[additionSet].hitfinish.volume = volume; self.game.sample[additionSet].hitfinish.play(); }
          if (bitmask & 8) { self.game.sample[additionSet].hitclap.volume   = volume; self.game.sample[additionSet].hitclap.play(); }
        }
        if (hit.type === "circle" || hit.type === "spinner") {
          const toplay = hit.hitSound;
          const normalSet = hit.hitSample.normalSet || defSet;
          const additionSet = hit.hitSample.additionSet || normalSet;
          playHit(toplay, normalSet, additionSet);
        }
        if (hit.type === "slider") {
          const toplay = hit.edgeHitsounds[id];
          const normalSet = hit.edgeSets[id].normalSet || defSet;
          const additionSet = hit.edgeSets[id].additionSet || normalSet;
          playHit(toplay, normalSet, additionSet);
        }
      };

      this.hitSuccess = function (hit, points, time) {
        self.scoreOverlay.hit(points, 300, time);
        if (points > 0) {
          if (hit.type === "spinner") self.playHitsound(hit, 0, hit.endTime);
          else self.playHitsound(hit, 0, hit.time);
          if (hit.type === "slider") hit.judgements[hit.judgements.length - 1]._defaultScore = 50;
        }
        hit.score = points; hit.clickTime = time;

        
        let jx = hit.x, jy = hit.y;
        if (hit.type === "slider" && hit.ball) { jx = hit.ball._x; jy = hit.ball._y; }
        self.invokeJudgement(hit.judgements[0], points, time, jx, jy);
      };

      
      
      let waitinghitid = 0;

      this.updateUpcoming = function (time) {
        
        while (waitinghitid < self.hits.length && self.hits[waitinghitid].endTime < time) waitinghitid++;

        
        for (let i = self.upcomingHits.length - 1; i >= 0; i--) {
          const hit = self.upcomingHits[i];
          const diff = hit.time - time;
          let despawn = -1500;
          if (hit.type === "slider") despawn -= hit.sliderTimeTotal;
          if (hit.type === "spinner") despawn -= (hit.endTime - hit.time);
          if (diff < despawn) {
            self.upcomingHits.splice(i, 1); 
            try { hit._container?.remove(); } catch (e) {} 
            (hit.judgements || []).forEach(j => { try { j.remove(); } catch (e) {} }); 
            hit.destroyed = true;
          }
        }

        
        
        
        const spawnTimeWindow = time + 3000;
        while (self.nextHitToSpawn < self.hits.length) {
          const hit = self.hits[self.nextHitToSpawn];

          
          let appearTime;
          if (hit.type === "spinner") {
            
            appearTime = hit.time - (self.approachTime + 300);
          } else {
            
            appearTime = hit.time - self.approachTime;
          }

          if (appearTime < spawnTimeWindow) {
            
            self.populateHit(hit); 
            self.upcomingHits.push(hit); 
            self.nextHitToSpawn++; 
          } else {
            
            break;
          }
        }
      };

      
      this.updateHitCircle = function (hit, time) {
        const diff = hit.time - time;

        
        const fullAppear = self.approachTime - self.approachFadeInTime;
        if (diff <= self.approachTime && diff > 0) {
          const mul = (diff / self.approachTime) * self.approachScale + 1; 
          hit.approach._setScale(Math.max(1, mul));
        } else {
          hit.approach._setScale(1);
        }
        if (diff <= self.approachTime && diff > fullAppear) {
          hit.approach._setAlpha((self.approachTime - diff) / self.approachFadeInTime);
        } else if (diff <= fullAppear && diff > 0) {
          hit.approach._setAlpha(1);
        }

        
        const noteFull = self.approachTime - hit.objectFadeInTime;
        const setCircleAlpha = (a) => {
          const aa = Math.max(0, Math.min(1, a));
          hit.base._setAlpha(aa * FILL_ALPHA_CIRCLE); 
          hit.circle._setAlpha(aa);                    
          for (let i = 0; i < (hit.numbers || []).length; i++) hit.numbers[i]._setAlpha(aa);
        };
        if (diff <= self.approachTime && diff > noteFull) {
          setCircleAlpha((self.approachTime - diff) / hit.objectFadeInTime);
        } else if (diff <= noteFull) {
          if (-diff > hit.objectFadeOutOffset) {
            const ta = -diff - hit.objectFadeOutOffset;
            setCircleAlpha(clamp01(1 - ta / hit.circleFadeOutTime));
            hit.approach._setAlpha(clamp01(1 - ta / 50));
          } else setCircleAlpha(1);
        }

        
        if (hit.score > 0 && Number(hit.base.getAttribute("opacity")) > 0) {
          const ta = time - hit.clickTime;
          if (ta < 40) {
            const t = ta / 40, s = Math.max(0, 1 + 0.5 * t * (2 - t));
            hit.base._setScale(s);
            hit.circle._setScale(s);
            for (let i = 0; i < (hit.numbers || []).length; i++) {
              const single = (i === 0 && hit.numbers.length === 1);
              hit.numbers[i]._setScale((single ? 0.42 : 0.36) * s);
            }
          } else {
            hit.base._setAlpha(0); hit.circle._setAlpha(0);
            for (let i = 0; i < (hit.numbers || []).length; i++) hit.numbers[i]._setAlpha(0);
            hit.approach._setAlpha(0);
          }
        }

        this.updateJudgement(hit.judgements[0], time);
      };

      this.updateSlider = function (hit, time) {
        this.updateHitCircle(hit, time);

        const noteFull = self.approachTime - hit.objectFadeInTime;
        const diff = hit.time - time;

        const setBodyAlpha = (a) => {
          const aa = Math.max(0, Math.min(1, a));
          
          hit.body.alpha = aa * SLIDER_BODY_ALPHA_FACTOR;
          if (hit.reverse)  hit.reverse._setAlpha(aa);
          
        };
        if (diff <= self.approachTime && diff > noteFull) {
          setBodyAlpha((self.approachTime - diff) / hit.objectFadeInTime);
        } else if (diff <= noteFull) {
          if (-diff > hit.fadeOutOffset) {
            const t = clamp01((-diff - hit.fadeOutOffset) / hit.fadeOutDuration);
            setBodyAlpha(1 - t * (2 - t));
          } else {
            setBodyAlpha(1);
          }
        }

        
        function resizeFollow(dir) {
          if (!hit.followLasttime) hit.followLasttime = time;
          if (!hit.followLinearSize) hit.followLinearSize = 1;
          const dt = Math.max(0, time - hit.followLasttime);
          hit.followLinearSize = Math.max(1, Math.min(2, hit.followLinearSize + dt * dir));
          hit.followSize = hit.followLinearSize;
          hit.followLasttime = time;
        }

        if (-diff >= 0 && -diff <= hit.fadeOutDuration + hit.sliderTimeTotal) {
          let t = -diff / hit.sliderTime;
          hit.currentRepeat = Math.min(Math.ceil(t), hit.repeat);

          let atEnd = false;
          if (Math.floor(t) > hit.lastrep) {
            hit.lastrep = Math.floor(t);
            if (hit.lastrep > 0 && hit.lastrep <= hit.repeat) atEnd = true;
          }
          t = repeatclamp(Math.min(t, hit.repeat));

          const at = hit.curve.pointAt(t);
          hit.follow._setXY(at.x, at.y);
          hit.ball._setXY(at.x, at.y);

          if (Number(hit.base.getAttribute("opacity")) > 0 && hit.score <= 0) {
            hit.base._setXY(at.x, at.y);
            hit.circle._setXY(at.x, at.y);
            for (let i = 0; i < hit.numbers.length; ++i) hit.numbers[i]._setXY(at.x, at.y);
            hit.approach._setXY(at.x, at.y);
          }

          
          const dx = game.mouseX - at.x, dy = game.mouseY - at.y;
          const followPx = hit.followSize * self.circleRadius;
          let isfollowing = dx * dx + dy * dy <= followPx * followPx;
          const predict = game.mouse(self.realtime);
          const dx1 = predict.x - at.x, dy1 = predict.y - at.y;
          isfollowing |= dx1 * dx1 + dy1 * dy1 <= (followPx + predict.r) * (followPx + predict.r);
          const activated = (self.game.down && isfollowing) || hit.followSize > 1.01;
          
          if (activated && !hit.activatedOnce) hit.activatedOnce = true;

          if (atEnd && activated) {
            const idx = Math.max(0, Math.min(hit.judgements.length - 1, hit.lastrep));
            const jd  = hit.judgements[idx];
            self.invokeJudgement(jd, 300, time, at.x, at.y);
            self.scoreOverlay.hit(300, 300, time);
            self.playHitsound(hit, hit.lastrep, hit.time + hit.lastrep * hit.sliderTime);
          }

          
          if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
            hit.ball._setAlpha(1);
            const fs = Math.max(1, hit.followSize);
            hit.follow._setAlpha(clamp01(fs - 1));
            if (self.game.down && isfollowing) resizeFollow( 1 / 100);
            else                                 resizeFollow(-1 / 100);
            hit.follow._setScale(0.9 * fs);
          }
          const timeAfter = -diff - hit.sliderTimeTotal;
          if (timeAfter > 0) {
            resizeFollow(-1 / 100);
            hit.follow._setScale(0.9 * hit.followSize);
            hit.follow._setAlpha(clamp01(hit.followSize - 1));
            hit.ball._setAlpha(self.fadeOutEasing(timeAfter / 100));
            hit.ball._setScale(1 + 0.15 * timeAfter / 100);
          }

          if (hit.repeat > 1) {
            const A = hit.repeat - (hit.repeat % 2);
            const B = hit.repeat - 1 + (hit.repeat % 2);
            if (hit.reverse)  hit.reverse._setAlpha(hit.currentRepeat < A ? 1 : 0);
            
            
            if (hit.reverse_b) {
              const showSecond = (hit.currentRepeat < B) && !!hit.activatedOnce;
              hit.reverse_b._setAlpha(showSecond ? 1 : 0);
            }
          }
        }

        for (let i = 0; i < hit.judgements.length; i++) this.updateJudgement(hit.judgements[i], time);
      };

      this.updateSpinner = function (hit, time) {
        let alpha = 0;
        const appearTime = hit.time - 500;
        if (time >= appearTime) {
          if (time <= hit.endTime) {
            
            const fadeInDuration = 300;
            const fadeProgress = (time - appearTime) / fadeInDuration;
            alpha = Math.min(1, fadeProgress);
          } else {
            alpha = clamp01(1 - (time - hit.endTime) / 150);
          }
        }
        hit.top._setAlpha(alpha); hit.progress._setAlpha(alpha); hit.base._setAlpha(alpha);

        if (time >= hit.time && time <= hit.endTime) {
          if (self.game.down) {
            const xr = self.game.mouseX - hit.x;
            const yr = self.game.mouseY - hit.y;
            const ang = Math.atan2(yr, xr);
            if (!hit.clicked) hit.clicked = true;
            else {
              let d = ang - hit.lastAngle;
              if (d > Math.PI) d -= Math.PI * 2;
              if (d < -Math.PI) d += Math.PI * 2;
              hit.rotation += d;
              hit.rotationProgress += Math.abs(d);
            }
            hit.lastAngle = ang;
          } else hit.clicked = false;
        }

        if (time < hit.endTime) {
          hit.top._setRot(hit.rotation / 2);
          const prog = clamp01((time - hit.time) / (hit.endTime - hit.time));
          hit.progress._setScale(0.13 + 0.87 * prog);
        } else {
          if (hit.score < 0) {
            const prog = hit.rotationProgress / hit.rotationRequired;
            let points = 0;
            if      (prog >= 1)   points = 300;
            else if (prog >= 0.9) points = 100;
            else if (prog >= 0.75)points = 50;
            self.hitSuccess(hit, points, hit.endTime);
          }
        }

        this.updateJudgement(hit.judgements[0], time);
      };

      
      this.updateHitObjects = function (time) {
        
        self.updateUpcoming(time);
        
        
        for (let i = self.upcomingHits.length - 1; i >= 0; i--) {
          const hit = self.upcomingHits[i];
          if (hit.type === "circle")  self.updateHitCircle(hit, time);
          if (hit.type === "slider")  self.updateSlider(hit, time);
          if (hit.type === "spinner") self.updateSpinner(hit, time);
        }
      };

      
      this.updateBackground = function (time) {
        let fade = self.game.backgroundDimRate; 
        if (time < -self.wait) fade *= Math.max(0, 1 - (-self.wait - time) / 800);
        fade = Math.max(0, Math.min(1, fade));

        
        const bgUrl = document.body?.dataset?.bgUrl;
        const effectiveFade = Math.min(Math.max(0, fade), 0.95);
        try {
          if (bgUrl) {
            document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${effectiveFade}), rgba(0,0,0,${effectiveFade})), url('${bgUrl}')`;
          } else {
            document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${effectiveFade}), rgba(0,0,0,${effectiveFade}))`;
          }
          document.body.style.backgroundSize = 'cover';
          document.body.style.backgroundRepeat = 'no-repeat';
          document.body.style.backgroundPosition = 'center';
        } catch (e) {  }
      };

      this.render = function () {
        this.realtime = Date.now();
        let time;
        if (this.audioReady) time = self.osu.audio.getPosition() * 1000 + self.offset;

        if (typeof time !== "undefined") {
          const nextapproachtime =
            (waitinghitid < self.hits.length &&
             self.hits[waitinghitid].time - (self.hits[waitinghitid].approachTime || self.approachTime) > time)
              ? self.hits[waitinghitid].time - (self.hits[waitinghitid].approachTime || self.approachTime)
              : -1;
          self.breakOverlay.countdown(nextapproachtime, time);
          self.updateBackground(time);
          self.updateHitObjects(time);
          self.scoreOverlay.update(time);
          self.game.updatePlayerActions(time);

          
          if (!self.game.paused &&
              self.scoreOverlay &&
              typeof self.scoreOverlay.HP !== "undefined" &&
              self.scoreOverlay.HP <= 0) {
            if (self.osu?.audio?.pause) self.osu.audio.pause();
            self.game.paused = true;
            
            try {
              const sfx = new Audio('hitsounds/beatmapFail.mp3');
              sfx.volume = 1.0;
              sfx.play().catch(() => {});
            } catch(_) {}
            const fm = document.getElementById("fail-menu");
            if (fm) {
              fm.removeAttribute("hidden");
              fm.style.zIndex = "99995";
              fm.style.pointerEvents = "auto";
              const btnr = document.getElementById("failbtn-retry");
              const btnq = document.getElementById("failbtn-quit");
              if (btnr) btnr.onclick = function () {
                fm.setAttribute("hidden", ""); btnr.onclick = btnq.onclick = null; self.retry();
              };
              if (btnq) btnq.onclick = function () {
                try { fm.setAttribute("hidden", ""); } catch (e) {}
                try { document.getElementById("pause-menu").setAttribute("hidden", ""); } catch (e) {}
                try { self.game.paused = false; self.osu?.audio?.pause?.(); } catch (e) {}
                try { self.destroy(); } catch (e) {}
                if (window.quitGame) window.quitGame();
              };
            }
          }
        } else {
          self.updateBackground(-100000);
        }

        
        ensureCursorPortal();
        updateCursorPortal(self.game, gfx);

        self.loadingMenu.update(Date.now());

        
        if (time > self.endTime) {
          if (!self.ended) {
            self.ended = true;
            self.pause = function () {};
            self.scoreOverlay.visible = false;
            
            
            self.scoreOverlay.showSummary(self.track.metadata, null, self.retry, self.quit)
              .catch(() => {});
          }
          
          try {
            const bgUrl = document.body?.dataset?.bgUrl;
            if (bgUrl) {
              document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0)), url('${bgUrl}')`;
            } else {
              document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0))`;
            }
          } catch (e) {  }
        }
      };

      
      this.start = function () {
        self.started = true;
        self.osu.audio.gain.gain.value = self.game.masterVolume;
        self.osu.audio.playbackRate = self.playbackRate;
        
        
        try {
          if (self.hits && self.hits.length > 0) {
            const firstHitMs = Number(self.hits[0].time) || 0;
            if (firstHitMs > 5000) {
              const desiredStartMs = Math.max(0, firstHitMs - 5000);
              
              
              
              const posoffsetMs = (self.osu.audio && self.osu.audio.posoffset) ? self.osu.audio.posoffset : 0;
              const desiredInternalSec = desiredStartMs / 1000 + posoffsetMs / 1000;
              
              self.osu.audio.position = desiredInternalSec;
              self.osu.audio.play(0);
              return;
            }
          }
        } catch (e) {  }

        
        self.osu.audio.play(800 + self.wait);
      };
      this.retry = function () {
        if (!self.game.paused) { self.osu.audio.pause(); self.game.paused = true; }
        self.destroy();
        self.constructor(self.game, self.osu, self.track);
        self.loadingMenu.hide();
        self.audioReady = true;
        self.start();
      };
      this.quit = function () {
        try { self.game.paused = false; self.osu?.audio?.play?.(); } catch (e) {}
        try { self.destroy(); } catch (e) {}
        if (window.quitGame) window.quitGame();
      };
      this.destroy = function () {
        try { self.breakOverlay._root.remove(); } catch (e) {}
        try { self.scoreOverlay._root.remove(); } catch (e) {}
        try { self.loadingMenu._root.remove(); } catch (e) {}
        try { svg.remove(); } catch (e) {}
        try { hud.remove(); } catch (e) {}
        
        try { host.querySelectorAll(':scope > div').forEach(n => n.remove()); } catch (e) {}
        try {
          if (self._bgObjectUrl) { try { URL.revokeObjectURL(self._bgObjectUrl); } catch (e) {} self._bgObjectUrl = null; }
        } catch (e) {}
        try {
          
          const url = document.body?.dataset?.bgUrl;
          if (url && (!self._bgObjectUrl || self._bgObjectUrl !== url)) {
            try { URL.revokeObjectURL(url); } catch (e) {}
          }
          document.body.style.backgroundImage = '';
          if (document.body && document.body.dataset) delete document.body.dataset.bgUrl;
        } catch (e) {}
        window.onresize = null;
        self.game.cleanupPlayerActions();
        self.render = function () {};
      };

      
      window.onresize = function () {
        if (self.audioReady) self.pause();
        self.calcSize();
        self.scoreOverlay.resize({ width: window.innerWidth, height: window.innerHeight });
        self.loadingMenu.resize({ width: window.innerWidth, height: window.innerHeight });
        self.breakOverlay.resize({ width: window.innerWidth, height: window.innerHeight });

        ensureCursorPortal();
        updateCursorPortal(self.game, gfx);
      };
      window.addEventListener("blur", function () { if (self.audioReady) self.pause(); });
  }

export default Playback;

