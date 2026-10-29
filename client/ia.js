// Bots: siguen la pista mirando un punto adelante, derrapan en las curvas y usan ítems.
// Cada uno tiene su "línea" (un poco a la izquierda o a la derecha) y su nivel para que no vayan en fila.
import { AJUSTES } from "./kart.js";

const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Bot {
  constructor(nivel = 0.95) {
    this.nivel = nivel; // fracción de la velocidad máxima que se permite
    this.linea = (Math.random() - 0.5) * 6;
    this.tLinea = 2 + Math.random() * 3;
    this.derrapando = false;
    this.esperaItem = 1 + Math.random() * 3;
    this.atascado = 0;
  }

  // devuelve la entrada { acel, freno, giro, derrape, usar, atras } para este cuadro
  pensar(dt, p, rec, otros, gomaElastica = 1) {
    const k = p.control, pos = k.pos, n = rec.n;
    // cambia de línea de vez en cuando
    if ((this.tLinea -= dt) < 0) { this.linea = (Math.random() - 0.5) * 7; this.tLinea = 2 + Math.random() * 4; }
    const vel = Math.abs(k.vel);
    const adelante = Math.round(9 + vel * 0.45);
    const i = p.idx;
    const a = rec.p[(i + adelante) % n], b = rec.p[(i + adelante + 2) % n];
    // punto objetivo corrido según la línea del bot (perpendicular a la pista)
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const ox = a.x + (dz / l) * this.linea * -1, oz = a.z + (-dx / l) * this.linea * -1;
    const d = angulo(Math.atan2(ox - pos.x, oz - pos.z) - k.rumbo);
    let giro = Math.max(-1, Math.min(1, -d * 2.6));
    // ¿viene curva? mirar cuánto cambia la dirección de la pista más adelante
    const dir0 = rec.direccion(i), dir1 = rec.direccion((i + 22) % n), dir2 = rec.direccion((i + 45) % n);
    const curva = angulo(dir2 - dir0), curvaCerca = angulo(dir1 - dir0);
    // derrape en curvas largas a buena velocidad; lo suelta cuando se endereza o con turbo violeta
    let derrape = false;
    if (!this.derrapando && Math.abs(curva) > 0.55 && vel > AJUSTES.velMax * 0.6 && Math.abs(d) < 0.6) this.derrapando = true;
    if (this.derrapando) {
      derrape = true;
      const lado = k.dirDerrape || -Math.sign(curva);
      if (!k.derrapando && k.tBoton > 0.4) { this.derrapando = false; derrape = false; } // no entró
      else {
        giro = Math.abs(curvaCerca) > 0.25 ? lado * 0.9 : -lado * 0.2 + giro * 0.3;
        if (k.derrapando && (Math.abs(curvaCerca) < 0.12 || k.nivel >= 3 || Math.sign(-curvaCerca) !== lado && Math.abs(curvaCerca) > 0.2)) { this.derrapando = false; derrape = false; }
      }
    }
    // velocidad: goma elástica (si va muy adelante afloja, si va atrás aprieta)
    const limite = AJUSTES.velMax * this.nivel * gomaElastica;
    const acel = vel < limite || k.tTurbo > 0;
    // atascado contra algo: reversa un rato
    this.atascado = vel < 2 ? this.atascado + dt : 0;
    let freno = false;
    if (this.atascado > 1.2) { freno = true; giro = -giro; if (this.atascado > 2.6) this.atascado = 0; }

    // ítems: con un poco de demora, y según qué tiene
    let usar = false, atras = false;
    if (p.item) {
      this.esperaItem -= dt;
      if (this.esperaItem < 0) {
        const it = p.item;
        const hayAtras = otros.some((o) => o.p < p.p && p.p - o.p < 30);
        const hayAdelante = otros.some((o) => o.p > p.p && o.p - p.p < 40);
        if (it === "platano") { usar = hayAtras || this.esperaItem < -6; atras = true; }
        else if (it === "verde") { usar = hayAdelante || hayAtras || this.esperaItem < -6; atras = !hayAdelante && hayAtras; }
        else if (it === "rojo") usar = hayAdelante || this.esperaItem < -5;
        else usar = Math.abs(curvaCerca) < 0.2; // hongos, estrella y monedas en recta
        if (usar) this.esperaItem = 0.6 + Math.random() * 2.5;
      }
    }
    return { acel: acel && !freno, freno, giro, derrape, usar, atras };
  }
}
