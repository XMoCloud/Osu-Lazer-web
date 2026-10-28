/* ppy/osu LogoVisualisation: FFT512 linear amplitudes, 200 bins, five radial
 * passes, 50 ms peak updates and frame-time decay. No log-frequency remapping.
 */
(() => {
  const svg=document.getElementById('logoSpectrum'); if (!svg) return;
  const ns='http://www.w3.org/2000/svg';
  const defs=document.createElementNS(ns,'defs');
  const path=document.createElementNS(ns,'path'); path.id='spectrum-bars';
  defs.append(path); svg.append(defs);
  for(let pass=0;pass<5;pass++){
    const use=document.createElementNS(ns,'use');use.setAttribute('href','#spectrum-bars');use.setAttribute('transform',`rotate(${pass*72})`);svg.append(use);
  }
  const values=new Float32Array(200),cos=new Float32Array(200),sin=new Float32Array(200);
  for(let i=0;i<200;i++){cos[i]=Math.cos(i*Math.PI/100);sin[i]=Math.sin(i*Math.PI/100);}
  let bins,wave,offset=0,lastSample=-Infinity,lastBeatKey='',peak=0,bassAverage=0,lastOnset=-Infinity,onsetCount=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function pointAt(points,time){let point=points[0];for(const candidate of points){if(candidate.offset>time)break;point=candidate;}return point;}
  function beatAt(points,time){
    const timing=pointAt(points,time);
    if(!timing?.beatLength || timing.beatLength<=0)return null;
    const length=timing.beatLength;
    const index=Math.floor((time-timing.offset)/length);
    const beatTime=timing.offset+index*length;
    const elapsed=Math.max(0,time-beatTime);
    const strength=Math.pow(Math.max(0,1-elapsed/(2*length)),5);
    return {index,time:beatTime,length,strength,key:`${timing.offset}:${length}:${index}`};
  }
  window.osuVisualizer={
    peak:0,kiai:false,beatAt,
    update(now,dt){
      const audio=window.osuMenuAudio,analyser=audio?.analyser;
      if(document.hidden || document.body.classList.contains('gaming') || !analyser)return 0;
      if(!bins || bins.length!==analyser.frequencyBinCount){bins=new Float32Array(analyser.frequencyBinCount);wave=new Float32Array(analyser.fftSize);}
      const time=audio.clock*1000;
      let beat=beatAt(audio.current?.timingPoints||[],time);
      const effect=pointAt(audio.current?.effectPoints||[],time);
      const kiai=Boolean(effect?.kiai);
      this.kiai=kiai;
      if(now-lastSample>=50){
        analyser.getFloatFrequencyData(bins);analyser.getFloatTimeDomainData(wave);
        let maximum=0;for(const sample of wave)maximum=Math.max(maximum,Math.abs(sample));
        peak=audio.playing?Math.min(1,maximum*2.4):0;this.peak=peak;
        let bass=0;for(let i=1;i<9;i++)if(Number.isFinite(bins[i]))bass=Math.max(bass,Math.pow(10,bins[i]/20)*12);
        bassAverage+=(bass-bassAverage)*(1-Math.exp(-.05/.3));
        if(!beat&&audio.playing&&bass>.35&&bass>bassAverage*1.25&&time-lastOnset>280){lastOnset=time;onsetCount++;}

        for(let i=0;i<200;i++){
          // Preserve linear FFT peaks. Display gain accounts for browser FFT normalization
          // and the quiet bundled menu recording; it does not lift the noise floor.
          const db=bins[(i+offset)%200];
          const amplitude=audio.playing && Number.isFinite(db)?Math.min(1.6,Math.pow(10,db/20)*12)*(kiai?1:.5):0;
          values[i]=Math.max(values[i],amplitude);
        }
        offset=(offset+5)%200;lastSample=now;
      }
      if(!beat&&Number.isFinite(lastOnset))beat={length:500,strength:Math.pow(Math.max(0,1-(time-lastOnset)/1000),5),key:'onset:'+onsetCount,index:onsetCount};
      if(beat && audio.playing && beat.key!==lastBeatKey){
        lastBeatKey=beat.key;
        document.dispatchEvent(new CustomEvent('osu:beat',{detail:{...beat,amplitude:Math.max(.4,Math.min(1,peak*1.4)),kiai}}));
      }
      let d='';
      for(let i=0;i<200;i++){
        values[i]=Math.max(0,values[i]-dt*2.4*(values[i]+.03));
        const length=reduced.matches?Math.min(14,values[i]*40):values[i]*1125;
        if(length<1)continue;
        const end=480+length;
        d+=`M${(cos[i]*480).toFixed(1)},${(sin[i]*480).toFixed(1)}L${(cos[i]*end).toFixed(1)},${(sin[i]*end).toFixed(1)}`;
      }
      path.setAttribute('d',d);
      return reduced.matches || !audio.playing ? 0 : (beat?.strength||0)*Math.max(.4,Math.min(1,peak*1.4));
    },
    reset(){lastBeatKey='';offset=0;lastSample=-Infinity;peak=0;this.peak=0;lastOnset=-Infinity;bassAverage=0;values.fill(0);}
  };
  document.addEventListener('osu:preview-changed',()=>window.osuVisualizer.reset());
  document.addEventListener('osu:track-changed',()=>window.osuVisualizer.reset());
})();
