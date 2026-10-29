import { chromium } from "playwright";
const SP = "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1263, height: 696 } })).newPage();
await p.goto("http://127.0.0.1:8790/solo");
await p.waitForFunction(() => window.__kart?.C, null, { timeout: 30000 });
await p.waitForTimeout(4000);
await p.evaluate(() => {
  const K = window.__kart, k = K.C.yo.control, R = K.recorrido;
  const seguir = (n, extra = {}) => { for (let i = 0; i < n; i++) { const o = R.p[(K.C.idx + 14) % R.n], q = k.pos; let d = Math.atan2(o.x - q.x, o.z - q.z) - k.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); K.entrada({ acel: true, giro: Math.max(-1, Math.min(1, -d * 3)), ...extra }); K.avanzar(1 / 60); } };
  seguir(330);
  K.entrada({ acel: true, giro: 1, derrape: true }); K.avanzar(0.1);
  for (let i = 0; i < 50; i++) { const o = R.p[(K.C.idx + 14) % R.n], q = k.pos; let d = Math.atan2(o.x - q.x, o.z - q.z) - k.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); K.entrada({ acel: true, giro: Math.max(-1, Math.min(1, -d * 3)), derrape: true }); K.avanzar(1 / 60); }
});
await p.waitForTimeout(500);
await p.screenshot({ path: SP + "/k6.png" });
await b.close();
