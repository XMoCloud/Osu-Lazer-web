export default (function() {
    
    const CURVE_POINTS_SEPERATION = 3; 
    
    function CircumscribedCircle(hit) {

        var start = { x: hit.x, y: hit.y };
        var mid = { x: hit.keyframes[0].x, y: hit.keyframes[0].y };
        var end = { x: hit.keyframes[1].x, y: hit.keyframes[1].y };

        
        var mida = vecmid(start, mid);
        var midb = vecmid(end, mid);
        var nora = nor(vecsub(mid, start));
        var norb = nor(vecsub(mid, end));
        var circleCenter = intersect(mida, nora, midb, norb);
        if (!circleCenter) return [];

        
        var startAngPoint = vecsub(start, circleCenter);
        var midAngPoint   = vecsub(mid, circleCenter);
        var endAngPoint   = vecsub(end, circleCenter);

        var startAng = Math.atan2(startAngPoint.y, startAngPoint.x);
        var midAng   = Math.atan2(midAngPoint.y, midAngPoint.x);
        var endAng   = Math.atan2(endAngPoint.y, endAngPoint.x);

        const TWO_PI = Math.PI * 2;
        const HALF_PI = Math.PI / 2;

        
        if (!isIn(startAng, midAng, endAng)) {
            if (Math.abs(startAng + TWO_PI - endAng) < TWO_PI && isIn(startAng + (TWO_PI), midAng, endAng))
                startAng += TWO_PI;
            else if (Math.abs(startAng - (endAng + TWO_PI)) < TWO_PI && isIn(startAng, midAng, endAng + (TWO_PI)))
                endAng += TWO_PI;
            else if (Math.abs(startAng - TWO_PI - endAng) < TWO_PI && isIn(startAng - (TWO_PI), midAng, endAng))
                startAng -= TWO_PI;
            else if (Math.abs(startAng - (endAng - TWO_PI)) < TWO_PI && isIn(startAng, midAng, endAng - (TWO_PI)))
                endAng -= TWO_PI;
            else
                throw "Cannot find angles between midAng.";
        }

        
        var radius = veclen(startAngPoint);
        var arcAng = Math.abs(startAng - endAng);
        let expectAng = hit.pixelLength / radius;
        if (arcAng > expectAng * 0.97) {
            arcAng = expectAng; 
        }

        
        endAng = (endAng > startAng) ? startAng + arcAng : startAng - arcAng;

        
    var step = Math.floor(hit.pixelLength / CURVE_POINTS_SEPERATION);
        var curve = new Array(step + 1);

    const pointAt = function(t) {
            if (t > 1) t = 1;
            var ang = lerp(startAng, endAng, t);
            return {
                x: Math.cos(ang) * radius + circleCenter.x,
                y: Math.sin(ang) * radius + circleCenter.y,
                t: t,
            };
        };
        for (var i = 0; i < curve.length; i++) {
            curve[i] = pointAt(i / step);
        }

        
        var l = 0;
        for (let i=1; i<curve.length; ++i) {
            let dx = curve[i].x - curve[i-1].x;
            let dy = curve[i].y - curve[i-1].y;
            l += Math.hypot(dx, dy);
        }
        return {curve: curve, pointAt: pointAt, totalDistance: l};
    }
    return CircumscribedCircle;

    function lerp(a, b, t) {
        return a * (1 - t) + b * t;
    }

    function veclen(a) {
        return Math.sqrt(a.x * a.x + a.y * a.y);
    }

    function nor(a) {
        return { x: -a.y, y: a.x };
    }

    function vecsub(a, b)
    {
        return { x: a.x-b.x, y: a.y-b.y };
    }

    function vecmid(a, b)
    {
        return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
    }

    function isIn(a, b, c) {
        return (b > a && b < c) || (b < a && b > c);
    }

    function intersect(a, ta, b, tb) {
        var des = tb.x * ta.y - tb.y * ta.x;
        if (Math.abs(des) < 0.00001) {
            return undefined;
        }
        var u = ((b.y - a.y) * ta.x + (a.x - b.x) * ta.y) / des;
        return { x: b.x + tb.x * u, y: b.y + tb.y * u };
    }
})();

