import { showResultsOverlay } from "../UI/resultsPage.js";

export default (function () {
  

  
  
  function grade(acc) {
    if (acc >= 1) return 'SS';
    if (acc >= 0.95) return 'S';
    if (acc >= 0.9) return 'A';
    if (acc >= 0.8) return 'B';
    if (acc >= 0.7) return 'C';
    return 'D';
  }

  class LazyNumber {
    constructor(value = 0) {
      this.value = value;
      this.target = value;
      this.lasttime = -1000000;
    }
    static get lag() { return 200; }
    update(time) {
      this.value += (this.target - this.value) * (1 - Math.exp((this.lasttime - time) / LazyNumber.lag));
      this.lasttime = time;
    }
    set(time, value) {
      this.update(time);
      this.target = value;
    }
    valueAt(time) {
      this.update(time);
      return this.value;
    }
  }

  
  class ScoreOverlay {
    
    constructor(windowfield, HPdrain, scoreMultiplier, totalDurationMs) {
      this.field = windowfield || { width: innerWidth, height: innerHeight };
      this.HPdrain = HPdrain;
  this.scoreMultiplier = scoreMultiplier;
  this.scaleMul = this.field.height / 800;
  this.totalDurationMs = (typeof totalDurationMs === 'number' && totalDurationMs > 0) ? totalDurationMs : null;

      
      this.score = 0;
      this.combo = 0;
      this.maxcombo = 0;
      this.judgeTotal = 0;
      this.maxJudgeTotal = 0;
      this.HP = 1;
      this.fullcombo = true;
      this.onfail = null;
      this.judgecnt = { great: 0, good: 0, meh: 0, miss: 0 };
      this.sliderTicks = { hit:0,total:0 };

      this.score4display = new LazyNumber(this.score);
      this.combo4display = new LazyNumber(this.combo);
      this.accuracy4display = new LazyNumber(1);
      this.HP4display = new LazyNumber(this.HP);

      
      this._root = document.createElement('div');
      this._root.className = 'score-overlay-root';

      
      this._hp = document.createElement('div');
      this._hp.className = 'hpbar';
      this._hpFill = document.createElement('div');
      this._hpFill.className = 'hpbar-fill';
      this._hp.appendChild(this._hpFill);
      this._root.appendChild(this._hp);

  
  this._topRight = document.createElement('div');
  this._topRight.className = 'score-top-right';
  this._bottomLeft = document.createElement('div');
  this._bottomLeft.className = 'score-bottom-left';

  
      this._accChip = document.createElement('div');
      this._accChip.className = 'score-chip acc';
      this._accLabel = document.createElement('span');
      this._accLabel.className = 'label';
      this._accLabel.textContent = 'ACC';
      this._accVal = document.createElement('span');
      this._accVal.className = 'value';
      this._accVal.textContent = '100.00%';
      this._accChip.appendChild(this._accLabel);
      this._accChip.appendChild(this._accVal);

  
      this._scoreChip = document.createElement('div');
      this._scoreChip.className = 'score-chip score';
      this._scoreLabel = document.createElement('span');
      this._scoreLabel.className = 'label';
      this._scoreLabel.textContent = 'SCORE';
      this._scoreVal = document.createElement('span');
      this._scoreVal.className = 'value';
      this._scoreVal.textContent = '000000';
      this._scoreChip.appendChild(this._scoreLabel);
      this._scoreChip.appendChild(this._scoreVal);

    
      this._comboChip = document.createElement('div');
      this._comboChip.className = 'score-chip combo';
      this._comboLabel = document.createElement('span');
      this._comboLabel.className = 'label';
      this._comboLabel.textContent = 'COMBO';
      this._comboVal = document.createElement('span');
      this._comboVal.className = 'value';
      this._comboVal.textContent = '0x';
      this._comboChip.appendChild(this._comboLabel);
      this._comboChip.appendChild(this._comboVal);
    
    this._progressCircle = document.createElement('div');
    this._progressCircle.className = 'progress-circle';

    
    this._midRow = document.createElement('div');
    this._midRow.className = 'score-mid-row';
    this._midRow.appendChild(this._progressCircle);
    this._midRow.appendChild(this._accChip);

    
    this._topRight.appendChild(this._scoreChip);
    this._topRight.appendChild(this._midRow);
  
  this._bottomLeft.appendChild(this._comboChip);
  this._root.appendChild(this._topRight);
  this._root.appendChild(this._bottomLeft);

      
      this.resize(this.field);
    }

    
    mount(parent) {
      const host = parent || document.getElementById('game-area') || document.body;
      const cs = getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      host.appendChild(this._root);
    }

    
    resize(windowfield) {
      this.field = windowfield || { width: innerWidth, height: innerHeight };
      this.scaleMul = this.field.height / 800;

  

      
      
      this._hp.style.width = this.field.width + 'px';
    }

    HPincreasefor(result) {
      switch (result) {
        case 0:   return -0.02 * this.HPdrain;
        case 50:  return  0.01 * (4   - this.HPdrain);
        case 100: return  0.01 * (8   - this.HPdrain);
        case 300: return  0.01 * (10.2- this.HPdrain);
        default:  return 0;
      }
    }

    hit(result, maxresult, time) {
      if(maxresult===10){this.sliderTicks.total++;if(result>0)this.sliderTicks.hit++;}
      if (maxresult === 300) {
        if (result === 300) this.judgecnt.great++;
        if (result === 100) this.judgecnt.good++;
        if (result === 50)  this.judgecnt.meh++;
        if (result === 0)   this.judgecnt.miss++;
      }
      this.judgeTotal += result;
      this.maxJudgeTotal += maxresult;

      this.score += this.scoreMultiplier * result * (1 + this.combo / 25);

      const oldCombo = this.combo;
      this.combo = (result > 0) ? this.combo + 1 : 0;

      if (result === 0) {
        this.fullcombo = false;
        if (oldCombo > 20 && window.game?.sampleComboBreak) {
          window.game.sampleComboBreak.volume = window.game.effectVolume ?? 1;
          window.game.sampleComboBreak.play();
        }
      }
      this.maxcombo = Math.max(this.maxcombo, this.combo);
      if (this.HP >= 0) this.HP += maxresult === 10 ? this.HPincreasefor(result ? 300 : 0) * .1 : this.HPincreasefor(result);
      this.HP = Math.min(1, this.HP);

      this.score4display.set(time, this.score);
      this.combo4display.set(time, this.combo);
      this.accuracy4display.set(time, this.maxJudgeTotal ? (this.judgeTotal / this.maxJudgeTotal) : 1);
      this.HP4display.set(time, Math.max(0, this.HP));
    }

    
    newSpriteArray() { return []; }
    setSpriteArrayText() {}
    setSpriteArrayPos() {}

    update(time) {
      if (Number.isNaN(time)) return;

      
      const scoreDisp = Math.round(this.score4display.valueAt(time)).toString().padStart(6, '0');
      const comboDisp = Math.round(this.combo4display.valueAt(time)).toString() + 'x';
      const accDisp   = (this.accuracy4display.valueAt(time) * 100).toFixed(2) + '%';

      this._scoreVal.textContent = scoreDisp;
      this._comboVal.textContent = comboDisp;
      this._accVal.textContent   = accDisp;

      
      const hpRatio = Math.max(0, Math.min(1, this.HP4display.valueAt(time)));
      this._hpFill.style.width = (hpRatio * 100).toFixed(2) + '%';

      
      if (this.totalDurationMs && this._progressCircle) {
        const progress = Math.max(0, Math.min(1, time / this.totalDurationMs));
        const deg = (progress * 360).toFixed(1);
        this._progressCircle.style.background = `conic-gradient(#ffffff ${deg}deg, rgba(255,255,255,0.15) 0deg)`;
      }
    }

  async showSummary(metadata, hiterrors, retryCallback, quitCallback) {
      function errortext(a) {
        if (!a || !a.length) return '';
        let sum = 0; for (let i = 0; i < a.length; ++i) sum += a[i];
        let avg = sum / a.length;
        let sumsqerr = 0; for (let i = 0; i < a.length; ++i) sumsqerr += (a[i] - avg) ** 2;
        let stdev = Math.sqrt(sumsqerr / a.length);
        let sgnavg = avg.toFixed(0);
        if (sgnavg[0] !== '-') sgnavg = '+' + sgnavg;
        return sgnavg + " +/- " + stdev.toFixed(0) + "ms";
      }
      let acc = this.maxJudgeTotal ? (this.judgeTotal / this.maxJudgeTotal) : 1;
      let rank = this.HP < 0 ? "F" : grade(acc);

      const sessionInfo = window.currentGameSession || JSON.parse(sessionStorage.getItem('osu:lastSession') || '{}');

      const diffVersion = sessionInfo.diffName || (metadata && metadata.Version) || '';

      const summary = {
        resultId: crypto.randomUUID(),
        mapId: sessionInfo.mapId || null,
        diffName: diffVersion ? String(diffVersion).trim() : '',
  diffBid: sessionInfo.diffBid ? String(sessionInfo.diffBid) : null,
        title: (metadata && metadata.Title) || sessionInfo.title || 'Unknown',
        artist: (metadata && metadata.Artist) || sessionInfo.artist || '',
        mapper: (metadata && metadata.Creator) || sessionInfo.creator || '',
        score: Math.round(this.score),
        accuracy: parseFloat((acc * 100).toFixed(2)),
        rank,
        combo: this.maxcombo,
        fullCombo: Boolean(this.fullcombo),
        counts: {
          great: this.judgecnt.great,
          good: this.judgecnt.good,
          meh: this.judgecnt.meh,
          miss: this.judgecnt.miss
        },
        errorText: errortext(hiterrors),
        hitErrors: hiterrors || [],
        sliderTicks: {...this.sliderTicks},
        mods: "",
        timestamp: Date.now()
      };

  try { sessionStorage.setItem('osu:lastResult', JSON.stringify(summary)); }
  catch (_) {}

      
      try {
        const session = JSON.parse(sessionStorage.getItem('osu:lastSession') || '{}');
        const mapId = session.mapId || summary.mapId;
        if (mapId && window.osuMapStore && typeof window.osuMapStore.getMap === 'function') {
          await (async () => {
            try {
              const map = await window.osuMapStore.getMap(mapId);
              if (map) {
                map.leaderboard = map.leaderboard || [];
                const entry = {
                  resultId: summary.resultId,
                  timestamp: summary.timestamp,
                  player: 'osuPlayer1',
                  pfp: 'assets/pfp.png',
                  combo: summary.combo || 0,
                  accuracy: summary.accuracy || 0,
                  score: summary.score || 0,
                  rank: summary.rank || '',
                  counts: {...summary.counts},
                  sliderTicks: {...summary.sliderTicks},
                  fullCombo: summary.fullCombo,
                  errorText: summary.errorText,
                  diffName: String(summary.diffName || session.diffName || '').trim(),
                  diffBid: (summary.diffBid || session.diffBid || null) ? String(summary.diffBid || session.diffBid) : null
                };
                map.leaderboard.push(entry);
                map.leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));
                if (map.leaderboard.length > 50) map.leaderboard.length = 50;

                if (typeof window.osuMapStore.saveMap === 'function') {
                  await window.osuMapStore.saveMap(map);
                }
              }
            } catch (e) {
              
            }
          })();
        }
      } catch (e) {
        
      }
      
      
      await showResultsOverlay(summary, { onRetry: retryCallback, onQuit: quitCallback });
    }

    destroy() {
      if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
      this._root = null;
      this._hp = this._hpFill = null;
      this._topRight = null;
      this._bottomLeft = null;
      this._accChip = this._accLabel = this._accVal = null;
      this._scoreChip = this._scoreLabel = this._scoreVal = null;
      this._comboChip = this._comboLabel = this._comboVal = null;
    }
  }

  return ScoreOverlay;
})();

