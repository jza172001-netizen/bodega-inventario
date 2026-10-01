# Plan de verificación para entregar — Bodega Montecielo

**Fecha:** 1-oct-2026 · **Estado de producción:** PR #100 desplegado (Vercel READY), Node 24.

**Cómo se lee:** cada punto dice quién lo hace (🧑 Juli o la encargada en el celular · 🤖 Claude · 🧑🤖 juntos), cómo se comprueba y qué cuenta como aprobado. Nada se da por bueno sin ver el resultado.

---

## 0. Diagnóstico honesto: dónde estamos

| Dimensión | Estado | % |
|---|---|---|
| **Funciones construidas** (chat, bloque con verificación, devoluciones parciales, custodia, «¿Dónde está?», asistente, cola sin pérdidas) | Completas y en producción | ~90 |
| **Probadas con pruebas automáticas** (núcleo, manejadores reales, servidor en Node puro, SQL en base limpia, mutaciones) | 17 suites en verde | ~85 |
| **Probadas en un navegador real, tocando la pantalla** | **Nunca**. El bloque nuevo solo se probó por dentro, no se ha dibujado y tocado | ~10 |
| **Seguridad** (la llave pública puede mover inventario) | **Abierta**. Espera la confirmación de que Juli y Kate entraron con la contraseña nueva | ~40 |
| **Datos reales cargados** (inventario definitivo de las listas) | El informe está hecho, **sin aplicar**. Faltan ~35 eléctricas y casi todo lo manual | ~45 |
| **Probada por quien la va a usar** (la encargada, una mañana real) | **No** | 0 |

**Mi estimación: ~70 % lista para entregar.** El código está cerca del final. Lo que falta no es programar: es **comprobar en uso real, cerrar la seguridad y cargar los datos**. Una app que funciona en las pruebas pero tiene el inventario a medias y la puerta abierta no está para entregar. El último 30 % es corto en horas, pero no se puede saltar.

---

## 1. Bloqueantes — sin esto NO se entrega

### 1.1 🧑 Login nuevo (5 min) → desbloquea la seguridad
1. Entrar a `bodega-montecielo.vercel.app` con usuario y contraseña de siempre.
2. Cuando la app lo pida, poner una contraseña nueva de 6 caracteres o más.
3. Salir y volver a entrar con la nueva.
4. Kate hace lo mismo.

**Aprobado:** los dos entran con la nueva, y me lo confirman.

### 1.2 🤖 Corte de seguridad (después de 1.1)
- Quitarle a la llave pública el permiso de mover inventario, y dárselo solo a quien entró con usuario y contraseña.
- Antes de cortar, dejar escrita la vuelta atrás.
- Después del corte: entrar, registrar una salida de prueba y borrarla.

**Aprobado:** la app sigue funcionando con login, y una petición con solo la llave pública **no** puede mover stock (se comprueba en la base).

### 1.3 🧑🤖 Accesos fantasma
- **CAMILO** (dueño, sin contraseña) y **KATE** (duplicado de Kate) siguen en la lista. Ya no se pueden reclamar sin código de alta, pero estorban.
- Decisión de Juli: mandarlos a la papelera (se pueden recuperar).

**Aprobado:** en el login solo aparecen accesos reales.

### 1.4 🤖 Supabase se pausa solo
- **Pasó de verdad:** el plan gratuito se durmió del 12 al 28 de septiembre por inactividad, y en ese tiempo la app no guardó nada en la nube.
- Opciones: (a) plan pago de Supabase, (b) un aviso automático que lo mantenga despierto, (c) aceptar el riesgo. Mi recomendación es (b) ya, y (a) si la bodega lo usa todos los días. Precio del plan pago: NO LO TENGO.

**Aprobado:** hay un mecanismo para que no vuelva a pasar en silencio.

---

## 2. Recorridos reales en el celular (🧑 la encargada · 🤖 Claude los automatiza con Playwright en paralelo)

Cada recorrido termina **recargando la página** y comprobando que lo hecho sigue ahí, y que aparece en el otro teléfono.

| # | Recorrido | Aprobado si… |
|---|---|---|
| R1 | **Chat paso a paso:** salida de 2 herramientas y 1 EPP a un trabajador, sin obra | Sale. El EPP no pide obra; el stock baja |
| R2 | **Chat con oficial:** elegir a Alex → para alguien de su cuadrilla | El préstamo queda a nombre del trabajador, no de Alex |
| R3 | **Chat con consumible:** cemento sin obra | No deja seguir sin obra |
| R4 | **Bloque con encabezados:** pegar el bloque de la prueba del Gem (3 obras, un oficial, una persona nueva) | Cada renglón queda con su obra y hora; Alex pregunta para quién; la persona nueva solo se crea al tocar «Crear» |
| R5 | **Bloque — verificación:** pedir una herramienta que ya tiene otro | Aparece el aviso y no sale hasta tocar «Verificar» |
| R6 | **Bloque — mover:** pasar un elemento de una persona a otra | Queda en la otra, no se duplica, pide verificar de nuevo |
| R7 | **Devolución parcial:** prestar 3, devolver 1 | Préstamo de 3, 2 pendientes, una fila de devolución |
| R8 | **Traslado de obra:** cambiarle la obra a un préstamo que ya tenía una | La obra anterior queda en el historial |
| R9 | **¿Dónde está?:** anotar «1 láser Total — posible: Jesús» y después resolverlo como hallado | Se cierra sin borrar; si se halla con persona, nace el préstamo |
| R10 | **Sin señal:** modo avión → registrar → volver a la señal | Queda en «Pendientes», sube solo y no se duplica |
| R11 | **Dos teléfonos:** registrar en uno | Aparece en el otro sin recargar |
| R12 | **Papelera:** borrar un movimiento y restaurarlo | El stock vuelve a cuadrar |
| R13 | **Organizar:** armar Tubería › Accesorios con los codos, renombrar un género, ponerle medida a un ítem | La vista previa dice qué cambia; el inventario muestra los niveles; ninguna cantidad se mueve |
| R14 | **Bloque — medida:** pegar «Juan: 3 codos» y «Pedro: 2 codos de 4» | El primero pregunta la medida con botones; el segundo va directo al de 4" |
| R15 | **Bloque — dudoso:** pegar «Juan: 1 pulidora grande» | Pregunta cuál (hay cuatro); no registra ninguna sola |

**Aprobado el bloque:** los 15 recorridos sin un error. Cada fallo se arregla, con su prueba automática, antes de seguir.

---

## 3. Datos reales

### 3.1 🧑 Decisión pendiente: Lista 5 (herramientas manuales)
¿Es lo que cada uno **tiene hoy** (→ préstamo confirmado) o lo que **tuvo alguna vez** (→ posible, verificar)? Recomendado: lo concreto como préstamo confirmado; lo vago («herramientas varias») no se carga.

### 3.2 🧑 Revisar el informe `herramientas/INFORME-VINCULACION.md`
- 19 renglones marcados «⚠ revisar a mano».
- Dos familias donde la lista no cuadra consigo misma (taladros demoledores y pulidoras pequeñas).
- Aprobar o corregir renglón por renglón.

### 3.3 🤖 Aplicar el cruce (después de 3.1 y 3.2)
- Primero en una copia aislada; se compara antes contra después.
- Después en producción, con una entrada de apertura por cada unidad que entra. Nada se borra.

**Aprobado:** el Kardex cuadra (la consulta de `supabase/RESTAURAR.md` devuelve cero filas, descontados los préstamos viejos sin entrada), y el total por familia coincide con la lista.

---

## 4. El asistente

### 4.1 🧑 Gem
- Crearlo con `asistente/GEM.md` y correr la prueba de 6 audios que trae al final.
- Ver si pone la hora real o «hora ?».

**Aprobado:** el bloque que entrega se pega y la app lo lee sin renglones ignorados.

### 4.2 🧑 GPT (solo si se consigue un plan que lo permita)
- Revisar que en Vercel existan `BODEGA_API_TOKEN`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Yo no tengo permiso para verlas.
- Hacer la prueba del paso 5 de `asistente/GPT.md`.

---

## 5. Respaldo y recuperación (🤖)

### 5.1 Restaurar un respaldo en una base aislada
- Cargar en la base aislada los datos reales de hoy, reconstruida desde el repositorio.
- Comparar artículos, préstamos, movimientos y saldos.

**Aprobado:** todo coincide.

### 5.2 Procedimiento escrito
- Revisar que `supabase/RESTAURAR.md` sirva tal como está.
- Agregar cómo exportar un respaldo desde el celular, que la app ya tiene.

---

## 6. La mañana supervisada con la encargada (🧑 — lo que ninguna prueba contesta)

Una mañana real, con Juli al lado **sin ayudar**, anotando:

1. ¿Entiende «Pendientes», «¿Dónde está?» y la verificación del bloque sin que nadie le explique?
2. ¿El bloque aguanta el ritmo: diez trabajadores, sesenta cosas, media hora?
3. ¿Las verificaciones ayudan o estorban? ¿Toca «Verificar» sin mirar?
4. ¿Cuánto tiene que recordar o anotar por fuera de la app?
5. ¿Qué preguntó? Cada pregunta es una pantalla que no se explica sola.

**Aprobado:** termina la mañana sin perder un movimiento, y lo que anotó Juli se convierte en ajustes concretos.

---

## 7. Higiene (no bloquea, pero se cierra antes de entregar)

- [ ] Desconectar **Netlify** del repositorio. Lo hace Juli en Netlify.
- [ ] `npm audit`: 8 vulnerabilidades (6 altas). Revisar cuáles llegan al navegador y actualizar.
- [ ] Marcas mal escritas (Nn/NN, Truper/Trupper/Trupee, Dwalt) y duplicados probables (Vibro, Concretadora, Mezcladora): con el visto bueno de Juli.
- [ ] Dos devoluciones al mismo tiempo desde dos teléfonos: prueba con dos conexiones reales a la base.

---

## Orden sugerido

1. **Hoy / mañana:** 1.1 (login), luego 1.2 (corte), 1.3 y 1.4.
2. **En paralelo:** 🤖 recorridos automáticos (§2) y restauración (§5).
3. **Después de los documentos de mañana en la noche:** 3.1 y 3.2, luego 3.3.
4. 4.1 (Gem).
5. **La mañana supervisada (§6).** Es lo último y lo que decide la entrega.

## Criterio de entrega

Se entrega cuando cumple las cuatro:
- §1 completo;
- §2 sin errores;
- §3 aplicado y cuadrado;
- §6 hecho una vez sin perder un movimiento.

Lo de §7 puede quedar para la semana siguiente.
