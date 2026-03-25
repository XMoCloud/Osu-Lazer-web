export default (function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  
  const CFG = {
    borderColor: "#ffffff",   
    bodyColor: "rgba(0,0,0,0.35)", 
    borderWidthFrac: 0.128,   
  };

  function pathFromPoints(points) {
    if (!points || !points.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
    return d;
  }

  class SliderMesh {
    
    constructor(curve, radius, _tintId, svgRoot) {
      this.curve = curve;
      this.radius = radius;
      this._alpha = 0;

      
      this.g = document.createElementNS(SVG_NS, "g");
      this.g.setAttribute("opacity", "0");
      if (svgRoot) svgRoot.appendChild(this.g);

      const d = pathFromPoints(curve.curve);

      
      this.border = document.createElementNS(SVG_NS, "path");
      this.border.setAttribute("d", d);
      this.border.setAttribute("fill", "none");
      this.border.setAttribute("stroke", CFG.borderColor);
      this.border.setAttribute("stroke-linecap", "round");
      this.border.setAttribute("stroke-linejoin", "round");
      this.border.setAttribute("stroke-width", String(2 * radius)); 
      this.g.appendChild(this.border);

      
      this.inner = document.createElementNS(SVG_NS, "path");
      this.inner.setAttribute("d", d);
      this.inner.setAttribute("fill", "none");
      this.inner.setAttribute("stroke", CFG.bodyColor);
      this.inner.setAttribute("stroke-linecap", "round");
      this.inner.setAttribute("stroke-linejoin", "round");
      const innerPortion = 1 - CFG.borderWidthFrac;
      this.inner.setAttribute("stroke-width", String(2 * radius * innerPortion));
      this.inner.setAttribute("opacity", "1");
      this.g.appendChild(this.inner);
    }

    set alpha(a) {
      this._alpha = a;
      if (this.g) this.g.setAttribute("opacity", String(a));
    }
    get alpha() { return this._alpha; }

    destroy() {
      try { this.g?.parentNode?.removeChild(this.g); } catch(e) {}
      this.g = this.border = this.inner = null;
    }
  }

  return SliderMesh;
})();

