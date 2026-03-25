export default (function () {
  

  class BreakOverlay {
    constructor() {
      this.fadetime = 200;
      this.appearthreshold = 1500;
      this.visible = false;
      this.alpha = 0;

      
      this._root = document.createElement('div');
      this._root.className = 'break-overlay-root';

      
      this._center = document.createElement('div');
      this._center.className = 'break-overlay-center';
      this._num = document.createElement('div');
      this._num.className = 'break-number';
      this._num.textContent = '';
      this._center.appendChild(this._num);
      this._root.appendChild(this._center);

      
      this._line = document.createElement('div');
      this._line.className = 'break-line';
      this._lineFill = document.createElement('div');
      this._lineFill.className = 'break-line-fill';
      this._line.appendChild(this._lineFill);
      this._root.appendChild(this._line);

      this.starttime = 0;
      this.nextapproachtime = 0;
      this._baseWidth = 400;
    }

    
    mount(host) {
      const parent = host || document.getElementById('game-area') || document.body;
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      parent.appendChild(this._root);
    }

    
    setBounds(x, y, w, h) {
      Object.assign(this._root.style, {
        left: `${Math.round(x)}px`,
        top: `${Math.round(y)}px`,
        width: `${Math.round(w)}px`,
        height: `${Math.round(h)}px`
      });
      
      this._baseWidth = Math.min(600, Math.max(360, w * 0.6));
      this._line.style.width = this._baseWidth + 'px';
    }

    
    resize(windowfield) {
      if (!windowfield) return;
      const w = windowfield.width || 0, h = windowfield.height || 0;
      
      const rect = this._root.getBoundingClientRect();
      this.setBounds(rect.left, rect.top, w, h);
    }

    countdown(nextapproachtime, time) {
      if ((nextapproachtime - time) > this.appearthreshold && !this.visible) {
        this.visible = true;
        this._root.style.display = 'block';
        this.starttime = time;
        this.nextapproachtime = nextapproachtime;
      }
      if (!this.visible) return;

      if (time >= this.nextapproachtime) {
        this.visible = false;
        this._root.style.opacity = '0';
        this._root.style.display = 'none';
        return;
      }

      const t = this.nextapproachtime - time;
      const total = this.nextapproachtime - this.starttime;
      const ratio = Math.max(0, Math.min(1, t / Math.max(1,total)));

      this._num.textContent = Math.ceil(t / 1000).toString();
      this._lineFill.style.width = Math.max(0, this._baseWidth * ratio) + 'px';

      const a = Math.max(0, Math.min(1, Math.min(t, time - this.starttime - 500) / this.fadetime));
      this.alpha = a;
      this._root.style.opacity = String(this.alpha);
    }

    destroy() {
      this._root?.parentNode?.removeChild(this._root);
      this._root = this._center = this._num = null;
      this._line = this._lineFill = null;
    }
  }

  return BreakOverlay;
})();

