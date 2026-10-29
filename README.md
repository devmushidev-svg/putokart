# Puto Kart

Juego de karts tipo Mario Kart en el navegador. Se crea una sala, se pasa el link y juegan hasta 8.

- **Cliente:** Three.js (gráficos) + Rapier (física), empaquetado con esbuild en `public/juego.js`.
- **Servidor:** Cloudflare Worker + un Durable Object por sala (`src/worker.js`). Reenvía las posiciones de los karts
  y decide quién está, cuándo arranca la carrera y el orden de llegada.

## Controles

| | PC | Control | Celular |
|---|---|---|---|
| Acelerar | W / ↑ | A o RT | automático |
| Frenar / reversa | S / ↓ | B o LT | botón FRENO |
| Doblar | A D / ← → | palanca | arrastrar a la izquierda de la pantalla |
| Derrapar | Shift (mantener) | RB / LB | botón DERRAPE |
| Reaparecer | R | Y | ↺ |

**Derrape y mini-turbo (como Mario Kart):** tocá derrape para dar un saltito y elegí el lado con el giro; mantenelo apretado.
El kart dobla en curva sin perder velocidad: doblar hacia adentro la cierra y carga más rápido, al revés la abre. Las chispas
pasan de azul → naranja → violeta; al soltar das un turbo más largo cuanto más alto el nivel.

Los números del manejo están todos en `AJUSTES` (`client/kart.js`). `node test/manejo.mjs` mide giro, derrape y turbo en un piso plano. **Salida turbo:** acelerá justo cuando aparece el "1".

## Estética

Estilo PS1 + televisor CRT (activado por defecto; botón 📺 o tecla **C** para apagarlo): la escena se dibuja a ~270 píxeles
de alto, los vértices tiemblan como en PlayStation 1, texturas sin suavizado, colores de 15 bits con tramado, y encima
curvatura, líneas de barrido, máscara de fósforo y viñeta (`client/retro.js`). Para los modelos: pocos polígonos y
texturas chicas (128-256 px) se ven mejor que texturas grandes.

## Modelos de Blender

Exportar como **glTF 2.0 binario (.glb)**, con escala y rotación aplicadas (Ctrl+A).

### Kart → `public/modelos/kart.glb`
- Mirando hacia **-Y** de Blender (adelante) y apoyado en el suelo (Z = 0). Tamaño de referencia: 1,7 m de ancho × 2,6 m de largo.
- Material llamado **`color`**: se pinta con el color de cada jugador.
- Objetos **`rueda_del_izq`, `rueda_del_der`** (giran y doblan) y **`rueda_tras_izq`, `rueda_tras_der`** (giran), con el origen en el centro de la rueda.
- Objeto **`piloto`** (opcional): se inclina en las curvas.
- Low poly: 5-15 mil triángulos, texturas de 1024 o menos.

### Pista → `public/pistas/pista.glb`
| Nombre del objeto | Qué es |
|---|---|
| `col_suelo…` | Colisión invisible de la pista |
| `col_fuera…` | Colisión invisible del pasto/arena (frena) |
| `col_pared…` | Colisión invisible de las paredes |
| `salida_1` … `salida_8` | Lugares de largada (vacíos, mirando hacia adelante) |
| `checkpoint_1` … `checkpoint_N` | El recorrido en orden; el 1 es la meta. Ponelos seguido (cada 20-30 m) |
| `turbo…` | Zonas de turbo |
| todo lo demás | Se ve, sin colisión |

Si no hay `col_…`, todo lo visible se usa como suelo. Sin pista propia se usa el Circuito de Prueba hecho con código.

## Desarrollo

```bash
npm install
npm run dev      # empaqueta y levanta el servidor local
npm run deploy   # a Cloudflare (o automático al subir a main si el repo está conectado)
```

Pruebas en navegador (con el servidor local en el puerto 8790): `node test/sim.mjs` (da 3 vueltas solo),
`node test/derrape.mjs`, `node test/online.mjs` (dos jugadores), `node test/movil.mjs`.
