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

// ---------- líneas de velocidad estilo anime ----------
// Rayas en cuña que salen del centro de la pantalla hacia los bordes y parpadean muy rápido (cada raya
// cambia de lugar 20 veces por segundo). Va dibujado encima de todo, dentro de la imagen chica,
// así que también se pixela con el filtro PS1.
export class LineasVelocidad {
  constructor(escena) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uInt: { value: 0 }, uAsp: { value: 1 }, uCol: { value: new THREE.Color(1, 1, 1) }, uBorde: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform float uT, uInt, uAsp; uniform vec3 uCol, uBorde; varying vec2 vUv;
        float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        void main() {
          vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(uAsp, 1.0);
          float r = length(p), a = atan(p.y, p.x) / 6.28318 + 0.5;
          float N = 64.0, s = floor(a * N), f = fract(a * N);
          float tk = floor(uT * 20.0), ft = fract(uT * 20.0);
          float sh = h(s + tk * 13.7);
          float hay = step(1.0 - uInt * 0.75, sh);
          float ancho = 0.15 + 0.45 * h(s * 7.3 + tk);
          float raya = 1.0 - smoothstep(ancho * 0.35, ancho * 0.5, abs(f - 0.5));
          // cada raya arranca a distinta distancia del centro y en su vida corre hacia afuera
          float r0 = 0.5 - 0.22 * uInt + 0.3 * h(s * 3.1 + tk * 1.7) + ft * 0.18;
          float m = hay * raya * smoothstep(r0, r0 + 0.12, r);
          // el borde de la pantalla se tiñe (blanco, naranja con turbo, arcoíris con estrella)
          float borde = smoothstep(0.38, 1.0, r) * uInt;
          vec3 c = mix(uBorde, uCol, m);
          float alfa = clamp(m * 0.85 + borde * 0.32, 0.0, 0.9);
          if (alfa < 0.01) discard;
          gl_FragColor = vec4(c, alfa);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.malla.frustumCulled = false;
    this.malla.renderOrder = 999;
    escena.add(this.malla);
    this.int = 0;
  }
  // intensidad 0..1; color de las rayas y del borde
  actualizar(dt, intensidad, color = 0xffffff, borde = color) {
    this.int += (Math.min(1, intensidad) - this.int) * (1 - Math.exp(-(intensidad > this.int ? 10 : 4) * dt));
    const u = this.mat.uniforms;
    u.uInt.value = this.int; u.uT.value += dt; u.uAsp.value = innerWidth / innerHeight;
    u.uCol.value.set(color); u.uBorde.value.set(borde);
    this.malla.visible = this.int > 0.02;
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
