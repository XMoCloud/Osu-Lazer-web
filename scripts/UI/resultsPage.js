


function ensureResultsStyle() {
  
}

function formatScore(n){return (Number(n)||0).toLocaleString();}
function formatAcc(n){const v = Number(n)||0;return v.toFixed(2)+"%";}
function mapRankToImage(rank){
  const r = String(rank||'').toUpperCase();
  const known = ['SS','S','A','B','C','D','F'];
  const key = known.includes(r)? r : 'D';
  return `assets/rank-${key}.png`;
}

async function resolveStarsFromStore(mapId, diffName){
  try{
    if(!mapId || !window.osuMapStore) return null;
    const m = await window.osuMapStore.getMap(mapId);
    const list = m?.difficulties || m?.beatmaps || [];
    const dn = (diffName||'').trim().toLowerCase();
    const found = list.find(d => (d.version||d.diffName||d.name||'').trim().toLowerCase() === dn);
    const stars = found?.stars ?? found?.sr ?? found?.difficulty_rating;
    return (typeof stars === 'number') ? stars : null;
  }catch(_){return null;}
}

export async function showResultsOverlay(summary, opts={}){
  ensureResultsStyle();
  const onRetry = opts.onRetry || null;
  const onQuit = opts.onQuit || null;

  
  try{
    const hud = window.playback?.scoreOverlay?._root;
    if(hud){ 
      hud.style.transition = 'opacity .6s ease'; 
      hud.style.opacity = '0'; 
      hud.style.pointerEvents='none'; 
    }
  }catch(_){}

  
  try{
    const bgUrl = document.body?.dataset?.bgUrl;
    if(bgUrl){
      document.body.style.transition = 'background-image .6s ease';
      
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url('${bgUrl}')`;
    }
  }catch(_){}

  
  const root = document.createElement('div');
  root.className = 'results-overlay-root';
  root.id = 'results-overlay';
  const host = document.getElementById('game-area') || document.body;
  host.appendChild(root);

  const card = document.createElement('div');
  card.className = 'results-card';
  root.appendChild(card);

  
  const hdr = document.createElement('div');
  hdr.className = 'hdr';
  const avatar = document.createElement('img');
  const playerName = window.game?.playerName || 'osuplayer1';
  avatar.src = window.game?.profileImage || 'assets/pfp.png';
  avatar.alt = playerName;
  const name = document.createElement('div');
  name.className = 'name'; name.textContent = playerName;
  hdr.appendChild(avatar); hdr.appendChild(name);
  card.appendChild(hdr);

  
  const meta = document.createElement('div'); meta.className = 'meta';
  const title = document.createElement('div'); title.className = 'title'; title.textContent = summary?.title || 'Unknown';
  const artist = document.createElement('div'); artist.className = 'artist'; artist.textContent = summary?.artist || '';
  meta.appendChild(title); meta.appendChild(artist); card.appendChild(meta);

  
  const rankWrap = document.createElement('div'); rankWrap.className = 'rank-wrap';
  const rankImg = document.createElement('img'); rankImg.className = 'rank-img'; rankImg.src = mapRankToImage(summary?.rank); rankImg.alt = summary?.rank||'';
  rankWrap.appendChild(rankImg); card.appendChild(rankWrap);

  
  const score = document.createElement('div'); score.className = 'score'; score.textContent = formatScore(summary?.score||0);
  card.appendChild(score);

  
  const chips = document.createElement('div'); chips.className = 'chips';
  const starChip = document.createElement('div'); starChip.className = 'chip';
  const starIcon = document.createElement('span'); starIcon.className = 'star'; starIcon.textContent = '?';
  const starVal = document.createElement('span'); starVal.className = 'val'; starVal.textContent = '';
  starChip.appendChild(starIcon); starChip.appendChild(starVal); chips.appendChild(starChip);
  card.appendChild(chips);
  const diff = document.createElement('div'); diff.className = 'diff'; diff.textContent = summary?.diffName || '';
  card.appendChild(diff);

  
  const stats = document.createElement('div'); stats.className = 'stats';
  const sAcc = document.createElement('div'); sAcc.className = 'stat'; sAcc.innerHTML = `<div class="label">ACCURACY</div><div class="value">${formatAcc(summary?.accuracy||0)}</div>`;
  const sCombo = document.createElement('div'); sCombo.className = 'stat'; sCombo.innerHTML = `<div class="label">MAX COMBO</div><div class="value">${formatScore(summary?.combo||0)}x</div>`;
  stats.appendChild(sAcc); stats.appendChild(sCombo); card.appendChild(stats);

  
  const judges = document.createElement('div'); judges.className = 'judges';
  const c = summary?.counts || {great:0,good:0,meh:0,miss:0};
  const jGreat = document.createElement('div'); jGreat.className = 'judge jg-great'; jGreat.textContent = `GREAT ${formatScore(c.great||0)}`;
  const jOk = document.createElement('div'); jOk.className = 'judge jg-ok'; jOk.textContent = `GOOD ${formatScore(c.good||0)}`;
  const jMeh = document.createElement('div'); jMeh.className = 'judge jg-meh'; jMeh.textContent = `MEH ${formatScore(c.meh||0)}`;
  const jMiss = document.createElement('div'); jMiss.className = 'judge jg-miss'; jMiss.textContent = `MISS ${formatScore(c.miss||0)}`;
  [jGreat,jOk,jMeh,jMiss].forEach(x=>judges.appendChild(x));
  card.appendChild(judges);

  
  const actions = document.createElement('div'); actions.className = 'results-actions';
  const btnRetry = document.createElement('button'); btnRetry.className = 'btn primary'; btnRetry.textContent = 'Retry';
  const btnQuit = document.createElement('button'); btnQuit.className = 'btn'; btnQuit.textContent = 'Quit';
  actions.append(btnRetry, btnQuit); card.appendChild(actions);

  btnRetry.onclick = () => { if(onRetry) onRetry(); };
  btnQuit.onclick = () => { if(onQuit) onQuit(); };

  
  const stars = await resolveStarsFromStore(summary?.mapId, summary?.diffName);
  if (stars != null) starVal.textContent = stars.toFixed(2);
  else starVal.textContent = (typeof summary?.stars === 'number' ? summary.stars.toFixed(2) : '') || '';

  return root;
}

export default { showResultsOverlay };



