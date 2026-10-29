// foto del efecto de velocidad: a fondo y con turbo
import { chromium } from "playwright";
const S = "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 640 } })).newPage();
const err = []; p.on("pageerror", (e) => err.push(e.message));
await p.addInitScript(() => localStorage.setItem("kart_nombre", "Prueba"));
await p.goto("http://127.0.0.1:8790/contrarreloj");
await p.waitForFunction(() => window.__kart?.C, null, { timeout: 30000 });
await p.waitForTimeout(4000);
await p.evaluate(() => window.__kart.entrada({ acel: true }));
await p.waitForTimeout(3500);
await p.screenshot({ path: S + "v1.png" });
await p.evaluate(() => window.__kart.C.yo.control.turbo(3));
await p.waitForTimeout(700);
await p.screenshot({ path: S + "v2.png" });
console.log(JSON.stringify({ vel: await p.evaluate(() => window.__kart.C.yo.control.vel), err }));
await b.close();
