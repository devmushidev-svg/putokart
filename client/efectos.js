// Efectos para que se sienta la velocidad y los golpes: humo/polvo, líneas de velocidad y marcas de llantas.
import * as THREE from "three";

// ---------- partículas (humo, polvo, chispas de golpe, estrellitas) ----------
// Un solo sistema de puntos con tamaño, color y transparencia por partícula (barato: 1 draw call).
const texRedonda = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.6, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
})();

export class Particulas {
  constructor(escena, max = 900) {
    this.max = max; this.sig = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.tam = new Float32Array(max); this.alfa = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.vida = new Float32Array(max); this.vidaMax = new Float32Array(max);
    this.crece = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("tam", new THREE.BufferAttribute(this.tam, 1));
    geo.setAttribute("alfa", new THREE.BufferAttribute(this.alfa, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { mapa: { value: texRedonda }, escala: { value: 300 } },
      vertexShader: `attribute float tam; attribute float alfa; varying vec3 vCol; varying float vA;
        void main() { vCol = color; vA = alfa; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = tam * 300.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D mapa; varying vec3 vCol; varying float vA;
        void main() { vec4 t = texture2D(mapa, gl_PointCoord); if (t.a * vA < 0.04) discard; gl_FragColor = vec4(vCol, t.a * vA); }`,
      transparent: true, depthWrite: false, vertexColors: true,
    });
    this.puntos = new THREE.Points(geo, mat);
    this.puntos.frustumCulled = false;
    escena.add(this.puntos);
  }
  // opciones: color (THREE.Color/hex), tam, vida, vel [x,y,z], dispersion, crece, gravedad, alfa
  emitir(p, n, o = {}) {
    const c = new THREE.Color(o.color ?? 0xffffff);
    for (let k = 0; k < n; k++) {
      const i = this.sig++ % this.max, d = o.dispersion ?? 1;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * (o.radio ?? 0.4);
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * (o.radio ?? 0.4) * 0.5;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * (o.radio ?? 0.4);
      const v = o.vel || [0, 0, 0];
      this.vel[i * 3] = v[0] + (Math.random() - 0.5) * d * 2;
      this.vel[i * 3 + 1] = v[1] + Math.random() * d;
      this.vel[i * 3 + 2] = v[2] + (Math.random() - 0.5) * d * 2;
      const vm = (o.vida ?? 0.8) * (0.7 + Math.random() * 0.6);
      this.vida[i] = this.vidaMax[i] = vm;
      this.tam[i] = (o.tam ?? 0.6) * (0.7 + Math.random() * 0.6);
      this.crece[i] = o.crece ?? 1.5; this.grav[i] = o.gravedad ?? 0;
      this.alfa[i] = o.alfa ?? 0.7;
      const var_ = o.variacion ?? 0.08;
      this.col[i * 3] = c.r * (1 - Math.random() * var_); this.col[i * 3 + 1] = c.g * (1 - Math.random() * var_); this.col[i * 3 + 2] = c.b * (1 - Math.random() * var_);
    }
  }
  actualizar(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.vida[i] <= 0) { this.alfa[i] = 0; continue; }
      this.vida[i] -= dt;
      const t = this.vida[i] / this.vidaMax[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const fr = Math.exp(-2.5 * dt);
      this.vel[i * 3] *= fr; this.vel[i * 3 + 2] *= fr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.tam[i] += this.crece[i] * dt;
      this.alfa[i] = Math.max(0, Math.min(this.alfa[i], t * 0.9));
    }
    for (const n of ["position", "color", "tam", "alfa"]) this.geo.attributes[n].needsUpdate = true;
  }
}

// ---------- líneas de velocidad: rayas que pasan volando alrededor de la cámara ----------
export class LineasVelocidad {
  constructor(camara, n = 70) {
    this.n = n;
    const pos = new Float32Array(n * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.lineas = new THREE.LineSegments(this.geo, this.mat);
    this.lineas.frustumCulled = false;
    this.lineas.renderOrder = 20;
    camara.add(this.lineas);
    this.datos = Array.from({ length: n }, () => this.nueva({}, true));
  }
  nueva(l, primera = false) {
    const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 3.5;
    l.x = Math.cos(a) * r * 1.4; l.y = Math.sin(a) * r * 0.9; l.z = primera ? -Math.random() * 40 : -40 - Math.random() * 10;
    l.largo = 2 + Math.random() * 5;
    return l;
  }
  // intensidad 0..1 (0 = no se ven), vel en m/s
  actualizar(dt, intensidad, vel) {
    this.mat.opacity += (Math.min(0.55, intensidad) - this.mat.opacity) * (1 - Math.exp(-6 * dt));
    this.lineas.visible = this.mat.opacity > 0.01;
    if (!this.lineas.visible) return;
    const p = this.geo.attributes.position.array, avance = (vel * 1.6 + 30) * dt;
    this.datos.forEach((l, i) => {
      l.z += avance;
      if (l.z > -1) this.nueva(l);
      p.set([l.x, l.y, l.z, l.x, l.y, l.z - l.largo * (0.6 + intensidad)], i * 6);
    });
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ---------- marcas de llantas en el asfalto al derrapar ----------
export class Marcas {
  constructor(escena, max = 500) {
    this.max = max; this.sig = 0;
    const geo = new THREE.PlaneGeometry(0.32, 1).rotateX(-Math.PI / 2);
    this.malla = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.45, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), max);
    this.malla.frustumCulled = false;
    const cero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.malla.setMatrixAt(i, cero);
    escena.add(this.malla);
    this.ultimas = new Map();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3();
  }
  // deja una marca entre la posición anterior de esa rueda y la actual
  marcar(clave, pos) {
    const ant = this.ultimas.get(clave);
    this.ultimas.set(clave, pos.clone());
    if (!ant) return;
    const d = pos.distanceTo(ant);
    if (d < 0.05 || d > 3) return;
    const medio = ant.clone().add(pos).multiplyScalar(0.5); medio.y += 0.03;
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().sub(ant).normalize());
    this.m.compose(medio, this.q, this.s.set(1, 1, d));
    this.malla.setMatrixAt(this.sig++ % this.max, this.m);
    this.malla.instanceMatrix.needsUpdate = true;
  }
  cortar(clave) { this.ultimas.delete(clave); }
}
