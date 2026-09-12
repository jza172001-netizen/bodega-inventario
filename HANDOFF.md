# HANDOFF — Bodega Montecielo

> Traspaso de contexto. La sesión nueva lee **este archivo completo** antes de
> tocar nada. Verificado contra producción el **11 de septiembre de 2026**.
>
> **⚠️ LEER LA SECCIÓN 0.1 ANTES QUE NADA.** Varias cifras y afirmaciones de
> este archivo resultaron falsas al verificarlas. Están corregidas ahí.

---

## 0.1 Lo que este archivo decía mal (corregido el 11-sep-2026, de noche)

Una auditoría externa del commit `ab86bd6` obligó a verificar cosas que acá se
daban por ciertas. Estas quedaron desmentidas **sumando o abriendo el código**,
no por opinión:

| Decía | Es |
|---|---|
| Apéndice B.1: «96 unidades» | Las filas suman **82** |
| Apéndice B.5: «25 unidades» pendientes | Las filas suman **24** |
| «Faltan ~35 eléctricas» | **No se puede afirmar**: sale de restar 96, que no es el total real |
| «Todo borrado es lápida» | El SQL versionado de `delete_movement_and_revert_stock` hace `delete from movements`, en tres puntos, incluida su definición más nueva |
| Rama de trabajo `claude/new-session-7548vr` | Hoy es `claude/handoff-md-review-m3j9pp` |
| `CLAUDE.md`: «build verifica TypeScript» | `build` es `vite build` a secas. El que verifica es `lint`. **Correr los dos.** |

**Que las cifras no cuadren NO significa que falten 14 herramientas.** Significa
que el documento está inconsistente. **No se carga nada hasta conciliar las
listas contando en la bodega**, con papel. Cargar con cifras que no suman es
meterle el error adentro al inventario.

## 0.2 Lo que se hizo la noche del 11-sep-2026

Seis PR mergeados y desplegados (#75 a #80):

- **Botón «📋 Bloque»** en el asistente: se pega el texto de todos los
  trabajadores de una y se registra de un toque. `utils/lote.ts` lo lee sin
  React; la pantalla de confirmación es donde se atrapa el error del que dictó.
- **`api/despacho.ts`** — la ventanilla para un asistente de IA. Ver
  `api/README.md`. **NO funciona hasta crear tres variables en Vercel**
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BODEGA_API_TOKEN`) y volver a
  desplegar.
- **`core/despacho.ts`** — la aritmética del stock afuera de React, para que
  pueda correr en un servidor. `App.tsx` ya no calcula: aplica.
- **191 comprobaciones** en `tests/` (hoy son 222, ver 0.3). `npm run test`. No es Vitest a propósito:
  ver `CLAUDE.md`. **Cubren el núcleo, no la pantalla ni el endpoint** — una
  auditoría externa encontró ocho fallos con estas suites en verde.
- **`components/PasosDeNombre.tsx`** — género y medida en el formulario de
  crear, no solo en el chat.

**Tres bugs silenciosos arreglados**, todos encontrados por una auditoría
externa y verificados antes de tocarlos:
1. El accesorio salía aunque la herramienta se rechazara por stock.
2. El formulario no expandía accesorios y el chat sí: dos resultados para la
   misma salida.
3. Editar el nombre o el rol de un acceso le borraba la contraseña.

### Lo que sigue abierto y NO se tocó

- **Permisos de la base.** Las funciones de stock son `security definer` y
  ninguna migración las revoca, así que quedan con el valor por defecto de
  PostgreSQL: ejecutables por cualquiera con la clave pública, que va dentro del
  JavaScript publicado. **No se tocó a propósito**: revocarlas sin ajustar los
  permisos del navegador deja la app sin funcionar, y eso no se hace de noche
  sin nadie mirando.
- **El borrado que no es lápida** (`delete from movements` en el SQL versionado).
  Se resuelve leyendo qué está instalado en el servidor, no el repositorio.
- **No hay migración base**: el repo no alcanza para recrear el servidor.
- **Conciliar las listas** (ver 0.1). Papel y conteo, no código.
- **Kate y KATE**, y la integración de Netlify todavía conectada al repo.

## 0.3 Lo que se hizo el 12-sep-2026 — los fallos que yo mismo metí

Una **segunda** auditoría externa revisó los PR #75–#80 y encontró ocho fallos
nuevos. **Los ocho eran míos**, introducidos al arreglar los anteriores. Se
arreglaron siete; el octavo necesita una migración y queda para el bloque
siguiente.

**Todos verificados corriendo el arnés de los auditores, no leyendo el código.**

| | Qué hacía | Cómo quedó |
|---|---|---|
| **N01** | «Alex: 1 pala, 1 zorbex»: entraba la pala y se borraba la línea entera, zorbex incluido. El panel se cerraba y el pendiente no volvía | Se quita **solo lo que entró**. Lo sin resolver se queda en pantalla |
| **N02** | Las decisiones se guardaban por posición. Al quitar un renglón los siguientes heredaban la del vecino: lo marcado «Consumo» nacía «Eléctrica» | Cada ítem y cada renglón llevan un id que no es su posición |
| **N03** | La vista previa contaba por su cuenta y no mostraba las entradas automáticas acumuladas. Dos personas pedían la única pala y nadie avisaba nada | La vista previa dibuja **el mismo plan** que se va a aplicar |
| **N03b** | *(este lo encontré yo)* La vista previa llamaba a la función que **crea** ítems, y la vista previa corre en cada render: abrir el panel creaba ítems duplicados con cada tecla | `armarMovimientos` recibe `crear`; dibujar simula, registrar crea |
| **N05** | El identificador anti-doble-registro salía del índice del plan. En un reintento los índices se corrían, chocaban, y el endpoint respondía que registró un martillo que **no estaba en la base** | Sale de lo que no cambia entre reintentos: operación, ítem, persona, tipo, cantidad. Y ante clave repetida **lee la fila** antes de cantar éxito |
| **N06** | Si la herramienta fallaba al escribirse, su accesorio se gastaba igual. La guarda que puse estaba **después** del RPC, o sea que revisaba con el disco ya escrito | La guarda va **antes** de escribir |
| **N07** | La pantalla exigía proyecto para consumibles y el endpoint no: dos reglas para lo mismo | `exigeProyecto` en `core/despacho.ts`, una regla, un sitio |
| **N08** | `tsx` en `package.json` sin poder regenerar el lockfile: `npm ci` se caía | `tsx` por `npx`. `npm ci` verificado |

### N04 sigue abierto, y es el que importa

**El orden de las escrituras a la red no está garantizado.** El núcleo pone la
entrada antes que la salida, pero son un RPC por movimiento: el SQL puede
recibir la salida primero, rechazarla por falta de stock, y guardar la entrada
después. La app ya cantó éxito y muestra saldo cero; el servidor queda con una
entrada, ninguna salida y saldo uno.

**Esto NO se arregla en la aplicación.** Pide una transacción por despacho: un
RPC nuevo con su migración. Y **antes hay que leer qué está instalado en
Supabase**, porque ya se sabe que el repo y el servidor difieren.

### La lección de método, que es la parte cara

**Las 191 comprobaciones pasaban con los ocho fallos adentro.** Cubrían el
núcleo, y ninguno de los ocho vivía ahí: vivían en la pantalla, en el endpoint y
en el orden de las escrituras. Puse las pruebas donde era fácil ponerlas, no
donde estaban los huecos.

Por eso ahora son **222** y dos de ellas son de otra clase:

- `tests/pantalla.test.ts` **saca los manejadores de verdad** de
  `FloatingChat.tsx` con el compilador de TypeScript y los corre. No es una
  copia. Si alguien renombra o mueve una función, la prueba **falla nombrándola**
  en vez de pasar callada contra código viejo.
- `api/identidad.ts` existe para que `tests/endpoint.test.ts` pueda importar la
  función que se despliega. La prueba anterior **copiaba la fórmula adentro** y
  se quedó en verde mientras la desplegada reportaba registros falsos.

**Y una advertencia para la sesión siguiente:** al correr el arnés de los
auditores, cuatro pruebas devolvieron `HARNESS_FAILURE`. No era que el fallo
estuviera arreglado: era que yo había movido las funciones y el arnés no las
encontraba. **`HARNESS_FAILURE` no es un arreglo.** Hay que leer el motivo de
cada una, y si hace falta, reescribir la prueba con la lógica de ellos contra el
código nuevo. Eso es lo que hay en `tests/pantalla.test.ts`.

---

## 0. Cómo se usa esto

Leelo entero de una. No hace falta que Juli pegue nada más. Si algo de acá
contradice lo que él recuerde, **gana lo que diga él** — pero decíselo, no lo
construyas sobre el recuerdo.

---

## 1. Qué es esto

App de bodega para **Grupo Montecielo** (construcción, Antioquia). Está en
producción en `bodega-montecielo.vercel.app` y **se está entregando a una persona
que no es Juli**: la residente/encargada de bodega.

Juli **no es programador**. Se le explica **qué cambia en la pantalla**, nunca
cómo está hecho.

**Stack:** React 18 + TypeScript + Vite + Tailwind. Sin router, una sola página.
Estado en `App.tsx` con `useState`, persistido a localStorage y sincronizado con
Supabase. Despliegue **solo en Vercel**, proyecto `bodega-inventario`.

---

## 2. Estado real de producción (verificado, no de memoria)

| Tipo | Filas | En bodega | Prestadas |
|---|---|---|---|
| Herramienta Eléctrica | 55 | 47 | 14 |
| Herramienta Manual | 13 | 12 | 9 |
| EPP | 6 | 14 | 0 |
| Material de Consumo | 52 | 21 | 0 |
| Accesorio | 3 | 0 | 0 |

Además: **166 movimientos, 34 personas, 5 accesos** (CAMILO, Juli, Kate, KATE,
Visitante).

**El kardex cuadra en cero descuadres.** Se logró sumando las 4 entradas de
apertura que faltaban, **sin cambiar una sola cantidad**. No lo rompas.

**Termómetro honesto:** la app funciona y se puede usar. Lo que nunca pasó es que
**otra persona la use un día real** — en 100 días hay solo 2 actores y 9 días con
actividad, y todo eso es testeo de Juli.

---

## 3. Reglas duras (no se negocian)

1. **«No se me pueden borrar datos ni información ni nada de eso.»** Todo borrado
   es lápida (`deleted_at`), nunca `DELETE`. Hay una Papelera con botón Devolver.
   **No tiene botón de vaciar y así se queda**, salvo que Juli lo pida.
2. **Nada de subagentes.** No usar la herramienta Agent. Quemó su límite una vez.
3. **Solo Vercel.** Nunca Netlify. Confirmar siempre que quede READY.
4. **«Margea, si no margea no hay nada.»** Cada bloque de trabajo se commitea, se
   hace PR, **se mergea y se despliega**, sin preguntar.
5. **Toda operación sobre producción deja renglón en la trazabilidad.**
6. **Su contraseña no se guarda en ningún lado.** Para probar en navegador se usa
   una desechable (`prueba123`, sha256 `ff960cb5…`).
7. **Token-first antes de PRODUCIR** (código, documentos, archivos): clasificar
   dificultad, estimar tokens, plan numerado, esperar «Ejecuta». **No aplica**
   cuando se está pensando o debatiendo — ahí se responde de frente. Si se queja
   del gasto: **parar y proponer reducir, sin justificarse**.
8. Rama de trabajo: `claude/handoff-md-review-m3j9pp`.

---

## 4. La pregunta de arquitectura, contestada

> *«¿La lógica de despacho, devolución y creación de ítems está en funciones de
> servicio separadas, o dentro de los componentes de React? Si está dentro, ¿qué
> tan grande es el trabajo de extraerla a una capa de servicios expuesta como API?»*

**Está mezclada, pero no de la peor manera.** Ya existen tres capas de hecho:

**Ya está afuera de React (reutilizable tal cual):**
- `utils/inventory.ts` — la regla de **activo vs. gasto** (se presta vs. se
  entrega), y los filtros de préstamo activo. Antes estaba duplicada en 21 sitios
  con 4 nombres distintos; hoy es el único lugar.
- `utils/genus.ts` — la **única** regla de parecido entre nombres (`looseMatch`,
  `getGenus`, `familiaDe`, `raizDeFamilia`). **Nunca escribir una segunda.**
- `utils/arbol.ts` (familia → rama → color·marca), `utils/medida.ts`,
  `utils/cambios.ts`, `utils/nombres.ts`.
- `services/warehouseQA.ts` — **ya responde «¿qué tiene Abel?» sin React**,
  recibiendo un contexto plano `{items, movements, personnel, projects}`. Esto
  cubre los puntos 16 y 18 del prompt del asistente sin escribir nada nuevo.

**Ya está afuera y es transaccional:**
- `services/supabaseService.ts` — `logMovementWithStock`,
  `returnLoanAndRestoreStock`, `deleteMovementWithRevert`. Movimiento + stock en
  una sola transacción del servidor. Es persistencia, no reglas.

**Lo que SÍ está metido dentro de `App.tsx`** (2.010 líneas, todo el estado):
- `handleLogMovement` (:1216) · `handleLogMovements` (:1193) ·
  `handleReturnItem` (:1291) · `handleAddItemSync` (:1036) ·
  `registrarApertura` (:961) · `handleDeleteMovement` (:1263) ·
  `handleDescartarItems` (:1058).

Ahí la aritmética del stock vive entrelazada con `setItems`, `setMovements`,
`ajustarEspejo()` y un `alert()`.

**Tamaño real del trabajo:** el enredo es **superficial, no estructural**. Son
~40 líneas de aritmética pura escondidas entre llamadas de React. Sacarlas a un
`core/` con `despachar()`, `devolver()`, `crearItem()` que reciban
`{items, movements}` y devuelvan `{efectos, error}` —y que `App.tsx` solo aplique
los efectos— son **2 a 3 días**, no semanas.

**Y vale la pena aunque el agente de Telegram nunca se haga:** hoy la validación
de stock está escrita **dos veces**, en `handleLogMovement` y otra vez en
`handleLogMovements`. Eso es una divergencia esperando a pasar.

---

## 5. Los tres huecos de MODELO DE DATOS (esto es lo que importa)

El prompt del asistente (Apéndice A) pide cosas que **la app ya hace** —varios
elementos en un mensaje, devoluciones parciales, no borrar historial, estado
bueno/malo, «¿qué tiene Abel?»— y tres cosas que **la app no puede hacer, y no
por falta de chatbot sino porque no existe la columna**:

### Hueco 1 — No existe «pendiente de verificar ubicación»
Hoy un ítem está **en bodega** o **prestado a alguien**. Punto. No existe el
tercer estado que pide la Lista 4:

> *1 láser Total fuera → posible asignación: Jesús → verificar actualmente.*

Y son **25 unidades** en ese limbo. Esto es una columna nueva en `items` o un
estado nuevo en `movements`, más su pantalla. **No lo arregla un chatbot.**

### Hueco 2 — No hay traslado obra → obra
`Movement` tiene `projectId`, pero el flujo es siempre **bodega → persona**. El
punto 13 del prompt («Mandé una pulidora de Bonilla para El Cristo») no tiene
dónde guardarse: faltan **origen y destino**.

### Hueco 3 — No hay «responsable anterior»
El punto de «La tenía Juan y se la entregué a Carlos» existe a medias:
`handleTransferLoan` (:1382) traslada el préstamo, pero el prompt pide que quede
escrito quién la tenía antes como dato, no solo como historial.

---

## 6. La brecha grande: las listas y la app son dos bodegas distintas

| | Listas de Juli | App hoy |
|---|---|---|
| Eléctricas | **96 unidades** | **61** (47 + 14) |
| Manuales | ~20 trabajadores con decenas de herramientas (Apéndice C) | **13 filas, 21 unidades** |

Faltan ~35 eléctricas y **el inventario manual prácticamente no está cargado**.

**DECIDIDO (11 de septiembre de 2026, palabras de Juli): «Las listas son de
verdad.»** Mandan las listas. Hay que cargar lo que falta en la app, no recortar
las listas. El detalle de cómo, y las tres cosas que eso NO autoriza, están al
final de este archivo.

---

## 7. Pendiente (en orden)

1. **Cargar el inventario que falta** — las listas mandan (punto 6, ya
   decidido). Antes de cargar, abrir el estado «pendiente de verificar
   ubicación», o las 25 unidades del Apéndice B.5 entran mintiendo.
2. **Pruebas automáticas.** Acordado. El argumento se reforzó solo: varios de los
   últimos hallazgos fueron **efectos secundarios de arreglos del mismo día**.
3. **Los cuatro pasos (familia → género → denominación → cantidad)** ya funcionan
   en el chatbot para consumibles y herramientas; **faltan los formularios de
   afuera del chatbot**.
4. ~~`medidaDe` no entiende fracciones~~ — **ARREGLADO** (#75). Entiende `1/2`,
   `1 1/2` y el símbolo `½`. Lo que sigue sin modelarse: «Llave 12» se lee como
   12 pulgadas y son milímetros.
5. **Marcas mal escritas en producción:** Nn/NN, Truper/Trupper/Trupee, Dwalt.
   Ofrecido, **no tocado sin su visto bueno**.
6. **Duplicados probables a decidir:** Concretadora / Concretadora Eléctrica ·
   Mezcladora / Mezcladora Eléctrica · Vibro / Vibro Compactador / Motor vibro ·
   las dos Hidrolavadoras negras · Extension / Extensiones.
7. **«Pistola impacto»** sin color ni marca.
8. **Kate y KATE son dos accesos distintos.** Mandar uno a la papelera.
9. **Fuera de alcance (decisión suya):** teléfonos de Jhon Jader y Rafael ·
   capacitación · la conversación del chat entre celulares (solo sincronizan las
   acciones, no la charla).

---

## 8. Trampas del código (ya costaron tiempo, no las repitas)

- **RLS en `app_users`:** hay política de insert/update/delete pero **ninguna de
  SELECT**. Cualquier `.select()` después de un insert hace que PostgREST
  **revierta el insert entero**. Las lecturas de esa tabla van por RPC
  `SECURITY DEFINER`: `get_users_safe`, `get_deleted_users_safe`,
  `authenticate_user`, `restore_user`. **Esta sola trampa causó tres bugs
  distintos.**
- **Comentario JSX dentro de una lista de props** → rompe el build con TS1005.
  Pasó tres veces. El comentario va **arriba** del elemento.
- **Componentes definidos adentro de otros componentes** se remontan en cada
  render y pierden su estado local. Por eso `ConfirmLoteWhatsApp` es archivo
  aparte.
- **Un préstamo devuelto NO crea un movimiento de devolución** — voltea
  `is_returned` y repone el stock. Cualquier fórmula de triangulación que asuma
  lo contrario reporta descuadres falsos.
- **Borrar un préstamo ya devuelto tiene efecto neto cero.** Revertirlo infla el
  stock. Ya está contemplado (`netZero` en `handleDeleteMovement`).
- **Paleta de marca** (`tailwind.config.js`): `marca #f5be09` **solo de fondo** ·
  `papel #ffffff` · `atencion #a35a00` · `alerta #c81e1e` · `bien #0f7a34` ·
  `bien-suave #eaf6ee` (casi blanco, **nunca** con `text-papel`).
- **Playwright:** `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`,
  hace falta un `.env.local` de mentira, y **sembrar una sola vez** (no en cada
  recarga) o la prueba miente. Semilla con `version: '3.0'`, clave de localStorage
  `warehouse_inventory_pro_data`, los `InventoryType` son strings en español.
- **Después de cada squash-merge la rama remota queda atrás.** Patrón:
  `git fetch origin main && git checkout -B <rama> origin/main`, recommit, y
  `git push --force-with-lease` **después** de verificar que
  `git diff --stat origin/<rama> origin/main` salga vacío.

---

## 9. Migraciones ya aplicadas a producción

```
20260907120000_add_setup_columns_to_app_users.sql
20260907170000_papelera.sql
20260907173000_get_users_safe_papelera.sql
20260907180000_origen_en_audit_logs.sql
20260907190000_accesos_borrados_para_la_papelera.sql
20260907200000_operacion_en_audit_logs.sql
entrar_con_nombre_o_usuario_sin_mayusculas
```

Proyecto Supabase: `xmizawuhiounkiaqrwxd` (`bodega-inventario`, región sa-east-1).

---
---

# APÉNDICE A — Prompt del asistente de trazabilidad

> Pegado por Juli tal cual. Es la especificación funcional del agente que quiere.
> La persona que lo va a usar es **la residente/encargada de bodega**, y la regla
> madre es que **ella no se convierta en digitadora**: habla por voz a texto
> mientras trabaja.

**Propósito.** Mantener la trazabilidad de todo lo que se entrega, recibe,
traslada, devuelve, daña o manda a una obra. Ella debe poder decir de corrido:
*«Hoy le entregué a Abel una pulidora grande, una plomada de punto, unos clavos,
un bisturí, una cuchilla, un martillo, una pala, una pica y un soldador»* — y que
el asistente interprete el mensaje entero y genere el registro.

**1. Las cinco listas de contexto.** No son cinco inventarios; cada una cumple
una función distinta.
- **Lista 1 — Planilla histórica.** La fuente más vieja. Las manuales que trae se
  consideran válidas; las eléctricas sirven de **antecedente**. Una asignación
  histórica **no** significa que la persona la tenga hoy.
- **Lista 2 — Inventario definitivo.** **Fuente maestra** del inventario inicial:
  qué existe y cuánto. **No sumar de nuevo** algo porque aparezca en otra lista.
- **Lista 3 — Kardex.** Movimientos y asignaciones. Las manuales se consideran
  correctas; las eléctricas fueron objeto de cruce, y un registro eléctrico viejo
  es **solo una posible asignación** hasta que haya confirmación actual.
- **Lista 4 — Cruce y control de pendientes.** Construida cruzando inventario
  definitivo, inventario físico, kardex y planilla. Establece el estado inicial:
  en bodega · buenas · malas · prestadas · responsables conocidos · fuera de
  bodega · pendientes de ubicación · posibles asignaciones históricas. **No
  considerar perdida una herramienta solo porque no esté en bodega**: usar
  `PENDIENTE DE VERIFICAR UBICACIÓN`.
- **Lista 5 — Manuales por trabajador.** Las manuales del Kardex con su
  trabajador. **No limitar el sistema a eléctricas.**

**2. El inventario es más amplio que las eléctricas.** Debe poder registrar
herramienta eléctrica, manual, equipo, material, consumible, EPP, accesorio,
repuesto, insumo, o lo que sea. **No exigirle que clasifique antes de registrar.**
«Le di clavos» → Clavos, cantidad indicada o 1. La clasificación se hace después.
La prioridad es **saber qué salió, quién lo recibió y cuándo**.

**3. Bitácora viva.** `ESTADO INICIAL + MOVIMIENTOS NUEVOS = ESTADO ACTUAL`.

**4. Los datos se autorrellenan.** Ella no escribe todos los campos.
- *Fecha:* la de hoy, salvo que diga otra. *Hora:* la del mensaje. **No preguntar
  la hora cada vez.**
- *Tipo de movimiento:* inferirlo. «Le presté» → préstamo · «Le entregué» /
  «Salió» → salida · «Entró» → entrada · «Volvió» / «Me devolvió» → devolución ·
  «Mandamos» → traslado · «Lo encontramos» → ubicación confirmada · «Se dañó» →
  cambio de estado. **No preguntarlo si se puede inferir.**
- *Cantidad:* si no se especifica, 1.
- *Marca y color:* registrar si se mencionan. **No inventarlos.**
- *Responsable:* quién recibe. Si menciona quién la tenía antes, registrar
  responsable anterior y nuevo.
- *Ubicación:* si sale de bodega → origen Bodega. Si menciona obra → destino esa
  obra. Si no da destino, **no inventarlo**.

**5. Varios elementos en un solo mensaje.** Identificar cada uno. **No pedirle
nueve mensajes.** Todos quedan atados a la misma persona, fecha, hora, operación,
origen y destino.

**6. Campos del registro:** fecha, hora, movimiento, elemento, cantidad, marca,
color, responsable anterior, responsable nuevo, quién entrega, quién recibe,
ubicación origen, ubicación destino, estado, observación. Lo que no se conozca
queda como `No especificado` — **nunca inventado**.

**7. Respuesta breve.** *«Registrado: entrega a Abel — pulidora grande, plomada,
clavos, bisturí, cuchilla, martillo, pala, pica y soldador.»* Nada de
explicaciones largas mientras ella trabaja.

**8. Confirmación.** Si el mensaje es claro, registrar directo. Solo preguntar lo
indispensable ante una ambigüedad que produzca un registro incorrecto
(*«¿Pulidora grande o pequeña?»*). **Nunca** preguntar fecha, hora, tipo o
cantidad inferibles.

**9. Devoluciones.** *«Abel devolvió la pulidora»* → registrar devolución.
**NO borrar el préstamo original.** Se conserva `Préstamo → devolución`.

**10. Devolución parcial.** Si prestó pulidora, pala y martillo y devuelve dos, se
registran dos devoluciones y **la pala sigue asignada**. No se cierra ni elimina
la operación original.

**11. Estado.** «Volvió buena» → buena. «Volvió mala» → mala. Si vuelve sin
información, **no inventar**.

**12. Dañadas.** Registrar el cambio de estado. **NO eliminarla del inventario.**

**13. Traslados entre obras.** *«Mandé una pulidora de Bonilla para El Cristo»* →
origen Bonilla, destino El Cristo. Si queda un responsable, registrarlo.

**14. Encontradas.** *«Encontré el láser Total en Salvador Bahía»* → actualizar
ubicación, estado «ubicación confirmada», sacarla de pendientes. **No borrar su
historial.**

**15. Pendientes de ubicación.** Se mantienen hasta que haya confirmación actual.
Una asignación histórica **no** resuelve el pendiente: *«Nivel láser Total →
pendiente de verificar → posible responsable histórico: Jesús»*. Solo cuando ella
diga *«el láser Total lo tiene Jesús»* pasa a confirmado.

**16. Control de responsables.** Debe responder *«¿qué tiene Abel?»* (solo lo que
está bajo su responsabilidad **ahora**) y *«¿qué tenía Abel?»* (historial).
Distinguir siempre **actual / histórico / devuelto**.

**17. NO borrar historial.** *Regla fundamental.* Todo cambio agrega un
movimiento nuevo. El historial debe permitir reconstruir: quién → recibió →
cuándo → qué → dónde fue → cuándo devolvió → en qué estado.

**18. Consultas** que debe soportar: ¿qué tiene Abel? · ¿qué está prestado? ·
¿qué salió hoy? · ¿qué entró hoy? · ¿qué volvió hoy? · ¿qué devolvió Abel? ·
¿qué está malo? · ¿qué falta por ubicar? · ¿qué hay en El Cristo? · ¿qué salió
para Bonilla? · ¿quién tiene las pulidoras? · ¿qué tiene cada trabajador?

**19. Resumen para el responsable principal.** Formato compacto: *Salidas /
préstamos* · *Devoluciones* · *Pendientes*, cada renglón con hora, persona,
elemento, cantidad y origen → destino.

**20. Pedidos.** *«Necesitamos 20 pares de guantes naranjas, 10 palas y dos
extensiones»* → registrar elementos y cantidades, sin exigir clasificación.

**21. Regla de trazabilidad.** Toda salida: **QUÉ + CUÁNTO + QUIÉN + CUÁNDO**, y
cuando aplique **DE DÓNDE + PARA DÓNDE + EN QUÉ ESTADO**. Toda devolución debe
poder relacionarse con su salida.

**22. Mínima fricción.** Ella está trabajando. Sin formularios, sin comandos, sin
memorizar categorías, sin repetir lo que ya está claro por contexto.

**23. Objetivo final.** El responsable principal trabaja hasta el mediodía y
después no está en la obra. Los movimientos de su ausencia deben quedar
registrados **en el momento**, por voz o texto. *La prioridad no es que el
registro sea perfecto en la primera captura; la prioridad es* **«QUE EL
MOVIMIENTO NO SE PIERDA»** *— después se completa, corrige o clasifica.*

**24. Regla final.** `LA RESIDENTE HABLA → EL ASISTENTE ENTIENDE → EL ASISTENTE
ESTRUCTURA → EL MOVIMIENTO QUEDA REGISTRADO → EL HISTORIAL SE CONSERVA.` Bitácora
inteligente, **no** un formulario que la obligue a parar de trabajar.

---

# APÉNDICE B — Inventario de herramientas eléctricas (listas 2, 3 y 4 de Juli)

> **Ojo:** esta lista dice **96 unidades**; producción tiene **61**. Ver punto 6.

## B.1 — Inventario total

| Herramienta | Total |
|---|---|
| Niveles láser | 5 |
| Plomada de punto láser | 1 |
| Hidrolavadoras | 2 |
| Vibros | 2 |
| Taladros demoledores | 2 |
| Tronzadoras | 2 |
| Radiales | 9 |
| Pulidoras grandes | 9 |
| Pulidoras pequeñas | 9 |
| Taladros percutores | 6 |
| Taladros inalámbricos | 7 |
| Taladros alámbricos | 3 |
| Soldadores pequeños Gamma | 2 |
| Mezcladoras eléctricas | 2 |
| Lijadoras | 7 |
| Compresores | 2 |
| Canguro | 1 |
| Nivel de precisión | 1 |
| Colichadora | 1 |
| Pistolas de impacto | 5 |
| Soldador grande Neo | 1 |
| Soldador pequeño Furious | 1 |
| Gramera eléctrica | 1 |
| Pesa eléctrica | 1 |

## B.2 — En bodega, buenas

Niveles láser 3 · Plomada de punto láser 1 · Hidrolavadoras 2 · Vibros 2 ·
Taladro demoledor DeWalt amarillo 1 · Radiales 6 · Pulidora grande Stanley 1 ·
Taladro inalámbrico Bauker 1 · Taladro alámbrico DeWalt 1 · Lijadoras 5 ·
Mezcladora eléctrica 1 · Soldador pequeño Gamma 1 · Soldador grande Neo 1 ·
Pistolas de impacto 5 · Compresor rojo 1 · Nivel de precisión 1 · Canguro 1 ·
Tronzadora 1

## B.3 — En bodega, malas (siguen siendo parte del inventario)

Compresor amarillo 1 · Taladros percutores Bosch 2 · Taladro percutor Truper de
maletín 1 · Pulidora grande Makita azul 1 · Taladro alámbrico Bosch 1 · Taladro
demoledor rojo 1 · Soldador Furious naranja 1 · Gramera eléctrica 1 ·
Colichadora 1

## B.4 — Prestadas, responsable CONFIRMADO

| Herramienta | Cant. | Responsable |
|---|---|---|
| Pulidora grande Makita azul | 1 | Duván |
| Pulidora grande | 1 | Anderson |
| Pulidora grande | 1 | John Jader |
| Radial | 1 | John Jader |
| Taladro inalámbrico | 1 | Jesús Vázquez |
| Taladro inalámbrico | 1 | John Jader |
| Taladro inalámbrico | 1 | Andrés |
| Taladro alámbrico DeWalt | 1 | Carlos Torrealba |
| Lijadoras | 2 | Diego |
| Soldador pequeño Gamma | 1 | Brian |
| Mezcladora eléctrica | 1 | Dani |

## B.5 — FALTA POR VERIFICAR + posibles asignaciones (**25 unidades**)

Los tres niveles que hay que distinguir, en palabras de Juli:
**Confirmado** (sabemos quién la tiene hoy) · **Posible asignación** (aparece
relacionado en Kardex/planilla, pero no sabemos si todavía la tiene) ·
**Falta por verificar** (la unidad existe, sin ubicación ni responsable actual).

| Herramienta | Cant. | Posibles asignaciones / personas relacionadas |
|---|---|---|
| Nivel láser DeWalt | 1 | Dani / William, históricos con láseres. Verificar quién lo tiene hoy. |
| Nivel láser Total | 1 | Jesús Vázquez aparece en planilla con «Láser Total». Verificar. |
| Taladro demoledor amarillo DeWalt | 1 | John Jader, histórico, registro decía «por confirmar». |
| Tronzadora | 1 | Revisar kardex/planilla, trabajadores con herramientas de corte. Sin asignación. |
| Radiales | 2 | John Jader tiene 1 confirmada; hay 2 más sin ubicar. |
| Pulidoras grandes | 4 | Andrés, Héctor Quiceno, Sebastián y otros históricos. Cruzar quién conserva alguna. |
| Pulidoras pequeñas | 7 | John Jader, Héctor Quiceno, Adrián Echeverri, Sebastián, Ricardo, Giovanni. |
| Taladros percutores | 3 | Ferney Giraldo → Truper gris · John Jader → Da Vinci · Abel/Abel Oficial → Da Vinci. Verificar también a Álex el oficial. |
| Taladros inalámbricos | 3 | Brian Sánchez (kardex) · Jorman (planilla) · Andrés confirmado. Revisar Brian/Jorman. |
| Taladro alámbrico Truper gris | 1 | Sin asignación actual confirmada. |

> Regla que Juli deja explícita: *no decir «lo tiene Jesús»; decir «1 láser Total
> fuera → posible asignación: Jesús → verificar»*. Eso evita que un registro viejo
> se vuelva una asignación actual por accidente. Cuando él diga «Ferney tiene el
> Truper gris», sale de pendientes y pasa a prestado confirmado, **sin alterar las
> demás listas**.

---

# APÉNDICE C — Lista 5: herramientas manuales por trabajador

> **Ojo:** la app tiene **13 filas / 21 unidades** de herramienta manual. Esta
> lista es mucho más grande. Prácticamente **no está cargada**.

| Trabajador | Herramientas manuales registradas |
|---|---|
| Dani | Escalera pequeña, cortadora de enchape |
| John Jader | Rodilleras |
| Jorman | CRC, pala, escuadra, tijera de lámina |
| Juan Puerta | Almádana, cincel |
| Adrián Echeverri | Trapera, marcador |
| Anderson | Serrucho, escuadras, alicates, pala, escuadra grande, tijera de lámina, palustre, segueta, espátulas pequeñas |
| Albeiro | Pala coca, barra, machetes, llaves 12 y 14, pala, almádana, gambia |
| Álex | Manguera de nivel, machete, barra, palas, cizalla, almádana, picas, entre otras |
| Carlos Torrealba | Escuadra, broca cónica, almádana, cinta, nivel de mano, martillo, prensas, destornilladores, espátulas, entre otras |
| Carlos García | Herramientas manuales varias |
| Duván | Chuela, llana |
| Jorge Giraldo | Palas, barra |
| William | Machete, paleta, pisón, pica, pala, espátula |
| Alex Ferreira | Espátula pequeña, cepillo de alambre |
| Ricardo | Herramientas manuales varias |
| Juan Echeverry | Herramientas manuales varias |
| Abel / Abel Oficial | Palustre, polea/diferencial |
| Héctor Quiceno | Almádana, bichiroqui, chipote, martillo, codal, cortatubo, plomada, palustres, alicate, cincel, nivel de mano, pala, palín |
| Brian Sánchez | Arnés, eslinga, pala, tijera de lámina |
| Jesús Vásquez | Herramientas manuales registradas en kardex histórico |
| Sebastián | Herramientas manuales registradas |
| Ferney Giraldo | Herramientas manuales registradas |

---

## Lo primero que hay que hacer en la sesión nueva

**La decisión ya está tomada.** Juli lo dijo textual el 11 de septiembre de 2026:

> **«Las listas son de verdad.»**

O sea: **mandan las listas**, no producción. Hay que subir la app al nivel de las
listas, no al revés. Eso significa, en este orden:

1. **Cargar las ~35 herramientas eléctricas que faltan** (Apéndice B contra el
   inventario actual).
2. **Cargar el inventario manual completo** del Apéndice C, con su trabajador
   responsable. Hoy hay 13 filas; la lista tiene decenas.
3. **Abrir el tercer estado** («pendiente de verificar ubicación», con posible
   responsable) — sin él, las 25 unidades del Apéndice B.5 no tienen dónde vivir
   y se cargarían mintiendo, como si estuvieran en bodega.

**Tres cosas que NO se deducen de «las listas mandan» y hay que respetar igual:**

- **Nada se borra.** Si producción tiene algo que la lista no trae, **no se
  elimina**: se deja y se marca para revisar. La regla del punto 3 manda sobre
  esto.
- **El kardex tiene que seguir cuadrando en cero.** Cada unidad que entre va con
  su **entrada de apertura**, igual que se hizo con las 4 que faltaban. Cargar
  cantidades a pelo descuadra el kardex.
- **Una asignación histórica no es una asignación actual.** Lo prestado
  confirmado (B.4) entra como préstamo; lo de B.5 entra como pendiente, **nunca**
  como préstamo a la persona que aparece de «posible».

**Orden sugerido:** primero el punto 3 (el estado nuevo), después la carga. Al
revés toca volver a tocar lo cargado.
