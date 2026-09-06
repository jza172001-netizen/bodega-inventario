# Traspaso — dónde va la bodega

Escrito el 6 de septiembre de 2026, al cerrar el chat anterior por peso.
Todo lo que dice acá está verificado contra la base de producción
(`xmizawuhiounkiaqrwxd`) el mismo día, no de memoria.

---

## 1. El plan de pruebas es el mismo, y está entero por correr

Son **12 pasos** (Juli los recuerda como trece, contando el Paso 0 —la primera
foto del Resumen—). El plan no cambió.

**Y no hay pasos hechos.** Él lo dijo con todas las letras: *«nunca hice los 12,
los pusiste en un plan pero no los hice»*. En el chat anterior yo di ocho por
hechos mirando su base de datos —42 préstamos, devoluciones con estado, 33
borrados— y eso fue un error de razonamiento: esos datos prueban que **la app se
usó**, no que alguien haya comprobado lo que el paso pregunta.

La diferencia importa y es toda la diferencia:

| Lo que hay | Lo que NO hay |
|---|---|
| Se registraron 42 préstamos sin que la app se cayera | Nadie verificó que el stock quedara bien después |
| Hay devoluciones guardadas como `damaged`, `worn`, `incomplete` | Nadie miró si la trazabilidad dice **quién la tuvo** ni si el stock subió +1 |
| Se borraron 33 movimientos | Nadie confirmó que el stock volviera |

Usar una función y verificarla son dos cosas. Lo primero dice que no explota;
lo segundo dice que la cuenta queda bien. Solo lo segundo cierra un paso.

### Lo único verificado hasta hoy, y por quién

- **Paso 12 (stock ↔ Kardex)** — lo corrí yo contra producción el 6 de
  septiembre: **74 de 77 cuadran**, los 3 descuadres están nombrados abajo.
  Este sí cuenta, porque es una consulta, no una impresión.
- **Arreglos sueltos** verificados en navegador a 390 px (choques de pantalla,
  el «?» de la ayuda, el botón de Despacho). Son de esos arreglos, no de los
  pasos del plan.

Todo lo demás —los pasos 1 al 11— **está por correr**, y los tiene que correr
Juli con el celular en la mano. No son de programar: son de hacer la acción y
mirar si la app contestó lo que debía.

---

## 2. Lo que Juli cree que falta, contra lo que de verdad falta

Él dijo: *«estamos a dos pasos: verificar que esté lista y terminar de subir los
números del personal»*. La segunda mitad está casi lista; la primera es más
grande de lo que suena.

- **Los teléfonos ya están casi todos: 31 de 33.** Faltan exactamente dos —
  **Jhon jader** y **Rafael**. Eso no es «terminar de subir los números», es
  agregar dos.
- **«Verificar que esté lista» son los once pasos del plan**, no tres. Varios
  son cortos y de solo mirar, pero ninguno está cerrado.

Una advertencia para el chat que siga: **no dar un paso por hecho porque en la
base haya datos que se le parezcan.** Un paso se cierra cuando Juli hizo la
acción y dijo qué vio.

---

## 3. Los 3 descuadres del Paso 12 (nombrados, ya no son un misterio)

| Ítem | Guardado | Kardex | Movimientos | Qué es |
|---|---|---|---|---|
| `clavos 2 acero` | 1 | 0 | **0** | nació sin movimiento de carga inicial |
| `clavos hierro 2` | 1 | 0 | **0** | lo mismo |
| `Polvo enchape` | 4 | 0 | 2 | entró 4 y salió 4 **seis segundos después** (5 sep, sesión de pruebas): la salida quedó en el Kardex pero la cantidad del ítem no bajó |

Los dos de clavos son **dato faltante de origen**, no plata perdida. El
`Polvo enchape` sí es un descuadre real de 4 unidades de un consumible, de la
sesión de pruebas.

**Nadie ha tocado esto todavía**, a propósito: el panel de cotejo del Resumen
los muestra y el botón «✓ Ya lo revisé» tiene que apretarlo Juli, para que su
nombre quede en la trazabilidad.

---

## 4. Reglas de trabajo de Juli — no negociables

- **«Margea, si no margea no hay nada»** — cada bloque de trabajo se commitea,
  se hace PR, **se mergea y se despliega**, sin preguntar.
- **Nada de subagentes.** No usar la herramienta Agent. Quemó su límite una vez.
- **Solo Vercel.** Nunca Netlify. Proyecto `bodega-inventario`, alias de
  producción `bodega-montecielo.vercel.app`. Confirmar siempre que quede READY.
- **Su contraseña no se guarda en ningún lado.** Para probar en navegador se usa
  una desechable (`prueba123`, sha256 `ff960cb5…`).
- **Toda operación sobre datos de producción deja entrada en la trazabilidad.**
- Él no es programador. Se le explica **qué cambia en la pantalla**, no cómo.
- Rama de trabajo: `claude/test-plan-reformulated-ub69fi`. `main` recibe los PR
  **como squash**, así que al traer main suele haber conflicto con commits que
  son míos: comprobar con `git diff origin/main HEAD` **antes** de resolver.

---

## 5. Cosas que sé que están pendientes y no son urgentes

- **La lista de pedidos no se guarda en localStorage**, solo en Supabase: una
  nota tomada sin señal se pierde si se cierra la pestaña antes de sincronizar.
- **Préstamos muestra 5 herramientas sin desplazar**, no las 6 que puse de meta
  en el plan visual. Para llegar a 6 habría que quitarle el buscador o los
  filtros de tipo, y eso cuesta más de lo que da.
- **La guía larga de ayuda** (`components/HelpView.tsx`) sigue existiendo pero
  ya no tiene entrada en el menú: la ayuda ahora se pregunta desde el chat. Es
  respaldo, no código muerto por descuido.

---

## 6. Lo que hay que saber del código para no romper nada

- **Una sola regla de parecido**: `utils/genus.ts` (`looseMatch`, `sameGenus`,
  `esParecido`). Juli fue explícito: *«debe ir con la lógica del buscador
  universal»*. No escribir una segunda.
- **El árbol** (`utils/arbol.ts`): familia → rama → color·marca. La rama es la
  palabra con la que él **pide** la cosa («la pulidora grande»), no el color.
  Un solo eje por familia.
- **La ayuda por preguntas**: `services/comoSeHace.ts`, conectada en
  `answerQuestion` **antes** de resolver entidades. Si se mueve después,
  «¿cómo devuelvo una herramienta?» cae en la ficha de una herramienta.
- **Colores de marca**: `tailwind.config.js`. El amarillo `#f5be09` va **de
  fondo con tinta encima**, nunca de texto sobre blanco (1,71 : 1).
- **`LoanRow` se define DENTRO de `LoansView`**, así que React lo remonta en
  cada render y cualquier estado local de un hijo se pierde. Por eso los
  accesorios usan un `<select>` nativo y una ✕ siempre visible.
- **Para probar en navegador**: la semilla de localStorage **debe** llevar
  `version: '3.0'` o `loadFromLocalStorage` la descarta (`storage.ts:47`).
  Los `InventoryType` son cadenas en español: `'Herramienta Manual'`,
  `'Herramienta Eléctrica'`, `'Equipo de Protección Personal'`,
  `'Material de Consumo'`.
- **Lápidas, no borrado**: `deleted_at` en `items`, `movements`, `personnel` y
  `projects`. Quitar la fila de verdad hace que el celular la resucite.

---

## 7. Lo primero que hay que preguntarle al retomar

> ¿Con cuál paso arrancamos? Y de paso, ¿le ponés el teléfono a Jhon jader y a
> Rafael?

Sugerencia de orden, de lo más corto a lo más largo: **3** (formulario directo),
**9** (mirar el Resumen), **4 y 5** (devoluciones, que son las de plata), **6**
(borrar), **10** (otro celular), **11** (WhatsApp). El 1, 2, 7 y 8 se cruzan
solos mientras hace los otros.

Cuando estén corridos, **la app está lista para entregar** — y entregarla no es
lo mismo que que no quede nada por hacer.
