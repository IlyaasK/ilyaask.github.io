/* Browser agent glue: MLP forward pass over policy_weights.json, driving the
 * WASM game via web_fill_obs / web_apply_action once per tick. */
(function () {
  'use strict';

  var OBS = 30, ACTS = 8;
  var layers = null;          // [{weight, bias} x3], from policy_weights.json
  var started = false;        // user clicked
  var runtimeReady = false;   // Module.calledRun observed
  var bound = false;          // cwrap done
  var fillObs, applyAction, obsPtr;

  function tanh(x) { return Math.tanh(x); }

  // Greedy (argmax) policy, matching the trainer's deterministic eval mode.
  function forward(obs) {
    var x = obs;
    for (var l = 0; l < layers.length; l++) {
      var L = layers[l], w = L.weight, b = L.bias;
      var out = new Float32Array(b.length);
      for (var o = 0; o < b.length; o++) {
        var s = b[o], wr = w[o];
        for (var i = 0; i < x.length; i++) s += wr[i] * x[i];
        out[o] = s;
      }
      x = out;
      if (l < layers.length - 1) x = x.map(tanh);
    }
    var a = 0;
    for (var i = 1; i < ACTS; i++) if (x[i] > x[a]) a = i;
    return a;
  }

  function tick() {
    if (!bound) return;
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
    if (bound || !started || !runtimeReady || !layers) return;
    fillObs = Module.cwrap('web_fill_obs', null, ['number']);
    applyAction = Module.cwrap('web_apply_action', null, ['number']);
    obsPtr = Module._malloc(OBS * 4);
    bound = true;
    setInterval(tick, 16); // ~60 Hz agent tick; hold-state interface
    console.log('agent started');
  }

  document.getElementById('start').addEventListener('click', function () {
    started = true;
    unlockAudio();
    document.getElementById('overlay').style.display = 'none';
    tryBind();
  });

  // Runtime-init watcher (Module.calledRun is set once main() is entered;
  // the game loop never returns, so this is the ready signal).
  var poll = setInterval(function () {
    if (Module.calledRun) {
      runtimeReady = true;
      tryBind();
      clearInterval(poll);
    }
  }, 50);

  fetch('policy_weights.json')
    .then(function (r) { return r.json(); })
    .then(function (j) { layers = j.layers; tryBind(); })
    .catch(function (e) { console.error('failed to load policy_weights.json', e); });
})();
