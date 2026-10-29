import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const err = []; p.on("pageerror", (e) => err.push(e.message));
await p.goto("http://127.0.0.1:8790/contrarreloj");
await p.waitForFunction(() => window.__kart?.C, null, { timeout: 30000 });
await p.waitForTimeout(4000);
const est = () => p.evaluate(() => { const c = window.__kart.C, k = c.yo.control; return { vel: +k.vel.toFixed(1), p: c.yo.p, vuelta: c.vuelta, suelo: k.tipoSuelo, derr: k.derrapando, nivel: k.nivel, turbo: +k.tTurbo.toFixed(2), y: +k.pos.y.toFixed(1) }; });
await p.evaluate(() => { window.__kart.entrada({ acel: true }); window.__kart.avanzar(3); });
const a = await est();
// manejo automático: sigue el camino para dar vueltas
const vuelta = await p.evaluate(() => {
  const K = window.__kart, c = K.C, k = c.yo.control, log = [];
  for (let i = 0; i < 60 * 150 && !c.terminado; i++) {
    // mira a un punto 12 adelante en el recorrido y dobla hacia él
    const rec = c.yo.control; const N = 700;
    const R = K.recorrido, obj = R.p[(c.yo.idx + 14) % R.n], pos = k.pos;
    const ang = Math.atan2(obj.x - pos.x, obj.z - pos.z);
    let d = ang - k.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const giro = Math.max(-1, Math.min(1, -d * 3));
    // derrapa en las curvas cerradas para probar el mini-turbo
    K.entrada({ acel: true, giro, derrape: Math.abs(d) > 0.35 || (k.derrapando && Math.abs(d) > 0.08) });
    K.avanzar(1 / 60);
    if (i % 600 === 0) log.push([c.vuelta, Math.round(k.vel), k.tipoSuelo, Math.round(c.yo.p)]);
  }
  return { terminado: c.terminado, vueltas: c.vueltasT, log };
});
console.log(JSON.stringify({ a, vuelta, err }));
await p.screenshot({ path: "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/k4.png" });
await b.close();
