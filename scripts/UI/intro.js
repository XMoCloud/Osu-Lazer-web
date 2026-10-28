/* Menu motion adapted from wosu! OsuLogo/MenuButton (MIT), rendered with DOM/SVG. */
(() => {
  const audio=window.osuMenuAudio,motion=window.osuMotion;
  const intro=document.getElementById('intro'),video=document.getElementById('introVideo'),start=document.getElementById('startOverlay'),main=document.getElementById('main'),logo=document.getElementById('logo'),visual=document.getElementById('logoVisual'),strip=document.getElementById('menuStrip'),top=document.getElementById('topBar');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let revealed=false,menuOpen=false,selecting=false,suspended=false,frameId=0,previous=0,width=innerWidth,height=innerHeight,logoWidth=500,amplitudeScale=1;
  const pose={size:1,x:0,y:0},fx={hover:1,press:1};
  const sfx=id=>{const sound=document.getElementById(id);if(sound){sound.currentTime=0;sound.play().catch(()=>{});}};
  const iconSVG={
    play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    import:'<path d="M12 3v11m-4-4 4 4 4-4M3 15v6h18v-6M3 16h4l2 3h6l2-3h4"/>',
    browse:'<path d="M5 3h14v15H5zM3 6v15h14M14 6v7m0-5 3-1"/><ellipse cx="11.5" cy="13.5" rx="2.5" ry="1.5"/>',
    exit:'<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m-8 0 8-8"/>'
  };
  const buttons=[...document.querySelectorAll('.menuBtn'),document.getElementById('menuSettings')].map(node=>{
    const role=[...node.classList].find(name=>iconSVG[name]);
    if(role){const old=node.querySelector('.menuIcon');old.outerHTML='<svg class="menuIcon" viewBox="0 0 24 24" aria-hidden="true">'+iconSVG[role]+'</svg>';}
    const glyph=node.querySelector('svg'),holder=document.createElement('span');holder.className='menuGlyph';glyph.replaceWith(holder);holder.append(glyph);
    return{node,holder,settings:node.id==='menuSettings',width:0,scaleX:1,scaleY:1,y:0,rotation:0,flash:0,hovered:false,rightward:false,token:0};
  });
  const tween=(target,props,duration,ease='OutQuint',delay=0)=>motion.tween(target,props,reduced.matches?1:duration,ease,reduced.matches?0:delay);
  function measure(){width=innerWidth;height=innerHeight;logoWidth=visual.offsetWidth;if(revealed)position();}
  function position(initial=false){
    const menuScale=width<=600?.46:.47,menuShift=Math.min(310,width*.16);
    const target=selecting?{size:.34,x:width/2-logoWidth*.34*.35,y:height/2-logoWidth*.34*.4}:menuOpen?{size:menuScale,x:-menuShift,y:28}:{size:1,x:0,y:0};
    tween(pose,target,initial?1500:selecting?700:menuOpen?200:800,initial?'OutElastic':selecting?'OutQuint':menuOpen?'In':'OutExpo');
  }
  function frame(now){
    frameId=0;if(document.hidden||!revealed||suspended)return;
    const dt=Math.min(.04,(now-(previous||now))/1000);previous=now;motion.update(now);
    const beat=window.osuVisualizer.update(now,dt),peak=window.osuVisualizer.peak||0;
    amplitudeScale+=(1-Math.max(0,peak-.4)*.06-amplitudeScale)*(1-Math.exp(-dt/.06));
    const scale=pose.size*fx.hover*fx.press*amplitudeScale*(1-.02*beat);
    visual.style.transform=`translate(-50%, -50%) translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    const centre=width/2+pose.x,facadeHalf=logoWidth*pose.size*.4*fx.hover*fx.press;
    strip.style.setProperty('--menu-start',Math.round(centre+facadeHalf)+'px');
    const baseWidth=width<=600?width*.18:Math.min(187,Math.max(90,width*.0975));
    for(const button of buttons){
      if(button.settings){const content=Math.max(1,150*button.width);strip.style.setProperty('--settings-content-width',content+'px');strip.style.setProperty('--settings-start',(centre-facadeHalf-content)+'px');strip.style.setProperty('--settings-width',(facadeHalf*2+content)+'px');}
      else button.node.style.width=Math.max(0,baseWidth*button.width)+'px';
      button.holder.style.transform=`translateY(${button.y.toFixed(2)}px) rotate(${button.rotation.toFixed(2)}deg) scale(${button.scaleX.toFixed(4)},${button.scaleY.toFixed(4)})`;
      button.node.style.setProperty('--button-flash',button.flash.toFixed(3));
    }
    frameId=requestAnimationFrame(frame);
  }
  function loop(){if(!frameId&&revealed&&!suspended&&!document.hidden){previous=0;frameId=requestAnimationFrame(frame);}}
  function setMenu(open){
    menuOpen=open;strip.classList.toggle('open',open);strip.inert=!open;document.body.classList.toggle('menu-open',open);top.classList.toggle('active',open||selecting);
    for(const button of buttons){button.hovered=false;++button.token;tween(button,{width:open?1:0,y:0,rotation:0,scaleX:1,scaleY:1},500,'OutExpo');}
    position();loop();
  }
  function reveal(){
    if(revealed){loop();return;}revealed=true;video.pause();intro.hidden=true;start.classList.remove('active');main.classList.add('active');measure();pose.size=.85;position(true);loop();document.dispatchEvent(new CustomEvent('osu:menu-ready'));
  }
  async function openSelection(){
    reveal();audio.setMode('selection');window.osuBrowse?.close();selecting=true;setMenu(false);document.getElementById('beatmapBrowser').hidden=false;document.body.classList.add('view-beatmaps');top.classList.add('active');
    await window.osuLibrary.ready;await window.osuLibrary.restore();void window.osuTransitions.selection(true);loop();
  }
  function leaveSelection(){audio.setMode('menu');selecting=false;document.body.classList.remove('view-beatmaps');document.getElementById('beatmapBrowser').hidden=true;window.osuTransitions.clear();setMenu(true);sfx('sfxBack');}
  let starting=false;
  async function begin(){if(starting)return;starting=true;audio.connect();await audio.playTrack(audio.defaultTrack,{seek:false,reason:'intro'});start.classList.remove('active');try{await video.play();}catch{reveal();}}
  window.osuMenu={openSelection,leaveSelection,reveal,get selecting(){return selecting;},
    suspend(){suspended=true;cancelAnimationFrame(frameId);frameId=0;fx.hover=fx.press=1;motion.finish(fx);fx.hover=fx.press=1;for(const button of buttons){button.hovered=false;++button.token;}},
    resume(){suspended=false;window.osuVisualizer.reset();measure();loop();}
  };
  start.classList.add('active');start.addEventListener('click',begin,{once:true});start.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')begin();});
  video.addEventListener('ended',reveal,{once:true});video.addEventListener('error',()=>{if(starting)reveal();},{once:true});
  logo.addEventListener('mouseenter',()=>{if(!selecting)tween(fx,{hover:1.1},500,'OutElastic');});
  logo.addEventListener('mouseleave',()=>{tween(fx,{hover:1},500,'OutElastic');tween(fx,{press:1},500,'OutElastic');});
  logo.addEventListener('pointerdown',event=>{event.preventDefault();tween(fx,{press:.9},1000,'Out');});
  window.addEventListener('pointerup',()=>tween(fx,{press:1},500,'OutElastic'));
  logo.addEventListener('click',()=>{
    audio.connect();if(selecting)return window.osuLibrary.playSelection();setMenu(!menuOpen);sfx(menuOpen?'sfxOpen':'sfxBack');
    if(!reduced.matches)logo.animate([{filter:'brightness(1.4)'},{filter:'brightness(1)'}],{duration:500,easing:'cubic-bezier(.22,1,.36,1)'});
  });
  logo.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();logo.click();}});
  for(const button of buttons){
    button.node.addEventListener('mouseenter',()=>{
      if(!menuOpen)return;button.hovered=true;++button.token;sfx('sfxHover');
      const beat=window.osuVisualizer.beatAt(audio.current?.timingPoints||[],audio.clock*1000);const until=beat?beat.length-(audio.clock*1000-beat.time):300;
      tween(button,{width:1.5},500,'OutElastic');tween(button,{rotation:button.rightward?-8:8},until,'InOutSine');tween(button,{scaleX:1.2,scaleY:1.08},until,'Out');
    });
    button.node.addEventListener('mouseleave',()=>{button.hovered=false;++button.token;tween(button,{rotation:0,y:0},500,'Out');tween(button,{scaleX:1,scaleY:1},200,'Out');if(menuOpen)tween(button,{width:1},500,'OutElastic');});
    button.node.addEventListener('pointerdown',()=>tween(button,{flash:.1},1000));
    button.node.addEventListener('click',()=>{button.flash=.9;tween(button,{flash:0},800,'OutExpo');});
  }
  document.addEventListener('osu:beat',event=>{
    if(suspended||reduced.matches)return;
    const {length,amplitude,kiai}=event.detail;
    if(kiai){const ripple=document.getElementById('logoBeatRipple');ripple.getAnimations().forEach(a=>a.cancel());ripple.animate([{opacity:.25*amplitude,transform:'scale(1)'},{opacity:0,transform:'scale(1.3)'}],{duration:800,easing:'cubic-bezier(.22,1,.36,1)'});}
    for(const button of buttons)if(button.hovered&&menuOpen){
      const token=++button.token,duration=length/2;button.rightward=!button.rightward;
      tween(button,{rotation:button.rightward?8:-8},length,'InOutSine');tween(button,{y:-10,scaleX:1.2,scaleY:1.2},duration,'Out');
      setTimeout(()=>{if(button.token===token&&button.hovered)tween(button,{y:0,scaleX:1.2,scaleY:1.08},duration,'In');},duration);
    }
  });
  document.querySelector('.menuBtn.play').onclick=()=>{sfx('sfxPlayClick');void openSelection();};
  const picker=document.getElementById('importPicker');document.querySelector('.menuBtn.import').onclick=()=>picker.click();picker.onchange=()=>{if(picker.files.length)window.importFiles(picker.files);picker.value='';};
  document.querySelector('.menuBtn.browse').onclick=()=>window.osuBrowse.open();
  let exiting=false;
  document.querySelector('.menuBtn.exit').onclick=()=>{
    if(exiting)return;exiting=true;audio.suspend();
    const outro=document.getElementById('outro'),clip=document.getElementById('outroVideo');outro.hidden=false;outro.classList.add('active');
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;clip.pause();
      // Browsers allow this for script-opened tabs. A normally opened tab may
      // refuse; restore the UI instead of leaving the user behind the outro.
      try{window.close();}catch{}
      setTimeout(()=>{if(window.closed)return;exiting=false;outro.hidden=true;outro.classList.remove('active');audio.setMode('menu');setMenu(true);audio.next(1);window.osuToast('Your browser prevented this tab from closing. You can close it manually.');},100);
    };
    clip.onended=finish;clip.onerror=finish;clip.currentTime=0;clip.play().catch(finish);
  };
  document.querySelector('.backButton').onclick=leaveSelection;
  document.getElementById('localRandom').onclick=()=>window.osuLibrary.random();document.getElementById('localBrowse').onclick=()=>window.osuBrowse.open();document.getElementById('localPlay').onclick=()=>window.osuLibrary.playSelection();
  for(const[id,icon]of[['localRandom','shuffle'],['localBrowse','folder'],['localPlay','play']])document.getElementById(id).querySelector('.actionIcon').innerHTML=window.osuIcons[icon];
  document.getElementById('ctrlPrev').onclick=()=>audio.next(-1);document.getElementById('ctrlNext').onclick=()=>audio.next(1);document.getElementById('ctrlToggle').onclick=()=>audio.toggle();
  document.getElementById('menuHome').onclick=()=>{window.osuMusicPlayer.close();if(window.osuApp?.busy){void window.osuApp.quit();return;}if(selecting)leaveSelection();else setMenu(!menuOpen);};
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||window.osuApp?.busy||document.body.classList.contains('browse-open')||document.body.classList.contains('shell-open')||document.body.classList.contains('gaming'))return;if(!revealed){if(starting)reveal();return;}if(selecting)leaveSelection();else setMenu(!menuOpen);});
  document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('page-hidden',document.hidden);if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else loop();});
  window.addEventListener('pageshow',()=>{frameId=0;loop();});window.addEventListener('resize',measure);
  const updateClock=()=>{document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'});};updateClock();setInterval(updateClock,1000);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);frameId=0;});
})();
