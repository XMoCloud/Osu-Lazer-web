export default (function() {
    
    function CurveType() {
        
        this.curve = [];
        
        this.curveDistance = [];
        
        this.ncurve = 0;
        
        this.totalDistance = 0;
    }
    CurveType.prototype.init = function init(approxLength) {
        
        this.ncurve = Math.floor(approxLength/5) + 2;
        for (var i = 0; i < this.ncurve; i++) {
            this.curve.push(this.pointAt(i / (this.ncurve - 1)));
        }
        
        for (var j = 0; j < this.ncurve; j++) {
            if (j === 0) {
                this.curveDistance.push(0);
            } else {
                var dx = this.curve[j].x - this.curve[j-1].x;
                var dy = this.curve[j].y - this.curve[j-1].y;
                this.curveDistance.push(Math.hypot(dx, dy));
                this.totalDistance += this.curveDistance[j];
            }
        }
    };

    
    function Bezier2(points) {
        CurveType.call(this);

        this.points = points;

        var approxLength = 0;
        for (var i = 0; i < points.length - 1; i++) {
            var x = points[i].x - points[i + 1].x;
            var y = points[i].y - points[i + 1].y;
            approxLength += Math.sqrt(x * x + y * y);
        }
        this.init(approxLength);
    }
    
    Bezier2.prototype = Object.create(CurveType.prototype);
    Bezier2.prototype.constructor = Bezier2;
    
    Bezier2.prototype.pointAt = function(t) {
        var c = { x: 0, y: 0 };
        var n = this.points.length - 1;
        for (var i = 0; i <= n; i++) {
            var b = Bezier2.bernstein(i, n, t);
            c.x += this.points[i].x * b;
            c.y += this.points[i].y * b;
        }
        return c;
    }
    
    Bezier2.bernstein = function bernstein(i, n, t) {
        return Bezier2.binomialCoefficient(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
    }
    Bezier2.binomialCoefficient = function binomialCoefficient(n, k) {
        if (k < 0 || k > n) {
            return 0;
        }
        if (k == 0 || k == n) {
            return 1;
        }
        k = Math.min(k, n - k);
        var c = 1;
        for (var i = 0; i < k; i++) {
            c = c * (n - i) / (i + 1);
        }
        return c;
    }

    
    const CURVE_POINTS_SEPERATION = 3;
    function lerp(a, b, t) { return a * (1 - t) + b * t; }

    class EqualDistanceMultiCurve {
        constructor(hit) {
            this.hitObject = hit;
            this.ncurve = 0;
            this.startAngle = 0;
            this.endAngle = 0;
            this.curve = [];
        }
        init(curves) {
            this.ncurve = Math.floor(this.hitObject.pixelLength / CURVE_POINTS_SEPERATION) + 1;
            this.curve = [];

            let distanceAt = 0; 
            let curPoint = 0;
            let curCurveIndex = 0;
            let curCurve = curves[0]; 
            let lastCurve = curCurve.curve[0];
            let lastDistanceAt = 0;

            const pixelLength = this.hitObject.pixelLength; 
            if (pixelLength < 0) console.error("osu curve: negative slider length");
            for (let i = 0; i <= this.ncurve; i++) {
                const prefDistance = i * pixelLength / this.ncurve; 
                while (distanceAt < prefDistance) {
                    lastDistanceAt = distanceAt;
                    lastCurve = curCurve.curve[curPoint];
                    curPoint++;

                    if (curPoint >= curCurve.ncurve) {
                        if (curCurveIndex < curves.length - 1) {
                            curCurveIndex++;
                            curCurve = curves[curCurveIndex];
                            curPoint = 0;
                        } else {
                            curPoint = curCurve.ncurve - 1;
                            if (lastDistanceAt === distanceAt) {
                                
                                
                                
                                break;
                            }
                        }
                    }
                    distanceAt += curCurve.curveDistance[curPoint];
                }
                const thisCurve = curCurve.curve[curPoint];

                
                if (lastCurve === thisCurve) {
                    this.curve[i] = thisCurve;
                } else {
                    const EPSILON = 0.001;
                    if (Math.abs(distanceAt - lastDistanceAt) < EPSILON) {
                        
                        this.curve[i] = {
                            x: (lastCurve.x + thisCurve.x) / 2,
                            y: (lastCurve.y + thisCurve.y) / 2,
                            t: i / this.ncurve
                        };
                    } else {
                        const tt = (prefDistance - lastDistanceAt) / (distanceAt - lastDistanceAt);
                        this.curve[i] = {
                            x: lerp(lastCurve.x, thisCurve.x, tt),
                            y: lerp(lastCurve.y, thisCurve.y, tt)
                        };
                        this.curve[i].t = i / this.ncurve;
                    }
                }
            }
        }
        pointAt(t) {
            const indexF = t * this.ncurve;
            const index = Math.floor(indexF);
            if (index >= this.ncurve) { 
                return this.curve[this.ncurve];
            } else {
                
                const poi = this.curve[index];
                const poi2 = this.curve[index + 1];
                const tt = indexF - index;
                return {
                    x: lerp(poi.x, poi2.x, tt),
                    y: lerp(poi.y, poi2.y, tt)
                };
            }
        }
    }

    class LinearBeizer extends EqualDistanceMultiCurve {
        constructor(hit, line) {
            super(hit); 

            let beziers = [];
            let points = [];
            let lastPoi = null;
            
            for (let i = -1; i < hit.keyframes.length; i++) {
                let tpoi = (i !== -1) ? hit.keyframes[i] : { x: hit.x, y: hit.y };
                if (line) {
                    if (lastPoi !== null) {
                        points.push(tpoi);
                        beziers.push(new Bezier2(points));
                        points = [];
                    }
                } else if (lastPoi !== null && tpoi.x === lastPoi.x && tpoi.y === lastPoi.y) {
                    if (points.length >= 2) {
                        beziers.push(new Bezier2(points));
                    }
                    points = [];
                }
                points.push(tpoi);
                lastPoi = tpoi;
            }
            if (!line && points.length >= 2) {
                beziers.push(new Bezier2(points));
                points = [];
            }
            
            this.init(beziers);
        }
    }
    return LinearBeizer;
})();

