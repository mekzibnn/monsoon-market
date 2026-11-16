// Synthesized sound: every effect is built from oscillators and filtered
// noise, so the game ships no audio files. One job: make noise on demand.
let ctx = null;
let master = null;

export function ensureAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { ctx = null; }
}

function noiseBuffer(dur) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst(dur, filterFreq, gain, type = 'lowpass') {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(); src.stop(ctx.currentTime + dur);
}

function tone(freq, dur, gain, type = 'sine', slideTo = null) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur);
}

export const sfx = {
  shot(kind) {
    if (!ctx) return;
    if (kind === 'shotgun') { burst(0.22, 900, 0.9); tone(90, 0.14, 0.5, 'sine', 45); }
    else if (kind === 'dmr' || kind === 'heavy') { burst(0.2, 1400, 0.8); tone(110, 0.12, 0.4, 'sine', 55); }
    else if (kind === 'smg') { burst(0.09, 2400, 0.5); tone(150, 0.06, 0.25, 'square', 90); }
    else if (kind === 'pistol') { burst(0.12, 1800, 0.6); tone(130, 0.08, 0.3, 'sine', 60); }
    else { burst(0.13, 2000, 0.65); tone(120, 0.09, 0.32, 'sine', 55); }
  },
  distantShot() { if (ctx) burst(0.1, 700, 0.25); },
  dry() { if (ctx) tone(1200, 0.04, 0.2, 'square'); },
  reload() { if (!ctx) return; tone(500, 0.05, 0.2, 'square'); setTimeout(() => tone(700, 0.05, 0.2, 'square'), 350); },
  hit(head) { if (ctx) tone(head ? 2400 : 1600, 0.06, 0.3, 'sine'); },
  kill() { if (!ctx) return; tone(880, 0.08, 0.3, 'sine'); setTimeout(() => tone(1320, 0.1, 0.3, 'sine'), 80); },
  plantBeep() { if (ctx) tone(1900, 0.07, 0.3, 'square'); },
  defuseBeep() { if (ctx) tone(1500, 0.07, 0.3, 'square'); },
  explosion() { if (!ctx) return; burst(0.9, 320, 1.0); tone(60, 0.8, 0.7, 'sine', 28); },
  roundWin() { if (!ctx) return; [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.3, 'triangle'), i * 120)); },
  roundLose() { if (!ctx) return; [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.3, 'triangle'), i * 130)); },
  buy() { if (ctx) tone(980, 0.07, 0.25, 'sine'); },
  denied() { if (ctx) tone(220, 0.12, 0.3, 'square'); },
  step() { if (ctx) burst(0.05, 500, 0.08); },
  throwPin() { if (ctx) tone(1400, 0.05, 0.2, 'square'); },
};
