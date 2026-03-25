export default (function () {
  let playback;

  function safeNowMs(pb) {
    try {
      return pb?.osu?.audio?.getPosition ? Math.floor(pb.osu.audio.getPosition() * 1000) : null;
    } catch (e) {
      return null;
    }
  }

  function checkClickdown() {
    if (!playback) return;
    const now = safeNowMs(playback);
    if (now == null) return;

    const click = { x: playback.game.mouseX, y: playback.game.mouseY, time: now };
    let hit = playback.upcomingHits.find(inUpcoming(click));

    if (!hit && playback.game.mouse) {
      const predicted = playback.game.mouse(Date.now());
      predicted.time = click.time;
      hit = playback.upcomingHits.find(inUpcoming_grace(predicted));
    }

    if (hit && (hit.type === "circle" || hit.type === "slider")) {
      const diff = Math.abs(click.time - hit.time);
      let points = 50;
      if (diff < playback.GoodTime) points = 100;
      if (diff < playback.GreatTime) points = 300;
      playback.hitSuccess(hit, points, click.time);
    }
  }

  function inUpcoming(click) {
    return (hit) => {
      const dx = click.x - hit.x;
      const dy = click.y - hit.y;
      const radiusSq = playback.circleRadius * playback.circleRadius;
      return hit.score < 0 && dx * dx + dy * dy < radiusSq && Math.abs(click.time - hit.time) < playback.MehTime;
    };
  }

  function inUpcoming_grace(predicted) {
    return (hit) => {
      const dx = predicted.x - hit.x;
      const dy = predicted.y - hit.y;
      const r = predicted.r + playback.circleRadius;
      return hit.score < 0 && dx * dx + dy * dy < r * r && Math.abs(predicted.time - hit.time) < playback.MehTime;
    };
  }

  function updateDownState(pb) {
    pb.game.down = pb.game.K1down || pb.game.K2down || pb.game.M1down || pb.game.M2down;
  }

  function updateMousePosition(e, pb, movehistory) {
    pb.game.mouseX = ((e.clientX - gfx.xoffset) / gfx.width) * 512;
    pb.game.mouseY = ((e.clientY - gfx.yoffset) / gfx.height) * 384;
    movehistory.unshift({ x: pb.game.mouseX, y: pb.game.mouseY, t: Date.now() });
    if (movehistory.length > 10) movehistory.pop();
  }

  const playerActions = function (pb) {
    playback = pb;

    pb.auto = {
      currentObject: null,
      curid: 0,
      lastx: pb.game.mouseX,
      lasty: pb.game.mouseY,
      lasttime: 0,
    };

    const movehistory = [{ x: 256, y: 192, t: Date.now() }];

    pb.game.mouse = function (t) {
      const m = movehistory;
      let i = 0;
      while (i < m.length - 1 && m[0].t - m[i].t < 40 && t - m[i].t < 100) i++;
      
      const velocity = i === 0 
        ? { x: 0, y: 0 }
        : { x: (m[0].x - m[i].x) / (m[0].t - m[i].t), y: (m[0].y - m[i].y) / (m[0].t - m[i].t) };
      
      const dt = Math.min(t - m[0].t + window.currentFrameInterval, 40);
      return {
        x: m[0].x + velocity.x * dt,
        y: m[0].y + velocity.y * dt,
        r: Math.hypot(velocity.x, velocity.y) * Math.max(t - m[0].t, window.currentFrameInterval),
      };
    };

    const mousemoveCallback = (e) => {
      if (pb.autopilot) return;
      updateMousePosition(e, pb, movehistory);
    };

    const mousedownCallback = (e) => {
      updateMousePosition(e, pb, movehistory);
      if (e.button === 0) {
        if (pb.game.M1down) return;
        pb.game.M1down = true;
      } else if (e.button === 2) {
        if (pb.game.M2down) return;
        pb.game.M2down = true;
      } else return;
      
      e.preventDefault();
      e.stopPropagation();
      updateDownState(pb);
      checkClickdown();
    };

    const mouseupCallback = (e) => {
      updateMousePosition(e, pb, movehistory);
      if (e.button === 0) pb.game.M1down = false;
      else if (e.button === 2) pb.game.M2down = false;
      else return;
      
      e.preventDefault();
      e.stopPropagation();
      updateDownState(pb);
    };

    const pauseKeydownCallback = (e) => {
      const isEsc = e.key === "Escape" || e.code === "Escape" || e.keyCode === 27;
      if (!isEsc) return;
      e.preventDefault();
      e.stopPropagation();
      pb.game.paused ? pb.resume() : pb.pause();
    };

    const keydownCallback = (e) => {
      if (e.keyCode === pb.game.K1keycode) {
        if (pb.game.K1down) return;
        pb.game.K1down = true;
      } else if (e.keyCode === pb.game.K2keycode) {
        if (pb.game.K2down) return;
        pb.game.K2down = true;
      } else return;
      
      e.preventDefault();
      e.stopPropagation();
      updateDownState(pb);
      checkClickdown();
    };

    const keyupCallback = (e) => {
      if (e.keyCode === pb.game.K1keycode) pb.game.K1down = false;
      else if (e.keyCode === pb.game.K2keycode) pb.game.K2down = false;
      else return;
      
      e.preventDefault();
      e.stopPropagation();
      updateDownState(pb);
    };

    const win = pb.game.window;
    
    if (!pb.autoplay) {
      win.addEventListener("mousemove", mousemoveCallback);
      if (!pb.relax) {
        win.addEventListener("keydown", keydownCallback);
        win.addEventListener("keyup", keyupCallback);
        win.addEventListener("keydown", pauseKeydownCallback);
        
        if (pb.game.allowMouseButton) {
          win.addEventListener("mousedown", mousedownCallback);
          win.addEventListener("mouseup", mouseupCallback);
        }
      }
    }

    pb.game.cleanupPlayerActions = function () {
      win.removeEventListener("mousemove", mousemoveCallback);
      win.removeEventListener("mousedown", mousedownCallback);
      win.removeEventListener("mouseup", mouseupCallback);
      win.removeEventListener("keydown", keydownCallback);
      win.removeEventListener("keyup", keyupCallback);
      win.removeEventListener("keydown", pauseKeydownCallback);
    };
  };

  return playerActions;
})();

