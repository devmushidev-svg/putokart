// Puto Kart — cliente: pantalla de inicio, sala por link, carrera y resultados.
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { pistaPrueba, pistaGLB, Recorrido } from "./pista.js";
import { crearModelo, animarModelo, Control, AJUSTES, usarPlantilla } from "./kart.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Sonido } from "./sonido.js";
import { FiltroCRT, objetoRetro, uniformes } from "./retro.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ui = $("#ui");
const VUELTAS_SOLO = 3;
const COLORES = ["#e63946", "#2a9df4", "#2ec27e", "#f4c430", "#a05cf0", "#ff8c1a", "#ff5fa2", "#e8e8e8"];

// ================= motor 3D =================
const celular = matchMedia("(pointer: coarse)").matches;
const lienzo = $("#lienzo");
const render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: !celular, powerPreference: "high-performance" });
render.setPixelRatio(Math.min(devicePixelRatio, celular ? 1.25 : 1.75));
render.shadowMap.enabled = !celular;
render.shadowMap.type = THREE.PCFSoftShadowMap;
render.outputColorSpace = THREE.SRGBColorSpace;
render.toneMapping = THREE.ACESFilmicToneMapping;
const escena = new THREE.Scene();
escena.background = (() => {
  const c = document.createElement("canvas"); c.width = 2; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#3f8fe0"); gr.addColorStop(0.55, "#9fd0ff"); gr.addColorStop(1, "#e8f4ff");
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
escena.fog = new THREE.Fog(0xcfe6ff, 160, 520);
const camara = new THREE.PerspectiveCamera(70, 1, 0.4, 900);
escena.add(new THREE.HemisphereLight(0xdcefff, 0x4f7a3a, 1.1));
const sol = new THREE.DirectionalLight(0xfff2d8, 2.4);
sol.position.set(60, 120, 40);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 300 });
escena.add(sol, sol.target);
// estética PS1 + tele CRT (se puede apagar con el botón 📺 o la tecla C)
let retro = leer("kart_retro", "1") === "1";
const crt = new FiltroCRT(render);
function aplicarRetro() {
  uniformes.uSnapOn.value = retro ? 1 : 0;
  render.setPixelRatio(retro ? 1 : Math.min(devicePixelRatio, celular ? 1.25 : 1.75));
  render.shadowMap.enabled = !retro && !celular;
  sol.castShadow = !retro;
  escena.fog.near = retro ? 70 : 160; escena.fog.far = retro ? 330 : 520;
  escena.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
  ajustarTamano();
  const b = document.querySelector("#crt"); if (b) b.classList.toggle("on", retro);
}
function alternarRetro() { retro = !retro; guardar("kart_retro", retro ? "1" : "0"); aplicarRetro(); }
addEventListener("keydown", (e) => { if (e.code === "KeyC" && e.target.tagName !== "INPUT") alternarRetro(); });
function ajustarTamano() {
  render.setSize(innerWidth, innerHeight, false);
  crt.tamano(innerWidth, innerHeight, celular);
  camara.aspect = innerWidth / innerHeight;
  camara.fov = innerWidth < innerHeight ? 82 : 70;
  camara.updateProjectionMatrix();
}
addEventListener("resize", ajustarTamano);
ajustarTamano();

// ================= pista y física =================
let pista = null, recorrido = null, mundo = null, tiposCol = new Map();
await RAPIER.init();
async function cargarPista() {
  if (pista) return;
  // si hay una pista hecha en Blender en /pistas/pista.glb, se usa esa; si no, la de prueba
  try {
    const r = await fetch("/pistas/pista.glb", { method: "HEAD" });
    if (r.ok && (r.headers.get("content-type") || "").includes("gltf")) pista = await pistaGLB("/pistas/pista.glb");
  } catch {}
  if (!pista) pista = pistaPrueba();
  // kart hecho en Blender, si existe
  try {
    const r = await fetch("/modelos/kart.glb", { method: "HEAD" });
    if (r.ok && (r.headers.get("content-type") || "").includes("gltf")) usarPlantilla((await new GLTFLoader().loadAsync("/modelos/kart.glb")).scene);
  } catch {}
  escena.add(pista.grupo);
  objetoRetro(pista.grupo);
  recorrido = new Recorrido(pista.camino);
}
function crearMundo() {
  if (mundo) mundo.free();
  mundo = new RAPIER.World({ x: 0, y: -26, z: 0 });
  tiposCol = new Map();
  for (const c of pista.colisiones) {
    const col = mundo.createCollider(RAPIER.ColliderDesc.trimesh(c.verts, c.idx).setFriction(0).setRestitution(c.tipo === "pared" ? 0.3 : 0));
    tiposCol.set(col.handle, c.tipo);
  }
}
const tipoSuelo = (c) => { const t = tiposCol.get(c.handle); return t === "suelo" || t === "fuera" ? t : null; };

// ================= entrada =================
const teclas = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  teclas.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyM") { Sonido.alternar(); actualizarBotonMudo(); }
});
addEventListener("keyup", (e) => teclas.delete(e.code));
addEventListener("blur", () => teclas.clear());
const tactil = { giro: 0, derrape: false, freno: false, reaparecer: false };
let entradaPrueba = null; // solo para las pruebas automáticas
function leerEntrada() {
  if (entradaPrueba) return { giro: 0, acel: false, freno: false, derrape: false, reaparecer: false, ...entradaPrueba };
  const k = (...c) => c.some((x) => teclas.has(x));
  let giro = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
  let acel = k("KeyW", "ArrowUp"), freno = k("KeyS", "ArrowDown"), derrape = k("Space", "ShiftLeft", "ShiftRight", "KeyK");
  let reaparecer = k("KeyR");
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.15) giro = ax;
    const b = (i) => gp.buttons[i]?.pressed || (gp.buttons[i]?.value || 0) > 0.3;
    acel ||= b(0) || b(7); freno ||= b(1) || b(6); derrape ||= b(5) || b(4) || b(2); reaparecer ||= b(3);
  }
  if (celular) {
    acel = !tactil.freno; // en celular acelera solo
    freno ||= tactil.freno; derrape ||= tactil.derrape; reaparecer ||= tactil.reaparecer;
    if (Math.abs(tactil.giro) > 0.05) giro = tactil.giro;
  }
  return { giro, acel, freno, derrape, reaparecer };
}

// ================= carrera =================
let C = null; // carrera en curso
const remotos = new Map(); // id → { mod, buf: [], cuerpo, nombre, color, p }
let miId = null;

// sombra redonda debajo del kart (barata, y como en los juegos de PS1)
const texSombra = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function nuevoModelo(color, nombre) {
  const m = crearModelo(new THREE.Color(color), nombre);
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false }));
  sombra.position.y = 0.04;
  m.cuerpo.add(sombra);
  objetoRetro(m.g);
  escena.add(m.g);
  return m;
}
function limpiarKarts() {
  for (const r of remotos.values()) escena.remove(r.mod.g);
  remotos.clear();
  if (C?.mod) escena.remove(C.mod.g);
}

async function empezarCarrera({ jugadores, yo, go, vueltas, online, numero }) {
  await cargarPista();
  limpiarKarts();
  crearMundo();
  const lugar = Math.max(0, jugadores.findIndex((j) => j.id === yo));
  const sal = pista.salidas[lugar % pista.salidas.length];
  const yoJ = jugadores[lugar] || { nombre: leer("kart_nombre", "Vos"), color: leer("kart_color", COLORES[0]) };
  const control = new Control(RAPIER, mundo, sal.pos, sal.yaw, tipoSuelo);
  const mod = nuevoModelo(yoJ.color, yoJ.nombre);
  mod.etiqueta.visible = false;
  for (const j of jugadores) {
    if (j.id === yo) continue;
    const s = pista.salidas[jugadores.indexOf(j) % pista.salidas.length];
    const r = { id: j.id, nombre: j.nombre, color: j.color, mod: nuevoModelo(j.color, j.nombre), buf: [], p: -1e9 };
    r.mod.g.position.copy(s.pos).y -= 1;
    r.mod.g.rotation.y = s.yaw;
    // cuerpo que se mueve solo (cinemático) para chocar con los demás
    r.cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s.pos.x, s.pos.y, s.pos.z));
    mundo.createCollider(RAPIER.ColliderDesc.ball(AJUSTES.radio).setRestitution(0.4), r.cuerpo);
    remotos.set(j.id, r);
  }
  const idx = recorrido.cercano(sal.pos);
  const N = recorrido.n;
  C = {
    online, numero, vueltas, go, control, mod, yo, jugadores,
    idx, p: idx > N / 2 ? idx - N : idx, vuelta: 1, terminado: false, tiempo: 0, vueltasT: [], tVuelta: go,
    cuenta: 4, acel0: null, turboCD: new Map(), alReves: 0, ultEnvio: 0, ultHud: 0, eventos: [],
    camPos: null, llegadas: [], miColor: yoJ.color,
  };
  pantallaCarrera();
}

const paso = 1 / 60;
let acumulado = 0;
function actualizarCarrera(dt) {
  const c = C, ct = c.control, ahora = Date.now();
  const antesGo = ahora < c.go;
  let e = leerEntrada();
  // cuenta regresiva: 3, 2, 1, ¡YA! (acelerar justo en el "1" da salida turbo)
  if (antesGo) {
    const s = Math.ceil((c.go - ahora) / 1000);
    if (s !== c.cuenta && s <= 3) { c.cuenta = s; Sonido.cuenta(); avisoGrande(String(s)); }
    if (e.acel && c.acel0 === null) c.acel0 = c.go - ahora;
    if (!e.acel) c.acel0 = null;
    e = { giro: 0, acel: false, freno: false, derrape: false };
  } else if (c.cuenta > 0) {
    c.cuenta = 0; Sonido.ya(); avisoGrande("¡YA!", "ya");
    if (c.acel0 !== null && c.acel0 < 1300 && c.acel0 > 250) { ct.turbo(1.2); Sonido.turbo(); aviso("¡SALIDA TURBO!"); }
  }
  if (c.terminado) e = { giro: 0, acel: false, freno: true, derrape: false };

  // reaparecer (caída o botón)
  const pos = ct.pos;
  if ((e.reaparecer && !c.reapareciendo) || pos.y < -30) {
    const i = (c.idx - 3 + recorrido.n) % recorrido.n, q = recorrido.p[i].clone();
    q.y += 1.5;
    ct.colocar(q, recorrido.direccion(i));
    c.reapareciendo = true;
    setTimeout(() => (c.reapareciendo = false), 800);
  }

  // física con paso fijo
  acumulado += dt;
  let pasos = 0;
  while (acumulado >= paso && pasos++ < 5) {
    ct.paso(paso, e, c.eventos);
    for (const r of remotos.values()) moverRemoto(r, false);
    mundo.step();
    ct.despues(c.eventos);
    acumulado -= paso;
  }
  // turbos de la pista
  const p = ct.pos;
  for (const t of pista.turbos) {
    if (ct.enSuelo && p.distanceTo(t.pos) < t.r + AJUSTES.radio && (c.turboCD.get(t) || 0) < ahora) {
      ct.turbo(1.0); c.eventos.push("turbo"); c.turboCD.set(t, ahora + 900);
    }
  }
  for (const ev of c.eventos.splice(0)) {
    if (ev === "turbo") Sonido.turbo();
    else if (ev === "choque") { Sonido.choque(); sacudir(0.4); }
    else if (ev === "salto") Sonido.salto();
    else if (ev.startsWith("chispa")) Sonido.chispa(+ev.slice(6));
  }

  // progreso en la pista: vueltas y posición
  const N = recorrido.n;
  const ni = recorrido.cercano(p, c.idx);
  let d = ni - c.idx;
  if (d > N / 2) d -= N;
  if (d < -N / 2) d += N;
  c.idx = ni;
  if (!c.reapareciendo) c.p += d;
  const vueltaAhora = Math.floor(c.p / N) + 1;
  if (!c.terminado && vueltaAhora > c.vuelta) {
    c.vueltasT.push(ahora - c.tVuelta); c.tVuelta = ahora;
    if (vueltaAhora > c.vueltas) terminar();
    else { Sonido.vuelta(); avisoGrande(vueltaAhora === c.vueltas ? "¡ÚLTIMA VUELTA!" : `VUELTA ${vueltaAhora}`, "vuelta"); }
  }
  c.vuelta = Math.max(c.vuelta, Math.min(vueltaAhora, c.vueltas));
  // ¿va al revés?
  const dirPista = recorrido.direccion(c.idx);
  const dot = Math.cos(dirPista - ct.rumbo);
  c.alReves = dot < -0.3 && Math.abs(ct.vel) > 4 && !antesGo ? c.alReves + dt : 0;

  // modelo y cámara
  ct.aplicarModelo(c.mod);
  animarModelo(c.mod, dt, { vel: ct.vel, giro: ct.giroVisual, derrape: ct.derrapando ? ct.nivel : 0, dirDerrape: ct.derrapando ? ct.dirDerrape : 0, turbo: ct.tTurbo > 0 });
  for (const r of remotos.values()) moverRemoto(r, true, dt);
  seguirCamara(dt);
  Sonido.motor(Math.abs(ct.vel) / (AJUSTES.velMax * AJUSTES.turbo), e.acel, ct.derrapando ? Math.max(1, ct.nivel) : 0, !c.terminado || Math.abs(ct.vel) > 1);

  // red: mandar mi posición 20 veces por segundo
  if (c.online && ahora - c.ultEnvio > 50) {
    c.ultEnvio = ahora;
    const q = c.mod.g.quaternion, g = c.mod.g.position;
    enviar({ t: "pos", c: c.numero, x: +g.x.toFixed(2), y: +g.y.toFixed(2), z: +g.z.toFixed(2),
      q: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)], v: +ct.vel.toFixed(1), g: +ct.giroVisual.toFixed(2),
      d: ct.derrapando ? ct.nivel : 0, dd: ct.derrapando ? ct.dirDerrape : 0, tb: ct.tTurbo > 0 ? 1 : 0, p: c.terminado ? 1e9 - c.llegada : c.p });
  }
  if (ahora - c.ultHud > 66) { c.ultHud = ahora; actualizarHud(); }
}

function terminar() {
  const c = C;
  c.terminado = true;
  c.tiempo = Date.now() - c.go;
  Sonido.meta();
  avisoGrande("¡META!", "meta");
  if (c.online) enviar({ t: "meta", carrera: c.numero, tiempo: c.tiempo });
  else {
    const mejor = +leer("kart_mejor", 0);
    if (!mejor || c.tiempo < mejor) guardar("kart_mejor", c.tiempo);
    const mv = Math.min(...c.vueltasT);
    const mejorV = +leer("kart_mejor_vuelta", 0);
    if (!mejorV || mv < mejorV) guardar("kart_mejor_vuelta", mv);
    setTimeout(() => resultadosSolo(), 2200);
  }
}

// karts de los demás: se dibujan 100 ms "en el pasado" para que se muevan suave
const tmpQ = new THREE.Quaternion();
function moverRemoto(r, dibujar, dt = 0) {
  const t = performance.now() - 110;
  const b = r.buf;
  while (b.length > 2 && b[1].tl <= t) b.shift();
  if (!b.length) return;
  let a = b[0], z = b[1] || b[0];
  const k = z === a ? 1 : THREE.MathUtils.clamp((t - a.tl) / (z.tl - a.tl), 0, 1.15);
  const x = a.x + (z.x - a.x) * k, y = a.y + (z.y - a.y) * k, zz = a.z + (z.z - a.z) * k;
  if (!dibujar) { r.cuerpo.setNextKinematicTranslation({ x, y: y + AJUSTES.radio, z: zz }); return; }
  r.mod.g.position.set(x, y, zz);
  tmpQ.set(...a.q).slerp(new THREE.Quaternion(...z.q), Math.min(1, k));
  r.mod.g.quaternion.copy(tmpQ);
  animarModelo(r.mod, dt, { vel: z.v, giro: z.g, derrape: z.d, dirDerrape: z.dd, turbo: !!z.tb });
  r.p = z.p;
}

// cámara detrás del kart, se aleja un poco con la velocidad y se abre en el turbo
const camObj = new THREE.Vector3(), camMira = new THREE.Vector3();
let temblor = 0;
function sacudir(f) { temblor = Math.max(temblor, f); }
function seguirCamara(dt) {
  const ct = C.control, g = C.mod.g.position;
  const f = ct.adelante(), velN = Math.abs(ct.vel) / AJUSTES.velMax;
  const lejos = 7 + velN * 1.8, alto = 3 + velN * 0.4;
  camObj.copy(g).addScaledVector(f, -lejos).add(new THREE.Vector3(0, alto, 0));
  // en el derrape la cámara se corre un poco al costado

  if (!C.camPos) C.camPos = camObj.clone();
  C.camPos.lerp(camObj, 1 - Math.exp(-7 * dt));
  camara.position.copy(C.camPos);
  if (temblor > 0) { camara.position.x += (Math.random() - 0.5) * temblor; camara.position.y += (Math.random() - 0.5) * temblor; temblor = Math.max(0, temblor - dt * 2); }
  camMira.copy(g).addScaledVector(f, 4).y += 1.3;
  camara.lookAt(camMira);
  const fovObj = (innerWidth < innerHeight ? 82 : 70) + (ct.tTurbo > 0 ? 12 : 0) + velN * 4;
  camara.fov += (fovObj - camara.fov) * (1 - Math.exp(-4 * dt));
  camara.updateProjectionMatrix();
  sol.position.copy(g).add(new THREE.Vector3(60, 120, 40));
  sol.target.position.copy(g);
}

// posiciones: los que llegaron, por orden de llegada; los demás, por cuánto avanzaron
function ranking() {
  const c = C;
  const lista = [{ id: c.yo, p: c.terminado ? Infinity : c.p }, ...[...remotos.values()].map((r) => ({ id: r.id, p: r.p }))];
  const lleg = c.llegadas.map((l) => l.id);
  return lista.sort((a, b) => {
    const la = lleg.indexOf(a.id), lb = lleg.indexOf(b.id);
    if (la >= 0 || lb >= 0) return (la < 0 ? 99 : la) - (lb < 0 ? 99 : lb);
    return b.p - a.p;
  });
}

// ================= pantallas =================
const fmt = (ms) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`; };
const ordinal = (n) => n + "º";

function pantallaCarrera() {
  ui.innerHTML = `
    <div class="hud">
      <div class="hud-pos"><b id="h-pos">1º</b><span id="h-de">/1</span></div>
      <div class="hud-der"><div class="hud-vuelta" id="h-vuelta">VUELTA 1/3</div><div class="hud-tiempo" id="h-tiempo">0:00.00</div></div>
      <canvas id="minimapa" width="180" height="180"></canvas>
      <div class="hud-vel"><b id="h-vel">0</b><small>km/h</small><div class="barra-turbo"><i id="h-turbo"></i></div></div>
      <div id="aviso" class="aviso"></div><div id="aviso-grande" class="aviso-grande"></div>
      <button class="btn-chico mudo" id="mudo">${Sonido.mudo ? "🔇" : "🔊"}</button>
      <button class="btn-chico crt ${retro ? "on" : ""}" id="crt" title="filtro de tele (C)">📺</button>
      ${celular ? `<div class="tactil">
        <div class="zona-giro" id="zona-giro"><div class="palanca"><i id="perilla"></i></div></div>
        <button class="btn-t derrape" id="t-derrape">DERRAPE</button>
        <button class="btn-t freno" id="t-freno">FRENO</button>
        <button class="btn-t reaparecer" id="t-reap">↺</button></div>` : `<div class="ayuda-teclas">W/↑ acelerar · S/↓ frenar · A D/← → doblar · ESPACIO derrapar (soltalo para el turbo) · R reaparecer</div>`}
    </div>`;
  $("#mudo").onclick = () => { Sonido.alternar(); actualizarBotonMudo(); };
  $("#crt").onclick = alternarRetro;
  prepararMinimapa();
  if (celular) controlesTactiles();
}
function actualizarBotonMudo() { const b = $("#mudo"); if (b) b.textContent = Sonido.mudo ? "🔇" : "🔊"; }

function controlesTactiles() {
  const zona = $("#zona-giro"), perilla = $("#perilla");
  let id = null, x0 = 0;
  zona.addEventListener("pointerdown", (e) => { id = e.pointerId; x0 = e.clientX; zona.setPointerCapture(id); });
  zona.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    tactil.giro = THREE.MathUtils.clamp((e.clientX - x0) / 55, -1, 1);
    perilla.style.transform = `translateX(${tactil.giro * 40}px)`;
  });
  const soltar = (e) => { if (e.pointerId !== id) return; id = null; tactil.giro = 0; perilla.style.transform = ""; };
  zona.addEventListener("pointerup", soltar); zona.addEventListener("pointercancel", soltar);
  const boton = (sel, k) => {
    const b = $(sel);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); tactil[k] = true; b.classList.add("on"); });
    const off = () => { tactil[k] = false; b.classList.remove("on"); };
    b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
  };
  boton("#t-derrape", "derrape"); boton("#t-freno", "freno"); boton("#t-reap", "reaparecer");
}

let mapa = null;
function prepararMinimapa() {
  const cv = $("#minimapa"), g = cv.getContext("2d");
  const xs = recorrido.p.map((p) => p.x), zs = recorrido.p.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const esc_ = 160 / Math.max(maxX - minX, maxZ - minZ);
  const aPx = (p) => [10 + (p.x - minX) * esc_ + (160 - (maxX - minX) * esc_) / 2, 10 + (p.z - minZ) * esc_ + (160 - (maxZ - minZ) * esc_) / 2];
  mapa = { cv, g, aPx };
}
function dibujarMinimapa() {
  const { cv, g, aPx } = mapa;
  g.clearRect(0, 0, cv.width, cv.height);
  g.lineWidth = 9; g.lineJoin = "round"; g.strokeStyle = "#0008";
  g.beginPath(); recorrido.p.forEach((p, i) => { const [x, y] = aPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
  g.lineWidth = 5; g.strokeStyle = "#fffd"; g.stroke();
  const punto = (pos, color, grande) => { const [x, y] = aPx(pos); g.fillStyle = color; g.strokeStyle = "#000"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, grande ? 6 : 4.5, 0, 7); g.fill(); g.stroke(); };
  for (const r of remotos.values()) punto(r.mod.g.position, r.color, false);
  punto(C.mod.g.position, C.miColor, true);
}

function actualizarHud() {
  const c = C;
  if (!$("#h-pos")) return;
  const rk = ranking();
  const mi = rk.findIndex((x) => x.id === c.yo) + 1;
  $("#h-pos").textContent = ordinal(mi);
  $("#h-de").textContent = "/" + rk.length;
  $("#h-vuelta").textContent = c.terminado ? "¡TERMINASTE!" : `VUELTA ${c.vuelta}/${c.vueltas}`;
  const t = c.terminado ? c.tiempo : Date.now() - c.go;
  $("#h-tiempo").textContent = Date.now() < c.go ? "0:00.00" : fmt(t);
  $("#h-vel").textContent = Math.round(Math.abs(c.control.vel) * 3.6);
  const tb = c.control.tTurbo > 0 ? 1 : c.control.derrapando ? c.control.tDerrape / AJUSTES.nivelesDerrape[2] : 0;
  const barra = $("#h-turbo");
  barra.style.width = Math.min(100, tb * 100) + "%";
  barra.className = c.control.tTurbo > 0 ? "turbo" : "n" + c.control.nivel;
  aviso(c.alReves > 1 ? "¡VAS AL REVÉS!" : null, true);
  dibujarMinimapa();
}
let avisoT = 0;
function aviso(texto, fijo = false) {
  const a = $("#aviso");
  if (!a) return;
  if (texto) { a.textContent = texto; a.classList.add("on"); if (!fijo) { avisoT = Date.now() + 1500; } }
  else if (Date.now() > avisoT) a.classList.remove("on");
}
function avisoGrande(texto, clase = "") {
  const a = $("#aviso-grande");
  if (!a) return;
  a.textContent = texto;
  a.className = "aviso-grande " + clase;
  void a.offsetWidth;
  a.classList.add("on");
}

function resultadosSolo() {
  const c = C;
  const mejor = +leer("kart_mejor", 0), mv = +leer("kart_mejor_vuelta", 0);
  ui.insertAdjacentHTML("beforeend", `<div class="modal"><div class="caja">
    <h2>¡Terminaste!</h2>
    <div class="tiempo-grande">${fmt(c.tiempo)}</div>
    <table class="tabla">${c.vueltasT.map((t, i) => `<tr><td>Vuelta ${i + 1}</td><td>${fmt(t)}</td></tr>`).join("")}
      <tr class="sep"><td>Tu récord</td><td>${fmt(mejor)}</td></tr><tr><td>Mejor vuelta</td><td>${fmt(mv)}</td></tr></table>
    <button class="boton" id="otra">Otra vez</button><button class="boton sec" id="salir">Salir</button></div></div>`);
  $("#otra").onclick = () => practicar();
  $("#salir").onclick = () => (location.href = "/");
}

function resultadosOnline(sala) {
  const c = C;
  const nombre = (id) => sala.jugadores.find((j) => j.id === id)?.nombre || "?";
  const color = (id) => sala.jugadores.find((j) => j.id === id)?.color || "#fff";
  const llegados = sala.llegadas;
  const faltan = sala.jugadores.filter((j) => !llegados.some((l) => l.id === j.id));
  $(".modal")?.remove();
  ui.insertAdjacentHTML("beforeend", `<div class="modal"><div class="caja">
    <h2>Resultados</h2>
    <table class="tabla resultados">${llegados.map((l, i) => `<tr class="${l.id === miId ? "yo" : ""}"><td>${ordinal(i + 1)}</td>
      <td><i class="chip" style="background:${color(l.id)}"></i>${esc(nombre(l.id))}</td><td>${fmt(l.tiempo)}</td></tr>`).join("")}
      ${faltan.map((j) => `<tr class="${j.id === miId ? "yo" : ""}"><td>—</td><td><i class="chip" style="background:${j.color}"></i>${esc(j.nombre)}</td><td>no llegó</td></tr>`).join("")}</table>
    ${sala.host === miId ? `<button class="boton" id="otra">Otra carrera</button><button class="boton sec" id="volver">Volver a la sala</button>`
      : `<div class="ayuda">esperando que ${esc(nombre(sala.host))} arranque otra…</div>`}
    <button class="boton sec" id="salir">Salir</button></div></div>`);
  $("#otra") && ($("#otra").onclick = () => { Sonido.clic(); enviar({ t: "empezar" }); });
  $("#volver") && ($("#volver").onclick = () => { Sonido.clic(); enviar({ t: "volver" }); });
  $("#salir").onclick = () => (location.href = "/");
}

// ================= vista de fondo (inicio y sala) =================
let vuelo = 0;
function vistaFondo(dt) {
  if (!recorrido) return;
  vuelo += dt * 0.012;
  const n = recorrido.n, i = Math.floor((vuelo % 1) * n), a = recorrido.p[i], b = recorrido.p[(i + 25) % n];
  camara.position.lerp(new THREE.Vector3(a.x, a.y + 14, a.z).add(new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(18)), 1 - Math.exp(-2 * dt));
  camara.lookAt(b.x, b.y + 2, b.z);
  sol.position.set(a.x + 60, 120, a.z + 40); sol.target.position.copy(a);
  for (const r of remotos.values()) animarModelo(r.mod, dt, {});
}

function pantallaInicio() {
  ui.innerHTML = `<div class="inicio"><div class="caja">
    <h1 class="logo">PUTO<span>KART</span></h1>
    <input id="nombre" maxlength="16" placeholder="tu nombre" value="${esc(leer("kart_nombre", ""))}">
    <button class="boton" id="crear">Crear sala</button>
    <button class="boton sec" id="solo">Practicar solo</button>
    <button class="btn-chico crt ${retro ? "on" : ""}" id="crt">📺 filtro de tele</button>
    <div class="ayuda">Creás una sala y le pasás el link a tus amigos (hasta 8).</div></div></div>`;
  const nombre = () => { const n = $("#nombre").value.trim(); if (!n) { $("#nombre").focus(); Sonido.error(); return null; } guardar("kart_nombre", n); return n; };
  $("#crear").onclick = async () => {
    if (!nombre()) return;
    Sonido.clic();
    const { id } = await (await fetch("/api/crear", { method: "POST" })).json();
    location.href = "/s/" + id;
  };
  $("#solo").onclick = () => { if (nombre()) location.href = "/solo"; };
  $("#crt").onclick = alternarRetro;
}

function practicar() {
  const n = leer("kart_nombre", "Vos");
  empezarCarrera({ jugadores: [{ id: "yo", nombre: n, color: leer("kart_color", COLORES[0]) }], yo: "yo", go: Date.now() + 3600, vueltas: VUELTAS_SOLO, online: false });
}

// ================= sala online =================
let ws = null, sala = null, desfase = 0, salaId = "";
function enviar(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); }

function conectar() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${salaId}`);
  ws.onopen = () => enviar({ t: "hola", nombre: leer("kart_nombre", ""), token: leer("kart_tok_" + salaId, null) });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.t === "bienvenido") { miId = d.id; if (d.token) guardar("kart_tok_" + salaId, d.token); }
    else if (d.t === "sala") recibirSala(d);
    else if (d.t === "pos") {
      const r = remotos.get(d.id);
      if (r && C && d.c === C.numero) { d.tl = performance.now(); r.buf.push(d); if (r.buf.length > 30) r.buf.shift(); }
    }
  };
  ws.onclose = () => setTimeout(conectar, 1500);
}

function recibirSala(d) {
  desfase = d.ahora - Date.now();
  const antes = sala;
  sala = d;
  if (d.fase === "carrera" && (!C || C.numero !== d.carrera)) {
    $(".modal")?.remove();
    empezarCarrera({ jugadores: d.jugadores, yo: miId, go: d.inicio - desfase, vueltas: d.vueltas, online: true, numero: d.carrera });
    return;
  }
  if (C && C.online) {
    C.llegadas = d.llegadas;
    if (d.fase === "resultados") { if (antes?.fase !== "resultados" || !$(".modal")) resultadosOnline(d); return; }
    if (d.fase === "carrera") return;
    C = null; // volvió a la sala
  }
  if (!miId && !leer("kart_nombre", "")) return pedirNombre();
  pantallaSala();
}

function pedirNombre() {
  ui.innerHTML = `<div class="inicio"><div class="caja"><h1 class="logo">PUTO<span>KART</span></h1>
    <div class="ayuda">Te invitaron a una carrera</div>
    <input id="nombre" maxlength="16" placeholder="tu nombre"><button class="boton" id="entrar">Entrar</button></div></div>`;
  $("#entrar").onclick = () => {
    const n = $("#nombre").value.trim();
    if (!n) return Sonido.error();
    guardar("kart_nombre", n);
    enviar({ t: "hola", nombre: n, token: leer("kart_tok_" + salaId, null) });
  };
}

async function pantallaSala() {
  await cargarPista();
  // los karts de la sala, en la largada
  const ids = new Set(sala.jugadores.map((j) => j.id));
  for (const [id, r] of remotos) if (!ids.has(id) || r.color !== sala.jugadores.find((j) => j.id === id)?.color) { escena.remove(r.mod.g); remotos.delete(id); }
  sala.jugadores.forEach((j, i) => {
    if (remotos.has(j.id)) return;
    const s = pista.salidas[i % pista.salidas.length];
    const r = { id: j.id, nombre: j.nombre, color: j.color, mod: nuevoModelo(j.color, j.nombre), buf: [], p: 0 };
    r.mod.g.position.copy(s.pos).y -= 1;
    r.mod.g.rotation.y = s.yaw;
    remotos.set(j.id, r);
  });
  const link = location.origin + "/s/" + salaId;
  const soyHost = sala.host === miId;
  const yo = sala.jugadores.find((j) => j.id === miId);
  ui.innerHTML = `<div class="sala"><div class="caja">
    <h1 class="logo chico">PUTO<span>KART</span></h1>
    <div class="link"><span>${esc(link)}</span><button class="btn-chico" id="copiar">Copiar</button>
      <a class="btn-chico wa" target="_blank" href="https://wa.me/?text=${encodeURIComponent("¡Carrera en Puto Kart! " + link)}">WhatsApp</a></div>
    <ul class="jugadores">${sala.jugadores.map((j) => `<li class="${j.conectado ? "" : "off"}"><i class="chip" style="background:${j.color}"></i>${esc(j.nombre)}
      ${j.id === sala.host ? '<small>anfitrión</small>' : ""}${j.id === miId ? '<small>vos</small>' : ""}</li>`).join("")}</ul>
    ${yo ? `<div class="colores">${COLORES.map((c) => `<button class="color ${yo.color === c ? "on" : ""}" style="background:${c}" data-c="${c}"
      ${sala.jugadores.some((j) => j.color === c && j.id !== miId) ? "disabled" : ""}></button>`).join("")}</div>` : '<div class="ayuda">La sala está llena: mirás como espectador.</div>'}
    ${soyHost ? `<button class="boton" id="empezar">¡Empezar carrera!</button>` : `<div class="ayuda">Esperando que el anfitrión arranque…</div>`}
    <div class="ayuda">${sala.vueltas} vueltas · ${esc(pista.nombre)}</div></div></div>`;
  $("#copiar").onclick = () => { navigator.clipboard?.writeText(link); $("#copiar").textContent = "¡Copiado!"; };
  $("#empezar") && ($("#empezar").onclick = () => { Sonido.clic(); enviar({ t: "empezar" }); });
  ui.querySelectorAll(".color").forEach((b) => (b.onclick = () => { guardar("kart_color", b.dataset.c); enviar({ t: "color", color: b.dataset.c }); }));
}

// ================= bucle principal =================
const reloj = new THREE.Clock();
function bucle() {
  requestAnimationFrame(bucle);
  const dt = Math.min(0.05, reloj.getDelta());
  if (C) actualizarCarrera(dt); else vistaFondo(dt);
  if (retro) crt.dibujar(escena, camara, performance.now() / 1000);
  else render.render(escena, camara);
}

// ================= arranque =================
const ruta = location.pathname;
await cargarPista();
aplicarRetro();
if (ruta.startsWith("/s/")) { salaId = ruta.slice(3).replace(/\/$/, ""); ui.innerHTML = '<div class="inicio"><div class="caja"><h1 class="logo">PUTO<span>KART</span></h1><div class="ayuda">conectando…</div></div></div>'; conectar(); }
else if (ruta.startsWith("/solo")) practicar();
else pantallaInicio();
bucle();
// para pruebas: avanzar la simulación sin esperar a que dibuje
window.__kart = { get C() { return C; }, get remotos() { return remotos; }, get recorrido() { return recorrido; },
  entrada(e) { entradaPrueba = e; }, avanzar(seg) { for (let i = 0; i < seg * 60; i++) actualizarCarrera(1 / 60); } };
