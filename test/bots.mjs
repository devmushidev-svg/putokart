// carrera contra bots: que corran, agarren ítems y no haya errores
import { chromium } from "playwright";
const S = "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const err = []; p.on("pageerror", (e) => err.push(e.message + e.stack)); p.on("console", (m) => m.type() === "error" && err.push(m.text()));
await p.addInitScript(() => localStorage.setItem("kart_nombre", "Prueba"));
await p.goto("http://127.0.0.1:8790/solo");
await p.waitForFunction(() => window.__kart?.C, null, { timeout: 30000 });
await p.waitForTimeout(4200);
await p.keyboard.down("KeyW");
await p.waitForTimeout(4000);
await p.screenshot({ path: S + "b1.png" });
const r = await p.evaluate(() => {
  const k = window.__kart; k.entrada({ acel: true });
  const items = new Set(), estado = [];
  for (let s = 0; s < 40; s++) {
    k.avanzar(1);
    for (const pl of k.C.pilotos) if (pl.item) items.add(pl.item);
    if (s % 10 === 9) estado.push(k.C.pilotos.map((pl) => `${pl.nombre}:${pl.p}${pl.item ? "/" + pl.item : ""}`).join(" "));
  }
  k.entrada(null);
  return { items: [...items], estado, bananas: k.items.platanos.size, proy: k.items.proy.size, monedas: k.C.yo.control.monedas };
});
await p.waitForTimeout(1500);
await p.screenshot({ path: S + "b2.png" });
console.log(JSON.stringify({ r, err: err.slice(0, 5) }, null, 1));
await b.close();
