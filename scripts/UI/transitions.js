/* Native adaptation of wosu!'s SongSelect and PlayerLoader motion (MIT). */
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),quint='cubic-bezier(.22,1,.36,1)',animations=new Set();
  function animate(node,frames,duration,delay=0,fill='none'){
    if(!node)return Promise.resolve();
    const animation=node.animate(frames,{duration:reduced.matches?1:duration,delay:reduced.matches?0:delay,easing:quint,fill});animations.add(animation);
    // Finished fill animations still affect rendering. Retain them until clear()
    // cancels their effect, otherwise exiting a map leaves the menu transparent.
    return animation.finished.catch(()=>{}).finally(()=>{if(fill!=='forwards'&&fill!=='both')animations.delete(animation);});
  }
  const loader=document.createElement('section');loader.id='beatmapLoading';loader.hidden=true;loader.setAttribute('aria-label','Loading beatmap');
  loader.innerHTML='<div class="loaderBackground"></div><div class="loaderContent" role="status"><div class="loaderCover"></div><h1></h1></div>';
  document.body.append(loader);
  let coverURL=null;
  function selection(enter){
    for(const animation of animations)animation.cancel();animations.clear();
    const duration=enter?800:300,jobs=[];
    for(const [selector,offset]of [['#beatmapInfoBox,.leaderboardContainer','-35vw'],['.searchContainer,.beatmapListContainer','35vw']]){
      for(const node of document.querySelectorAll(selector))jobs.push(animate(node,enter?[{translate:offset+' 0',opacity:0},{translate:'0 0',opacity:1}]:[{translate:'0 0',opacity:1},{translate:offset+' 0',opacity:0}],duration,0,enter?'none':'forwards'));
    }
    for(const node of document.querySelectorAll('.bottomBar,.backButton'))jobs.push(animate(node,enter?[{translate:'0 67px'},{translate:'0 0'}]:[{translate:'0 0'},{translate:'0 67px'}],enter?500:300,0,enter?'none':'forwards'));
    jobs.push(animate(document.getElementById('logoVisual'),enter?[{scale:.4,opacity:0},{scale:1,opacity:1}]:[{scale:1,opacity:1},{scale:.4,opacity:0}],enter?700:300,0,enter?'none':'forwards'));
    return Promise.all(jobs);
  }
  window.osuTransitions={selection,
    clear(){for(const animation of animations)animation.cancel();animations.clear();},
    showLoader(map,diff){
      loader.hidden=false;loader.style.opacity='';
      if(coverURL)URL.revokeObjectURL(coverURL);coverURL=map.coverBlob?URL.createObjectURL(map.coverBlob):null;
      const cover=coverURL||'assets/background.png';loader.querySelector('.loaderBackground').style.backgroundImage=`url("${cover}")`;loader.querySelector('.loaderCover').style.backgroundImage=`url("${cover}")`;
      loader.querySelector('h1').textContent=map.title;
      animate(loader.querySelector('.loaderContent'),[{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'scale(1)'}],650);
    },
    async hideLoader(){
      animate(loader.querySelector('.loaderContent'),[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.7)'}],600);
      await animate(loader,[{opacity:1},{opacity:0}],300);loader.hidden=true;
      if(coverURL){URL.revokeObjectURL(coverURL);coverURL=null;}
    },
    cancelLoader(){loader.hidden=true;if(coverURL){URL.revokeObjectURL(coverURL);coverURL=null;}},
    gameIn(){return animate(document.getElementById('game-area'),[{opacity:0},{opacity:1}],400);},
    gameOut(){const jobs=[animate(document.getElementById('game-area'),[{opacity:1},{opacity:0}],250,0,'forwards')];for(const id of['pause-menu','fail-menu','results-overlay']){const node=document.getElementById(id);if(node&&!node.hidden)jobs.push(animate(node,[{opacity:1},{opacity:0}],250,0,'forwards'));}return Promise.all(jobs);}
  };
})();
