// Puto Kart — servidor: sirve el juego y una sala (Durable Object) por carrera.
// El servidor no simula la física: cada jugador manda la posición de su kart y la sala
// la reenvía a los demás. La sala sí decide lo importante: quién está, cuándo arranca y
// el orden de llegada.

const MAX_JUGADORES = 8;
const VUELTAS = 3;
const ESPERA_TRAS_PRIMERO = 45_000; // después de que llega el primero, los demás tienen 45 s
const COLORES = ["#e63946", "#2a9df4", "#2ec27e", "#f4c430", "#a05cf0", "#ff8c1a", "#ff5fa2", "#e8e8e8"];

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const limpiar = (n) => String(n || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16) || null;
const idCorto = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/crear" && req.method === "POST") return json({ id: idCorto() + idCorto() });
    const m = url.pathname.match(/^\/ws\/([a-z0-9]{4,16})$/);
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("esperaba websocket", { status: 426 });
      return env.SALAS.get(env.SALAS.idFromName(m[1])).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

export class Sala {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.s = null; // estado de la sala (se guarda en storage para sobrevivir a la hibernación)
  }

  async cargar() {
    if (this.s) return;
    this.s = (await this.ctx.storage.get("s")) || { fase: "sala", host: null, jugadores: [], inicio: 0, llegadas: [], vueltas: VUELTAS, carrera: 0 };
  }
  guardar() { return this.ctx.storage.put("s", this.s); }

  conectados() {
    const ids = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === this.cerrando) continue; // el socket que se está cerrando ya no cuenta
      const a = ws.deserializeAttachment();
      if (a?.id) ids.add(a.id);
    }
    return ids;
  }

  vista() {
    const con = this.conectados();
    return {
      t: "sala", fase: this.s.fase, host: this.s.host, inicio: this.s.inicio, vueltas: this.s.vueltas, carrera: this.s.carrera,
      llegadas: this.s.llegadas, ahora: Date.now(),
      jugadores: this.s.jugadores.map((j) => ({ id: j.id, nombre: j.nombre, color: j.color, conectado: con.has(j.id) })),
    };
  }
  difundir(msg, excepto = null) {
    const txt = typeof msg === "string" ? msg : JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== excepto) try { ws.send(txt); } catch {}
  }

  async fetch(req) {
    await this.cargar();
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ id: null });
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 2000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const yo = ws.deserializeAttachment()?.id;

    // posiciones: se reenvían tal cual (no se guardan), es lo más frecuente
    if (m.t === "pos") {
      if (!yo) return;
      m.id = yo;
      this.difundir(m, ws);
      return;
    }

    await this.cargar();
    const s = this.s;

    if (m.t === "hola") {
      let j = s.jugadores.find((x) => x.token && x.token === m.token);
      const nombre = limpiar(m.nombre);
      if (!j && nombre && s.jugadores.length < MAX_JUGADORES) {
        const usados = new Set(s.jugadores.map((x) => x.color));
        j = { id: idCorto(), token: crypto.randomUUID(), nombre, color: COLORES.find((c) => !usados.has(c)) || COLORES[0] };
        s.jugadores.push(j);
        if (!s.host) s.host = j.id;
      }
      if (j && nombre) j.nombre = nombre;
      ws.serializeAttachment({ id: j ? j.id : null });
      ws.send(JSON.stringify({ t: "bienvenido", id: j ? j.id : null, token: j ? j.token : null }));
      await this.guardar();
      this.difundir(this.vista());
      return;
    }
    if (!yo) return; // espectador

    if (m.t === "color" && s.fase !== "carrera" && s.fase !== "cuenta" && COLORES.includes(m.color)) {
      const j = s.jugadores.find((x) => x.id === yo);
      if (j && !s.jugadores.some((x) => x.color === m.color && x.id !== yo)) j.color = m.color;
    } else if (m.t === "empezar") {
      if (yo !== s.host || (s.fase !== "sala" && s.fase !== "resultados")) return;
      s.fase = "carrera";
      s.carrera++;
      s.inicio = Date.now() + 4500; // 4,5 s de cuenta regresiva
      s.llegadas = [];
      await this.ctx.storage.setAlarm(s.inicio + 15 * 60_000); // por si nadie termina nunca
    } else if (m.t === "meta") {
      if (s.fase !== "carrera" || s.llegadas.some((x) => x.id === yo) || m.carrera !== s.carrera) return;
      const tiempo = Math.max(1, Math.min(3_600_000, Math.round(+m.tiempo || Date.now() - s.inicio)));
      s.llegadas.push({ id: yo, tiempo });
      if (s.llegadas.length === 1) await this.ctx.storage.setAlarm(Date.now() + ESPERA_TRAS_PRIMERO);
      const con = this.conectados();
      if (s.jugadores.filter((j) => con.has(j.id)).every((j) => s.llegadas.some((x) => x.id === j.id))) s.fase = "resultados";
    } else if (m.t === "volver" && yo === s.host && s.fase === "resultados") {
      s.fase = "sala";
    } else return;
    await this.guardar();
    this.difundir(this.vista());
  }

  async webSocketClose(ws) {
    await this.cargar();
    const yo = ws.deserializeAttachment()?.id;
    this.cerrando = ws;
    try { ws.close(); } catch {}
    const s = this.s;
    // en la sala de espera, el que se va libera su lugar; en carrera se queda como desconectado
    if (yo && s.fase !== "carrera" && !this.conectados().has(yo)) {
      s.jugadores = s.jugadores.filter((j) => j.id !== yo);
      if (s.host === yo) s.host = s.jugadores[0]?.id || null;
      await this.guardar();
    }
    this.difundir(this.vista(), ws);
    this.cerrando = null;
  }

  async alarm() {
    await this.cargar();
    if (this.s.fase === "carrera") {
      this.s.fase = "resultados";
      await this.guardar();
      this.difundir(this.vista());
    }
  }
}
