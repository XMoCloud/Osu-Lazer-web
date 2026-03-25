export default (function () {
  

  return class LoadingMenu {
    constructor(windowfield, track) {
      this.fadetime = 200;
      this.alpha = 1;
      this.hidden = false;
      this.visible = true;
      this.t0 = 0;

      
      this._root = document.createElement('div');
      this._root.className = 'loading-menu-root';

      
      this.bg = document.createElement('img');
      this.bg.className = 'loading-menu-bg';
      this.bg.src = 'assets/hpbarright.png';
      this._bgScaleX = 0.6;
      this._bgScaleY = 500;
      this.bg.style.transform = `translate(-50%, -50%) rotate(90deg) scale(${this._bgScaleX}, ${this._bgScaleY})`;
      this._root.appendChild(this.bg);

      const meta = (track && track.metadata) || {};
      this.titletext  = this._makeText('loading-menu-text loading-menu-title', meta.Title || '-');
      this.artisttext = this._makeText('loading-menu-text loading-menu-sub',   meta.Artist || '-');
      this.versiontext= this._makeText('loading-menu-text loading-menu-sub',   meta.Version || '-');
      this.mappertext = this._makeText('loading-menu-text loading-menu-sub',   `Mapper: ${meta.Creator || '-'}`);

  
  this.loading = document.createElement('div');
  this.loading.className = 'loading-menu-dot';
  this._root.appendChild(this.loading);

      this.resize(windowfield || { width: window.innerWidth, height: window.innerHeight });
    }

    
    mount(parent) {
      const host = parent || document.getElementById('game-area') || document.body;
      
      const cs = getComputedStyle(host);
      if (cs.position === 'static') host.style.position = 'relative';
      host.appendChild(this._root);
    }

    _makeText(cls, txt) {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = txt;
      this._root.appendChild(el);
      return el;
    }

    resize(windowfield) {
      const w = windowfield.width, h = windowfield.height;

      
      this.bg.style.left = (w/2) + 'px';
      this.bg.style.top  = (h/2) + 'px';
      this.bg.style.transform = `translate(-50%, -50%) rotate(90deg) scale(${this._bgScaleX}, ${this._bgScaleY})`;

      const centerX = (w/2) + 'px';
      this.titletext.style.left   = centerX;
      this.titletext.style.top    = (h/2 - 90) + 'px';

      this.artisttext.style.left  = centerX;
      this.artisttext.style.top   = (h/2 - 60) + 'px';

      this.versiontext.style.left = centerX;
      this.versiontext.style.top  = (h/2 + 60) + 'px';

      this.mappertext.style.left  = centerX;
      this.mappertext.style.top   = (h/2 + 110) + 'px';

      this.loading.style.left = centerX;
      this.loading.style.top  = (h/2) + 'px';
    }

    hide() { this.hidden = true; }

    update(timestamp) {
      if (!this.visible) return;

      if (!this.hidden) {
        this._root.style.opacity = '1';
        return;
      }

      if (!this.t0) this.t0 = timestamp;
      const dt = timestamp - this.t0;
      if (dt > this.fadetime) {
        this.alpha = 0;
        this.visible = false;
        this._root.style.opacity = '0';
        this._root.style.display = 'none';
      } else {
        this.alpha = 1 - dt / this.fadetime;
        this._root.style.opacity = String(this.alpha);
      }
    }

    destroy() {
      if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
      this._root = null;
      this.bg = this.loading = this.titletext = this.artisttext =
        this.versiontext = this.mappertext = null;
    }
  };
})();

