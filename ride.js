/*
  ride.js — one velocity value, many consumers. Suspension, not speed.

  A second-order spring, not a low-pass filter: it overshoots and settles, so the
  stop itself rebounds. That rebound is most of the feeling. Everything visual
  is a CSS custom property, so nothing here touches layout.

  Graceful without it: no script, no ride — the page is exactly what it was.
*/
(function () {
  var root = document.documentElement;

  var K = 0.30;    // stiffness: how hard it reaches the scroll speed, and how fast it rises
  var D = 0.46;    // damping: 0.46 settles in ~5 frames with a 6% rebound on the stop
  var SCALE = 50;  // px per nominal frame that counts as "fast"
  var EPS = 0.35;  // where the ride is quiet enough to stop the loop

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var trail = document.querySelector('.trail');
  var ridden = trail && trail.querySelector('.trail-ridden');
  var hot = trail && trail.querySelector('.trail-hot');
  var rider = trail && trail.querySelector('.trail-rider');

  var pathLength = 0;
  var lastY = window.scrollY;
  var lastT = performance.now();
  var x = 0;      // filtered velocity, in px per nominal frame
  var vx = 0;     // its rate of change
  var phase = 0;   // jitter sign, flipped every frame while moving
  var top = 0;    // cached scrollable height
  var running = false;

  function measure() {
    top = Math.max(root.scrollHeight - window.innerHeight, 1);
    if (ridden) {
      var len = ridden.getTotalLength();
      // a display:none path still reports its geometry, but never let a 0 clobber it
      if (len > 0) {
        pathLength = len;
        root.style.setProperty('--pl', len.toFixed(2));
      }
    }
  }

  function paintProgress() {
    if (!trail) return;
    var p = Math.min(Math.max(window.scrollY / top, 0), 1);
    root.style.setProperty('--p', p.toFixed(4));
    if (rider && pathLength) {
      var pt = ridden.getPointAtLength(p * pathLength);
      rider.setAttribute('cx', pt.x.toFixed(2));
      rider.setAttribute('cy', pt.y.toFixed(2));
    }
  }

  function frame(now) {
    var dt = Math.min(Math.max(now - lastT, 1), 50);
    lastT = now;

    // normalize to a nominal frame: a wheel sends 100px steps, a trackpad sends
    // hundreds of 1px ones, and both should feel like the same hill
    var dy = (window.scrollY - lastY) * (16.7 / dt);
    lastY = window.scrollY;

    vx += (dy - x) * K;   // spring toward the instantaneous scroll speed
    vx *= 1 - D;          // damper
    x += vx;

    var m = reduced.matches ? 0 : Math.min(Math.abs(x) / SCALE, 1);
    // trail texture, not a shimmer: only once there is real speed to shake
    phase = m > 0.12 ? (phase > 0 ? -1 : 1) : 0;

    root.style.setProperty('--v', (x < 0 ? -m : m).toFixed(3));
    root.style.setProperty('--m', m.toFixed(3));
    root.style.setProperty('--j', (phase * m * 0.7).toFixed(2));
    paintProgress();

    var live = Math.abs(dy) > 0.5 || Math.abs(x) > EPS || Math.abs(vx) > EPS;
    if (live) {
      requestAnimationFrame(frame);
    } else {
      x = 0;
      vx = 0;
      root.style.setProperty('--v', '0');
      root.style.setProperty('--m', '0');
      root.style.setProperty('--j', '0');
      running = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    // do NOT resync lastY here: the scroll event fires after the position has
    // already moved, so resyncing would discard the very delta that startles the ride
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', start, { passive: true });
  window.addEventListener('resize', function () {
    measure();
    paintProgress();
    if (!running) start();
  });
  if (reduced.addEventListener) {
    reduced.addEventListener('change', function () {
      if (!running) start();
    });
  }

  measure();
  paintProgress();
})();
