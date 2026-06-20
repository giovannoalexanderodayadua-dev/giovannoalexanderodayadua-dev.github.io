/* ============================================================
   maz — audio engine (Web Audio API, fully synthesized)
   All sound effects for the neon maze are generated in code:
   wall collisions, rolling, reaching the goal post, and the
   wall-deconstruct / flag-emerge sequence. No audio files.

   Modern browsers block sound until a real user gesture. We add
   a fully transparent, page-wide "unlock layer" plus window-level
   listeners (pointer / mouse move / scroll / wheel / key / touch /
   device tilt). The first such interaction resumes the AudioContext
   so everything is audible afterwards — without blocking the UI.
   ============================================================ */
const MazAudio = (() => {
  "use strict";

  let ctx = null;
  let master = null;
  let unlocked = false;
  let muted = false;

  // rolling-sound chain (persistent, gain-modulated)
  let roll = null;
  let noiseBuffer = null;

  /* ---------- context bootstrap ---------- */
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = makeNoise(ctx, 1.2);
    return ctx;
  }

  function makeNoise(ac, seconds) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ---------- unlock on first gesture ---------- */
  function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state !== "running") c.resume();
    unlocked = true;
  }

  function isReady() { return unlocked && ctx && ctx.state === "running"; }

  /* ---------- small synth helpers ---------- */
  function tone({ freq = 440, type = "sine", t0 = 0, dur = 0.15, gain = 0.3, glideTo = null, dest = null }) {
    if (!ctx) return;
    const start = ctx.currentTime + t0;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(dest || master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noiseBurst({ t0 = 0, dur = 0.12, gain = 0.3, type = "highpass", freq = 1200, q = 0.7 }) {
    if (!ctx || !noiseBuffer) return;
    const start = ctx.currentTime + t0;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  /* ---------- SFX: wall collision ---------- */
  function wallHit(intensity = 1) {
    if (!isReady() || muted) return;
    const i = Math.max(0.15, Math.min(1, intensity));
    // tonal "tok"
    tone({ freq: 150 + i * 260, type: "triangle", dur: 0.09, gain: 0.05 + i * 0.22, glideTo: 90 + i * 120 });
    // short click of noise
    noiseBurst({ dur: 0.05, gain: 0.04 + i * 0.12, type: "bandpass", freq: 900 + i * 1400, q: 1.2 });
  }

  /* ---------- SFX: reach goal post ---------- */
  function goal() {
    if (!isReady() || muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, idx) => {
      tone({ freq: f, type: "triangle", t0: idx * 0.085, dur: 0.34, gain: 0.26 });
      tone({ freq: f * 2, type: "sine", t0: idx * 0.085, dur: 0.22, gain: 0.08 });
    });
    noiseBurst({ t0: 0.0, dur: 0.5, gain: 0.07, type: "highpass", freq: 5000, q: 0.5 });
  }

  /* ---------- SFX: deconstruct walls ---------- */
  function deconstruct() {
    if (!isReady() || muted) return;
    // downward sweep "shatter"
    tone({ freq: 420, type: "sawtooth", dur: 0.45, gain: 0.16, glideTo: 50 });
    // crackle / debris
    noiseBurst({ dur: 0.4, gain: 0.22, type: "bandpass", freq: 2600, q: 0.6 });
    for (let k = 0; k < 6; k++) {
      noiseBurst({ t0: 0.04 + Math.random() * 0.32, dur: 0.05, gain: 0.07, type: "highpass", freq: 1500 + Math.random() * 4000, q: 1.5 });
    }
  }

  /* ---------- SFX: new flag emerges ---------- */
  function emerge() {
    if (!isReady() || muted) return;
    tone({ freq: 220, type: "sine", dur: 0.5, gain: 0.16, glideTo: 880 });
    [880, 1175, 1568].forEach((f, idx) =>
      tone({ freq: f, type: "triangle", t0: 0.18 + idx * 0.07, dur: 0.2, gain: 0.12 })
    );
  }

  /* ---------- rolling loop (gain follows speed) ---------- */
  function ensureRoll() {
    if (roll || !ctx || !noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 240;
    band.Q.value = 0.9;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(band).connect(low).connect(g).connect(master);
    src.start();
    roll = { src, band, low, g };
  }

  function rollUpdate(speed) {
    if (!isReady() || muted) return;
    ensureRoll();
    if (!roll) return;
    const s = Math.max(0, Math.min(1, speed));
    const target = s < 0.04 ? 0.0001 : 0.02 + s * 0.16;
    const t = ctx.currentTime;
    roll.g.gain.setTargetAtTime(target, t, 0.05);
    roll.band.frequency.setTargetAtTime(140 + s * 320, t, 0.08);
    roll.low.frequency.setTargetAtTime(500 + s * 1400, t, 0.08);
  }

  function rollStop() {
    if (!roll || !ctx) return;
    roll.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
  }

  /* ---------- transparent unlock layer + listeners ---------- */
  function installUnlockLayer() {
    // The invisible, non-blocking layer. Its presence documents the
    // unlock mechanism; the real gesture capture is on `window` so the
    // page stays fully clickable.
    const layer = document.createElement("div");
    layer.id = "maz-audio-unlock";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText =
      "position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;background:transparent;";
    document.body.appendChild(layer);

    const events = [
      "pointerdown", "mousedown", "click", "mousemove",
      "touchstart", "touchmove", "keydown", "wheel",
      "scroll", "deviceorientation"
    ];
    const onGesture = () => {
      unlock();
      if (isReady()) {
        events.forEach(ev => window.removeEventListener(ev, onGesture, true));
      }
    };
    events.forEach(ev =>
      window.addEventListener(ev, onGesture, { capture: true, passive: true })
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installUnlockLayer);
  } else {
    installUnlockLayer();
  }

  /* ---------- public API ---------- */
  return {
    unlock,
    isReady,
    wallHit,
    goal,
    deconstruct,
    emerge,
    rollUpdate,
    rollStop,
    setMuted(v) { muted = !!v; if (muted) rollStop(); }
  };
})();
