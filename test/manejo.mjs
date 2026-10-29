// Prueba del manejo en un piso plano infinito (sin paredes), en Node.
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Control, AJUSTES } from "../client/kart.js";
await RAPIER.init();
function nuevo() {
  const mundo = new RAPIER.World({ x: 0, y: -26, z: 0 });
  const piso = mundo.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setTranslation(0, -0.5, 0).setFriction(0));
  const k = new Control(RAPIER, mundo, new THREE.Vector3(0, 1, 0), 0, (c) => (c.handle === piso.handle ? "suelo" : null));
  const ev = [];
  const correr = (seg, e) => { for (let i = 0; i < seg * 60; i++) { k.paso(1 / 60, e, ev); mundo.step(); k.despues(ev); } };
  return { k, ev, correr };
}
const r = {};
{ const { k, correr } = nuevo(); correr(3, { acel: true }); r.velMax = +k.vel.toFixed(1); r.t = 0;
  const y = k.yaw; correr(1, { acel: true, giro: 1 }); r.giroNormal1s = +(y - k.yaw).toFixed(2); r.velGirando = +k.vel.toFixed(1); }
for (const [nombre, g] of [["adentro", -1], ["neutro", 0], ["afuera", 1]]) {
  const { k, ev, correr } = nuevo();
  correr(3, { acel: true });
  correr(0.1, { acel: true, giro: -1, derrape: true }); // toque + izquierda
  const y = k.yaw;
  correr(2.4, { acel: true, giro: g, derrape: true });
  r[nombre] = { derrapa: k.derrapando, giro: +(k.yaw - y).toFixed(2), nivel: k.nivel, vel: +k.vel.toFixed(1) };
  correr(1 / 60, { acel: true, giro: 0, derrape: false });
  r[nombre].turbo = +k.tTurbo.toFixed(2);
  correr(0.5, { acel: true });
  r[nombre].velTurbo = +k.vel.toFixed(1);
  r[nombre].eventos = ev.join(",");
}
{ // tocar sin girar y girar enseguida también entra
  const { k, correr } = nuevo(); correr(3, { acel: true });
  correr(0.05, { acel: true, giro: 0, derrape: true }); correr(0.2, { acel: true, giro: 1, derrape: true });
  r.giroDespues = { derrapa: k.derrapando, dir: k.dirDerrape };
}
console.log(JSON.stringify(r, null, 1));
