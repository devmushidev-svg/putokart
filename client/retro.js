// Estética PS1 + televisor CRT:
//  - la escena se dibuja a baja resolución (unos 270 píxeles de alto) y se agranda sin suavizar
//  - los vértices "saltan" a la grilla de píxeles (el temblor de la PlayStation 1)
//  - texturas sin suavizado, colores de 15 bits con tramado (dithering)
//  - efecto de tele: curvatura, líneas de barrido, máscara de fósforo, aberración de color y viñeta
import * as THREE from "three";

export const uniformes = { uSnap: { value: new THREE.Vector2(320, 240) }, uSnapOn: { value: 1 } };

// parcha un material para que sus vértices tiemblen como en PS1 (se puede apagar sin recompilar)
export function materialRetro(mat) {
  if (!mat || mat.userData.retro) return;
  mat.userData.retro = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uSnap = uniformes.uSnap;
    sh.uniforms.uSnapOn = uniformes.uSnapOn;
    sh.vertexShader = "uniform vec2 uSnap;\nuniform float uSnapOn;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      if (uSnapOn > 0.5) {
        vec4 s = gl_Position;
        s.xy = floor(s.xy / s.w * uSnap * 0.5 + 0.5) / (uSnap * 0.5) * s.w;
        gl_Position = s;
      }`);
  };
  mat.customProgramCacheKey = () => "retro";
  const mapas = [mat.map, mat.emissiveMap].filter(Boolean);
  for (const t of mapas) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.anisotropy = 1; t.needsUpdate = true; }
  mat.needsUpdate = true;
}
export function objetoRetro(obj) {
  obj.traverse((o) => {
    if (!o.material || o.isSprite || o.isPoints) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(materialRetro);
  });
}

// pasada final: de la imagen chica a la pantalla, con el filtro de tele
export class FiltroCRT {
  constructor(render) {
    this.render = render;
    this.objetivo = new THREE.WebGLRenderTarget(320, 240, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, samples: 0 });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tImagen: { value: this.objetivo.texture }, uBaja: { value: new THREE.Vector2(320, 240) }, uTiempo: { value: 0 }, uZoom: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tImagen; uniform vec2 uBaja; uniform float uTiempo, uZoom; varying vec2 vUv;
        vec2 curvar(vec2 uv) { uv = uv * 2.0 - 1.0; vec2 o = abs(uv.yx) / vec2(5.5, 4.5); uv += uv * o * o; return uv * 0.5 + 0.5; }
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)), i = x + y * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          return m[i] / 16.0;
        }
        void main() {
          vec2 uv = curvar(vUv);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
          // desenfoque radial con la velocidad: los bordes se estiran hacia el centro
          vec2 d = uv - vec2(0.5, 0.56);
          float r2 = dot(d, d);
          vec2 paso = d * uZoom * 0.09 * r2;
          vec2 ab = vec2(0.9 / uBaja.x, 0.0) + d * uZoom * 0.012;
          vec3 c = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            vec2 q = uv - paso * float(i);
            c += vec3(texture2D(tImagen, q + ab).r, texture2D(tImagen, q).g, texture2D(tImagen, q - ab).b);
          }
          c /= 6.0;
          // un poco de brillo que se corre (fósforo)
          c += texture2D(tImagen, uv - vec2(2.0 / uBaja.x, 0.0)).rgb * 0.12;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          c = gl_FragColor.rgb;
          // 15 bits de color (5 por canal) con tramado, como la PS1
          vec2 px = floor(uv * uBaja);
          c += (bayer(px) - 0.5) / 31.0;
          c = floor(c * 31.0 + 0.5) / 31.0;
          // líneas de barrido por cada fila de la imagen chica y máscara de fósforo de la pantalla
          float fila = fract(uv.y * uBaja.y);
          c *= 0.78 + 0.22 * smoothstep(0.0, 0.35, fila) * smoothstep(1.0, 0.65, fila);
          float m = mod(gl_FragCoord.x, 3.0);
          c *= vec3(m < 1.0 ? 1.06 : 0.92, (m >= 1.0 && m < 2.0) ? 1.06 : 0.92, m >= 2.0 ? 1.06 : 0.92);
          // viñeta y un parpadeo mínimo
          vec2 v = uv * (1.0 - uv.yx);
          c *= pow(v.x * v.y * 18.0, 0.22) * (0.985 + 0.015 * sin(uTiempo * 60.0));
          gl_FragColor = vec4(c * 1.08, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.escena = new THREE.Scene();
    this.escena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  tamano(w, h, celular) {
    // alto de la imagen chica: ~270 píxeles en PC, un poco más en el celular parado para que se lea
    const alto = Math.round(Math.max(200, Math.min(celular && h > w ? 400 : 288, h / 2.6)));
    const ancho = Math.round(alto * (w / h));
    this.objetivo.setSize(ancho, alto);
    this.mat.uniforms.uBaja.value.set(ancho, alto);
    uniformes.uSnap.value.set(ancho, alto);
  }
  dibujar(escena, camara, t, zoom = 0) {
    this.mat.uniforms.uZoom.value = zoom;
    const r = this.render;
    r.setRenderTarget(this.objetivo);
    r.render(escena, camara);
    r.setRenderTarget(null);
    this.mat.uniforms.uTiempo.value = t;
    r.render(this.escena, this.cam);
  }
}
