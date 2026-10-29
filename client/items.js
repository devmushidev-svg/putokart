// Ítems tipo Mario Kart: cajas, monedas, plátanos, caparazones verde y rojo, hongos y estrella.
//
// Cada jugador simula lo suyo: sus caparazones los mueve su dueño y manda las posiciones con las del kart;
// cuando un caparazón o un plátano de otro te pega, sos vos quien lo detecta y avisa para que desaparezca.
import * as THREE from "three";

export const ICONOS = { platano: "🍌", verde: "🟢", rojo: "🔴", hongo: "🍄", hongo2: "🍄", hongo3: "🍄", estrella: "⭐", moneda: "🪙" };
export const CANTIDAD = { hongo3: 3, hongo2: 2 };

// qué ítems tocan según la posición (0 = primero, 1 = último): los de atrás reciben cosas más fuertes
const TABLAS = [
  [0.25, { platano: 34, verde: 30, moneda: 26, hongo: 10 }],
  [0.6, { platano: 16, verde: 22, rojo: 30, hongo: 22, moneda: 10 }],
  [0.85, { rojo: 30, hongo: 20, hongo3: 32, estrella: 18 }],
  [1.01, { hongo3: 40, estrella: 34, rojo: 26 }],
];
export function sortear(fraccion) {
  const t = TABLAS.find(([lim]) => fraccion < lim)[1];
  let r = Math.random() * Object.values(t).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(t)) if ((r -= w) < 0) return k;
  return "platano";
}

// ---------- modelos ----------
function texCaja() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 64, 64);
  ["#ff4d6d", "#ffd23f", "#3bceac", "#2a9df4", "#a05cf0"].forEach((col, i) => gr.addColorStop(i / 4, col));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#fffc"; g.fillRect(4, 4, 56, 56);
  g.fillStyle = gr; g.fillRect(8, 8, 48, 48);
  g.font = "900 44px Arial Black, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 5; g.strokeStyle = "#000"; g.strokeText("?", 32, 35); g.fillStyle = "#fff"; g.fillText("?", 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
const geoCaja = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const matCaja = new THREE.MeshStandardMaterial({ map: texCaja(), transparent: true, opacity: 0.85, roughness: 0.3, emissive: 0x222222 });
const geoMoneda = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 14).rotateX(Math.PI / 2);
const matMoneda = new THREE.MeshStandardMaterial({ color: 0xffc31a, metalness: 0.7, roughness: 0.25, emissive: 0x553300 });
function modeloPlatano() {
  const g = new THREE.Group();
  const curva = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 6, 10, Math.PI * 0.85), new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.6 }));
  curva.rotation.set(0, 0, Math.PI * 0.6); curva.position.y = 0.45; curva.castShadow = true;
  const punta = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 5), new THREE.MeshStandardMaterial({ color: 0x5a3a1a }));
  punta.position.set(-0.32, 0.78, 0); g.add(curva, punta);
  return g;
}
function modeloCaparazon(color) {
  const g = new THREE.Group();
  const casco = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
  casco.scale.y = 0.8; casco.castShadow = true;
  const borde = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.2, 14).translate(0, -0.1, 0), new THREE.MeshStandardMaterial({ color: 0xfff1c8 }));
  g.add(casco, borde, base);
  g.position.y = 0.3;
  const c = new THREE.Group(); c.add(g);
  return c;
}

let contador = 0;

export class Items {
  // fisica: { suelo(pos) → altura o null, pared(pos, dir, largo) → { normal, dist } o null }
  constructor(escena, pista, recorrido, particulas, fisica, sonido, retro) {
    this.escena = escena; this.recorrido = recorrido; this.part = particulas; this.fisica = fisica; this.S = sonido; this.retro = retro;
    this.grupo = new THREE.Group();
    escena.add(this.grupo);
    this.cajas = (pista.cajas || []).map((c) => {
      const m = new THREE.Mesh(geoCaja, matCaja); m.position.copy(c.pos); m.castShadow = true;
      this.grupo.add(m);
      return { pos: c.pos.clone(), mesh: m, vuelve: 0, fase: Math.random() * 6 };
    });
    this.monedas = (pista.monedas || []).map((c) => {
      const m = new THREE.Mesh(geoMoneda, matMoneda); m.position.copy(c.pos); m.castShadow = true;
      this.grupo.add(m);
      return { pos: c.pos.clone(), mesh: m, vuelve: 0 };
    });
    retro?.(this.grupo);
    this.platanos = new Map(); // id → { pos, mesh, dueño }
    this.proy = new Map(); // míos: id → { tipo, pos, dir, vel, vida, rebotes, dueño, objetivo, mesh }
    this.ajenos = new Map(); // de otros jugadores: id → { tipo, pos, mesh, dueño, visto }
    this.red = null; // (msg) => enviar a los demás
    this.prefijo = "l";
  }

  limpiar() {
    for (const m of [...this.platanos.values(), ...this.proy.values(), ...this.ajenos.values()]) this.grupo.remove(m.mesh);
    this.platanos.clear(); this.proy.clear(); this.ajenos.clear();
    for (const c of [...this.cajas, ...this.monedas]) { c.vuelve = 0; c.mesh.visible = true; }
  }

  nuevoId() { return `${this.prefijo}-${++contador}`; }

  // ---------- usar el ítem de un piloto ----------
  // p: piloto local { id, control, item, ... }; atras: tirar para atrás; objetivoDe(p) → kart de adelante
  usar(p, atras, objetivoDe) {
    const it = p.item, k = p.control;
    if (!it) return;
    const pos = k.pos, f = k.nariz();
    if (it === "platano") {
      const q = pos.clone().addScaledVector(f, atras ? -2.4 : 2.4);
      this.ponerPlatano(this.nuevoId(), q, p.id, true);
      this.S.tirar();
    } else if (it === "verde" || it === "rojo") {
      const dir = f.clone().multiplyScalar(atras ? -1 : 1);
      const q = pos.clone().addScaledVector(dir, 2.6);
      const obj = it === "rojo" && !atras ? objetivoDe(p) : null;
      this.lanzar(this.nuevoId(), it, q, dir, Math.max(46, Math.abs(k.vel) + 16), p.id, obj);
      this.S.tirar();
    } else if (it.startsWith("hongo")) {
      k.turbo(1.15); k.vel = Math.max(k.vel, 32);
      this.S.turbo();
    } else if (it === "estrella") {
      k.tEstrella = 7; k.turbo(0.5);
      this.S.estrella();
    } else if (it === "moneda") {
      k.monedas = Math.min(10, k.monedas + 2); this.S.moneda(); this.S.moneda(0.08);
    }
    // hongo triple: quedan usos
    p.item = it === "hongo3" ? "hongo2" : it === "hongo2" ? "hongo" : null;
  }

  ponerPlatano(id, pos, dueño, avisar) {
    if (this.platanos.has(id)) return;
    const y = this.fisica.suelo(pos);
    const m = modeloPlatano(); m.position.set(pos.x, (y ?? pos.y - 0.6), pos.z); m.rotation.y = Math.random() * 6;
    this.retro?.(m);
    this.grupo.add(m);
    this.platanos.set(id, { pos: m.position.clone(), mesh: m, dueño });
    if (avisar) this.red?.({ t: "ev", k: "pon", id, x: +m.position.x.toFixed(2), y: +m.position.y.toFixed(2), z: +m.position.z.toFixed(2) });
    // máximo 24 plátanos: el más viejo desaparece
    if (this.platanos.size > 24) this.quitar(this.platanos.keys().next().value, true);
  }

  lanzar(id, tipo, pos, dir, vel, dueño, objetivo) {
    const m = modeloCaparazon(tipo === "rojo" ? 0xe63946 : 0x2ec27e);
    this.retro?.(m);
    m.position.copy(pos);
    this.grupo.add(m);
    this.proy.set(id, { tipo, pos: pos.clone(), dir: dir.clone().setY(0).normalize(), vel, vida: tipo === "rojo" ? 9 : 8, rebotes: 0, dueño, objetivo, mesh: m, edad: 0, idx: -1 });
  }

  // saca un plátano o caparazón (avisar = mandar a los demás)
  quitar(id, avisar) {
    const o = this.platanos.get(id) || this.proy.get(id) || this.ajenos.get(id);
    if (!o) return;
    this.grupo.remove(o.mesh);
    this.platanos.delete(id); this.proy.delete(id); this.ajenos.delete(id);
    this.part.emitir(o.mesh.position, 14, { color: o.tipo === "rojo" ? 0xff4d4d : o.tipo === "verde" ? 0x3be37a : 0xffd93d, tam: 0.35, dispersion: 4, vida: 0.5, crece: 0.3, gravedad: 9, alfa: 1 });
    if (avisar) this.red?.({ t: "ev", k: "quita", id });
  }

  // lo que mando por red junto con la posición de mi kart
  paraRed() {
    return [...this.proy.entries()].map(([id, o]) => [id, o.tipo === "rojo" ? 1 : 0, +o.pos.x.toFixed(1), +o.pos.y.toFixed(1), +o.pos.z.toFixed(1)]);
  }
  // caparazones de otro jugador (llegan con su posición)
  recibirAjenos(dueño, lista) {
    const vistos = new Set();
    for (const [id, rojo, x, y, z] of lista || []) {
      vistos.add(id);
      let o = this.ajenos.get(id);
      if (!o) {
        const m = modeloCaparazon(rojo ? 0xe63946 : 0x2ec27e); this.retro?.(m);
        this.grupo.add(m);
        o = { tipo: rojo ? "rojo" : "verde", pos: new THREE.Vector3(x, y, z), mesh: m, dueño, destino: new THREE.Vector3(x, y, z) };
        m.position.copy(o.pos);
        this.ajenos.set(id, o);
      }
      o.destino.set(x, y, z);
    }
    for (const [id, o] of this.ajenos) if (o.dueño === dueño && !vistos.has(id)) { this.grupo.remove(o.mesh); this.ajenos.delete(id); }
  }
  recibirEvento(m) {
    if (m.k === "pon") this.ponerPlatano(m.id, new THREE.Vector3(m.x, m.y + 0.6, m.z), m.id.split("-")[0], false);
    else if (m.k === "quita") this.quitar(m.id, false);
  }

  // ---------- cada cuadro ----------
  // locales: pilotos que simula esta compu (yo y los bots) → recogen cosas y reciben golpes acá
  // karts: todos los karts { id, pos } (para que el caparazón rojo persiga)
  actualizar(dt, locales, karts, cuandoPega) {
    const t = performance.now() / 1000;
    // cajas: giran y flotan; vuelven a aparecer
    for (const c of this.cajas) {
      if (c.vuelve > 0) { c.vuelve -= dt; c.mesh.visible = c.vuelve <= 0; if (c.vuelve <= 0) c.mesh.scale.setScalar(0.1); }
      c.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-6 * dt));
      c.mesh.rotation.set(t * 0.9 + c.fase, t * 1.3 + c.fase, 0);
      c.mesh.position.y = c.pos.y + Math.sin(t * 2 + c.fase) * 0.15;
    }
    for (const c of this.monedas) {
      if (c.vuelve > 0) { c.vuelve -= dt; c.mesh.visible = c.vuelve <= 0; }
      c.mesh.rotation.y = t * 3;
    }
    for (const p of locales) {
      const pos = p.control.pos;
      for (const c of this.cajas) {
        if (c.vuelve > 0 || pos.distanceToSquared(c.mesh.position) > 2.6 * 2.6) continue;
        c.vuelve = 2.5; c.mesh.visible = false;
        this.part.emitir(c.mesh.position, 18, { color: new THREE.Color().setHSL(Math.random(), 0.9, 0.6), tam: 0.4, dispersion: 5, vida: 0.6, crece: 0.2, gravedad: 6, alfa: 1, variacion: 0.6 });
        if (!p.item && !p.ruleta) { p.ruleta = p.bot ? 1.0 : 1.6; p.itemFuturo = sortear(p.fraccion ?? 0.5); if (!p.bot) this.S.caja(); }
      }
      for (const c of this.monedas) {
        if (c.vuelve > 0 || pos.distanceToSquared(c.mesh.position) > 1.9 * 1.9) continue;
        c.vuelve = 8; c.mesh.visible = false;
        p.control.monedas = Math.min(10, p.control.monedas + 1);
        if (!p.bot) this.S.moneda();
        this.part.emitir(c.mesh.position, 8, { color: 0xffd23f, tam: 0.3, dispersion: 3, vida: 0.4, crece: 0.1, gravedad: 4, alfa: 1 });
      }
      // plátanos
      for (const [id, b] of this.platanos) {
        if (pos.distanceToSquared(b.pos) > 1.55 * 1.55 || Math.abs(pos.y - b.pos.y) > 2) continue;
        this.quitar(id, true);
        cuandoPega(p, "platano");
      }
      // caparazones de otros jugadores
      for (const [id, o] of this.ajenos) {
        if (pos.distanceToSquared(o.mesh.position) > 1.7 * 1.7) continue;
        this.quitar(id, true);
        cuandoPega(p, o.tipo);
      }
    }
    // mis caparazones
    for (const [id, o] of this.proy) {
      o.edad += dt; o.vida -= dt;
      if (o.vida <= 0) { this.quitar(id, true); continue; }
      // el rojo persigue al de adelante si lo tiene cerca; si no, sigue la pista
      if (o.tipo === "rojo") {
        const obj = o.objetivo && karts.find((k) => k.id === o.objetivo);
        let hacia = null;
        if (obj && obj.pos.distanceTo(o.pos) < 45) hacia = obj.pos.clone().sub(o.pos);
        else {
          o.idx = this.recorrido.cercano(o.pos, o.idx);
          hacia = this.recorrido.p[(o.idx + 10) % this.recorrido.n].clone().sub(o.pos);
        }
        hacia.y = 0;
        if (hacia.lengthSq() > 0.01) {
          const a0 = Math.atan2(o.dir.x, o.dir.z), a1 = Math.atan2(hacia.x, hacia.z);
          let d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
          const a = a0 + THREE.MathUtils.clamp(d, -5 * dt, 5 * dt);
          o.dir.set(Math.sin(a), 0, Math.cos(a));
        }
      }
      // choque con paredes: el verde rebota, el rojo se rompe
      const paso = o.vel * dt;
      const pared = this.fisica.pared(o.pos, o.dir, paso + 0.6);
      if (pared) {
        if (o.tipo === "rojo" || ++o.rebotes > 6) { this.quitar(id, true); continue; }
        const n = new THREE.Vector3(pared.normal.x, 0, pared.normal.z).normalize();
        o.dir.addScaledVector(n, -2 * o.dir.dot(n)).normalize();
        this.S.rebote?.();
      }
      o.pos.addScaledVector(o.dir, paso);
      const y = this.fisica.suelo(o.pos);
      if (y === null) { o.pos.y -= 20 * dt; if (o.pos.y < -20) { this.quitar(id, true); continue; } }
      else o.pos.y = y;
      o.mesh.position.copy(o.pos);
      o.mesh.rotation.y += dt * 14;
      // choque con plátanos: los dos se rompen
      for (const [bid, b] of this.platanos) if (b.pos.distanceToSquared(o.pos) < 1.4 * 1.4) { this.quitar(bid, true); this.quitar(id, true); break; }
      if (!this.proy.has(id)) continue;
      // choque con karts que simula esta compu (al dueño no le pega al salir)
      for (const p of locales) {
        if (p.id === o.dueño && o.edad < 0.7) continue;
        if (p.control.pos.distanceToSquared(o.pos) > 1.7 * 1.7) continue;
        this.quitar(id, true);
        cuandoPega(p, o.tipo);
        break;
      }
    }
    // caparazones ajenos: se mueven suave hacia su última posición conocida
    for (const o of this.ajenos.values()) {
      o.mesh.position.lerp(o.destino, 1 - Math.exp(-14 * dt));
      o.mesh.rotation.y += dt * 14;
    }
  }
}
