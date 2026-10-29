import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 800, height: 500 } })).newPage();
await p.goto("http://127.0.0.1:8790/solo");
await p.waitForFunction(() => window.__kart?.C, null, { timeout: 30000 });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const K = window.__kart, k = K.C.yo.control, out = [];
  const R = K.recorrido;
  K.entrada({ acel: true });
  for (let i = 0; i < 10; i++) {
    K.avanzar(0.25);
    const pos = k.pos, j = R.cercano(pos), q = R.p[j];
    out.push([+pos.x.toFixed(1), +pos.y.toFixed(2), +pos.z.toFixed(1), k.tipoSuelo, k.enSuelo, +k.vel.toFixed(1), j, +Math.hypot(q.x - pos.x, q.z - pos.z).toFixed(1), +k.yaw.toFixed(2), +R.direccion(j).toFixed(2)]);
  }
  return out;
});
console.log(r.map((x) => x.join(" ")).join("\n"));
await b.close();
