# Plan — Bloque verificado en la app + Gem traductor

**Objetivo:** dictar las entregas a lo largo de la mañana, que el Gem las acumule, las unifique y las verifique contra los audios, y que la app las reciba en un formato que entiende igual que si se hubiera usado el chatbot paso a paso, con su propio paso de verificación contra la bodega.

**Principio:** el Gem **no aplica la lógica de la app**; escribe lo que se dijo en un formato que la lleva. La app decide (oficial, préstamo/gasto, obra, stock), porque es la única que conoce el personal y el inventario.

**Dos verificaciones, las dos obligatorias:**

| Dónde | Contra qué | Atrapa |
|---|---|---|
| Gem | Los audios | Lo mal oído: «Juan» por «Julián», cantidades no dichas, duplicados entre audios |
| App | La bodega | Lo que no cuadra: herramienta que ya tiene otro, oficial sin cuadrilla, persona inexistente, gasto sin obra, falta de stock |

---

## Fase A — La app (primero; el Gem depende del formato final)

### A1. Una sola regla de obra
- Hoy el chatbot exige obra solo al **material de consumo**; el bloque y el asistente la exigen a **todo lo que se gasta** (consumo, EPP, accesorios).
- Se usa `exigeProyecto` de `core/despacho.ts` en las tres puertas.
- **Decisión de Juli:** ¿los EPP exigen obra? Recomendado: **sí**. Si no hay respuesta, se aplica lo recomendado.
- Aceptación: la misma salida da el mismo resultado por el chatbot, el bloque y `/api/despacho`.

### A2. Formato del bloque, compatible hacia atrás
```
@ El Cristo · 07:30 · contenedor
Alex: 3 palas, 1 martillo
Juan (cuadrilla de Alex): 2 pares de guantes, 1 casco
@ Bonilla · 07:35
Pedro: 1 pulidora
```
- `@ obra · hora · lugar`: cada renglón hereda los datos del encabezado que tiene encima. Las tres partes son opcionales.
- La hora se combina con la fecha del bloque. El lugar va a la nota del movimiento, porque no hay columna para eso.
- `Nombre (cuadrilla de X)`: marca a qué cuadrilla pertenece la persona.
- **Un bloque sin encabezados se registra exactamente igual que hoy.**
- Mismo lector en `utils/lote.ts` para la app y para `/api/despacho`, que también acepta `@`.
- Aceptación: pruebas del lector con y sin encabezados, con obra o hora inválidas (quedan como alerta, no se adivinan) y con un bloque viejo idéntico al de hoy.

### A3. Paso de verificación en «Despacho por bloque»
- Cada **elemento** tiene su estado: verificado o sin verificar.
- **Registrar** queda bloqueado hasta que todo esté verificado o quitado.
- Las alertas se calculan contra la bodega:
  1. **Ya la tiene otro:** «Esta pulidora la tiene Pedro desde el 10-sep». ¿Es otra unidad o un traslado?
  2. **Oficial:** «Alex es oficial». ¿Para él o para alguien de su cuadrilla? Es la misma pregunta del chatbot.
  3. **Persona nueva:** «Juan no existe». ¿Se crea? ¿En la cuadrilla de quién?
  4. **Gasto sin obra:** consumo, EPP o accesorio sin obra.
  5. **Posible duplicado:** el mismo elemento a la misma persona ya salió hoy o está repetido en el bloque.
  6. **Falta stock:** «Hay 1 y piden 3». Aplica la regla actual de completar faltante.
- Lo que no tiene alertas llega verificado. Hay un botón visible de «verificar todos», que solo cubre lo que no tiene alertas.
- **Mover un elemento a otra persona** con un toque. Al moverlo, su verificación vuelve a cero.
- El renglón muestra obra, hora y lugar heredados, y se pueden cambiar por renglón.
- Aceptación: cada alerta aparece cuando debe y no aparece cuando no; mover un elemento no pierde ni duplica nada; no se puede registrar con pendientes.

### A4. Oficial y cuadrilla, igual que el chatbot
- Si la línea es de un oficial y no dice para quién, se pregunta en la verificación. La opción por defecto es «Alex, sin especificar».
- «Juan (cuadrilla de Alex)», si Juan no existe, se crea en esa cuadrilla **solo al confirmar, y mostrado en pantalla**. Respeta la lección de Rafael: crear sí, en silencio no.
- `/api/despacho` no crea personas: devuelve la duda (422), igual que hoy.

### A5. Pruebas (todas con un fallo reintroducido a propósito para ver que la detectan)
- Lector: con encabezados, sin encabezados, mixto, con datos inválidos.
- Equivalencia: el mismo pedido da los mismos movimientos por el bloque y por el chatbot (los manejadores reales se extraen con el árbol de sintaxis, como en `tests/pantalla.test.ts`).
- Alertas: una prueba por cada una de las seis.
- Mover un elemento: la persona cambia y la verificación se reinicia.
- Servidor: `/api/despacho` con `@` carga en Node puro (`tests/servidor.test.ts`).
- Cierre: `npm run test`, `node verificar-lint.cjs` y `npm run build` con código de salida 0.

### A6. Entrega
PR → merge → Vercel READY → comprobar en producción que `/api/despacho` responde.

---

## Fase B — El Gem

### B1. Instrucciones nuevas en cuatro momentos
1. **Captura.** Cada audio o mensaje queda anotado así:
   `✓ #3 · 07:42 · Alex · El Cristo · contenedor · 3 palas, 1 martillo`
   - Lo que falte (persona, cantidad, obra si es gasto) se pregunta en el momento, sin bloquear la captura.
   - **Hora:** si el Gem ve la hora real, la usa; si no, escribe «hora no especificada» y nunca la inventa. La persona también puede decirla en el audio: «7 y media…».
2. **«Unificá».** Devuelve la lista numerada, en orden de hora, para comparar con los audios.
3. **Verificación contra los audios.**
   - Marca nombres dudosos, cantidades no dichas, posibles duplicados entre audios y totales por trabajador.
   - No sigue hasta que digan «confirmado».
   - Las correcciones se dicen por número: «el 3 era para Juan».
4. **Traducción.** Recién ahí entrega el bloque con encabezados `@`, listo para pegar en **📋 Bloque**.

Además:
- Todo lo que no es salida (devoluciones, traslados, hallazgos, daños, pedidos) sale aparte como **ficha de 15 campos**, con «No especificado» en lo que no se dijo.
- Reglas fijas: no inventar, no clasificar, quien entrega no es quien recibe, una devolución parcial no cierra el préstamo, lo posible se dice «→ verificar».

### B2. Prueba guiada
Una mañana simulada de 6 audios: 3 obras, un oficial, una persona nueva, un duplicado y un consumible sin obra. Se pasa por el Gem y el bloque resultante se pega en la app. Criterio: la app recibe todo, y las alertas de la verificación coinciden con lo que se sembró a propósito.

### B3. Entrega
`asistente/GEM.md` reemplazado, con la prueba guiada incluida. Se comprueba en el celular de Juli si Gemini ve la hora real.

---

## Lo que NO entra en este plan
- Devoluciones, traslados y hallazgos **por bloque**: siguen por ficha o por la app. Podría ser una segunda versión del formato.
- El corte de seguridad de la llave pública (sigue esperando la confirmación de Juli y Kate).
- Telegram + DeepSeek.

## Riesgos y cómo se cubren
| Riesgo | Cobertura |
|---|---|
| Un formato más rico es más frágil al dictado | Todo es opcional, la verificación de la app es la red, y un bloque viejo sigue igual |
| Palomear todo se vuelve rutina y nadie mira | Solo se obliga a mirar lo que tiene alertas |
| Romper la pantalla más usada | Prueba de equivalencia bloque = chatbot, y prueba del bloque viejo |
| El Gem inventa la hora | Regla explícita «hora no especificada», más la prueba en el celular |

## Costo
| Fase | Dificultad | Tokens estimados |
|---|---|---|
| A (app) | Alta | 90–120 mil |
| B (Gem) | Media | 15–25 mil |
| **Total** | | **105–145 mil** |

Orden: **A completa → B**. El Gem se escribe contra el formato ya desplegado, no contra uno supuesto.

## Decisiones que necesita Juli
1. ¿Los EPP exigen obra? Recomendado: **sí**.
2. ¿Ejecuta, Reformulo o Divídelo? Si es «Divídelo»: **A1–A2**, después **A3–A4**, después **B**.
