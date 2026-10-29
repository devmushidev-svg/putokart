import { chromium } from "playwright";
const SP = "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const err = []; p.on("pageerror", (e) => err.push(e.message));
await p.goto("http://127.0.0.1:8790/contrarreloj");
await p.waitForFunction(() => window.__kart?.C, null, { timeout: 30000 });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const K = window.__kart, k = K.C.yo.control, out = {};
  // sigue la pista hasta tener velocidad
  const R = K.recorrido;
  for (let i = 0; i < 150; i++) { const o = R.p[(K.C.idx + 14) % R.n], q = k.pos; let d = Math.atan2(o.x - q.x, o.z - q.z) - k.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); K.entrada({ acel: true, giro: Math.max(-1, Math.min(1, -d * 3)) }); K.avanzar(1 / 60); }
  out.vel0 = +k.vel.toFixed(1);
  // tocar derrape y doblar a la izquierda
  K.entrada({ acel: true, giro: -1, derrape: true }); K.avanzar(0.2);
  out.empezo = k.derrapando; out.dir = k.dirDerrape;
  const y0 = k.yaw; K.avanzar(1.0); out.giroAdentro = +((k.yaw - y0)).toFixed(2);
  K.entrada({ acel: true, giro: 1, derrape: true }); const y1 = k.yaw; K.avanzar(1.0); out.giroAfuera = +((k.yaw - y1)).toFixed(2);
  out.nivel = k.nivel; out.velDerrape = +k.vel.toFixed(1);
  K.entrada({ acel: true, giro: 0, derrape: false }); K.avanzar(1 / 60);
  out.turbo = k.tTurbo; K.avanzar(0.4); out.velTurbo = +k.vel.toFixed(1);
  return out;
});
await p.screenshot({ path: SP + "/k5.png" });
console.log(JSON.stringify({ r, err }));
await b.close();
