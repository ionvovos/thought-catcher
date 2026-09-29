// Microphone level for the orb: an AnalyserNode on the mic stream, RMS scaled to 0-1, handed to onLevel at most once per
// animation frame. The stream is used for the level only and is stopped with stop(); nothing is recorded or kept.
// If the microphone cannot be opened a second time (a speech engine may hold it), start() resolves false and the orb
// keeps its resting halo.
export const rmsToLevel = (rms) => Math.max(0, Math.min(1, Math.sqrt(Math.max(0, rms)) * 2.4));

export function createLevelMeter({ win = globalThis, onLevel }) {
  let stream = null;
  let ctx = null;
  let raf = 0;
  let stopped = true;

  async function start() {
    stopped = false;
    const Ctx = win.AudioContext || win.webkitAudioContext;
    if (!Ctx || !win.navigator?.mediaDevices?.getUserMedia) return false;
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false;
    }
    if (stopped) { for (const t of stream.getTracks()) t.stop(); stream = null; return false; }
    ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (stopped) return;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      onLevel(rmsToLevel(sum / data.length));
      raf = win.requestAnimationFrame(tick);
    };
    raf = win.requestAnimationFrame(tick);
    return true;
  }

  function stop() {
    stopped = true;
    if (raf) { win.cancelAnimationFrame?.(raf); raf = 0; }
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    if (ctx) { ctx.close?.(); ctx = null; }
    onLevel(0);
  }

  return { start, stop };
}
