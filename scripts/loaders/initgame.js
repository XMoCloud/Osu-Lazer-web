
import Osu from "../Engine/osu.js";
import AudioEngine from "../Engine/AudioEngine.js";
import Playback from "../Engine/playback.js";

(() => {
  "use strict";

  
  window.Osu = Osu;
  window.Playback = Playback;

  
  window.AudioContext = window.AudioContext || window.webkitAudioContext;

  
  var game = {
    window: window,
    stage: null,          
    scene: null,
    updatePlayerActions: function () {},

    
    backgroundDimRate: 0.85,
    cursorSize: 1.15,
    showhwmouse: false,

    
    musicVolume: window.osuVolume?.value ?? .15,
    effectVolume: 1.0,

    
    allowMouseButton: true,
    allowMouseScroll: true,
    K1keycode: 90,
    K2keycode: 88,
    ESCkeycode: 27,
    ESC2keycode: 27,

    
    mouseX: 0,
    mouseY: 0,
    mouse: null,     
    K1down: false,
    K2down: false,
    M1down: false,
    M2down: false,
    down: false,

    finished: false,
    sample: [{}, {}, {}, {}],
    sampleSet: 1,
  };
  window.currentFrameInterval = 16;
  window.game = game;

  if (window.gamesettings) window.gamesettings.loadToGame();
  window.osuSettings?.applyToGame(game);

  
  window.skinReady = false;
  window.soundReady = false;
  window.scriptReady = false;

  

  function preloadImages(urls) {
    if (!urls || !urls.length) return Promise.resolve();
    let loaded = 0;
    return new Promise((resolve) => {
      urls.forEach((u) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === urls.length) resolve();
        };
        img.src = u;
      });
    });
  }

  (async function loadSkinAssets() {
    try {
      
      const SKIN_ASSETS = [
        "assets/disc.png",
        "assets/hitcircleoverlay.png",
        "assets/approachcircle.png",
        "assets/score-0.png", "assets/score-1.png", "assets/score-2.png",
        "assets/score-3.png", "assets/score-4.png", "assets/score-5.png",
        "assets/score-6.png", "assets/score-7.png", "assets/score-8.png",
        "assets/score-9.png",
        "assets/sliderscorepoint.png",
        "assets/reversearrow.png",
        "assets/sliderfollowcircle.png",
        "assets/sliderb.png",
        "assets/spinnerbase.png",
        "assets/spinnerprogress.png",
        "assets/spinnertop.png",
        "assets/cursor.png"
      ];
      await preloadImages(SKIN_ASSETS);

  window.skinReady = true;
  document.body.classList.add("skin-ready");
    } catch (_) {
  window.skinReady = true; 
  document.body.classList.add("skin-ready");
    }
  })();

  
  var sample = [
    "hitsounds/normal-hitnormal.ogg",
    "hitsounds/normal-hitwhistle.ogg",
    "hitsounds/normal-hitfinish.ogg",
    "hitsounds/normal-hitclap.ogg",
    "hitsounds/normal-slidertick.ogg",
    "hitsounds/soft-hitnormal.ogg",
    "hitsounds/soft-hitwhistle.ogg",
    "hitsounds/soft-hitfinish.ogg",
    "hitsounds/soft-hitclap.ogg",
    "hitsounds/soft-slidertick.ogg",
    "hitsounds/drum-hitnormal.ogg",
    "hitsounds/drum-hitwhistle.ogg",
    "hitsounds/drum-hitfinish.ogg",
    "hitsounds/drum-hitclap.ogg",
    "hitsounds/drum-slidertick.ogg",
    "hitsounds/combobreak.ogg",
  ];
  var issafariBrowser = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  if (issafariBrowser) {
    sample = sample.map((path) => {
      const sp = path.split(".");
      sp.pop();
      sp.push("wav");
      return sp.join(".");
    });
  }
  
  window.osuSoundReady = AudioEngine.loadSfx(sample).then(function(map){
    const silent = { volume: 0, play() {} };
    sample.forEach(path => { map[path] ||= silent; });
    game.sample[1].hitnormal = map[sample[0]];
    game.sample[1].hitwhistle = map[sample[1]];
    game.sample[1].hitfinish = map[sample[2]];
    game.sample[1].hitclap = map[sample[3]];
    game.sample[1].slidertick = map[sample[4]];

    game.sample[2].hitnormal = map[sample[5]];
    game.sample[2].hitwhistle = map[sample[6]];
    game.sample[2].hitfinish = map[sample[7]];
    game.sample[2].hitclap = map[sample[8]];
    game.sample[2].slidertick = map[sample[9]];

    game.sample[3].hitnormal = map[sample[10]];
    game.sample[3].hitwhistle = map[sample[11]];
    game.sample[3].hitfinish = map[sample[12]];
    game.sample[3].hitclap = map[sample[13]];
    game.sample[3].slidertick = map[sample[14]];

    game.sampleComboBreak = map[sample[15]];

    window.soundReady = true;
    document.body.classList.add("sound-ready");
  });

  
  window.scriptReady = true;
  document.body.classList.add("script-ready");

  
  [
    "drag","dragend","dragenter","dragexit","dragleave","dragover","dragstart","drop"
  ].forEach((ev) => {
    window.addEventListener(ev, function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
    });
  });
})();

