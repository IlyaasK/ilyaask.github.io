/* Browser agent glue: recurrent (MinGRU) forward over policy_weights.json,
 * driving the WASM game via web_fill_obs / web_apply_action once per tick.
 * Carried 3x256 state across ticks; reset on new game. Sampled (softmax),
 * NOT argmax: the trained policy needs stochasticity (train entropy ~0.5);
 * greedy collapses to one action and drains. */
(function () {
  'use strict';

  var OBS = 30, ACTS = 8, HID = 256;
  var EW = null, GW = null, AW = null;  // encoder, 3x gru, actor
  var ST = null;                         // carried state, reset on new game
  var started = false;        // user clicked
  var runtimeReady = false;   // Module.onRuntimeInitialized fired
  var bound = false;          // cwrap done
  var fillObs, applyAction, autoLaunch, obsPtr;

  function sig(x) { return 1 / (1 + Math.exp(-x)); }

  function matvec(w, x) {
    var out = new Float64Array(w.length);
    for (var o = 0; o < w.length; o++) {
      var s = 0, wr = w[o];
      for (var i = 0; i < x.length; i++) s += wr[i] * x[i];
      out[o] = s;
    }
    return out;
  }

  function gruCell(x, W, st) {
    var c = matvec(W, x);
    var out = new Float64Array(HID);
    for (var h = 0; h < HID; h++) {
      var hidden = c[h], gate = c[HID + h], proj = c[2 * HID + h];
      var z = sig(gate);
      var ht = hidden >= 0 ? hidden + 0.5 : sig(hidden);
      var d = ht - st[h];
      var nh = Math.abs(z) < 0.5 ? st[h] + z * d : ht - d * (1 - z);
      st[h] = nh;
      var s = sig(proj);
      out[h] = s * nh + (1 - s) * x[h];
    }
    return out;
  }

  function resetState() {
    ST = [new Float64Array(HID), new Float64Array(HID), new Float64Array(HID)];
  }

  function forward(obs) {
    var x = matvec(EW, obs);
    for (var l = 0; l < 3; l++) x = gruCell(x, GW[l], ST[l]);
    var lg = matvec(AW, x);
    var m = lg[0], sum = 0, k;
    for (var i = 1; i < ACTS; i++) if (lg[i] > m) m = lg[i];
    for (var j = 0; j < ACTS; j++) { lg[j] = Math.exp(lg[j] - m); sum += lg[j]; }
    var r = Math.random() * sum;
    for (k = 0; k < ACTS; k++) { r -= lg[k]; if (r <= 0) return k; }
    return ACTS - 1;
  }

  function tick() {
    if (!bound) return;
    autoLaunch();
    fillObs(obsPtr);
    var obs = new Float32Array(Module.HEAPF32.buffer, obsPtr, OBS);
    applyAction(forward(obs));
  }

  function unlockAudio() {
    // Best-effort resume of the Emscripten SDL2 audio context. The overlay
    // click is the required user gesture; SDL2 also auto-resumes on it.
    try {
      var s = Module.SDL2;
      if (!s) return;
      var ctx = s.audioContext || s.audioCtx || (s.audio && s.audio.audioContext);
      if (ctx && ctx.resume) ctx.resume();
    } catch (e) {}
  }

  function tryBind() {
    if (bound || !started || !runtimeReady || !EW) return;
    fillObs = Module.cwrap('web_fill_obs', null, ['number']);
    applyAction = Module.cwrap('web_apply_action', null, ['number']);
    autoLaunch = Module.cwrap('web_auto_launch', null, []);
    obsPtr = Module._malloc(OBS * 4);
    bound = true;
    setInterval(tick, 16); // ~60 Hz agent tick; hold-state interface
    console.log('agent started');
  }

  document.getElementById('start').addEventListener('click', function () {
    started = true;
    resetState();
    unlockAudio();
    document.getElementById('overlay').style.display = 'none';
    tryBind();
  });

  // Runtime-ready signal. This Emscripten build never sets Module.calledRun
  // (it stays a local `var` in the generated JS), so polling it never fired
  // and the agent never bound. onRuntimeInitialized is the real signal: it
  // fires once the WASM runtime is fully set up (exports, _malloc, cwrap)
  // and just before main() runs.
  function markReady() {
    if (runtimeReady) return;
    runtimeReady = true;
    tryBind();
  }
  if (Module.onRuntimeInitialized) {
    var prevInit = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = function () { prevInit(); markReady(); };
  } else {
    Module.onRuntimeInitialized = markReady;
  }
  // Fallback poll in case onRuntimeInitialized was already consumed before
  // this script ran (agent.js is synchronous, before the async WASM script,
  // so it normally won't -- but keep a safety net on the real exports).
  var poll = setInterval(function () {
    if (Module.cwrap && Module._web_fill_obs) {
      markReady();
      clearInterval(poll);
    }
  }, 50);

  fetch('policy_weights.json')
    .then(function (r) { return r.json(); })
    .then(function (j) {
      EW = j.encoder.weight;
      GW = [j.gru[0].weight, j.gru[1].weight, j.gru[2].weight];
      AW = j.actor.weight;
      resetState();
      tryBind();
    })
    .catch(function (e) { console.error('failed to load policy_weights.json', e); });
})();
