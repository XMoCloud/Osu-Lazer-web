/* Motion values adapted from wosu! (MIT); see docs/DESIGN_REFERENCES.md. */
(() => {
  const eases={None:t=>t,Out:t=>1-(1-t)**2,In:t=>t*t,InSine:t=>1-Math.cos(t*Math.PI/2),InOutSine:t=>-(Math.cos(Math.PI*t)-1)/2,OutQuint:t=>1-(1-t)**5,OutExpo:t=>t===1?1:1-2**(-10*t),OutElastic:t=>t===0||t===1?t:2**(-10*t)*Math.sin((t-.075)*2*Math.PI/.3)+1-2**(-11)*t};
  const tracks=new Set();
  function tween(target,values,duration=500,ease='OutQuint',delay=0){
    for(const [key,to]of Object.entries(values)){
      for(const track of tracks)if(track.target===target&&track.key===key)tracks.delete(track);
      tracks.add({target,key,from:target[key],to,start:performance.now()+delay,duration,ease:eases[ease]||eases.OutQuint});
    }
  }
  function update(now){for(const track of tracks){if(now<track.start)continue;const p=Math.min(1,(now-track.start)/Math.max(1,track.duration));track.target[track.key]=track.from+(track.to-track.from)*track.ease(p);if(p===1)tracks.delete(track);}}
  function finish(target){for(const track of tracks)if(track.target===target){target[track.key]=track.to;tracks.delete(track);}}
  window.osuMotion={tween,update,finish,eases};
})();
