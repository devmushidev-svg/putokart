// Pistas: una de prueba hecha con código y el cargador de pistas hechas en Blender (.glb).
//
// Una pista es: { grupo (lo que se ve), colisiones: [{ verts, idx, tipo }], salidas: [{ pos, yaw }],
//                 camino: [Vector3...] (el recorrido en orden, para vueltas y posiciones),
//                 turbos: [{ pos, r }], cielo, ancho }
// tipos de colisión: "suelo" (pista), "fuera" (pasto: frena), "pared".
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ARRIBA = new THREE.Vector3(0, 1, 0);

// ---------- texturas hechas con canvas ----------
function textura(w, h, dibujar, repetir = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  dibujar(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function ruido(g, w, h, base, var_, n = 4000, tam = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * var_;
    g.fillStyle = `rgba(${v > 0 ? "255,255,255" : "0,0,0"},${Math.abs(v)})`;
    g.fillRect(Math.random() * w, Math.random() * h, tam, tam);
  }
}
const texAsfalto = () => textura(256, 256, (g, w, h) => {
  ruido(g, w, h, "#4a4c52", 0.18, 9000, 2);
  // línea central discontinua
  g.fillStyle = "#e9e4d0";
  g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
});
const texBordillo = () => textura(64, 64, (g, w, h) => {
  g.fillStyle = "#d62828"; g.fillRect(0, 0, w, h / 2);
  g.fillStyle = "#f5f5f5"; g.fillRect(0, h / 2, w, h / 2);
});
const texPasto = () => textura(256, 256, (g, w, h) => {
  ruido(g, w, h, "#4f9a3a", 0.22, 12000, 3);
  g.globalAlpha = 0.08;
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "#3c7f2b" : "#62b048"; g.fillRect(0, i * (h / 12), w, h / 12); }
});
const texMuro = () => textura(128, 64, (g, w, h) => {
  ruido(g, w, h, "#d8d2c4", 0.12, 1500, 2);
  g.fillStyle = "#1d6fd6"; g.fillRect(0, h * 0.62, w, h * 0.16);
  g.fillStyle = "#f4c430"; g.fillRect(0, h * 0.78, w, h * 0.06);
});
const texTierra = () => textura(128, 128, (g, w, h) => ruido(g, w, h, "#7a5a3a", 0.2, 3000, 3));
const texMeta = () => textura(128, 32, (g, w, h) => {
  const c = 16;
  for (let x = 0; x < w / c; x++) for (let y = 0; y < h / c; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#fff"; g.fillRect(x * c, y * c, c, c); }
});
const texTurbo = () => textura(128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, "#ff7a00"); gr.addColorStop(1, "#ffe14d");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff8";
  for (let i = 0; i < 3; i++) { const y = h - i * 42 - 10; g.beginPath(); g.moveTo(w * 0.15, y); g.lineTo(w / 2, y - 30); g.lineTo(w * 0.85, y); g.lineTo(w * 0.85, y - 12); g.lineTo(w / 2, y - 42); g.lineTo(w * 0.15, y - 12); g.fill(); }
}, false);
const texCartel = (texto) => textura(512, 128, (g, w, h) => {
  g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#f4c430"; g.font = "900 78px Impact, Arial Black, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(texto, w / 2, h / 2 + 4);
}, false);

// ---------- cinta a lo largo del recorrido ----------
// desde/hasta: desplazamiento lateral (negativo = izquierda); alto: altura extra en cada borde
function cinta(puntos, derechas, desde, hasta, { altoA = 0, altoB = 0, abajo = 0, repV = 10, cerrar = true } = {}) {
  const verts = [], uvs = [], idx = [];
  let dist = 0;
  const n = puntos.length;
  for (let i = 0; i <= n; i++) {
    const k = i % n, p = puntos[k], r = derechas[k];
    if (i > 0) dist += p.distanceTo(puntos[(i - 1) % n]);
    const a = p.clone().addScaledVector(r, desde), b = p.clone().addScaledVector(r, hasta);
    a.y += altoA - abajo; b.y += altoB - abajo;
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uvs.push(0, dist / repV, 1, dist / repV);
    if (i > 0) { const j = (i - 1) * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); } // incluye el tramo que cierra la vuelta
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
const datosColision = (geo, tipo) => ({
  verts: new Float32Array(geo.attributes.position.array),
  idx: new Uint32Array(geo.index ? geo.index.array : [...Array(geo.attributes.position.count).keys()]),
  tipo,
});

// ---------- pista de prueba ----------
export function pistaPrueba() {
  // recorrido cerrado con subida, puente y curvas cerradas (x, altura, z)
  const control = [
    [0, 0, 0], [60, 0, 0], [110, 0, -20], [135, 3, -70], [120, 8, -120], [70, 10, -140], [15, 10, -130],
    [-15, 7, -95], [-35, 3, -55], [-80, 0, -60], [-125, 0, -95], [-165, 0, -60], [-150, 0, 0], [-95, 0, 25], [-45, 0, 10],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curva = new THREE.CatmullRomCurve3(control, true, "centripetal");
  const N = 700;
  const puntos = curva.getSpacedPoints(N).slice(0, N);
  const derechas = puntos.map((p, i) => {
    const t = puntos[(i + 1) % N].clone().sub(puntos[(i - 1 + N) % N]); t.y = 0; t.normalize();
    return new THREE.Vector3().crossVectors(t, ARRIBA).normalize();
  });
  const ancho = 16, borde = 1.4, banquina = 7;
  const grupo = new THREE.Group(), colisiones = [];
  const mat = (tex, rep = [1, 1], extra = {}) => { if (tex.wrapS === THREE.RepeatWrapping) tex.repeat.set(...rep); return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, ...extra }); };
  const agregar = (geo, material, tipo, sombra = true) => {
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = sombra;
    grupo.add(m);
    if (tipo) colisiones.push(datosColision(geo, tipo));
    return m;
  };
  const h = ancho / 2;
  agregar(cinta(puntos, derechas, -h, h), mat(texAsfalto(), [1, 1]), "suelo");
  // bordillos rojo/blanco
  const mB = mat(texBordillo(), [1, 1]);
  agregar(cinta(puntos, derechas, -h - borde, -h, { altoA: 0.04, altoB: 0.04, repV: 3 }), mB, "suelo");
  agregar(cinta(puntos, derechas, h, h + borde, { altoA: 0.04, altoB: 0.04, repV: 3 }), mB, "suelo");
  // banquinas de pasto (frenan)
  const mP = mat(texPasto(), [2, 2]);
  agregar(cinta(puntos, derechas, -h - borde - banquina, -h - borde, { repV: 14 }), mP, "fuera");
  agregar(cinta(puntos, derechas, h + borde, h + borde + banquina, { repV: 14 }), mP, "fuera");
  // muros a los costados
  const lim = h + borde + banquina, mM = mat(texMuro(), [1, 1], { side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const geo = muro(puntos, derechas, s * lim, 1.6);
    agregar(geo, mM, "pared", false).castShadow = true;
    // "pollera" de tierra debajo de los tramos elevados
    const pol = muro(puntos, derechas, s * lim, -40, 0); // pared de tierra hacia abajo
    agregar(pol, mat(texTierra(), [1, 1], { side: THREE.DoubleSide }), null, false);
  }
  // suelo del mundo
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 30, 30).rotateX(-Math.PI / 2), mat(texPasto(), [60, 60]));
  // el piso del mundo va bien abajo: si está pegado a la pista, a lo lejos "atraviesa" el asfalto
  piso.position.y = -2.5; piso.receiveShadow = true;
  grupo.add(piso);
  colisiones.push(datosColision(piso.geometry.clone().translate(0, -2.5, 0), "fuera"));

  // línea de meta y arco
  const meta = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 2.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texMeta(), roughness: 0.8 }));
  orientar(meta, puntos[0], derechas[0]); meta.position.y += 0.03;
  grupo.add(meta);
  const arc = arco(puntos[0], derechas[0], ancho + 2 * borde + 4);
  grupo.add(arc);
  // los postes del arco chocan
  arc.updateMatrixWorld(true);
  arc.children.filter((o) => o.userData.poste).forEach((o) => colisiones.push(datosColision(o.geometry.clone().applyMatrix4(o.matrixWorld), "pared")));
  // turbos en la pista
  const turbos = [];
  const mT = new THREE.MeshBasicMaterial({ map: texTurbo(), transparent: true });
  for (const f of [0.14, 0.47, 0.83]) {
    const i = Math.floor(f * N), lado = (Math.floor(f * 10) % 2 ? 1 : -1) * 3.2;
    const pos = puntos[i].clone().addScaledVector(derechas[i], lado);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(4, 5).rotateX(-Math.PI / 2), mT);
    orientar(pad, pos, derechas[i]); pad.position.y += 0.05;
    grupo.add(pad);
    turbos.push({ pos, r: 2.6 });
  }
  decorar(grupo, puntos, lim + 6);

  // ---------- cosas al borde de la pista: pasan volando y se siente la velocidad ----------
  const curv = puntos.map((_, i) => {
    const a = puntos[(i - 10 + N) % N], b = puntos[i], c = puntos[(i + 10) % N];
    const d1 = Math.atan2(b.x - a.x, b.z - a.z), d2 = Math.atan2(c.x - b.x, c.z - b.z);
    return Math.atan2(Math.sin(d2 - d1), Math.cos(d2 - d1)); // + = dobla a la izquierda
  });
  bordes(grupo, puntos, derechas, curv, lim, h + borde);
  tribuna(grupo, puntos, derechas, lim);

  // ---------- rampas (en las rectas): saltás y con un truco en el aire ganás turbo ----------
  const rampas = [];
  const mR = new THREE.MeshStandardMaterial({ map: texRampa(), roughness: 0.7 });
  for (const f of [0.42, 0.76]) {
    let i = Math.floor(f * N), mejor = i;
    for (let k = -25; k <= 25; k++) if (Math.abs(curv[(i + k + N) % N]) < Math.abs(curv[mejor])) mejor = (i + k + N) % N;
    agregar(rampa(puntos, derechas, mejor, 6, 1.7, h), mR, "suelo").castShadow = true;
    rampas.push(mejor);
  }

  // cajas de ítems: filas de 4 a lo ancho; monedas: hileras de 5
  const cajas = [], monedas = [];
  for (const f of [0.28, 0.6, 0.93]) {
    const i = Math.floor(f * N);
    for (const l of [-5.25, -1.75, 1.75, 5.25]) cajas.push({ pos: puntos[i].clone().addScaledVector(derechas[i], l).add(new THREE.Vector3(0, 1.2, 0)) });
  }
  for (const [f, l] of [[0.06, -3.5], [0.2, 3.5], [0.52, 0], [0.68, -4], [0.86, 4]]) {
    for (let k = 0; k < 5; k++) {
      const i = (Math.floor(f * N) + k * 4) % N;
      monedas.push({ pos: puntos[i].clone().addScaledVector(derechas[i], l).add(new THREE.Vector3(0, 0.9, 0)) });
    }
  }

  // salidas: 8 lugares en dos columnas detrás de la meta
  const salidas = [];
  for (let k = 0; k < 8; k++) {
    const i = (N - 6 - Math.floor(k / 2) * 6 + N) % N;
    const pos = puntos[i].clone().addScaledVector(derechas[i], k % 2 ? 3.5 : -3.5);
    pos.y += 1;
    const t = puntos[(i + 1) % N].clone().sub(puntos[i]);
    salidas.push({ pos, yaw: Math.atan2(t.x, t.z) });
  }
  return { nombre: "Circuito de Prueba", grupo, colisiones, salidas, camino: puntos, turbos, ancho, cajas, monedas, rampas };
}

// rampa: cuña a lo ancho de la pista que sube "alto" metros en "largo" puntos del recorrido
function rampa(puntos, derechas, i0, largo, alto, h) {
  const n = puntos.length, verts = [], idx = [], uvs = [];
  const v = (p, u, w) => { verts.push(p.x, p.y, p.z); uvs.push(u, w); return verts.length / 3 - 1; };
  const filas = [];
  for (let k = 0; k <= largo; k++) {
    const i = (i0 + k) % n, y = (k / largo) ** 1.4 * alto + 0.02;
    const a = puntos[i].clone().addScaledVector(derechas[i], -h).add(new THREE.Vector3(0, y, 0));
    const b = puntos[i].clone().addScaledVector(derechas[i], h).add(new THREE.Vector3(0, y, 0));
    filas.push([v(a, 0, k / largo), v(b, 1, k / largo), i]);
  }
  for (let k = 1; k < filas.length; k++) { const [a0, b0] = filas[k - 1], [a1, b1] = filas[k]; idx.push(a0, b0, a1, b0, b1, a1); }
  // frente vertical (donde termina la rampa)
  const [af, bf, i] = filas[filas.length - 1];
  const ab = v(puntos[i].clone().addScaledVector(derechas[i], -h), 0, 0), bb = v(puntos[i].clone().addScaledVector(derechas[i], h), 1, 0);
  idx.push(af, ab, bf, bf, ab, bb);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// conos en las curvas, carteles con flechas del lado de afuera, postes de luz, pilas de llantas
function bordes(grupo, puntos, derechas, curv, lim, bordePista) {
  const n = puntos.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const yaw = (i) => Math.atan2(puntos[(i + 1) % n].x - puntos[i].x, puntos[(i + 1) % n].z - puntos[i].z);
  const instanciar = (geo, mat, lista) => {
    if (!lista.length) return;
    const im = new THREE.InstancedMesh(geo, mat, lista.length);
    lista.forEach(([pos, ang], k) => { m.compose(pos, q.setFromAxisAngle(ARRIBA, ang), s); im.setMatrixAt(k, m); });
    im.castShadow = true;
    grupo.add(im);
  };
  // postes de luz a los dos lados, cada ~15 m, con el brazo hacia la pista
  const postes = [];
  for (let i = 0; i < n; i += 10) for (const l of [-1, 1]) {
    const pos = puntos[i].clone().addScaledVector(derechas[i], l * (lim + 1.2));
    const hacia = puntos[i].clone().sub(pos);
    postes.push([pos, Math.atan2(hacia.x, hacia.z)]);
  }
  const mGris = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.4 });
  instanciar(new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0), mGris, postes);
  instanciar(new THREE.BoxGeometry(0.15, 0.15, 2.2).translate(0, 7, 0.9), mGris, postes);
  instanciar(new THREE.BoxGeometry(0.5, 0.18, 0.7).translate(0, 6.92, 1.9), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), postes);
  // conos del lado de adentro de las curvas cerradas y carteles de flechas del lado de afuera
  const conos = [], carteles = { "-1": [], "1": [] }, llantas = [];
  for (let i = 0; i < n; i += 6) {
    const c = curv[i];
    if (Math.abs(c) < 0.32) continue;
    const adentro = c > 0 ? -1 : 1;
    conos.push([puntos[i].clone().addScaledVector(derechas[i], adentro * (bordePista + 1.2)), Math.random() * 6]);
    if (i % 12 === 0) {
      const pos = puntos[i].clone().addScaledVector(derechas[i], -adentro * (lim - 0.3)).add(new THREE.Vector3(0, 1.2, 0));
      carteles[adentro].push([pos, yaw(i) + Math.PI]);
    }
    if (i % 24 === 0) llantas.push([puntos[i].clone().addScaledVector(derechas[i], -adentro * (lim - 1.4)), Math.random() * 6]);
  }
  instanciar(new THREE.ConeGeometry(0.32, 0.85, 8).translate(0, 0.42, 0), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 }), conos);
  instanciar(new THREE.BoxGeometry(0.75, 0.08, 0.75).translate(0, 0.04, 0), new THREE.MeshStandardMaterial({ color: 0xff6a00 }), conos);
  for (const lado of [-1, 1]) instanciar(new THREE.PlaneGeometry(3.2, 1.3), new THREE.MeshBasicMaterial({ map: texFlechas(lado), side: THREE.DoubleSide }), carteles[lado]);
  const pilas = llantas.flatMap(([pos, a]) => [0, 1, 2].map((k) => [pos.clone().add(new THREE.Vector3(0, 0.22 + k * 0.42, 0)), a + k]));
  instanciar(new THREE.TorusGeometry(0.5, 0.22, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.9 }), pilas);
}

// tribunas con público a los dos lados de la recta de largada
function tribuna(grupo, puntos, derechas, lim) {
  const n = puntos.length, t = textura(256, 128, (g, w, h) => {
    g.fillStyle = "#2b2f3a"; g.fillRect(0, 0, w, h);
    const cols = ["#e63946", "#f4c430", "#2a9df4", "#2ec27e", "#ffffff", "#ff8c1a", "#a05cf0", "#ffd1a8"];
    for (let y = 6; y < h; y += 14) for (let x = 4; x < w; x += 9) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0]; g.fillRect(x, y, 6, 7);
      g.fillStyle = "#f2c9a0"; g.fillRect(x + 1, y - 4, 4, 4);
    }
  });
  t.repeat.set(4, 1);
  const mGente = new THREE.MeshStandardMaterial({ map: t }), mGris = new THREE.MeshStandardMaterial({ color: 0x5a606e });
  for (const lado of [1, -1]) {
    const g = new THREE.Group(), i = (n - 22) % n;
    for (let k = 0; k < 5; k++) {
      const esc = new THREE.Mesh(new THREE.BoxGeometry(48, 1.1, 2), [mGris, mGris, mGris, mGris, mGente, mGente]);
      esc.position.set(0, 0.55 + k * 1.1, k * 2);
      esc.castShadow = esc.receiveShadow = true;
      g.add(esc);
    }
    const techo = new THREE.Mesh(new THREE.BoxGeometry(50, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xd62828 }));
    techo.position.set(0, 8.5, 4); g.add(techo);
    const pos = puntos[i].clone().addScaledVector(derechas[i], lado * (lim + 5));
    g.position.set(pos.x, pos.y - 0.2, pos.z);
    // que la gente mire hacia la pista
    const hacia = puntos[i].clone().sub(pos);
    g.rotation.y = Math.atan2(-hacia.x, -hacia.z);
    grupo.add(g);
  }
}
const texRampa = () => textura(128, 128, (g, w, h) => {
  g.fillStyle = "#ffd23f"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#111";
  for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 48, h); g.lineTo(k * 32 + 32, h); g.fill(); }
});
const texFlechas = (lado) => textura(256, 104, (g, w, h) => {
  g.fillStyle = "#14213d"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#ffd23f";
  for (let k = 0; k < 3; k++) {
    const x0 = 30 + k * 70;
    g.beginPath();
    if (lado > 0) { g.moveTo(x0, 12); g.lineTo(x0 + 40, h / 2); g.lineTo(x0, h - 12); g.lineTo(x0 + 18, h - 12); g.lineTo(x0 + 58, h / 2); g.lineTo(x0 + 18, 12); }
    else { g.moveTo(x0 + 58, 12); g.lineTo(x0 + 18, h / 2); g.lineTo(x0 + 58, h - 12); g.lineTo(x0 + 40, h - 12); g.lineTo(x0, h / 2); g.lineTo(x0 + 40, 12); }
    g.fill();
  }
}, false);

function muro(puntos, derechas, lateral, alto, base = 0) {
  const verts = [], idx = [], uvs = [];
  const n = puntos.length;
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    const p = puntos[i % n], r = derechas[i % n];
    if (i > 0) dist += p.distanceTo(puntos[(i - 1) % n]);
    const a = p.clone().addScaledVector(r, lateral);
    verts.push(a.x, a.y + base, a.z, a.x, a.y + base + alto, a.z);
    uvs.push(dist / 8, 0, dist / 8, 1);
    if (i > 0) { const j = (i - 1) * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
function orientar(obj, pos, derecha) {
  obj.position.copy(pos);
  const adelante = new THREE.Vector3().crossVectors(ARRIBA, derecha).normalize();
  obj.rotation.y = Math.atan2(adelante.x, adelante.z);
}
function arco(pos, derecha, ancho) {
  const g = new THREE.Group();
  const mPal = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const pal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 10), mPal);
    pal.position.set(s * ancho / 2, 4.5, 0); pal.castShadow = true; pal.userData.poste = true;
    g.add(pal);
  }
  const cartel = new THREE.Mesh(new THREE.BoxGeometry(ancho, 2.6, 0.5), [mPal, mPal, mPal, mPal,
    new THREE.MeshBasicMaterial({ map: texCartel("PUTO KART") }), new THREE.MeshBasicMaterial({ map: texCartel("PUTO KART") })]);
  cartel.position.y = 8.6;
  g.add(cartel);
  orientar(g, pos, derecha);
  return g;
}
function decorar(grupo, puntos, minDist) {
  // árboles y rocas lejos del recorrido (instanciados para que no pese)
  const lejos = (x, z) => puntos.every((p, i) => i % 5 || (p.x - x) ** 2 + (p.z - z) ** 2 > minDist * minDist);
  const tronco = new THREE.CylinderGeometry(0.4, 0.6, 3, 6).translate(0, 1.5, 0);
  const copa = new THREE.ConeGeometry(2.6, 6, 7).translate(0, 5.5, 0);
  const n = 160;
  const it = new THREE.InstancedMesh(tronco, new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), n);
  const ic = new THREE.InstancedMesh(copa, new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.9 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0, intentos = 0;
  while (k < n && intentos++ < 5000) {
    const x = (Math.random() - 0.5) * 520, z = (Math.random() - 0.5) * 420 - 60;
    if (!lejos(x, z)) continue;
    const e = 0.7 + Math.random() * 0.9;
    m.compose(p.set(x, -2.5, z), q.setFromAxisAngle(ARRIBA, Math.random() * 6), s.set(e, e, e));
    it.setMatrixAt(k, m); ic.setMatrixAt(k, m); k++;
  }
  it.count = ic.count = k;
  it.castShadow = ic.castShadow = true;
  grupo.add(it, ic);
}

// ---------- pista hecha en Blender (.glb) ----------
// Convención de nombres de objetos:
//   col_suelo*, col_fuera*, col_pared*  → colisiones invisibles (pista, pasto que frena, paredes)
//   salida_1 … salida_8                 → lugares de largada (mirando hacia adelante = -Y de Blender)
//   checkpoint_1 … checkpoint_N         → el recorrido en orden (el 1 es la meta)
//   turbo*                              → zonas de turbo
//   todo lo demás                       → se ve, sin colisión
export async function pistaGLB(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const escena = gltf.scene;
  escena.updateMatrixWorld(true);
  const colisiones = [], salidas = [], cps = [], turbos = [], cajasG = [], monedasG = [];
  const ocultar = [];
  escena.traverse((o) => {
    const n = (o.name || "").toLowerCase();
    if (o.isMesh && n.startsWith("col_")) {
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      colisiones.push(datosColision(geo, n.includes("pared") ? "pared" : n.includes("fuera") ? "fuera" : "suelo"));
      ocultar.push(o);
    } else if (n.startsWith("salida")) {
      const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const dir = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
      salidas.push({ n: parseInt(n.replace(/\D/g, "")) || 0, pos: pos.add(new THREE.Vector3(0, 1, 0)), yaw: Math.atan2(dir.x, dir.z) });
    } else if (n.startsWith("checkpoint")) {
      cps.push({ n: parseInt(n.replace(/\D/g, "")) || 0, pos: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) });
    } else if (n.startsWith("caja")) {
      cajasG.push({ pos: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) }); ocultar.push(o);
    } else if (n.startsWith("moneda")) {
      monedasG.push({ pos: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) }); ocultar.push(o);
    } else if (n.startsWith("turbo")) {
      turbos.push({ pos: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), r: 2.6 });
    } else if (o.isMesh) { o.castShadow = o.receiveShadow = true; }
  });
  ocultar.forEach((o) => (o.visible = false));
  // si no hay colisiones aparte, se usa todo lo visible como suelo
  if (!colisiones.length) escena.traverse((o) => { if (o.isMesh) colisiones.push(datosColision(o.geometry.clone().applyMatrix4(o.matrixWorld), "suelo")); });
  cps.sort((a, b) => a.n - b.n);
  salidas.sort((a, b) => a.n - b.n);
  // camino: se rellena entre checkpoints para tener muchos puntos
  const camino = [];
  for (let i = 0; i < cps.length; i++) {
    const a = cps[i].pos, b = cps[(i + 1) % cps.length].pos, pasos = Math.max(2, Math.round(a.distanceTo(b) / 1.5));
    for (let k = 0; k < pasos; k++) camino.push(a.clone().lerp(b, k / pasos));
  }
  return { nombre: url.split("/").pop().replace(".glb", ""), grupo: escena, colisiones, salidas, camino, turbos, ancho: 16, cajas: cajasG, monedas: monedasG, rampas: [] };
}

// ---------- recorrido: en qué parte de la pista está un punto ----------
export class Recorrido {
  constructor(camino) {
    this.p = camino;
    this.n = camino.length;
  }
  // índice del punto más cercano, buscando cerca del anterior (o en todo el camino si no hay)
  cercano(pos, anterior = -1) {
    const n = this.n;
    let mejor = -1, md = Infinity;
    const revisar = (i) => { const q = this.p[i], d = (q.x - pos.x) ** 2 + (q.z - pos.z) ** 2 + ((q.y - pos.y) * 2) ** 2; if (d < md) { md = d; mejor = i; } };
    if (anterior < 0) for (let i = 0; i < n; i++) revisar(i);
    else for (let k = -30; k <= 30; k++) revisar((anterior + k + n) % n);
    if (anterior >= 0 && md > 400) for (let i = 0; i < n; i++) revisar(i); // se perdió (respawn, atajo)
    return mejor;
  }
  direccion(i) {
    const a = this.p[i], b = this.p[(i + 2) % this.n];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
}
