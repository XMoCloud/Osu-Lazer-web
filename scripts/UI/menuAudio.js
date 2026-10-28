/* One persistent music session for the menu, selection, previews and gameplay handoff. */
(() => {
  const audio=document.getElementById('bgm'),preview=new Audio(),directPreview=new Audio(),tracks=new Map();
  preview.crossOrigin='anonymous';preview.preload='none';
  // Official preview fallback plays natively, outside Web Audio: its server
  // allows media playback but supplies no CORS permission for an analyser.
  directPreview.preload='none';let previewMedia=preview;
  const defaultTrack={id:'intro',intro:true,src:'hitsounds/Trinagles.mp3',artist:'cYsmix',title:'Triangles',cover:'assets/background.png',previewTime:0,timingPoints:[{offset:15,beatLength:375,meter:4}]};
  let context,analyser,masterGain,mainGain,previewGain,seekHandler;
  let generation=0,previewGeneration=0,current=null,requested=null,previewId=null,previewTrack=null,previousPlaying=false,shuffle=false,mode='menu',introRetired=false,wantPlaying=true;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function connect(){
    if(context){if(context.state==='suspended')context.resume().catch(()=>{});return;}
    context=new(window.AudioContext||window.webkitAudioContext)();analyser=context.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=0;
    mainGain=context.createGain();previewGain=context.createGain();masterGain=context.createGain();mainGain.gain.value=1;previewGain.gain.value=0;masterGain.gain.value=window.osuVolume?.value??.38;
    context.createMediaElementSource(audio).connect(mainGain);context.createMediaElementSource(preview).connect(previewGain);
    mainGain.connect(analyser);previewGain.connect(analyser);analyser.connect(masterGain);masterGain.connect(context.destination);context.resume().catch(()=>{});
  }
  function ramp(node,value,seconds=.12){
    if(!node||!context)return;const now=context.currentTime;
    if(node.gain.cancelAndHoldAtTime)node.gain.cancelAndHoldAtTime(now);else{node.gain.cancelScheduledValues(now);node.gain.setValueAtTime(node.gain.value,now);}
    node.gain.linearRampToValueAtTime(value,now+seconds);
  }
  function playbackState(){
    const button=document.getElementById('ctrlToggle'),paused=previewId?previewMedia.paused:audio.paused;
    button?.classList.toggle('paused',paused);button?.setAttribute('aria-label',paused?'Play music':'Pause music');
    document.dispatchEvent(new CustomEvent('osu:audio-state'));
  }
  function announce(){if(current)document.dispatchEvent(new CustomEvent('osu:track-changed',{detail:current}));playbackState();}
  function retireIntro(){introRetired=true;}
  async function playTrack(track,{seek=mode==='selection',reason='selection'}={}){
    if(!track?.src||mode==='gameplay'||(track.intro&&introRetired))return;
    if(!track.intro)retireIntro();
    connect();stopPreview(false);wantPlaying=true;
    const token=++generation;requested=track;ramp(mainGain,0,.15);
    if(current&&!audio.paused)await delay(155);
    if(token!==generation||mode==='gameplay')return;
    audio.pause();current=track;requested=null;
    if(seekHandler)audio.removeEventListener('loadedmetadata',seekHandler);
    const start=seek?Math.max(0,Number(track.previewTime)||0):0;
    const applySeek=()=>{if(token===generation&&Number.isFinite(audio.duration))audio.currentTime=start<audio.duration?start:0;};
    seekHandler=applySeek;
    if(audio.getAttribute('src')===track.src&&audio.readyState>=1)applySeek();
    else{audio.addEventListener('loadedmetadata',applySeek,{once:true});audio.src=track.src;}
    document.dispatchEvent(new CustomEvent('osu:track-changed',{detail:{...track,reason}}));
    try{await audio.play();if(token!==generation)return;if(wantPlaying)ramp(mainGain,1,.22);else audio.pause();}
    catch(error){if(token===generation&&!['AbortError','NotAllowedError'].includes(error.name))window.osuToast?.('This track could not be played.',true);}
  }
  function stopPreview(resume=true){
    ++previewGeneration;const oldId=previewId;previewId=null;previewTrack=null;
    preview.pause();directPreview.pause();ramp(previewGain,0,.08);
    if(!oldId)return;
    document.dispatchEvent(new CustomEvent('osu:preview-changed',{detail:{id:oldId,playing:false}}));
    if(resume&&mode!=='gameplay'&&previousPlaying){
      if(current?.intro&&introRetired)next(1);
      else if(current)audio.play().then(()=>ramp(mainGain,1,.15)).catch(()=>{});
    }
    if(resume)announce();
  }
  async function playPreview(set){
    if(mode==='gameplay')return;connect();
    if(previewId===String(set.id)){stopPreview();return;}
    retireIntro();const token=++previewGeneration;++generation;requested=null;
    if(!previewId)previousPlaying=!audio.paused;
    if(previewId)document.dispatchEvent(new CustomEvent('osu:preview-changed',{detail:{id:previewId,playing:false}}));
    ramp(mainGain,0,.1);ramp(previewGain,0,.07);await delay(105);
    if(token!==previewGeneration||mode==='gameplay')return;
    audio.pause();preview.pause();directPreview.pause();previewMedia=preview;previewId=String(set.id);
    previewTrack={...set,timingPoints:set.bpm?[{offset:0,beatLength:60000/set.bpm,meter:4}]:[],effectPoints:[]};preview.src=set.preview_url;
    try{
      try{await preview.play();if(token!==previewGeneration)return;ramp(previewGain,1,.15);}
      catch(error){
        if(token!==previewGeneration)return;
        if(!set.preview_fallback||error.name==='NotAllowedError')throw error;
        preview.pause();previewMedia=directPreview;directPreview.volume=window.osuVolume?.value??.38;directPreview.src=set.preview_fallback;
        await directPreview.play();if(token!==previewGeneration)return;
      }
      document.dispatchEvent(new CustomEvent('osu:preview-changed',{detail:{id:previewId,playing:true}}));playbackState();
    }catch(error){if(token===previewGeneration){stopPreview();window.osuToast?.('The song preview is unavailable. You can still download the map.');}}
  }
  function next(direction=1,{automatic=false}={}){
    if(mode==='gameplay')return;
    const all=[...tracks.values()];if(!all.length)return;
    const active=requested||current;
    if(automatic&&mode==='selection'&&active?.mapId)return playTrack(tracks.get(active.mapId)||active,{seek:true,reason:'loop'});
    const index=all.findIndex(track=>track.mapId===active?.mapId);
    const n=index<0?(direction<0?all.length-1:0):shuffle&&all.length>1?(index+1+Math.floor(Math.random()*(all.length-1)))%all.length:(index+direction+all.length)%all.length;
    return playTrack(all[n],{seek:mode==='selection',reason:automatic?'auto-next':'transport'});
  }
  function suspend(){
    ++generation;requested=null;wantPlaying=false;stopPreview(false);audio.pause();ramp(mainGain,0,.08);mode='gameplay';playbackState();
  }
  function setMode(nextMode){mode=nextMode;if(context&&mode!=='gameplay')connect();}
  audio.addEventListener('ended',()=>{if(mode!=='gameplay'&&wantPlaying)next(1,{automatic:true});});
  preview.addEventListener('ended',()=>stopPreview());
  directPreview.addEventListener('ended',()=>stopPreview());
  for(const media of[audio,preview,directPreview])for(const event of['play','pause'])media.addEventListener(event,playbackState);
  window.addEventListener('osu:volume-changed',event=>{ramp(masterGain,event.detail.value,.04);directPreview.volume=event.detail.value;});
  window.osuMenuAudio={audio,connect,playTrack,playPreview,stopPreview,next,suspend,setMode,defaultTrack,
    registerTrack(id,track){id=String(id);tracks.set(id,{...track,id,mapId:id,intro:false});},
    playMap(id,options){const track=tracks.get(String(id));if(track)return playTrack(track,options);},
    toggle(){
      if(mode==='gameplay')return;connect();
      if(previewId){if(previewMedia.paused)previewMedia.play().catch(()=>{});else previewMedia.pause();return;}
      if(requested){wantPlaying=!wantPlaying;return;}
      if(!current||(current.intro&&introRetired))return next(1);
      wantPlaying=audio.paused;
      if(wantPlaying)audio.play().then(()=>ramp(mainGain,1)).catch(()=>{});
      else{const token=generation;ramp(mainGain,0,.08);setTimeout(()=>{if(token===generation&&!wantPlaying)audio.pause();},85);}
    },
    get shuffle(){return shuffle;},set shuffle(value){shuffle=Boolean(value);},
    get mode(){return mode;},get introRetired(){return introRetired;},get analyser(){return analyser;},get context(){return context;},
    get current(){return previewId?previewTrack:current;},get clock(){return previewId?previewMedia.currentTime:audio.currentTime;},get playing(){return mode!=='gameplay'&&(previewId?!previewMedia.paused:!audio.paused);}
  };
  // Closing a Web Audio graph on pagehide breaks BFCache-restored media sources permanently.
  window.addEventListener('pagehide',()=>{audio.pause();preview.pause();directPreview.pause();});
  window.addEventListener('pageshow',event=>{if(event.persisted&&context)connect();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&context&&mode!=='gameplay')connect();});
})();
