// Puto Kart — cliente: pantalla de inicio, sala por link, carrera (con bots e ítems) y resultados.
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { pistaPrueba, pistaGLB, Recorrido } from "./pista.js";
import { crearModelo, animarModelo, Control, AJUSTES, usarPlantilla } from "./kart.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Sonido } from "./sonido.js";
import { FiltroCRT, objetoRetro, uniformes } from "./retro.js";
import { Particulas, LineasVelocidad, Marcas } from "./efectos.js";
import { Items, ICONOS, CANTIDAD } from "./items.js";
import { Bot } from "./ia.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ui = $("#ui");
const VUELTAS_SOLO = 3;
const COLORES = ["#e63946", "#2a9df4", "#2ec27e", "#f4c430", "#a05cf0", "#ff8c1a", "#ff5fa2", "#e8e8e8"];
const BOTS = ["Tun", "Mauro", "Cruit", "Coco", "Chance", "Panamá", "Verity"];

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
const particulas = new Particulas(escena);
const lineas = new LineasVelocidad(escena);
let zoomVel = 0; // desenfoque radial del filtro CRT
const marcas = new Marcas(escena);
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
let pista = null, recorrido = null, mundo = null, tiposCol = new Map(), items = null;
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
  items = new Items(escena, pista, recorrido, particulas, fisicaItems, Sonido, objetoRetro);
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
// rayos para los ítems: altura del piso y paredes
const fisicaItems = {
  suelo(pos) {
    if (!mundo) return null;
    const h = mundo.castRay(new RAPIER.Ray({ x: pos.x, y: pos.y + 2.5, z: pos.z }, { x: 0, y: -1, z: 0 }), 8, true, undefined, undefined, undefined, undefined, (c) => !!tipoSuelo(c));
    return h ? pos.y + 2.5 - h.timeOfImpact : null;
  },
  pared(pos, dir, largo) {
    if (!mundo) return null;
    const h = mundo.castRayAndGetNormal(new RAPIER.Ray({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: dir.x, y: 0, z: dir.z }), largo, true, undefined, undefined, undefined, undefined, (c) => tiposCol.get(c.handle) === "pared");
    return h ? { normal: h.normal, dist: h.timeOfImpact } : null;
  },
};

// ================= entrada =================
const teclas = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  teclas.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyM") { Sonido.alternar(); actualizarBotonMudo(); }
});
addEventListener("keyup", (e) => teclas.delete(e.code));
addEventListener("blur", () => teclas.clear());
const tactil = { giro: 0, derrape: false, freno: false, reaparecer: false, item: false };
let entradaPrueba = null; // solo para las pruebas automáticas
function leerEntrada() {
  if (entradaPrueba) return { giro: 0, acel: false, freno: false, derrape: false, reaparecer: false, item: false, ...entradaPrueba };
  const k = (...c) => c.some((x) => teclas.has(x));
  let giro = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
  let acel = k("KeyW", "ArrowUp"), freno = k("KeyS", "ArrowDown"), derrape = k("ShiftLeft", "ShiftRight");
  let reaparecer = k("KeyR"), item = k("Space", "KeyE");
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.15) giro = ax;
    const b = (i) => gp.buttons[i]?.pressed || (gp.buttons[i]?.value || 0) > 0.3;
    // como Mario Kart: A acelera, B frena, R derrapa, L tira el ítem
    acel ||= b(0) || b(7); freno ||= b(1) || b(6); derrape ||= b(5); item ||= b(4) || b(2); reaparecer ||= b(3);
    if ((gp.axes[1] || 0) > 0.6) freno ||= false;
  }
  if (celular) {
    acel = !tactil.freno; // en celular acelera solo
    freno ||= tactil.freno; derrape ||= tactil.derrape; reaparecer ||= tactil.reaparecer; item ||= tactil.item;
    if (Math.abs(tactil.giro) > 0.05) giro = tactil.giro;
  }
  return { giro, acel, freno, derrape, reaparecer, item };
}

// ================= carrera =================
// C.pilotos = karts que simula esta compu (yo + bots). Los de otros jugadores están en "remotos".
let C = null;
const remotos = new Map(); // id → { mod, buf: [], cuerpo, nombre, color, p }
let miId = null;
let pausaImpacto = 0; // congela la simulación un instante en los golpes fuertes

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
  for (const p of C?.pilotos || []) escena.remove(p.mod.g);
}

function nuevoPiloto(j, salida, bot) {
  const control = new Control(RAPIER, mundo, salida.pos, salida.yaw, tipoSuelo);
  const mod = nuevoModelo(j.color, j.nombre);
  const idx = recorrido.cercano(salida.pos), N = recorrido.n;
  return {
    id: j.id, nombre: j.nombre, color: j.color, control, mod, bot, eventos: [],
    idx, p: idx > N / 2 ? idx - N : idx, vuelta: 1, vueltasT: [], tVuelta: 0, terminado: false, tiempo: 0,
    item: null, ruleta: 0, itemFuturo: null, fraccion: 0.5, itemAntes: false, turboCD: new Map(), rebufo: 0, reapareciendo: false,
  };
}

// modo: "online" | "bots" | "reloj"
async function empezarCarrera({ jugadores, yo, go, vueltas, modo, numero }) {
  await cargarPista();
  limpiarKarts();
  crearMundo();
  items.limpiar();
  items.prefijo = modo === "online" ? miId : "l";
  items.red = modo === "online" ? enviar : null;
  const pilotos = [];
  jugadores.forEach((j, i) => {
    const sal = pista.salidas[i % pista.salidas.length];
    if (j.id === yo || j.bot) {
      const p = nuevoPiloto(j, sal, j.bot ? new Bot(0.9 + Math.random() * 0.09) : null);
      p.tVuelta = go;
      pilotos.push(p);
      return;
    }
    // kart de otro jugador
    const r = { id: j.id, nombre: j.nombre, color: j.color, mod: nuevoModelo(j.color, j.nombre), buf: [], p: -1e9, pos: sal.pos.clone() };
    r.mod.g.position.copy(sal.pos).y -= 1;
    r.mod.g.rotation.y = sal.yaw;
    // cuerpo que se mueve solo (cinemático) para chocar con los demás
    r.cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(sal.pos.x, sal.pos.y, sal.pos.z));
    mundo.createCollider(RAPIER.ColliderDesc.ball(AJUSTES.radio).setRestitution(0.4), r.cuerpo);
    remotos.set(j.id, r);
  });
  const yoP = pilotos.find((p) => p.id === yo);
  yoP.mod.etiqueta.visible = false;
  C = {
    modo, online: modo === "online", numero, vueltas, go, yo: yoP, pilotos,
    cuenta: 4, acel0: null, alReves: 0, ultEnvio: 0, ultHud: 0, camPos: null, llegadas: [], orden: [], posAntes: 0,
    finSolo: 0,
  };
  pantallaCarrera();
}

const paso = 1 / 60;
let acumulado = 0;
function actualizarCarrera(dt) {
  const c = C, ahora = Date.now();
  const antesGo = ahora < c.go;
  const yo = c.yo;
  // cuenta regresiva: 3, 2, 1, ¡YA! (acelerar justo en el "1" da salida turbo)
  let e = leerEntrada();
  if (antesGo) {
    const s = Math.ceil((c.go - ahora) / 1000);
    if (s !== c.cuenta && s <= 3) { c.cuenta = s; Sonido.cuenta(); avisoGrande(String(s)); }
    if (e.acel && c.acel0 === null) c.acel0 = c.go - ahora;
    if (!e.acel) c.acel0 = null;
  } else if (c.cuenta > 0) {
    c.cuenta = 0; Sonido.ya(); avisoGrande("¡YA!", "ya");
    if (c.acel0 !== null && c.acel0 < 1300 && c.acel0 > 250) { yo.control.turbo(1.2); Sonido.turbo(); aviso("¡SALIDA TURBO!"); }
    for (const p of c.pilotos) if (p.bot && Math.random() < 0.5) p.control.turbo(0.8 + Math.random() * 0.5);
  }
  // entradas de todos los pilotos locales
  const rk = ranking();
  const total = rk.length;
  rk.forEach((r, i) => { const p = c.pilotos.find((x) => x.id === r.id); if (p) p.fraccion = total > 1 ? i / (total - 1) : 0.5; });
  const otrosDe = (p) => [...c.pilotos.filter((x) => x !== p), ...remotos.values()].map((x) => ({ p: x.p }));
  const entradas = new Map();
  for (const p of c.pilotos) {
    let en;
    if (antesGo) en = { giro: 0, acel: false, freno: false, derrape: false };
    else if (p.bot) {
      const goma = p.p - yo.p > 150 ? 0.87 : p.p - yo.p > 60 ? 0.94 : yo.p - p.p > 150 ? 1.08 : yo.p - p.p > 60 ? 1.03 : 1;
      en = p.bot.pensar(dt, p, recorrido, otrosDe(p), c.modo === "bots" ? goma : 1);
      if (p.terminado) en = { giro: en.giro, acel: Math.abs(p.control.vel) < 12, freno: false, derrape: false };
    } else if (p.terminado) {
      // ya cruzó la meta: maneja solo, tranquilo (como en Mario Kart)
      p.auto ||= new Bot(0.55);
      en = { ...p.auto.pensar(dt, { ...p, item: null }, recorrido, [], 1), usar: false, derrape: false };
    } else en = e;
    entradas.set(p, en);
    // usar ítem (al apretar, no al mantener)
    const quiere = p.bot ? en.usar : en.item;
    if (quiere && !p.itemAntes && p.item && !p.ruleta && !antesGo && p.control.tGolpe <= 0) {
      items.usar(p, p.bot ? en.atras : en.freno, objetivoDe);
      if (!p.bot) actualizarItemHud(true);
    }
    p.itemAntes = !!quiere;
    // reaparecer (caída o botón)
    if (((en.reaparecer && !p.reapareciendo) || p.control.pos.y < -30) && !antesGo) reaparecer(p);
  }

  // física con paso fijo
  acumulado += dt;
  let pasos = 0;
  while (acumulado >= paso && pasos++ < 5) {
    for (const p of c.pilotos) p.control.paso(paso, entradas.get(p), p.eventos);
    for (const r of remotos.values()) moverRemoto(r, false);
    mundo.step();
    for (const p of c.pilotos) p.control.despues(p.eventos);
    acumulado -= paso;
  }

  for (const p of c.pilotos) {
    const k = p.control, pos = k.pos;
    // turbos de la pista
    for (const t of pista.turbos) {
      if (k.enSuelo && pos.distanceTo(t.pos) < t.r + AJUSTES.radio && (p.turboCD.get(t) || 0) < ahora) {
        k.turbo(1.0); p.eventos.push("turbo"); p.turboCD.set(t, ahora + 900);
      }
    }
    // rebufo: ir pegado detrás de otro carga un turbo
    if (!antesGo && Math.abs(k.vel) > 20) {
      const f = k.adelante();
      const pegado = todosLosKarts().some((o) => {
        if (o.id === p.id) return false;
        const d = o.pos.clone().sub(pos), dist = d.length();
        return dist > 2.5 && dist < 16 && d.normalize().dot(f) > 0.97;
      });
      p.rebufo = pegado ? p.rebufo + dt : Math.max(0, p.rebufo - dt * 2);
      if (p.rebufo > 1.1) { k.turbo(0.9); p.rebufo = 0; p.eventos.push("rebufo"); }
    } else p.rebufo = 0;
    // ruleta del ítem
    if (p.ruleta > 0) {
      p.ruleta -= dt;
      if (p.ruleta <= 0) { p.ruleta = 0; p.item = p.itemFuturo; if (!p.bot) { Sonido.item(); actualizarItemHud(true); } }
    }
    progreso(p, ahora);
  }
  // estrella: chocar a otros los hace girar
  for (const p of c.pilotos) {
    if (p.control.tEstrella <= 0) continue;
    const pos = p.control.pos;
    for (const o of c.pilotos) if (o !== p && o.control.pos.distanceToSquared(pos) < 2.4 * 2.4) golpear(o, "estrella");
    for (const r of remotos.values()) if (r.pos.distanceToSquared(pos) < 2.4 * 2.4 && !(r.golpeadoHasta > ahora)) {
      r.golpeadoHasta = ahora + 1500; enviar({ t: "ev", k: "golpe", a: r.id });
    }
  }
  items.actualizar(dt, c.pilotos, todosLosKarts(), golpear);

  // sonidos y efectos de los eventos de cada kart (los de los bots solo si están cerca)
  for (const p of c.pilotos) {
    const cerca = p === yo || p.control.pos.distanceTo(camara.position) < 40;
    for (const ev of p.eventos.splice(0)) {
      if (!cerca) continue;
      const pos = p.control.pos;
      if (ev === "turbo") { if (p === yo) Sonido.turbo(); particulas.emitir(pos, 6, { color: 0xffa020, tam: 0.6, vida: 0.4, dispersion: 1.5 }); }
      else if (ev === "choque") { Sonido.choque(); if (p === yo) { sacudir(0.45); pausaImpacto = 0.06; } particulas.emitir(pos.clone().addScaledVector(p.control.adelante(), 1.2), 10, { color: 0xffe08a, tam: 0.25, dispersion: 5, vida: 0.35, crece: 0, gravedad: 10, alfa: 1 }); }
      else if (ev === "salto") { if (p === yo) Sonido.salto(); }
      else if (ev.startsWith("chispa")) { if (p === yo) Sonido.chispa(+ev.slice(6)); }
      else if (ev === "truco") { Sonido.truco(); if (p === yo) aviso("¡TRUCO!"); }
      else if (ev === "aterriza") { if (p === yo) { Sonido.aterriza(); sacudir(0.25); } particulas.emitir(pos.clone().setY(pos.y - 0.5), 14, { color: 0xc9b79a, tam: 0.9, vida: 0.6, dispersion: 3, crece: 2 }); }
      else if (ev === "rebufo") { if (p === yo) { Sonido.rebufo(); aviso("¡REBUFO!"); } }
    }
  }

  // modelos, efectos y cámara
  for (const p of c.pilotos) {
    const k = p.control;
    k.aplicarModelo(p.mod);
    animarModelo(p.mod, dt, { vel: k.vel, giro: k.giroVisual, derrape: k.derrapando ? k.nivel : 0, dirDerrape: k.derrapando ? k.dirDerrape : 0, turbo: k.tTurbo > 0, estrella: k.tEstrella > 0 });
    efectosKart(p.id, p.mod, { vel: k.vel, derrape: k.derrapando && k.enSuelo, nivel: k.nivel, fuera: k.enSuelo && k.tipoSuelo === "fuera", turbo: k.tTurbo > 0, rebufo: p.rebufo, estrella: k.tEstrella > 0 }, dt);
  }
  for (const r of remotos.values()) moverRemoto(r, true, dt);
  particulas.actualizar(dt);
  const yk = yo.control;
  const velN = Math.abs(yk.vel) / AJUSTES.velMax;
  // velocidad en pantalla: rayas anime + desenfoque radial; naranja con turbo, arcoíris con estrella, celeste con rebufo
  // El turbo pasa casi todo el tiempo (derrapes, flechas, rebufo), así que no se marca entero:
  // solo un golpe corto de rayas cuando arranca, que se apaga en medio segundo. Fijo, solo con la estrella.
  if (yk.tTurbo > 0 && !C.turboAntes) C.pulso = Math.min(1, 0.45 + yk.tTurbo * 0.25);
  C.turboAntes = yk.tTurbo > 0;
  C.pulso = (C.pulso || 0) * Math.exp(-3.5 * dt);
  let intV = C.pulso * 0.55, colV = 0xffffff, bordeV = 0xffffff;
  if (yk.tTurbo > 0) colV = 0xffe9a8;
  if (yk.tEstrella > 0) { intV = Math.max(intV, 0.4); const t = performance.now() / 400; colV = new THREE.Color().setHSL(t % 1, 1, 0.75); bordeV = new THREE.Color().setHSL((t + 0.3) % 1, 1, 0.55); }
  if (!yk.enSuelo || antesGo) intV *= 0.5;
  lineas.actualizar(dt, Math.min(0.55, intV), colV, bordeV);
  zoomVel += (C.pulso * 0.35 - zoomVel) * (1 - Math.exp(-8 * dt));
  seguirCamara(dt);
  Sonido.motor(Math.abs(yk.vel) / (AJUSTES.velMax * AJUSTES.turbo), e.acel, yk.derrapando ? Math.max(1, yk.nivel) : 0, !yo.terminado || Math.abs(yk.vel) > 1);
  // ¿va al revés?
  const dot = Math.cos(recorrido.direccion(yo.idx) - yk.rumbo);
  c.alReves = dot < -0.3 && Math.abs(yk.vel) > 4 && !antesGo ? c.alReves + dt : 0;

  // red: mandar mi posición 20 veces por segundo (con mis caparazones)
  if (c.online && ahora - c.ultEnvio > 50) {
    c.ultEnvio = ahora;
    const q = yo.mod.g.quaternion, g = yo.mod.g.position;
    const msg = { t: "pos", c: c.numero, x: +g.x.toFixed(2), y: +g.y.toFixed(2), z: +g.z.toFixed(2),
      q: [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)], v: +yk.vel.toFixed(1), g: +yk.giroVisual.toFixed(2),
      d: yk.derrapando ? yk.nivel : 0, dd: yk.derrapando ? yk.dirDerrape : 0, tb: yk.tTurbo > 0 ? 1 : 0, es: yk.tEstrella > 0 ? 1 : 0,
      p: yo.terminado ? 1e9 - c.orden.length : yo.p };
    const pr = items.paraRed();
    if (pr.length) msg.pr = pr;
    enviar(msg);
  }
  // contra bots: cuando terminás, se espera a que lleguen los demás (máximo 15 s)
  if (c.modo === "bots" && yo.terminado && !c.resultadosVistos && (c.pilotos.every((p) => p.terminado) || ahora > c.finSolo)) { c.resultadosVistos = true; resultadosSolo(); }
  if (ahora - c.ultHud > 66) { c.ultHud = ahora; actualizarHud(); }
}

function todosLosKarts() {
  return [...C.pilotos.map((p) => ({ id: p.id, pos: p.control.pos })), ...[...remotos.values()].map((r) => ({ id: r.id, pos: r.pos }))];
}
// el de adelante (para el caparazón rojo)
function objetivoDe(p) {
  const rk = ranking(), i = rk.findIndex((r) => r.id === p.id);
  return i > 0 ? rk[i - 1].id : null;
}

// golpe de un ítem a un piloto de esta compu
function golpear(p, tipo) {
  if (!p.control.golpe(tipo === "estrella" ? 1.0 : 1.15)) return;
  const pos = p.control.pos;
  p.control.monedas = Math.max(0, p.control.monedas - 3);
  particulas.emitir(pos, 16, { color: 0xffffff, tam: 0.5, dispersion: 4, vida: 0.5, crece: 0.5, gravedad: 3 });
  for (let k = 0; k < 5; k++) particulas.emitir(pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 1, { color: 0xffe14d, tam: 0.35, dispersion: 2.5, vida: 0.9, crece: 0, gravedad: -1, alfa: 1 });
  if (p === C.yo) { Sonido.golpe(); sacudir(0.6); pausaImpacto = 0.09; aviso(tipo === "platano" ? "¡PLÁTANO!" : tipo === "estrella" ? "¡TE ATROPELLARON!" : "¡CAPARAZONAZO!"); }
  else if (p.control.pos.distanceTo(camara.position) < 40) Sonido.golpe();
}

function reaparecer(p) {
  const i = (p.idx - 3 + recorrido.n) % recorrido.n, q = recorrido.p[i].clone();
  q.y += 1.5;
  p.control.colocar(q, recorrido.direccion(i));
  p.reapareciendo = true;
  setTimeout(() => (p.reapareciendo = false), 800);
}

// progreso en la pista: vueltas y llegada
function progreso(p, ahora) {
  const N = recorrido.n, pos = p.control.pos;
  const ni = recorrido.cercano(pos, p.idx);
  let d = ni - p.idx;
  if (d > N / 2) d -= N;
  if (d < -N / 2) d += N;
  p.idx = ni;
  if (!p.reapareciendo) p.p += d;
  const vueltaAhora = Math.floor(p.p / N) + 1;
  if (!p.terminado && vueltaAhora > p.vuelta && ahora > C.go) {
    p.vueltasT.push(ahora - p.tVuelta); p.tVuelta = ahora;
    if (vueltaAhora > C.vueltas) terminar(p);
    else if (p === C.yo) { Sonido.vuelta(); avisoGrande(vueltaAhora === C.vueltas ? "¡ÚLTIMA VUELTA!" : `VUELTA ${vueltaAhora}`, "vuelta"); }
  }
  p.vuelta = Math.max(p.vuelta, Math.min(vueltaAhora, C.vueltas));
}

function terminar(p) {
  const c = C;
  p.terminado = true;
  p.tiempo = Date.now() - c.go;
  c.orden.push(p.id);
  if (p !== c.yo) return;
  Sonido.meta();
  avisoGrande("¡META!", "meta");
  if (c.online) enviar({ t: "meta", carrera: c.numero, tiempo: p.tiempo });
  else {
    if (c.modo === "reloj") {
      const mejor = +leer("kart_mejor", 0);
      if (!mejor || p.tiempo < mejor) guardar("kart_mejor", p.tiempo);
      const mv = Math.min(...p.vueltasT);
      const mejorV = +leer("kart_mejor_vuelta", 0);
      if (!mejorV || mv < mejorV) guardar("kart_mejor_vuelta", mv);
      setTimeout(() => resultadosSolo(), 2200);
    } else c.finSolo = Date.now() + 15000;
  }
}

// humo de derrape (y del color de las chispas), polvo en el pasto, fuego del turbo, viento del rebufo, marcas
const tmpV = new THREE.Vector3();
const COLOR_HUMO = [0xe8e8e8, 0xb9dcff, 0xffd2a8, 0xe9c2ff];
function efectosKart(id, mod, { vel, derrape, nivel, fuera, turbo, rebufo, estrella }, dt) {
  const g = mod.g;
  if (g.position.distanceToSquared(camara.position) > 60 * 60) return;
  const q = g.quaternion;
  const atras = (x) => tmpV.set(x, 0.15, -1.0).applyQuaternion(q).add(g.position).clone();
  if (derrape && Math.abs(vel) > 8) {
    for (const x of [-0.85, 0.85]) {
      if (Math.random() < 0.7) particulas.emitir(atras(x), 1, { color: COLOR_HUMO[nivel] || COLOR_HUMO[0], tam: 0.55, vida: 0.7, dispersion: 0.6, crece: 2.2, alfa: 0.55 });
      marcas.marcar(id + x, atras(x));
    }
  } else { marcas.cortar(id + -0.85); marcas.cortar(id + 0.85); }
  if (fuera && Math.abs(vel) > 6 && Math.random() < 0.6) particulas.emitir(atras(Math.random() < 0.5 ? -0.85 : 0.85), 1, { color: 0x8a7a4a, tam: 0.7, vida: 0.6, dispersion: 1.2, crece: 1.6, alfa: 0.6 });
  if (turbo && Math.random() < 0.8) particulas.emitir(tmpV.set(0, 0.65, -1.9).applyQuaternion(q).add(g.position), 1, { color: Math.random() < 0.5 ? 0xff7a00 : 0xffd23f, tam: 0.45, vida: 0.25, dispersion: 0.5, crece: -0.8, alfa: 0.9 });
  if (rebufo > 0.3 && Math.random() < 0.5) particulas.emitir(tmpV.set((Math.random() - 0.5) * 3, 0.8 + Math.random(), 1.5).applyQuaternion(q).add(g.position), 1, { color: 0xffffff, tam: 0.18, vida: 0.3, dispersion: 0.2, crece: 0, alfa: 0.7 });
  if (estrella && Math.random() < 0.7) particulas.emitir(tmpV.set((Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5).applyQuaternion(q).add(g.position), 1, { color: new THREE.Color().setHSL(Math.random(), 1, 0.6), tam: 0.3, vida: 0.4, dispersion: 0.5, crece: 0, alfa: 1 });
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
  r.pos.set(x, y + AJUSTES.radio, zz);
  if (!dibujar) { r.cuerpo.setNextKinematicTranslation({ x, y: y + AJUSTES.radio, z: zz }); return; }
  r.mod.g.position.set(x, y, zz);
  tmpQ.set(...a.q).slerp(new THREE.Quaternion(...z.q), Math.min(1, k));
  r.mod.g.quaternion.copy(tmpQ);
  animarModelo(r.mod, dt, { vel: z.v, giro: z.g, derrape: z.d, dirDerrape: z.dd, turbo: !!z.tb, estrella: !!z.es });
  efectosKart(r.id, r.mod, { vel: z.v, derrape: z.d > 0 || (z.dd !== 0 && z.dd !== undefined), nivel: z.d, fuera: false, turbo: !!z.tb, rebufo: 0, estrella: !!z.es }, dt);
  r.p = z.p;
}

// cámara detrás del kart: se queda un poco atrás con el turbo (sensación de empujón) y abre el ángulo
const camObj = new THREE.Vector3(), camMira = new THREE.Vector3();
let temblor = 0;
function sacudir(f) { temblor = Math.max(temblor, f); }
function seguirCamara(dt) {
  const ct = C.yo.control, g = C.yo.mod.g.position;
  const f = ct.adelante(), velN = Math.abs(ct.vel) / AJUSTES.velMax, turbo = ct.tTurbo > 0;
  const lejos = 7 + velN * 1.6 + (turbo ? 1.8 : 0), alto = 3 + velN * 0.4;
  camObj.copy(g).addScaledVector(f, -lejos).add(new THREE.Vector3(0, alto, 0));
  if (!C.camPos) C.camPos = camObj.clone();
  C.camPos.lerp(camObj, 1 - Math.exp(-(turbo ? 4.5 : 7) * dt));
  camara.position.copy(C.camPos);
  // a fondo, la cámara vibra un poquito (como el motor al máximo)
  const vib = (C.pulso || 0) * 0.05;
  camara.position.y += (Math.random() - 0.5) * vib;
  if (temblor > 0) { camara.position.x += (Math.random() - 0.5) * temblor; camara.position.y += (Math.random() - 0.5) * temblor; temblor = Math.max(0, temblor - dt * 2); }
  camMira.copy(g).addScaledVector(f, 4).y += 1.3;
  camara.lookAt(camMira);
  const fovObj = (innerWidth < innerHeight ? 82 : 70) + (turbo ? 13 : 0) + velN * 5 + (ct.tEstrella > 0 ? 4 : 0);
  camara.fov += (fovObj - camara.fov) * (1 - Math.exp(-4 * dt));
  camara.updateProjectionMatrix();
  sol.position.copy(g).add(new THREE.Vector3(60, 120, 40));
  sol.target.position.copy(g);
}

// posiciones: los que llegaron, por orden de llegada; los demás, por cuánto avanzaron
function ranking() {
  const c = C;
  const lista = [...c.pilotos.map((p) => ({ id: p.id, p: p.p })), ...[...remotos.values()].map((r) => ({ id: r.id, p: r.p }))];
  const lleg = c.online ? c.llegadas.map((l) => l.id) : c.orden;
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
      <div class="hud-monedas" id="h-monedas">🪙 0</div>
      <div class="hud-item"><div class="ranura" id="h-item"></div><small id="h-cant"></small></div>
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
        <button class="btn-t item" id="t-item">ÍTEM</button>
        <button class="btn-t reaparecer" id="t-reap">↺</button></div>` : `<div class="ayuda-teclas">W/↑ acelerar · S/↓ frenar · A D/← → doblar · SHIFT derrapar (y truco en el aire) · ESPACIO ítem (con S, para atrás) · R reaparecer</div>`}
    </div>`;
  $("#mudo").onclick = () => { Sonido.alternar(); actualizarBotonMudo(); };
  $("#crt").onclick = alternarRetro;
  prepararMinimapa();
  if (celular) controlesTactiles();
  actualizarItemHud(false);
}
function actualizarBotonMudo() { const b = $("#mudo"); if (b) b.textContent = Sonido.mudo ? "🔇" : "🔊"; }

let ultRuleta = 0;
function actualizarItemHud(pop) {
  const r = $("#h-item"), yo = C?.yo;
  if (!r || !yo) return;
  if (yo.ruleta > 0) {
    if (Date.now() - ultRuleta > 70) {
      ultRuleta = Date.now();
      const ks = Object.keys(ICONOS);
      r.textContent = ICONOS[ks[(Math.random() * ks.length) | 0]];
      Sonido.ruleta();
    }
    r.className = "ranura girando";
  } else {
    r.textContent = yo.item ? ICONOS[yo.item] : "";
    r.className = "ranura" + (yo.item ? " llena" : "");
    if (pop && yo.item) { void r.offsetWidth; r.classList.add("pop"); }
  }
  $("#h-cant").textContent = CANTIDAD[yo.item] ? "×" + CANTIDAD[yo.item] : "";
  const t = $("#t-item");
  if (t) { t.textContent = yo.item && !yo.ruleta ? ICONOS[yo.item] : "ÍTEM"; t.classList.toggle("listo", !!yo.item && !yo.ruleta); }
}

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
  boton("#t-derrape", "derrape"); boton("#t-freno", "freno"); boton("#t-reap", "reaparecer"); boton("#t-item", "item");
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
  for (const p of C.pilotos) if (p !== C.yo) punto(p.mod.g.position, p.color, false);
  punto(C.yo.mod.g.position, C.yo.color, true);
}

function actualizarHud() {
  const c = C, yo = c.yo;
  if (!$("#h-pos")) return;
  const rk = ranking();
  const mi = rk.findIndex((x) => x.id === yo.id) + 1;
  if (c.posAntes && mi < c.posAntes && Date.now() > c.go) { Sonido.adelanto(); const b = $("#h-pos"); b.classList.remove("sube"); void b.offsetWidth; b.classList.add("sube"); }
  c.posAntes = mi;
  $("#h-pos").textContent = ordinal(mi);
  $("#h-de").textContent = "/" + rk.length;
  $("#h-vuelta").textContent = yo.terminado ? "¡TERMINASTE!" : `VUELTA ${yo.vuelta}/${c.vueltas}`;
  const t = yo.terminado ? yo.tiempo : Date.now() - c.go;
  $("#h-tiempo").textContent = Date.now() < c.go ? "0:00.00" : fmt(t);
  $("#h-vel").textContent = Math.round(Math.abs(yo.control.vel) * 3.6);
  $("#h-monedas").textContent = "🪙 " + yo.control.monedas;
  const k = yo.control;
  const tb = k.tTurbo > 0 ? 1 : k.derrapando ? k.tDerrape / AJUSTES.nivelesDerrape[2] : 0;
  const barra = $("#h-turbo");
  barra.style.width = Math.min(100, tb * 100) + "%";
  barra.className = k.tTurbo > 0 ? "turbo" : "n" + k.nivel;
  aviso(c.alReves > 1 ? "¡VAS AL REVÉS!" : null, true);
  if (yo.ruleta > 0) actualizarItemHud(false);
  dibujarMinimapa();
}
let avisoT = 0;
function aviso(texto, fijo = false) {
  const a = $("#aviso");
  if (!a) return;
  if (texto) {
    if (!fijo || a.textContent !== texto || !a.classList.contains("on")) { a.classList.remove("on"); void a.offsetWidth; }
    a.textContent = texto; a.classList.add("on"); if (!fijo) avisoT = Date.now() + 1500;
  }
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
  const c = C, yo = c.yo;
  let cuerpo;
  if (c.modo === "reloj") {
    const mejor = +leer("kart_mejor", 0), mv = +leer("kart_mejor_vuelta", 0);
    cuerpo = `<h2>¡Terminaste!</h2><div class="tiempo-grande">${fmt(yo.tiempo)}</div>
      <table class="tabla">${yo.vueltasT.map((t, i) => `<tr><td>Vuelta ${i + 1}</td><td>${fmt(t)}</td></tr>`).join("")}
      <tr class="sep"><td>Tu récord</td><td>${fmt(mejor)}</td></tr><tr><td>Mejor vuelta</td><td>${fmt(mv)}</td></tr></table>`;
  } else {
    const rk = ranking(), pil = (id) => c.pilotos.find((p) => p.id === id);
    const mi = rk.findIndex((r) => r.id === yo.id) + 1;
    cuerpo = `<h2>${mi === 1 ? "¡GANASTE!" : ordinal(mi) + " lugar"}</h2>
      <table class="tabla resultados">${rk.map((r, i) => { const p = pil(r.id); return `<tr class="${p === yo ? "yo" : ""}"><td>${ordinal(i + 1)}</td>
        <td><i class="chip" style="background:${p.color}"></i>${esc(p.nombre)}</td><td>${p.terminado ? fmt(p.tiempo) : "—"}</td></tr>`; }).join("")}</table>`;
  }
  ui.insertAdjacentHTML("beforeend", `<div class="modal"><div class="caja">${cuerpo}
    <button class="boton" id="otra">Otra vez</button><button class="boton sec" id="salir">Salir</button></div></div>`);
  $("#otra").onclick = () => (c.modo === "reloj" ? contrarreloj() : contraBots());
  $("#salir").onclick = () => (location.href = "/");
}

function resultadosOnline(sala) {
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
  items?.actualizar(dt, [], [], () => {});
  lineas.actualizar(dt, 0);
  zoomVel = 0;
}

function pantallaInicio() {
  ui.innerHTML = `<div class="inicio"><div class="caja">
    <h1 class="logo">PUTO<span>KART</span></h1>
    <input id="nombre" maxlength="16" placeholder="tu nombre" value="${esc(leer("kart_nombre", ""))}">
    <button class="boton" id="crear">Crear sala</button>
    <button class="boton sec" id="bots">Carrera contra bots</button>
    <button class="boton sec" id="reloj">Contrarreloj</button>
    <button class="btn-chico crt ${retro ? "on" : ""}" id="crt">📺 filtro de tele</button>
    <div class="ayuda">Creás una sala y le pasás el link a tus amigos (hasta 8).</div></div></div>`;
  const nombre = () => { const n = $("#nombre").value.trim(); if (!n) { $("#nombre").focus(); Sonido.error(); return null; } guardar("kart_nombre", n); return n; };
  $("#crear").onclick = async () => {
    if (!nombre()) return;
    Sonido.clic();
    const { id } = await (await fetch("/api/crear", { method: "POST" })).json();
    location.href = "/s/" + id;
  };
  $("#bots").onclick = () => { if (nombre()) location.href = "/solo"; };
  $("#reloj").onclick = () => { if (nombre()) location.href = "/contrarreloj"; };
  $("#crt").onclick = alternarRetro;
}

function contraBots() {
  const n = leer("kart_nombre", "Vos"), miColor = leer("kart_color", COLORES[0]);
  const colores = COLORES.filter((c) => c !== miColor);
  const nombres = [...BOTS].sort(() => Math.random() - 0.5).slice(0, 5);
  const jugadores = nombres.map((nb, i) => ({ id: "bot" + i, nombre: nb, color: colores[i], bot: true }));
  // vos salís en el medio de la grilla
  jugadores.splice(3, 0, { id: "yo", nombre: n, color: miColor });
  empezarCarrera({ jugadores, yo: "yo", go: Date.now() + 3600, vueltas: VUELTAS_SOLO, modo: "bots" });
}
function contrarreloj() {
  const n = leer("kart_nombre", "Vos");
  empezarCarrera({ jugadores: [{ id: "yo", nombre: n, color: leer("kart_color", COLORES[0]) }], yo: "yo", go: Date.now() + 3600, vueltas: VUELTAS_SOLO, modo: "reloj" });
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
      if (r && C && d.c === C.numero) {
        d.tl = performance.now(); r.buf.push(d); if (r.buf.length > 30) r.buf.shift();
        items.recibirAjenos(d.id, d.pr);
      }
    } else if (d.t === "ev" && C) {
      if (d.k === "golpe") { if (d.a === miId) golpear(C.yo, "estrella"); }
      else items.recibirEvento(d);
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
    if (!d.jugadores.some((j) => j.id === miId)) return pantallaSala(); // espectador
    empezarCarrera({ jugadores: d.jugadores, yo: miId, go: d.inicio - desfase, vueltas: d.vueltas, modo: "online", numero: d.carrera });
    return;
  }
  if (C && C.online) {
    C.llegadas = d.llegadas;
    if (d.fase === "resultados") { if (antes?.fase !== "resultados" || !$(".modal")) resultadosOnline(d); return; }
    if (d.fase === "carrera") return;
    limpiarKarts();
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
    const r = { id: j.id, nombre: j.nombre, color: j.color, mod: nuevoModelo(j.color, j.nombre), buf: [], p: 0, pos: s.pos.clone() };
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
  if (pausaImpacto > 0) pausaImpacto -= dt; // golpe fuerte: un instante congelado
  else if (C) actualizarCarrera(dt);
  else vistaFondo(dt);
  if (retro) crt.dibujar(escena, camara, performance.now() / 1000, zoomVel);
  else render.render(escena, camara);
}

// ================= arranque =================
const ruta = location.pathname;
await cargarPista();
aplicarRetro();
if (ruta.startsWith("/s/")) { salaId = ruta.slice(3).replace(/\/$/, ""); ui.innerHTML = '<div class="inicio"><div class="caja"><h1 class="logo">PUTO<span>KART</span></h1><div class="ayuda">conectando…</div></div></div>'; conectar(); }
else if (ruta.startsWith("/solo")) contraBots();
else if (ruta.startsWith("/contrarreloj")) contrarreloj();
else pantallaInicio();
bucle();
// para pruebas: avanzar la simulación sin esperar a que dibuje
window.__kart = { get C() { return C; }, get remotos() { return remotos; }, get recorrido() { return recorrido; }, get items() { return items; },
  entrada(e) { entradaPrueba = e; }, avanzar(seg) { for (let i = 0; i < seg * 60; i++) actualizarCarrera(1 / 60); } };
