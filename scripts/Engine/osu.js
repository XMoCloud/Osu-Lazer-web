import AudioEngine from "./AudioEngine.js";
import LinearBezier from "../curves/LinearBezier.js";
import CircumscribedCircle from "../curves/CircumscribedCircle.js";

export default (function() {
    const HIT_TYPE_CIRCLE = 1;
    const HIT_TYPE_SLIDER = 2;
    const HIT_TYPE_NEWCOMBO = 4;
    const HIT_TYPE_SPINNER = 8;

    function parseKeyValue(line) {
        const colonIdx = line.indexOf(":");
        const key = line.substring(0, colonIdx);
        const value = line.substring(colonIdx + 1).trim();
        return { key, value: isNaN(value) ? value : +value };
    }

    function parseHitSample(parts, startIndex) {
        const hitSample = (parts.length > startIndex ? parts[startIndex] : '0:0:0:0:').split(":");
        return {
            normalSet: +hitSample[0],
            additionSet: +hitSample[1],
            index: +hitSample[2],
            volume: +hitSample[3],
            filename: hitSample[4]
        };
    }

    function Track(zip, track) {
        this.track = track;
        this.zip = zip;
        this.ondecoded = null;
        this.general = {};
        this.metadata = {};
        this.difficulty = {};
        this.events = [];
        this.timingPoints = [];
        this.hitObjects = [];

        this.decode = (() => {
            const lines = this.track.replace(/\r/g, "").split("\n");
            let section = null;
            let combo = 0, index = 0;
            let forceNewCombo = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith("//")) continue;
                
                if (line.startsWith("[")) {
                    section = line;
                    continue;
                }

                switch (section) {
                    case "[General]": {
                        const { key, value } = parseKeyValue(line);
                        this.general[key] = value;
                        break;
                    }
                    case "[Metadata]": {
                        const { key, value } = parseKeyValue(line);
                        this.metadata[key] = value;
                        break;
                    }
                    case "[Events]":
                        this.events.push(line.split(","));
                        break;
                    case "[Difficulty]": {
                        const { key, value } = parseKeyValue(line);
                        this.difficulty[key] = value;
                        break;
                    }
                    case "[TimingPoints]": {
                        const parts = line.split(",");
                        const t = {
                            offset: +parts[0],
                            millisecondsPerBeat: +parts[1],
                            meter: +parts[2],
                            sampleSet: +parts[3],
                            sampleIndex: +parts[4],
                            volume: +parts[5],
                            uninherited: +parts[6],
                            kaiMode: +parts[7]
                        };
                        if (t.sampleSet > 3) t.sampleSet = 0;
                        if (t.millisecondsPerBeat < 0) t.uninherited = 0;
                        this.timingPoints.push(t);
                        break;
                    }
                    case "[HitObjects]": {
                        const parts = line.split(",");
                        const hit = {
                            x: +parts[0],
                            y: +parts[1],
                            time: +parts[2],
                            type: +parts[3],
                            hitSound: +parts[4]
                        };

                        if ((hit.type & HIT_TYPE_NEWCOMBO) > 0 || forceNewCombo) {
                            combo++;
                            combo += (hit.type >> 4) & 7;
                            index = 0;
                        }
                        forceNewCombo = false;
                        hit.combo = combo;
                        hit.index = index++;

                        if ((hit.type & HIT_TYPE_CIRCLE) > 0) {
                            hit.type = "circle";
                            hit.hitSample = parseHitSample(parts, 5);
                        } else if ((hit.type & HIT_TYPE_SLIDER) > 0) {
                            hit.type = "slider";
                            const sliderKeys = parts[5].split("|");
                            hit.sliderType = sliderKeys[0];
                            hit.keyframes = sliderKeys.slice(1).map(k => {
                                const [x, y] = k.split(":");
                                return { x: +x, y: +y };
                            });
                            hit.repeat = +parts[6];
                            hit.pixelLength = +parts[7];
                            hit.edgeHitsounds = parts.length > 8 
                                ? parts[8].split("|").map(Number)
                                : Array(hit.repeat + 1).fill(0);
                            
                            hit.edgeSets = Array(hit.repeat + 1).fill(null).map(() => ({ normalSet: 0, additionSet: 0 }));
                            if (parts.length > 9) {
                                parts[9].split("|").forEach((addition, i) => {
                                    const [normalSet, additionSet] = addition.split(":");
                                    hit.edgeSets[i].normalSet = +normalSet;
                                    hit.edgeSets[i].additionSet = +additionSet;
                                });
                            }
                            hit.hitSample = parseHitSample(parts, 10);
                        } else if ((hit.type & HIT_TYPE_SPINNER) > 0) {
                            if (hit.type & HIT_TYPE_NEWCOMBO) combo--;
                            hit.combo = combo - ((hit.type >> 4) & 7);
                            forceNewCombo = true;
                            hit.type = "spinner";
                            hit.endTime = Math.max(+parts[5], hit.time + 1);
                            hit.hitSample = parseHitSample(parts, 6);
                        } else {
                            console.log("Unknown hit object type " + hit.type + ": " + line);
                        }

                        if (hit.hitSample) {
                            if (hit.hitSample.normalSet > 3) hit.hitSample.normalSet = 0;
                            if (hit.hitSample.additionSet > 3) hit.hitSample.additionSet = 0;
                        }
                        this.hitObjects.push(hit);
                        break;
                    }
                }
            }

            this.general.PreviewTime = Math.min(this.general.PreviewTime / 10, this.hitObjects[0]?.time || 0);
            
            if (this.difficulty.OverallDifficulty) {
                this.difficulty.HPDrainRate = this.difficulty.HPDrainRate || this.difficulty.OverallDifficulty;
                this.difficulty.CircleSize = this.difficulty.CircleSize || this.difficulty.OverallDifficulty;
                this.difficulty.ApproachRate = this.difficulty.ApproachRate || this.difficulty.OverallDifficulty;
            } else {
                console.warn("[preproc] Overall Difficulty undefined");
            }

            let last = this.timingPoints[0];
            for (let i = 0; i < this.timingPoints.length; i++) {
                const point = this.timingPoints[i];
                if (point.uninherited === 0) {
                    point.uninherited = 1;
                    point.millisecondsPerBeat = Math.min(point.millisecondsPerBeat, -10);
                    point.millisecondsPerBeat = Math.max(point.millisecondsPerBeat, -1000);
                    point.millisecondsPerBeat *= -0.01 * last.millisecondsPerBeat;
                    point.trueMillisecondsPerBeat = last.trueMillisecondsPerBeat;
                } else {
                    last = point;
                    point.trueMillisecondsPerBeat = point.millisecondsPerBeat;
                }
            }

            preallocateTiming(this);

            for (let i = 0; i < this.hitObjects.length; i++) {
                const hit = this.hitObjects[i];
                if (hit.type === "circle") {
                    hit.endTime = hit.time;
                } else if (hit.type === "slider") {
                    hit.sliderTime = hit.timing.millisecondsPerBeat * (hit.pixelLength / this.difficulty.SliderMultiplier) / 100;
                    hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
                    hit.endTime = hit.time + hit.sliderTimeTotal;
                }
            }

            this.length = Math.round((this.hitObjects[this.hitObjects.length - 1].endTime) / 1000 + 1.5);

            calculateCurve(this);
            stackHitObjects(this);

            if (this.ondecoded) {
                this.ondecoded(this);
            }
        }).bind(this);
    }

    function Osu(zip) {
        this.zip = zip;
        this.song = null;
        this.ondecoded = null;
        this.onready = null;
        this.tracks = [];
        this.raw_tracks = null;

        let count = 0;
        this.track_decoded = () => {
            count++;
            if (count === this.raw_tracks.length && this.ondecoded) {
                this.ondecoded(this);
            }
        };

        this.load = () => {
            this.raw_tracks = this.zip.children.filter(c => c.name.endsWith(".osu"));

            if (!this.raw_tracks?.length) {
                this.onerror?.("No .osu files found!");
            } else {
                this.raw_tracks.forEach(t => {
                    t.getText(text => {
                        const track = new Track(this.zip, text);
                        this.tracks.push(track);
                        track.ondecoded = this.track_decoded;
                        track.decode();
                    });
                });
            }
        };

        this.getCoverSrc = function(img) {
            
            try { img.removeAttribute('src'); } catch { img.src = ''; }
        };

        

        this.load_mp3 = (track) => {
            track = track || this.tracks[0];
            const mp3_raw = this.zip.children.find(c => c.name.toLowerCase() === track.general.AudioFilename.toLowerCase());
            mp3_raw.getBlob("audio/mpeg", blob => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.audio = new AudioEngine(mp3_raw.name.toLowerCase(), e.target.result, () => {
                        if (this.onready) this.onready();
                    });
                };
                reader.readAsArrayBuffer(blob);
            });
        };
    }

    return Osu;

    function preallocateTiming(track) {
        let currentTimingIndex = 0;
        for (let i = 0; i < track.hitObjects.length; i++) {
            while (currentTimingIndex + 1 < track.timingPoints.length && 
                   track.timingPoints[currentTimingIndex + 1].offset <= track.hitObjects[i].time) {
                currentTimingIndex++;
            }
            track.hitObjects[i].timing = track.timingPoints[currentTimingIndex];
        }
    }

    function calculateCurve(track) {
        for (let i = 0; i < track.hitObjects.length; i++) {
            const hit = track.hitObjects[i];
            if (hit.type === "slider") {
                if (hit.sliderType === "P" && hit.keyframes.length === 2) {
                    hit.curve = new CircumscribedCircle(hit);
                    if (hit.curve.length === 0) {
                        hit.curve = new LinearBezier(hit, hit.sliderType === "L");
                    }
                } else {
                    if (hit.sliderType === "C") {
                        console.warn("[curve]", track.metadata.BeatmapID || `${track.metadata.Title}/${track.metadata.Version}`, 
                                     "Catmull curve unsupported, fallback to bezier");
                    }
                    hit.curve = new LinearBezier(hit, hit.sliderType === "L");
                }
                if (hit.curve.length < 2) {
                    console.error("[curve] slider curve calculation failed");
                }
            }
        }
    }

    function stackHitObjects(track) {
        const AR = track.difficulty.ApproachRate;
        const approachTime = AR < 5 ? 1800 - 120 * AR : 1950 - 150 * AR;
        const stackDistance = 3;
        const stackThreshold = approachTime * track.general.StackLeniency;

        function getInterval(A, B) {
            let endTime = A.time;
            if (A.type === "slider") {
                endTime += A.repeat * A.timing.millisecondsPerBeat * (A.pixelLength / track.difficulty.SliderMultiplier) / 100;
            }
            return B.time - endTime;
        }

        function getDistance(A, B) {
            let x = A.x, y = A.y;
            if (A.type === "slider" && A.repeat % 2 === 1) {
                const lastPoint = A.curve.curve[A.curve.curve.length - 1];
                x = lastPoint.x;
                y = lastPoint.y;
            }
            return Math.hypot(x - B.x, y - B.y);
        }

        const chains = [];
        const stacked = Array(track.hitObjects.length).fill(false);

        for (let i = 0; i < track.hitObjects.length; i++) {
            if (stacked[i]) continue;
            const hitI = track.hitObjects[i];
            if (hitI.type === "spinner") continue;

            stacked[i] = true;
            const newchain = [hitI];

            for (let j = i + 1; j < track.hitObjects.length; j++) {
                const hitJ = track.hitObjects[j];
                if (hitJ.type === "spinner") break;
                if (getInterval(newchain[newchain.length - 1], hitJ) > stackThreshold) break;

                if (getDistance(newchain[newchain.length - 1], hitJ) <= stackDistance) {
                    if (stacked[j]) {
                        console.warn("[preproc]", track.metadata.BeatmapID || `${track.metadata.Title}/${track.metadata.Version}`, 
                                     "object stacks intersecting", i, j);
                        break;
                    }
                    stacked[j] = true;
                    newchain.push(hitJ);
                }
            }

            if (newchain.length > 1) {
                chains.push(newchain);
            }
        }

        const stackScale = (1.0 - 0.7 * (track.difficulty.CircleSize - 5) / 5) / 2;
        const scaleX = stackScale * 6.4;
        const scaleY = stackScale * 6.4;

        function moveHit(hit, depth) {
            hit.x += scaleX * depth;
            hit.y += scaleY * depth;
            if (hit.type === "slider") {
                hit.keyframes.forEach(kf => {
                    kf.x += scaleX * depth;
                    kf.y += scaleY * depth;
                });
                hit.curve.curve.forEach(point => {
                    point.x += scaleX * depth;
                    point.y += scaleY * depth;
                });
            }
        }

        chains.forEach(chain => {
            if (chain[0].type === "slider") {
                let depth = 0;
                chain.forEach(hit => {
                    moveHit(hit, depth);
                    if (hit.type !== "slider" || hit.repeat % 2 === 0) depth++;
                });
            } else {
                let depth = 0;
                for (let j = 0; j < chain.length; j++) {
                    const cur = chain.length - 1 - j;
                    if (j > 0 && chain[cur].type === "slider" && chain[cur].repeat % 2 === 1) depth--;
                    moveHit(chain[cur], -depth);
                    depth++;
                }
            }
        });
    }
})();

