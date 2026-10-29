// Kart: el modelo (con piezas simples hasta que haya uno de Blender) y el manejo arcade.
//
// Manejo tipo "esfera": el kart es una bola que se desliza sobre la pista (sin girar) y el modelo
// la sigue. El rumbo y la velocidad los decide el código, no la física, así se puede afinar el derrape
// para que se sienta como Mario Kart. La física (Rapier) solo resuelve choques con paredes y otros karts.
import * as THREE from "three";

export const AJUSTES = {
  velMax: 30, // m/s (~108 km/h)
  acel: 26,
  frenoReversa: 38,
  velReversa: 10,
  roce: 7, // desacelera sin acelerar
  velFuera: 13, // velocidad máxima en el pasto
  giro: 1.75, // rad/s doblando normal
  respuestaGiro: 9, // qué tan rápido llega al giro pedido (más bajo = más pesado)
  agarre: 14, // qué tan rápido la velocidad sigue al rumbo
  // derrape estilo Mario Kart: el kart dobla en curva cerrada sin perder velocidad;
  // doblar hacia adentro cierra la curva, al revés la abre, pero nunca deja de doblar
  // (como MK8: sin tocar nada dobla parecido a doblar normal; adentro un poco más cerrado; afuera bien abierto)
  giroDerrapeAdentro: 1.85, giroDerrapeNeutro: 1.3, giroDerrapeAfuera: 0.5,
  agarreDerrape: 6, // en el derrape la velocidad sigue al rumbo un poco más lento: se siente que resbala
  anguloDerrape: 0.34, // cuánto apunta la trompa hacia adentro (solo se ve, ~20°)
  velMinDerrape: 0.5, // fracción de la velocidad máxima para poder derrapar
  turbo: 1.4, // multiplicador de velocidad máxima con turbo
  nivelesDerrape: [0.7, 1.45, 2.3], // segundos de carga para cada nivel (azul, naranja, violeta)
  turboDerrape: [0.7, 1.1, 1.6], // duración del turbo según el nivel
  radio: 0.6,
};
const COLOR_NIVEL = [null, 0x3fa9ff, 0xff8a1f, 0xc64bff];
const ARRIBA = new THREE.Vector3(0, 1, 0);

// ---------- modelo ----------
// Kart hecho en Blender (opcional): public/modelos/kart.glb. Convención:
//   material llamado "color" → se pinta con el color de cada jugador
//   rueda_del_* → ruedas delanteras (giran y doblan), rueda_* → traseras (giran)
//   piloto*     → se inclina en las curvas
//   el kart mira hacia -Y en Blender (adelante) y está apoyado en el suelo (Z = 0)
let plantilla = null;
export function usarPlantilla(escenaGLB) { plantilla = escenaGLB; }

export function crearModelo(color, nombre) {
  if (plantilla) return modeloDesdePlantilla(color, nombre);
  const g = new THREE.Group();
  const cuerpo = new THREE.Group(); // se inclina con el terreno y el derrape
  g.add(cuerpo);
  const mColor = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
  const mNegro = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.8 });
  const mGris = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.6 });
  const caja = (w, h, l, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); b.castShadow = true; cuerpo.add(b); return b; };
  caja(1.5, 0.35, 2.4, mColor, 0, 0.45, 0); // chasis
  caja(1.1, 0.3, 0.9, mColor, 0, 0.7, 0.85); // trompa
  caja(1.7, 0.12, 0.5, mNegro, 0, 0.55, 1.35); // paragolpes
  caja(1.6, 0.1, 0.45, mColor, 0, 1.05, -1.25); // alerón
  caja(0.12, 0.45, 0.12, mNegro, -0.55, 0.8, -1.15); caja(0.12, 0.45, 0.12, mNegro, 0.55, 0.8, -1.15);
  caja(0.9, 0.5, 0.25, mNegro, 0, 0.85, -0.45); // respaldo
  caja(0.3, 0.3, 0.3, mGris, 0.35, 0.65, -1.2); caja(0.3, 0.3, 0.3, mGris, -0.35, 0.65, -1.2); // escapes
  // volante y piloto
  const volante = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14), mNegro);
  volante.position.set(0, 0.95, 0.45); volante.rotation.x = -1.0; cuerpo.add(volante);
  const piloto = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.35, 4, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 }));
  torso.position.y = 1.05; torso.castShadow = true;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), mColor);
  cabeza.position.y = 1.65; cabeza.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.5 }));
  visor.position.set(0, 1.68, 0.32);
  piloto.add(torso, cabeza, visor);
  piloto.position.z = -0.15;
  cuerpo.add(piloto);
  // ruedas
  const ruedas = [];
  const geoR = new THREE.CylinderGeometry(0.38, 0.38, 0.34, 14).rotateZ(Math.PI / 2);
  for (const [x, z, del] of [[-0.85, 0.85, 1], [0.85, 0.85, 1], [-0.88, -0.9, 0], [0.88, -0.9, 0]]) {
    const pivote = new THREE.Group(); pivote.position.set(x, 0.38, z);
    const r = new THREE.Mesh(geoR, mNegro); r.castShadow = true;
    const llanta = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.36, 8).rotateZ(Math.PI / 2), mGris);
    r.add(llanta);
    pivote.add(r); cuerpo.add(pivote);
    ruedas.push({ pivote, r, del });
  }
  // nombre arriba
  const etiqueta = etiquetaNombre(nombre, color);
  etiqueta.position.y = 2.6;
  g.add(etiqueta);
  // chispas del derrape y fuego del turbo
  const chispas = crearChispas();
  cuerpo.add(chispas.puntos);
  const fuego = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 }));
  const fuego2 = fuego.clone(); fuego.position.set(0.35, 0.65, -1.85); fuego2.position.set(-0.35, 0.65, -1.85);
  fuego.visible = fuego2.visible = false;
  cuerpo.add(fuego, fuego2);
  return { g, cuerpo, ruedas, etiqueta, chispas, fuegos: [fuego, fuego2], piloto };
}

function modeloDesdePlantilla(color, nombre) {
  const g = new THREE.Group(), cuerpo = new THREE.Group();
  g.add(cuerpo);
  const m = plantilla.clone(true);
  cuerpo.add(m);
  const ruedas = [];
  let piloto = new THREE.Group();
  m.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((mt) => (mt?.name?.toLowerCase() === "color" ? Object.assign(mt.clone(), { color: new THREE.Color(color) }) : mt));
      if (o.material.length === 1) o.material = o.material[0];
    }
    const n = (o.name || "").toLowerCase();
    if (n.startsWith("rueda")) {
      // la rueda gira dentro de un pivote para poder doblar las delanteras
      ruedas.push({ pivote: o, r: o, del: n.startsWith("rueda_del") });
    }
    if (n.startsWith("piloto")) piloto = o;
  });
  const etiqueta = etiquetaNombre(nombre, color);
  const caja = new THREE.Box3().setFromObject(m);
  etiqueta.position.y = caja.max.y + 0.8;
  g.add(etiqueta);
  const chispas = crearChispas();
  cuerpo.add(chispas.puntos);
  const fuego = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 }));
  fuego.position.set(0, 0.6, caja.min.z - 0.4); fuego.visible = false;
  cuerpo.add(fuego);
  return { g, cuerpo, ruedas, etiqueta, chispas, fuegos: [fuego], piloto };
}

function etiquetaNombre(nombre, color) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "800 34px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 7; g.strokeStyle = "#000c"; g.strokeText(nombre, 128, 34);
  g.fillStyle = "#" + new THREE.Color(color).getHexString(); g.fillText(nombre, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(3.2, 0.8, 1);
  s.renderOrder = 10;
  return s;
}

function crearChispas() {
  const n = 40, pos = new Float32Array(n * 3), vel = [], vida = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.28, color: 0x3fa9ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const puntos = new THREE.Points(geo, mat);
  puntos.frustumCulled = false;
  for (let i = 0; i < n; i++) vel.push(new THREE.Vector3());
  let sig = 0;
  return {
    puntos,
    emitir(nivel, dir) {
      if (!nivel) return;
      mat.color.setHex(COLOR_NIVEL[nivel]);
      for (let k = 0; k < 2; k++) {
        const i = sig++ % n;
        const x = (k ? 0.85 : -0.85);
        pos.set([x, 0.15, -0.95], i * 3);
        vel[i].set(x * 2 + (Math.random() - 0.5) * 2 - dir * 1.5, 1.5 + Math.random() * 2, -2 - Math.random() * 3);
        vida[i] = 0.35;
      }
    },
    actualizar(dt) {
      for (let i = 0; i < n; i++) {
        if (vida[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        vida[i] -= dt;
        vel[i].y -= 12 * dt;
        pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// anima ruedas, chispas y fuego (sirve para el kart propio y los de los demás)
export function animarModelo(mod, dt, { vel = 0, giro = 0, derrape = 0, dirDerrape = 0, turbo = false, inclinacion = 0 }) {
  for (const w of mod.ruedas) {
    if (w.pivote === w.r) { // rueda de Blender: girar y doblar sobre su propia rotación
      w.base ||= w.r.rotation.clone();
      w.giroAcum = (w.giroAcum || 0) + (vel * dt) / 0.38;
      w.r.rotation.set(w.base.x + w.giroAcum, w.base.y - (w.del ? giro * 0.45 : 0), w.base.z, "YXZ");
      continue;
    }
    w.r.rotation.x += (vel * dt) / 0.38;
    if (w.del) w.pivote.rotation.y = -giro * 0.45;
  }
  // en el derrape la trompa apunta hacia adentro de la curva y el kart se inclina hacia afuera
  mod.cuerpo.rotation.z = THREE.MathUtils.lerp(mod.cuerpo.rotation.z, dirDerrape * 0.1 + giro * 0.035, 1 - Math.exp(-10 * dt));
  mod.cuerpo.rotation.y = THREE.MathUtils.lerp(mod.cuerpo.rotation.y, -dirDerrape * AJUSTES.anguloDerrape - giro * dirDerrape * 0.12, 1 - Math.exp(-9 * dt));
  mod.piloto.rotation.z = giro * 0.15;
  mod.chispas.emitir(derrape, dirDerrape);
  mod.chispas.actualizar(dt);
  for (const f of mod.fuegos) {
    f.visible = turbo;
    if (turbo) f.scale.set(1, 1, 0.8 + Math.random() * 0.6);
  }
}

// ---------- manejo del kart propio ----------
export class Control {
  constructor(RAPIER, mundo, pos, yaw, filtroSuelo) {
    this.R = RAPIER;
    this.mundo = mundo;
    this.cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).lockRotations().setCcdEnabled(true).setLinearDamping(0));
    this.col = mundo.createCollider(RAPIER.ColliderDesc.ball(AJUSTES.radio).setFriction(0).setRestitution(0.15).setDensity(2), this.cuerpo);
    this.filtroSuelo = filtroSuelo; // (collider) => tipo de suelo o null
    this.yaw = yaw;
    this.vel = 0; // velocidad hacia adelante (puede ser negativa)
    this.dirVel = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // hacia dónde se mueve en realidad
    this.normal = ARRIBA.clone();
    this.enSuelo = false;
    this.tipoSuelo = "suelo";
    this.derrapando = false; this.dirDerrape = 0; this.tDerrape = 0; this.nivel = 0;
    this.tTurbo = 0;
    this.salto = 0; // altura visual del saltito
    this.giroVisual = 0;
    this.velAng = 0; // velocidad de giro actual (se suaviza para que no sea instantáneo)
    this.botonAntes = false; this.tBoton = 9; // para detectar el toque del botón de derrape
    this.choque = 0;
  }
  get pos() { const t = this.cuerpo.translation(); return new THREE.Vector3(t.x, t.y, t.z); }
  adelante() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  turbo(seg) { this.tTurbo = Math.max(this.tTurbo, seg); }

  colocar(pos, yaw) {
    this.cuerpo.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.yaw = yaw; this.vel = 0; this.dirVel.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.derrapando = false; this.nivel = 0; this.tTurbo = 0;
  }

  // entrada: { acel, freno, giro (-1..1, + = derecha), derrape (mantener) }
  paso(dt, e, eventos) {
    const A = AJUSTES, R = this.R;
    const t = this.cuerpo.translation();
    // ¿toca el suelo? rayo hacia abajo
    const hit = this.mundo.castRayAndGetNormal(new R.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), A.radio + 0.45, true,
      undefined, undefined, this.col, this.cuerpo, (c) => !!this.filtroSuelo(c));
    this.enSuelo = !!hit;
    if (hit) {
      this.tipoSuelo = this.filtroSuelo(hit.collider);
      const n = hit.normal;
      this.normal.lerp(new THREE.Vector3(n.x, n.y, n.z), 1 - Math.exp(-12 * dt)).normalize();
    } else this.normal.lerp(ARRIBA, 1 - Math.exp(-3 * dt));

    const fuera = this.enSuelo && this.tipoSuelo === "fuera";
    const turbo = this.tTurbo > 0;
    let max = turbo ? A.velMax * A.turbo : fuera ? A.velFuera : A.velMax;
    if (turbo) this.tTurbo -= dt;

    // velocidad
    if (this.enSuelo) {
      if (turbo) this.vel = Math.max(this.vel, Math.min(max, this.vel + A.acel * 2.5 * dt));
      else if (e.acel && !e.freno) { if (this.vel < max) this.vel = Math.min(max, this.vel + (this.vel < 0 ? A.frenoReversa : A.acel * (1 - Math.max(0, this.vel) / max * 0.55)) * dt); }
      else if (e.freno) this.vel -= (this.vel > 0 ? A.frenoReversa : A.acel * 0.6) * dt;
      else this.vel -= Math.sign(this.vel) * Math.min(Math.abs(this.vel), A.roce * dt);
      if (this.vel > max) this.vel = Math.max(max, this.vel - (fuera ? 40 : 18) * dt);
      this.vel = Math.max(-A.velReversa, this.vel);
    }

    // derrape como Mario Kart: tocás el botón → saltito; la dirección se elige con el giro
    // (al tocar o durante los primeros instantes) y se mantiene mientras tengas el botón apretado
    const giro = THREE.MathUtils.clamp(e.giro || 0, -1, 1);
    const toque = e.derrape && !this.botonAntes;
    this.botonAntes = !!e.derrape;
    this.tBoton = e.derrape ? (toque ? 0 : this.tBoton + dt) : 9;
    if (toque && this.enSuelo && !this.derrapando) { this.salto = 0.32; eventos.push("salto"); }
    if (e.derrape && !this.derrapando && this.tBoton < 0.45 && Math.abs(giro) > 0.3 && this.vel > A.velMax * A.velMinDerrape && !fuera) {
      this.derrapando = true; this.dirDerrape = Math.sign(giro); this.tDerrape = 0; this.nivel = 0;
    }
    if (this.derrapando && (!e.derrape || this.vel < A.velMax * 0.35 || fuera)) {
      // al soltar: turbo según el nivel alcanzado
      if (!e.derrape && this.nivel > 0 && !fuera) { this.turbo(A.turboDerrape[this.nivel - 1]); eventos.push("turbo"); }
      this.derrapando = false; this.dirDerrape = 0; this.nivel = 0;
    }

    // giro: se calcula el giro pedido y la velocidad de giro se acerca suave (da peso al kart)
    const velAbs = Math.abs(this.vel);
    let objetivo;
    if (this.derrapando) {
      const s = giro * this.dirDerrape; // +1 = hacia adentro, -1 = hacia afuera
      const g = s >= 0 ? THREE.MathUtils.lerp(A.giroDerrapeNeutro, A.giroDerrapeAdentro, s) : THREE.MathUtils.lerp(A.giroDerrapeNeutro, A.giroDerrapeAfuera, -s);
      objetivo = this.dirDerrape * g;
      // la carga del mini-turbo va más rápido doblando hacia adentro
      const antes = this.nivel;
      this.tDerrape += dt * (s > 0.3 ? 1.15 : s < -0.3 ? 0.6 : 0.9);
      this.nivel = A.nivelesDerrape.filter((x) => this.tDerrape >= x).length;
      if (this.nivel > antes) eventos.push("chispa" + this.nivel);
    } else {
      // gira menos a muy baja velocidad y un poco menos a tope, en reversa al revés
      const factor = Math.min(1, velAbs / 6) * (1 - 0.2 * Math.min(1, velAbs / A.velMax)) * Math.sign(this.vel || 1);
      objetivo = giro * A.giro * factor;
    }
    if (!this.enSuelo) objetivo *= 0.5;
    this.velAng += (objetivo - this.velAng) * (1 - Math.exp(-A.respuestaGiro * dt));
    this.yaw -= this.velAng * dt; // + = derecha
    this.giroVisual = giro;

    // la velocidad sigue al rumbo con agarre alto: el kart va a donde apunta
    const f = this.adelante();
    this.dirVel.lerp(f, 1 - Math.exp(-(this.derrapando ? A.agarreDerrape : A.agarre) * dt)).normalize();
    if (this.vel < 0) this.dirVel.copy(f);

    // aplicar: la velocidad se proyecta sobre el plano del suelo (así sube y baja rampas)
    const lv = this.cuerpo.linvel();
    const deseada = this.dirVel.clone().multiplyScalar(this.vel);
    if (this.enSuelo) {
      deseada.addScaledVector(this.normal, -deseada.dot(this.normal));
      deseada.normalize().multiplyScalar(Math.abs(this.vel) * Math.sign(this.vel || 1));
      if (this.vel < 0) deseada.copy(f).multiplyScalar(this.vel).addScaledVector(this.normal, -f.clone().multiplyScalar(this.vel).dot(this.normal));
      this.cuerpo.setLinvel({ x: deseada.x, y: deseada.y - 2.5, z: deseada.z }, true);
    } else {
      this.cuerpo.setLinvel({ x: deseada.x, y: lv.y, z: deseada.z }, true);
    }
    this.salto = Math.max(0, this.salto - dt * 1.6);
    this.choque = Math.max(0, this.choque - dt);
  }

  // después del paso de la física: si chocó con una pared, pierde velocidad
  despues(eventos) {
    const lv = this.cuerpo.linvel();
    const real = Math.hypot(lv.x, lv.z);
    if (Math.abs(this.vel) > 8 && real < Math.abs(this.vel) * 0.55) {
      this.vel = Math.sign(this.vel) * real;
      if (this.choque <= 0) { eventos.push("choque"); this.choque = 0.4; }
      if (this.derrapando) { this.derrapando = false; this.nivel = 0; this.dirDerrape = 0; }
      this.velAng *= 0.3;
    }
  }

  // orienta el modelo según el rumbo y la pendiente
  aplicarModelo(mod) {
    const p = this.pos;
    mod.g.position.set(p.x, p.y - AJUSTES.radio + Math.sin(this.salto * Math.PI / 0.35) * 0.35 * (this.salto > 0 ? 1 : 0), p.z);
    const f = this.adelante();
    const derecha = new THREE.Vector3().crossVectors(f, this.normal).normalize();
    const fn = new THREE.Vector3().crossVectors(this.normal, derecha).normalize();
    const m = new THREE.Matrix4().makeBasis(derecha.negate(), this.normal, fn);
    mod.g.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 0.35);
  }
}
