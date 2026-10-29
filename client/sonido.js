// Sonidos sintetizados con WebAudio (no hay archivos de audio que descargar).
let ctx = null, mudo = false;
try { mudo = localStorage.getItem("kart_mudo") === "1"; } catch {}
const a = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tono(f, dur, tipo = "sine", vol = 0.15, slide = 1, delay = 0) {
  if (mudo) return;
  const c = a(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function ruido(dur, vol = 0.2, filtro = 1200, tipo = "lowpass") {
  if (mudo) return;
  const c = a(), b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; f.type = tipo; f.frequency.value = filtro; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start();
}

// motor y derrape: sonidos continuos que se ajustan cada cuadro
let motor = null;
function crearMotor() {
  const c = a();
  const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o1.type = "sawtooth"; o2.type = "square"; o2.detune.value = 7;
  f.type = "lowpass"; f.frequency.value = 600; g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g).connect(c.destination);
  // derrape: ruido filtrado en bucle
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
  n.buffer = b; n.loop = true; nf.type = "bandpass"; nf.frequency.value = 2400; nf.Q.value = 2; ng.gain.value = 0;
  n.connect(nf).connect(ng).connect(c.destination);
  o1.start(); o2.start(); n.start();
  motor = { o1, o2, f, g, ng, nf };
}

export const Sonido = {
  get mudo() { return mudo; },
  alternar() { mudo = !mudo; try { localStorage.setItem("kart_mudo", mudo ? "1" : "0"); } catch {} if (mudo) this.motor(0, 0, false); },
  despertar() { try { a().resume(); } catch {} },
  // vel: 0..1 (sobre la máxima), acel: si está acelerando, derrape: nivel 0..3
  motor(vel, acel, derrape, activo = true) {
    if (mudo || !activo) { if (motor) { motor.g.gain.value = 0; motor.ng.gain.value = 0; } return; }
    if (!motor) crearMotor();
    const t = a().currentTime, f = 55 + vel * 150 + (acel ? 12 : 0);
    motor.o1.frequency.setTargetAtTime(f, t, 0.05);
    motor.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    motor.f.frequency.setTargetAtTime(500 + vel * 1600, t, 0.05);
    motor.g.gain.setTargetAtTime(0.045 + vel * 0.05, t, 0.05);
    motor.ng.gain.setTargetAtTime(derrape ? 0.05 + derrape * 0.015 : 0, t, 0.04);
    motor.nf.frequency.setTargetAtTime(2000 + derrape * 500, t, 0.05);
  },
  cuenta() { tono(660, 0.25, "square", 0.12); },
  ya() { tono(990, 0.6, "square", 0.14); tono(1320, 0.6, "triangle", 0.08); },
  turbo() { ruido(0.6, 0.25, 900); tono(220, 0.5, "sawtooth", 0.08, 3); },
  chispa(nivel) { tono(800 + nivel * 300, 0.08, "triangle", 0.06); },
  choque() { ruido(0.25, 0.4, 400); tono(80, 0.2, "sine", 0.3, 0.5); },
  salto() { tono(300, 0.12, "triangle", 0.07, 1.6); },
  vuelta() { [523, 659, 784].forEach((f, i) => tono(f, 0.25, "triangle", 0.12, 1, i * 0.1)); },
  meta() { [523, 659, 784, 1046, 1318].forEach((f, i) => tono(f, 0.4, "triangle", 0.12, 1, i * 0.12)); },
  error() { tono(160, 0.2, "square", 0.08); },
  clic() { tono(1200, 0.04, "square", 0.04); },
};
addEventListener("pointerdown", () => Sonido.despertar(), { once: true });
addEventListener("keydown", () => Sonido.despertar(), { once: true });
