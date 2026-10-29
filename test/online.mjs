import { chromium } from "playwright";
const B = "http://127.0.0.1:8790";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const err = [];
async function jugador(nombre, w = 1000, h = 600, movil = false) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: movil, isMobile: movil });
  await ctx.addInitScript((n) => localStorage.setItem("kart_nombre", n), nombre);
  const p = await ctx.newPage(); p.on("pageerror", (e) => err.push(nombre + ": " + e.message)); return p;
}
const a = await jugador("Mario"), c = await jugador("Tun", 412, 915, true);
await a.goto(B);
const { id } = await (await fetch(B + "/api/crear", { method: "POST" })).json();
await a.goto(B + "/s/" + id); await a.waitForSelector(".sala");
await c.goto(B + "/s/" + id); await c.waitForSelector(".sala");
await a.waitForTimeout(800);
await a.screenshot({ path: "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/o_sala.png" });
const enSala = await c.$$eval(".jugadores li", (l) => l.map((x) => x.textContent.trim().replace(/\s+/g, " ")));
await a.click("#empezar");
await a.waitForFunction(() => window.__kart.C, null, { timeout: 15000 });
await c.waitForFunction(() => window.__kart.C, null, { timeout: 15000 });
await a.waitForTimeout(5200);
await a.evaluate(() => window.__kart.entrada({ acel: true, giro: 0.15 }));
await a.waitForTimeout(3500);
const visto = await c.evaluate(() => { const r = [...window.__kart.remotos.values()][0]; return { buf: r.buf.length, pos: r.mod.g.position.toArray().map((v) => +v.toFixed(1)) }; });
await c.screenshot({ path: "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/o_movil.png" });
await a.screenshot({ path: "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/o_pc.png" });
// los dos terminan a la fuerza para ver resultados
for (const p of [a, c]) await p.evaluate(() => { const C = window.__kart.C; C.p = C.vueltas * 700 - 1; window.__kart.entrada({ acel: true }); });
await a.waitForTimeout(6000);
const res = await a.$$eval(".resultados tr", (l) => l.map((x) => x.textContent.trim().replace(/\s+/g, " ")));
await a.screenshot({ path: "/tmp/claude-0/-home-claude/7ef66f04-94ad-5331-afbb-f831b821f135/scratchpad/o_res.png" });
console.log(JSON.stringify({ enSala, visto, res, err }));
await b.close();
