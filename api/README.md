# La ventanilla del asistente

Para conectar un asistente de IA —ChatGPT, un bot de Telegram, Gemini, el que
sea— sin que nadie tenga que abrir la página web.

## Antes de que funcione: tres variables en Vercel

Vercel → el proyecto `bodega-inventario` → **Settings → Environment Variables**.
Después de crearlas hay que **volver a desplegar**, porque solo entran en un
despliegue nuevo.

| Variable | Qué es | Dónde sale |
|---|---|---|
| `SUPABASE_URL` | La URL del proyecto | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de **servicio** | Supabase → Settings → API → `service_role` |
| `BODEGA_API_TOKEN` | Una contraseña larga que te inventás vos | La generás vos |

> **La clave de servicio se salta TODAS las reglas de la base.** Va solo acá, en
> las variables de Vercel. Nunca en el código, nunca en el navegador, nunca en
> un chat. Si alguna vez se filtra, se cambia en Supabase y se actualiza acá.
>
> **`BODEGA_API_TOKEN` es lo único que separa tu bodega del mundo.** Que sea
> largo y al azar, no `bodega123`. Para rotarlo se cambia la variable en Vercel
> y se le avisa al asistente; no hay que tocar código.

Para generar un token decente, en cualquier terminal:

```
openssl rand -hex 32
```

## Cómo se llama

```
POST https://bodega-montecielo.vercel.app/api/despacho
```

Cabeceras:
```
Content-Type: application/json
X-Bodega-Token: <el BODEGA_API_TOKEN>
```

Cuerpo:
```json
{
  "texto": "Alex: 3 palas, 1 martillo y una pica\nJuan: 2 palas, 1 palín",
  "operacionId": "2026-09-12-0730-alex-juan",
  "proyectoId": "opcional",
  "fecha": "opcional, ISO; si no va, es ahora"
}
```

### `operacionId` es obligatorio, y por qué

Es lo que impide el **doble registro**. Los identificadores de cada movimiento
se deducen de él, así que mandar el mismo bloque dos veces con el mismo
`operacionId` produce exactamente las mismas filas y la base rechaza las
repetidas. Sin eso, un reintento del bot —porque se le perdió la respuesta— o un
doble toque despacha dos veces, y ahí sí se pierde material de verdad.

Que sea único por bloque y estable para sus reintentos. La fecha con hora y las
personas alcanza: `2026-09-12-0730-alex-juan`.

## Lo que responde

```json
{
  "resumen": "4 registrado(s), 1 sin stock, 1 por revisar",
  "registrados": [{ "elemento": "Pala", "cantidad": 3, "persona": "Alex Ferreira" }],
  "fallos":      [{ "elemento": "Pica", "motivo": "Hay 0 und y se pidieron 1" }],
  "pendientes":  [{ "renglon": "Fulano: 2 palas", "motivo": "No se identificó a la persona" }]
}
```

- **registrados** — entraron. Ya están en el Kardex.
- **fallos** — no había existencias. **No entraron.**
- **pendientes** — la app no adivinó quién o qué era, **y no lo inventó**. Hay
  que resolverlos desde la app.

## Las instrucciones para el asistente

Esto se le pega al GPT, al bot o a donde sea que interprete la voz:

```
Convertí lo que te dicten en una lista, un renglón por trabajador:

Nombre: cantidad cosa, cantidad cosa, cantidad cosa

Reglas:
- Un solo renglón por persona. Si la misma persona aparece dos veces,
  juntá todo en un renglón.
- Los dos puntos van después del nombre. Nada más lleva dos puntos.
- Si no dicen cantidad, poné 1.
- Los decimales van con coma o punto: "1,5 metros de manguera".
- No inventés nombres de herramientas ni corrijas los que te den:
  escribí lo que oíste. La app se encarga de encontrarlos.
- No agregues nada que no hayan dicho. Sin encabezados, sin fechas,
  sin explicaciones. Solo los renglones.

Ejemplo:
Alex: 3 palas, 1 martillo, 1 pica
Juan: 2 palas, 1 palín
Pedro: 1 escalera, 2 rodilleras
```

La app también entiende «un martillo», «una pica» y «3 palas **y** un martillo»,
por si el dictado se cuela crudo.

## Qué NO hace, a propósito

- **No crea trabajadores ni elementos.** Si no reconoce a alguien o algo, lo
  devuelve como pendiente. Crear a alguien en silencio en mitad de un despacho
  ya pasó una vez, y así quedó Rafael en la cuadrilla de Alex sin que nadie lo
  decidiera.
- **No elige cuando hay dos parecidos.** «Una pulidora» con una grande y una
  pequeña en bodega vuelve como pendiente con las dos opciones. Elegir al azar
  deja el error con cara de correcto, que es peor que no elegir.
- **No se salta las reglas.** Pasa por el mismo núcleo que la pantalla:
  préstamo vs. gasto, accesorios pegados a su herramienta —si la pulidora no
  sale, su disco tampoco—, y freno por existencias.
- **No hace devoluciones ni traslados todavía.** Solo despachos.

## Probarlo

```
curl -X POST https://bodega-montecielo.vercel.app/api/despacho \
  -H "Content-Type: application/json" \
  -H "X-Bodega-Token: TU_TOKEN" \
  -d '{"texto":"Alex: 1 pala","operacionId":"prueba-1"}'
```

Mandá el mismo comando **dos veces**: la segunda no debe duplicar nada. Si el
resumen dice lo mismo las dos veces y en la app aparece una sola salida, la
protección está funcionando.
