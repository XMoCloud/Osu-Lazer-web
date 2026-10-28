/* Local score carousel, ordered by score. Only measured statistics are shown. */
const text=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;if(value!=null)node.textContent=value;return node;};
const number=value=>Number(value)||0;
const format=value=>Math.round(number(value)).toLocaleString();
const accuracy=value=>number(value).toFixed(2)+'%';
const validRank=rank=>['SS','S','A','B','C','D','F'].includes(rank)?rank:'D';
export async function showResultsOverlay(summary,opts={}){
  window.osuShell?.close();document.getElementById('results-overlay')?.dispatchEvent(new Event('osu:dispose'));
  const owner=window.playback;
  let map=null;
  try{if(summary.mapId)map=await window.osuMapStore?.getMap(summary.mapId);}catch{}
  if(owner&&(owner.destroyed||window.playback!==owner))return;
  const difficulty=map?.difficulties?.find(diff=>summary.diffBid?String(diff.bid)===String(summary.diffBid):diff.name===summary.diffName);
  const current={...summary,player:summary.player||window.game?.playerName||'osuPlayer1',pfp:summary.pfp||'assets/pfp.png',current:true};
  const entries=(map?.leaderboard||[]).filter(score=>String(score.player||'osuPlayer1').toLowerCase()===current.player.toLowerCase() && (summary.diffBid&&score.diffBid?String(score.diffBid)===String(summary.diffBid):score.diffName===summary.diffName) && !(score.resultId&&score.resultId===summary.resultId) && !(score.timestamp===summary.timestamp&&number(score.score)===number(summary.score))).map(score=>({...score,current:false}));
  entries.push(current);entries.sort((a,b)=>number(b.score)-number(a.score)||number(b.accuracy)-number(a.accuracy)||number(b.timestamp)-number(a.timestamp));
  let cover=document.body.dataset.bgUrl||'',ownedCover=false;
  if(!cover&&map?.coverBlob){cover=URL.createObjectURL(map.coverBlob);ownedCover=true;}
  document.body.classList.add('results-visible');
  document.dispatchEvent(new CustomEvent('osu:results-shown'));
  if(document.pointerLockElement)document.exitPointerLock();
  const hud=window.playback?.scoreOverlay?._root;if(hud)hud.style.opacity='0';
  const root=text('section','results-overlay-root');root.id='results-overlay';root.setAttribute('aria-label','Results');
  const backdrop=text('div','resultsBackdrop');if(cover)backdrop.style.backgroundImage=`url("${cover}")`;root.append(backdrop);
  const rail=text('div','resultsRail');rail.setAttribute('aria-label','Scores, highest first');root.append(rail);
  const cards=[];
  function addStat(parent,label,value,className=''){
    const cell=text('div','resultStat '+className);cell.append(text('span','resultStatLabel',label),text('span','resultStatValue',value));parent.append(cell);
  }
  function renderCard(entry,index,expanded){
    const card=text('article','resultScoreCard'+(expanded?' expanded':' compact'));card.dataset.score=number(entry.score);card.dataset.current=String(Boolean(entry.current));
    card.setAttribute('aria-label',`Score ${index+1}, ${format(entry.score)}${entry.current?', just played':''}`);
    const header=text('header','resultCardHeader');
    const avatar=text('img','resultAvatar');avatar.src=entry.pfp||'assets/pfp.png';avatar.alt='';
    header.append(text('span','resultPosition','#'+(index+1)),avatar,text('span','resultPlayerName',entry.player||'osuPlayer1'));card.append(header);
    const body=text('div','resultCardBody');if(cover)body.style.backgroundImage=`linear-gradient(#38383b80,#29292bcf),url("${cover}")`;card.append(body);
    const meta=text('div','resultCardMeta');meta.append(text('h1','',summary.title||map?.title||'Unknown'),text('p','',summary.artist||map?.artist||''));body.append(meta);
    const rank=validRank(entry.rank);
    const dial=text('div','resultRankDial');
    const progress=Math.max(0,Math.min(100,number(entry.accuracy)));
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 340 340');svg.setAttribute('aria-label',accuracy(entry.accuracy)+' accuracy');svg.classList.add('accuracyDial');
    const add=(tag,attrs,parent=svg)=>{const node=document.createElementNS(ns,tag);for(const[key,value]of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;};
    const gradientId='accuracy-'+crypto.randomUUID();const defs=add('defs',{}),gradient=add('linearGradient',{id:gradientId,x1:0,y1:0,x2:0,y2:1},defs);
    add('stop',{offset:0,'stop-color':rank==='F'?'#ff8a8a':'#7cf6ff'},gradient);add('stop',{offset:1,'stop-color':rank==='F'?'#ff5a5a':'#baffa9'},gradient);
    add('circle',{cx:170,cy:170,r:125,fill:'none',stroke:'#ffffff22','stroke-width':26});
    const gauge=add('circle',{cx:170,cy:170,r:125,fill:'none',stroke:'url(#'+gradientId+')','stroke-width':26,pathLength:100,'stroke-dasharray':progress+' 100',transform:'rotate(-90 170 170)',class:'resultProgress'});gauge.dataset.progress=String(progress);
    for(const[from,to,colour]of[[0,.7,'#ff6080'],[.7,.8,'#ff9565'],[.8,.9,'#f3c34e'],[.9,.95,'#a8e333'],[.95,.99,'#17c3d3'],[.99,1,'#dc38b0']]){
      const a=(from+1/360)*Math.PI*2-Math.PI/2,b=(to-1/360)*Math.PI*2-Math.PI/2,r=103;
      add('path',{d:`M${170+Math.cos(a)*r},${170+Math.sin(a)*r}A${r},${r} 0 ${b-a>Math.PI?1:0} 1 ${170+Math.cos(b)*r},${170+Math.sin(b)*r}`,fill:'none',stroke:colour,'stroke-width':8});
    }
    dial.append(svg);
    const grade=text('img','resultGrade grade-'+rank);grade.src=`assets/grades/GradeWhite-${rank}.svg`;grade.alt=rank;dial.append(grade);
    for(const[label,pos]of[['D',.35],['C',.75],['B',.85],['A',.9125],['S',.96],['SS',1]]){
      const threshold=text('img','resultThreshold');threshold.src=`assets/grades/GradeSmall-${label}${['S','SS'].includes(label)?'-Silver':''}.svg`;threshold.alt=label;
      const angle=-Math.PI/2+pos*Math.PI*2;threshold.style.left=(170+Math.cos(angle)*155)/3.4+'%';threshold.style.top=(170+Math.sin(angle)*150)/3.4+'%';dial.append(threshold);
    }
    body.append(dial);
    body.append(text('div','resultScore',format(entry.score)));
    const badge=text('div','resultDifficultyBadge');const stars=difficulty?.stars??summary.stars;
    if(stars!=null){badge.textContent='★ '+Number(stars).toFixed(2);window.osuDifficulty?.apply(badge,stars);}else badge.textContent='osu!';body.append(badge);
    body.append(text('div','resultDifficultyName',summary.diffName||''),text('div','resultMapper','mapped by '+(summary.mapper||map?.creator||'Unknown')));
    const stats=text('div','resultStats');addStat(stats,'ACCURACY',accuracy(entry.accuracy));addStat(stats,'MAX COMBO',format(entry.combo)+'x');body.append(stats);
    const counts=entry.counts,judges=text('div','resultJudges');
    for(const [key,label] of [['great','GREAT'],['good','OK'],['meh','MEH'],['miss','MISS']])addStat(judges,label,counts?format(counts[key]):'—','judge-'+key);body.append(judges);
    if(entry.fullCombo)body.append(text('p','resultFullCombo','PERFECT COMBO'));
    const date=text('p','resultPlayedOn',entry.timestamp?'Played on '+new Date(entry.timestamp).toLocaleString():'Local score');body.append(date);
    const footer=text('div','resultCompactFooter'),badgeImage=text('img','rankBadge');badgeImage.src=`assets/grades/GradeSmall-${rank}${['S','SS'].includes(rank)?'-Silver':''}.svg`;badgeImage.alt=rank;footer.append(text('span','',format(entry.score)),badgeImage);card.append(footer);
    const choose=text('button','inspectScore','View score #'+(index+1));choose.setAttribute('aria-pressed',String(expanded));choose.onclick=()=>select(index);card.append(choose);
    const slot=text('div','resultCardSlot');slot.dataset.expanded=String(expanded);slot.append(card);return slot;
  }
  function select(index,initial=false){
    activeIndex=index;
    cards.forEach((card,i)=>{const fresh=renderCard(entries[i],i,i===index);card.replaceWith(fresh);cards[i]=fresh;});
    fit();
    requestAnimationFrame(()=>{const card=cards[index];rail.scrollTo({left:card.offsetLeft-(rail.clientWidth-card.offsetWidth)/2,behavior:initial||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  }
  let activeIndex=0;
  function fit(){const scale=Math.max(.25,Math.min(1,(innerHeight-219)/760,(innerWidth-36)/480));root.style.setProperty('--result-scale',scale);rail.style.paddingLeft=rail.style.paddingRight=Math.max(18,(innerWidth-480*scale)/2)+'px';for(const slot of cards){const expanded=slot.dataset.expanded==='true';slot.style.width=(expanded?480:172)*scale+'px';slot.style.height=(expanded?760:550)*scale+'px';}}
  const initial=entries.findIndex(entry=>entry.current);
  entries.forEach((entry,index)=>{const card=renderCard(entry,index,index===initial);cards.push(card);rail.append(card);});
  const footer=text('footer','resultsFooter');const back=text('button','resultsBack','Back');back.type='button';
  if(window.osuIcons)back.insertAdjacentHTML('afterbegin',window.osuIcons.back);
  const retry=text('button','resultsRetry','Retry this beatmap');retry.type='button';
  footer.append(back,retry,text('span','resultsOrder','Local scores · highest score first'));root.append(footer);
  let disposed=false;
  function dispose(){if(disposed)return;disposed=true;root.remove();document.body.classList.remove('results-visible');window.osuShell?.close();window.removeEventListener('keydown',keydown);window.removeEventListener('resize',resize);if(ownedCover)URL.revokeObjectURL(cover);}
  root.addEventListener('osu:dispose',dispose,{once:true});
  back.onclick=async()=>{if(opts.onQuit)await opts.onQuit();dispose();};retry.onclick=()=>{dispose();opts.onRetry?.();};
  function keydown(event){if(window.osuShell?.active||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(event.key==='Escape'){event.preventDefault();back.click();}else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();select(Math.max(0,Math.min(entries.length-1,activeIndex+(event.key==='ArrowRight'?1:-1))));}}
  window.addEventListener('keydown',keydown);
  function resize(){fit();requestAnimationFrame(()=>rail.scrollTo({left:cards[activeIndex].offsetLeft-(rail.clientWidth-cards[activeIndex].offsetWidth)/2}));}
  window.addEventListener('resize',resize);
  rail.addEventListener('wheel',event=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX)){event.preventDefault();rail.scrollLeft+=event.deltaY;}},{passive:false});
  document.body.append(root);fit();
  requestAnimationFrame(()=>select(initial,true));
  return root;
}
export default {showResultsOverlay};
