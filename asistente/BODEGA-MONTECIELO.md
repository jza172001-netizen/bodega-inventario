# BODEGA MONTECIELO — Conocimiento del asistente de despacho

> **Qué es este archivo:** lo que el asistente sabe de la bodega. Se sube como
> **conocimiento** (archivo) al Gem, Proyecto o GPT. El comportamiento —qué hace,
> cuándo pregunta, el formato exacto— está en `asistente/INSTRUCCIONES.md`, que
> va en **Instrucciones**.
>
> **Catálogo, personas y obras leídos de producción el 14-nov-2026. Reglas de
> Juli del 11-oct y del 19-oct (el asistente supone y avisa, NO pregunta el
> proyecto y entrega revisión y bloque de una vez), conciliadas con la app el
> 14-nov: la FECHA va en el bloque, el tubo va por color y por tubo entero.** Cuando cambie el inventario, pedir en Claude Code: «regenerá el
> catálogo de asistente/BODEGA-MONTECIELO.md desde producción», y volver a
> subirlo.

---

## 1. Quién hace qué

```
JULI / ENCARGADA → dicta o pega, regado
        ↓
ASISTENTE → corrige solo lo obvio y avisa · clasifica · ordena por trabajador
          → deduce el proyecto (NUNCA lo pregunta)
          → pregunta SOLO: persona «nuevo», entrega repetida, trabajador
            que ya tuvo entrega, tubo sin color
          → entrega revisión Y bloque de una vez (no espera «CONFIRMADO»)
        ↓
BLOQUE (=== ENTREGA ===, uno por trabajador)
        ↓
APP (chat → 📋 Bloque) → verifica contra la bodega: existencias, quién tiene qué,
                          oficial y cuadrilla, cuál de varias iguales, medida
                          que falta, ítems y personas nuevas
        ↓
«✓ Pedido correcto» por trabajador → Registrar
```

- **El asistente** revisa contra **lo que se dijo**. Corrige solo los errores
  de dictado (silicomas → Silicona), completa lo obvio y lo deja listado en
  «Lo que supuse». Pregunta solo lo de la sección 7.
- **La app** revisa contra **la bodega**:
  - ¿esa pulidora la tiene otro?, ¿cuál de las pulidoras?;
  - ¿hay existencias? (si no hay, «entra lo que falta y sale»);
  - ¿Alex es oficial?, y entonces ¿para quién de su cuadrilla?;
  - ¿qué medida, si hay varias?;
  - ¿el ítem o la persona existe? Si no, pregunta «¿lo creo?».
- **Las dos verificaciones hacen falta y no se repiten:** lo que la app
  pregunta con un toque, el asistente no lo pregunta.

## 2. El bloque

```
=== ENTREGA ===
TRABAJADOR: Adrián Echeverry
PROYECTO: CRISTO
FECHA: 03/10/2026
HORA: 08:04
LUGAR: contenedor

[CONSUMIBLES]
- 2 Soudal
- 4 Silicona negra
- 1 Brocha 2"

[HERRAMIENTAS MANUALES]
- 1 Cincel
- 1 Almadana
=== FIN ===
```

- **Una ENTREGA por trabajador.** Es lo mismo que la tarjeta que muestra la
  app antes de «✓ Pedido correcto».
- **Campos:**
  - `TRABAJADOR`, `PROYECTO` y `FECHA` (DD/MM/AAAA) van siempre;
  - `HORA` (HH:MM) y `LUGAR` (contenedor, segundo piso…) son opcionales;
  - van en cualquier orden.
- **La fecha VA en el bloque** (la app la lee desde el 6-oct): cada entrega
  se registra en SU día, aunque se pegue días después o en un mismo bloque
  vengan varios días. Sin `FECHA`, la app registra hoy. Una fecha futura o
  imposible (31/02) la app no la registra: la deja en la tarjeta para
  corregir. Ya no hace falta «poné la fecha en la app».
- **`PROYECTO: SIN PROYECTO`** es una decisión, no un olvido. Nunca va con
  consumibles.
- **Cuadrilla:** `TRABAJADOR: Juan Echeverry (cuadrilla de Alex)`.
- **Categorías**, solo las que tengan algo y en este orden: `[CONSUMIBLES]`,
  `[HERRAMIENTAS MANUALES]`, `[HERRAMIENTAS ELÉCTRICAS]`, `[EPP]`.
- **Un elemento por renglón:** `- cantidad nombre`. La app también entiende
  `2 | Soudal` y viñetas.

**Qué hace la app con la categoría:**
- **Ítem que ya existe:** manda la categoría de la bodega, porque de ahí sale
  si es **Préstamo** o **Gasto**. Si el bloque dice otra, la app lo avisa y no
  frena: «El bloque dice Consumibles; en la bodega Pala es Herramientas
  manuales: sale como Préstamo».
- **Ítem nuevo:** nace con la categoría del bloque, y se cambia con un toque.

**El formato viejo** (`@ CRISTO · 07:30` + `Alex: 3 palas, 1 martillo`) sigue
funcionando, pero el oficial es este.

## 3. Las cuatro categorías

| Categoría | Qué es | Cómo sale | ¿Proyecto? |
|---|---|---|---|
| **CONSUMIBLES** | Se gasta: cemento, silicona, Soudal, lija, tornillos, clavos, codos, brochas, cinta, discos | **Gasto** | **Obligatorio** (vale ZONA GENERAL) |
| **HERRAMIENTAS MANUALES** | Vuelve: pala, martillo, cincel, almadana, espátula, palustre | **Préstamo** | Opcional |
| **HERRAMIENTAS ELÉCTRICAS** | Vuelve, con color y marca: pulidora, taladro, radial, lijadora | **Préstamo** | Opcional |
| **EPP** | Protección personal: guantes, gafas, casco, tapabocas, arnés de vida | Gasto | Opcional |

- **Ítem que no está en el catálogo** (regla de Juli, 6-oct). No se pregunta:
  - tiene cable o batería → HERRAMIENTAS ELÉCTRICAS;
  - es herramienta sin cable ni batería, se presta y vuelve → HERRAMIENTAS
    MANUALES;
  - gafas, guantes, tapabocas, mascarillas, casco, protector auditivo → EPP;
  - todo lo demás → CONSUMIBLES.
- **Lo que diga el catálogo (sección 9) manda.** Por ejemplo, «Rodilleras» está
  como Herramienta manual, aunque parezca EPP.
- **Los discos** de pulidora o radial van como CONSUMIBLES. La app los tiene
  como Accesorio, que también es gasto, y no lo marca como contradicción.

**Dudas frecuentes, ya resueltas (no se preguntan):**
- pinturas, barnices, lacas, cuñetes, selladores → CONSUMIBLES;
- llanas, espátulas, palustres, palines, pala coca, codales → MANUALES;
- ruedas de andamio, diferenciales, prensas → MANUALES;
- separadores de enchape (catapis), lijas, discos, clavos → CONSUMIBLES.

## 4. Medidas y unidades

- **`"` es pulgada** y va pegada: `Brocha 2"`, `Codos 4"`, `Tornillos 1"`.
- **Medida que no dijeron** (brochas, codos, semicodos, tubos, uniones, Y, T,
  bujes, sifones, tornillos, clavos, lijas):
  - el catálogo tiene **una sola** → se usa y se avisa (`Sifón 2"`);
  - tiene **varias** o ninguna → va sin medida (`3 Codos`) y la app pregunta
    con botones.
- **No son pulgadas:**
  - el grano de la lija: `Lija 180`;
  - los vatios: `LED 24 W`;
  - los kilos: `10 kg Lechada veige`;
  - los metros, las libras, los bultos.
- **Nunca se cambia una medida por la más parecida.** Si piden «Codos 5"» y no
  hay, el bloque dice `Codos 5"` y la app pregunta si lo crea.
- **El tubo va por color** (Juli, 13-nov): verde, rojo, amarillo, azul,
  violeta; en la bodega también hay naranja, gris y blanco. Si no lo dijeron,
  se pregunta (sección 7). El color va en el nombre: `- 2 Tubos verde 2"`. El
  tubo eléctrico (conduit) no lleva color. Si un tubo nuevo llega sin color,
  la app no lo crea: pregunta el color con botones.
- **El tubo sale por tubo entero:** 6 m; el eléctrico, 2 m. Pedido en metros
  → el asistente lo pasa a tubos y avisa la cuenta (12 m = 2 tubos). Si no da
  exacto (8 m), redondea hacia arriba (2 tubos) y lo avisa; si llega en
  metros a la app, la app hace lo mismo y lo deja para mirar.
- **Las unidades de la app** están entre corchetes en el catálogo: `[Kg]`,
  `[m]`, `[libras]`, `[caja]`, `[Cuñete]`. Sin corchete, son unidades.

**Material a granel (regla de Juli, 11-oct):**
- «hierro» o «acero» dicho solo, con una medida, son **CLAVOS** de ese
  material: `1 acero 1-1/2"` → `1 Clavos acero 1.5"`.
- Si dicen «clavos» con medida pero sin material, son de **HIERRO**.
- Si el material viene como **encabezado** de una lista («Hierro» y debajo
  varias medidas), ese material aplica a todos los renglones de abajo.

## 5. Proyectos

- **Las 9 obras activas** están en la sección 12. Se escriben exactamente así:
  `CRISTO`, no «El Cristo».
- **El proyecto NUNCA se pregunta.** Se resuelve en este orden:
  1. Si Juli lo dice en el mensaje, ese manda.
  2. Si no lo dice, el proyecto habitual del trabajador (sección 11). Se avisa.
  3. Si el trabajador no está en esa tabla, `ZONA GENERAL`. Se avisa.
- **«Zona general» = la obra `ZONA GENERAL`**, creada el 5-oct por decisión de
  Juli. Es para consumo de la bodega sin obra específica. Los consumibles salen
  ahí y en el Kardex quedan agrupados.
- **Un CONSUMIBLE sin proyecto no sale.** La app tampoco lo deja pasar.
- **Si dicen «todo lo de hoy es para CRISTO»**, se aplica a todos los que
  siguen, hasta que digan otra cosa.

## 6. Sinónimos y correcciones conocidas

Se aplican solos. Lo que dice «se avisa» va en «Lo que supuse».

| Dicho | Es | Nota |
|---|---|---|
| Soudal | Soudal, **Consumible** (sellador/espuma) | Juli, 5-oct |
| silicoma(s) | Silicona (negra, si lo dicen) | Juli, 6-oct. Error de dictado |
| espuma polibreta | Espuma de poliuretano · Consumible | Juli, 6-oct. Error de dictado |
| Brochas (sin medida) | Brocha (sin medida) | Desde el 14-nov hay 2", 3" y 4": va sin medida y la app pregunta |
| Rodillo pequeño | Rodillo | Juli, 6-oct. Es el rodillo normal |
| pistola de calafateo | Pistola de calafateo · Herramienta manual | Juli, 6-oct |
| Almadana nuevo | Almadana nueva · Herramienta manual · ítem nuevo | Juli, 6-oct. La app pregunta si la crea |
| tapa plus | Tapa plus · Consumible | No es herramienta → consumible. La app pregunta si lo crea |
| Jhorman / Yorman | Jorman | Persona del catálogo |
| Alex F | Alexander Ferreiro | Se avisa. «Alex» a secas es Alex, el OFICIAL |
| Andrés | Andrés Hernández | Único Andrés del catálogo |
| Taladro i stanley / taladro Stanley | Taladro Inhalambrico (Amarillo · Stanley) | Es el único Stanley inalámbrico |
| Ricardo nuevo | ¿Otro Ricardo? | **Se pregunta**: Ricardo ya existe |
| Lechada veige | Lechada veige `[Kg]` | Se pide en kilos |
| Lija 180 | Lija 180 | No existe (hay 240 y 150). No se cambia; la app pregunta si la crea |
| catapis | Separador de enchape · Consumible | Juli, 11-oct. Separador de enchape |
| acero 1-1/2" (solo) | Clavos acero 1.5" | Juli, 11-oct. Hierro/acero solo = clavos |
| Hierro (encabezado) | Los clavos de abajo son de hierro | Juli, 11-oct |
| Clavos sin material | Clavos de hierro | Juli, 11-oct |
| barniz | Barniz · Consumible | Es pintura |
| rollo / rodillo | Rodillo · Consumible | |
| cuñete hiperciclil / hyperciclil | Hiperciclyl `[Cuñete]` · Consumible | Es cuñete de pintura |
| llana lisa | Llana lisa · Herramienta manual | Juli, 11-oct. Ítem nuevo |
| ruedas (de andamio) | Ruedas de andamio · Herramienta manual | Juli, 11-oct. Ítem nuevo |
| pala coca | Pala coca · Herramienta manual | Juli, 11-oct. Ítem nuevo |
| palin / palín | Palín · Herramienta manual | Juli, 11-oct. Ítem nuevo |
| pesa | Gramera eléctrica · Herramienta eléctrica | Juli, 11-oct. Sale como préstamo |
| Bryan s | Brian Sánchez | Persona del catálogo |
| Juan s | Juan Salazar | Persona del catálogo |

Cada respuesta nueva de Juli se agrega a esta tabla la próxima vez que se
regenere el archivo.

## 7. Qué se supone, qué se pregunta y qué se deja a la app

**El asistente supone y avisa** (va en «Lo que supuse»):
- errores de dictado o escritura, corregidos al nombre del catálogo;
- cantidad no dicha → 1;
- medida no dicha, cuando el catálogo tiene una sola;
- persona con inicial o apellido que la identifica (Alex F);
- categoría de un ítem nuevo, con la regla de la sección 3;
- **el proyecto**, con la regla de la sección 5;
- material a granel (hierro/acero → clavos), con la regla de la sección 4;
- dos mensajes del mismo trabajador con cosas distintas → una entrega, con
  la hora del primero.

**El asistente pregunta** (va en «Lo que falta»), y nada más:
1. «nuevo» pegado a una persona: ¿el de la bodega u otro?
2. La misma cosa a la misma persona dos veces: ¿dos entregas o un audio
   repetido?
3. **Mensaje nuevo de un trabajador que ya tiene entrega en la conversación**
   (regla de Juli, 19-oct): ¿ya la registraste en la app o la junto con esta?
   - Si ya la registró → entrega nueva, solo con lo nuevo y la hora del
     mensaje nuevo.
   - Si no la ha registrado → una sola entrega con todo, y reemplaza el
     bloque anterior.
   - Manda sobre «dos mensajes del mismo trabajador → una entrega»: esa vale
     solo para mensajes que llegan juntos, antes de entregar el bloque.
4. **Tubo sin color** (regla de Juli, 13-nov): «¿verde, rojo, amarillo, azul
   o violeta?».
5. **Fecha futura** (un [20/12] cuando hoy es 14/11): «¿qué fecha es?». La app
   tampoco la registra.

Si todas las entregas quedan esperando respuesta, no sale bloque y se dice.

**El proyecto NO se pregunta nunca.** Se deduce (sección 5).

**Entrega de una vez (regla de Juli, 19-oct).** El asistente ya no espera
«CONFIRMADO»: en cada respuesta entrega la revisión y, debajo, el bloque.
- Si hay algo en «Lo que falta», el bloque sale sin las entregas de los
  trabajadores con pregunta pendiente, y se avisa en una línea.
- Cierra siempre con: «Si está malo, decime qué le modificamos. Si está
  bueno, dejalo así, Juli.»
- Si Juli corrige, sale revisión y bloque de nuevo, y reemplaza al anterior.

**Renglón suelto:** si algo queda sin trabajador (una nota pegada por error,
un pendiente anotado donde no era), NO se adjudica a nadie. Va aparte, al
final, bajo «Renglones sueltos (no los metí en ninguna entrega)».

**Lo pregunta la app** (el asistente no):
- cuál de varias iguales (pulidoras 9, taladros 11, radiales 6, lijadoras 6,
  soldadores 3) si no dijeron color ni marca;
- la medida, si el catálogo tiene varias;
- cuál persona, si hay dos parecidas y no hay pista (Juan a secas, Carlos a
  secas, Yesid / Yesid carpintero);
- para quién de la cuadrilla, cuando sale a Alex;
- si crea un ítem o una persona que no existe;
- si hay existencias.

## 8. Ejemplo completo: la mañana del 3-oct

**Lo que llegó por WhatsApp:**

```
[3/10, 8:04 a.m.] Adrian: 2 soudal, 4 silicomas negras, Brochas, 1 Rodillo pequeña,
  1 pistola de calafateo, Cincel, Almadana nuevo, Espuma polibreta
[3/10, 8:07 a.m.] William: 10 codos 2"
[3/10, 8:08 a.m.] Ricardo nuevo: Soudal
[3/10, 8:11 a.m.] Alex f: 10 kg lechada veige, Estopa, espatula, Hoja sierra
[3/10, 8:59 a.m.] Andres: 4 Led 24 w
[3/10, 9:07 a.m.] Jhorman: Taladro i stanley, 5 tapa plus, 50 tornillos 1"
[3/10, 10:00 a.m.] Jhorman: 5 lija 180
```

**La revisión que muestra el asistente** (aquí, solo dos trabajadores):

```
**ADRIÁN ECHEVERRY**
Fecha: 03/10/2026 · Hora: 08:04 · Proyecto: ZONA GENERAL

Consumibles:
* 2 Soudal
* 4 Silicona negra
* 1 Brocha
* 1 Rodillo
* 1 Espuma de poliuretano

Herramientas manuales:
* 1 Pistola de calafateo
* 1 Cincel
* 1 Almadana nueva

**JORMAN**
Fecha: 03/10/2026 · Hora: 09:07 · Proyecto: ZONA GENERAL

Consumibles:
* 5 Tapa plus
* 50 Tornillos 1"
* 5 Lija 180

Herramientas eléctricas:
* 1 Taladro Inhalambrico Amarillo Stanley

Lo que supuse (si algo está mal, corregilo):
* Adrián: brochas, cincel y espuma en 1; no dijiste cuántas.
* Alex F: lo dejé como Alexander Ferreiro.
* Jorman: la lija (10:00) va en la misma entrega de las 09:07.
* Proyecto ZONA GENERAL para todos; no dijiste obra y no están en la tabla.

Lo que falta (sin esto no sale):
* Ricardo nuevo: ¿el Ricardo de la bodega u otro?

Falta definir lo de Ricardo; su entrega no está en el bloque todavía.
```

**Justo debajo, en la misma respuesta**, sale el bloque:

```
=== ENTREGA ===
TRABAJADOR: Adrián Echeverry
PROYECTO: ZONA GENERAL
FECHA: 03/10/2026
HORA: 08:04

[CONSUMIBLES]
- 2 Soudal
- 4 Silicona negra
- 1 Brocha
- 1 Rodillo
- 1 Espuma de poliuretano

[HERRAMIENTAS MANUALES]
- 1 Pistola de calafateo
- 1 Cincel
- 1 Almadana nueva
=== FIN ===

=== ENTREGA ===
TRABAJADOR: Jorman
PROYECTO: ZONA GENERAL
FECHA: 03/10/2026
HORA: 09:07

[CONSUMIBLES]
- 5 Tapa plus
- 50 Tornillos 1"
- 5 Lija 180

[HERRAMIENTAS ELÉCTRICAS]
- 1 Taladro Inhalambrico Amarillo Stanley
=== FIN ===
```

Y cierra: «Si está malo, decime qué le modificamos. Si está bueno, dejalo
así, Juli.»

**En la app pasa esto:**
- pregunta si crea lo que no existe (Soudal, Silicona negra, Tapa plus, Lija
  180, Almadana nueva…) y lo crea con la categoría del bloque;
- avisa si no hay existencias;
- muestra la tarjeta de cada trabajador, agrupada por categoría, con
  «✓ Pedido correcto».

**La brocha** sale sin medida porque desde el 14-nov hay de 2", 3" y 4": la
app pregunta cuál con botones. **Jorman** tiene dos mensajes en el MISMO
material pegado (09:07 y 10:00): todavía no había entrega suya en la
conversación, entonces van juntos y se avisa. La pregunta «¿ya la
registraste?» es para cuando llega algo nuevo DESPUÉS de haber entregado su
bloque.

## 9. Catálogo (por categoría y familia)

`[unidad]` = cómo se cuenta en la app. Sin corchete, son unidades. Entre
paréntesis, color · marca.

### CONSUMIBLES

- **Barniz**: Barniz
- **Bisturi**: Bisturi
- **Bombillos**: Bombillos vintage grandes
- **Brocha**: Brocha 2" · Brocha 3" · Brocha 4"
- **Bujes**: Bujes pvc · Bujes tapa de 6"
- **Cinta**: Cinta (negra) · Cinta bandy [m]
- **Clabe**: Clabe #12
- **Clavos**: Clavos [libras] · clavos 2 acero [libras] · Clavos acero 1 [libras] · Clavos acero 1.5" · Clavos acero 2.5" [libras] · clavos hierro 2 [libras] · Clavos hierro 2.5" [libras] · Clavos hierro 3" · Clavos Tiro
- **Codos**: Codos 2" · Codos 4" · Codos 4"-2" · Codos 6"
- **Conector**: Conector macho
- **Disco**: Disco · Disco muro pequeño
- **Encauchetado**: Encauchetado [m]
- **Epoxica**: Epoxica
- **Estopa**: Estopa
- **Estuco**: Estuco 2" · Estuco tipo 3 · Estuco Tipo 3 · Estuco 2 en 1
- **G plac**: G plac polvo
- **Hilo**: Hilo
- **Hiperciclyl**: Hiperciclyl [Cuñete]
- **Lápiz**: Lápiz
- **Lechada**: Lechada gris claro [Kg] · Lechada veige [Kg]
- **Lija**: Lija 240 · Lijas 150
- **Limpiador**: Limpiador grande
- **Pega**: Pega pvc
- **Pintura**: Pintura Tipo 1
- **Polvo**: Polvo enchape
- **Rejillas**: Rejillas
- **Rodillo**: Rodillo
- **Semicodos**: Semicodos 6"
- **Separador**: Separador de enchape (catapis)
- **Sifón**: Sifón 2"
- **Silicona**: Silicona transparente
- **T**: T 2"
- **Tela**: Tela poliéster
- **Thinner**: Thinner
- **Tiros**: Tiros [caja]
- **Toma**: Toma doble Mercuri
- **Tornillos**: Tornillos autoperforantes con tuerca
- **Tubos** (por color; se despachan por tubo entero de 6 m): Tubos amarillo sanitario 2" · Tubos Naranja 2"
- **Unión**: Unión 2"
- **Varsol**: Varsol
- **Vasos**: Vasos meseyose
- **Y**: Y 4_4 · Y 4-2 · Y 6"-6"
- **3 en 1**: 3 en 1 galón
- *Discos que salen con su herramienta (en la app, Accesorio):* Disco corte lámina · Disco diamante · Disco fla

### HERRAMIENTAS MANUALES

- **Alicate**: Alicate (Verde · Siata)
- **Almadana**: Almadana
- **Arnés**: Arnés y slinga
- **Espátula**: Espátula pequeña
- **Lima**: Lima
- **Lasos**: Lasos (Rojo con blanco)
- **Llana**: Llana lisa
- **Machete**: Machete
- **Martillo**: Martillo
- **Pala**: Pala
- **Pala coca**: Pala coca
- **Palín**: Palín
- **Palustre**: Palustre
- **Pica**: Pica
- **Pistola de calafateo**: Pistola de calafateo
- **Pistola**: Pistola impacto ⚠ *(también existe como eléctrica: va como «Pistola impacto» en [HERRAMIENTAS ELÉCTRICAS] y la app pregunta cuál)*
- **Rodilleras**: Rodilleras
- **Ruedas**: Ruedas de andamio
- **Tenazas**: Tenazas

### HERRAMIENTAS ELÉCTRICAS

- **Canguro**: Canguro (Amarillo · Enermax)
- **Compresor**: Compresor (Amarillo · Nn)
- **Concretadora**: Concretadora (Amarilla · Nn) · Concretadora Electrica (Amarilla · Nn)
- **Equipo**: Equipo topografico (Azul · Nn)
- **Extension**: Extension (Blanca · Nn) · Extensiones (Negro · Nn)
- **Gramera**: Gramera eléctrica
- **Hidroflow**: Hidroflow (Azul · Nn)
- **Hidrolavadora**: Hidrolavadora (Negra · Black and decker) · Hidrolavadora (Negro · NN)
- **Lijadora**: Lijadora (Amarilla · Dwalt) · Lijadora (Amarilla · Pretul) · Lijadora (Amarilla · Stanley) · Lijadora (Azul · Bosch) · Lijadora (Naranja · Truper) · Lijadora (Verde · Prescott)
- **Mezcladora**: Mezcladora (Roja · Cinhell) · Mezcladora Electrica (Negra · Cinhell)
- **Motor**: Motor vibro (Negro · Nn)
- **Nivel**: Nivel laser (Amarillo · Dwalt)
- **Pesa**: Pesa Electricsv (Negra · Nn)
- **Pistola**: Pistola impacto ⚠ *(también existe como manual: la app pregunta cuál)*
- **Plomada**: Plomada de punto laser (Amarillo · Dwalt)
- **Pulidora**: Pulidora (Amarilla · Brickell) · Pulidora Grande (Amarillo · Dwalt) · Pulidora Grande (Amarillo · Stanley) · Pulidora Grande (Azul · Makita) · Pulidora Grande (Negra · Trupper) · Pulidora Pequeña (Amarilla · Dwalt) · Pulidora Pequeña (Gris · Truper) · Pulidora pequeña (Negro · Truper) · Pulidora Pequeña (Verde · Brickell)
- **Radial**: Radial (Amarilla · Dwalt) · Radial (Amarilla · Stanley) · Radial (Naranja · Black and decker) · Radial (Naranja · Trupper) · Radial (Negra · Trupee) · Radial (Roja · Cinhell)
- **Soldador**: Soldador grande (Gris · Neo) · Soldador pequeño (Naranja · Furius) · Soldador Pequeño (Rojo · Gamma)
- **Taladro**: Taladro Alambrico (Amarillo · Dwalt) · Taladro Alambrico (Azul · Bosch) · Taladro Alambrico (Gris · Truper) · Taladro Demoledor (Amarillo · Dwalt) · Taladro inhalambrico (Amarillo · Dwalt) · Taladro Inhalambrico (Amarillo · Stanley) · Taladro Inhalambrico (Verde · Bauker) · Taladro Inhalambrico (Verde · Brickell) · Taladro percutor (Amarillo · Davinci) · Taladro Percutor (Azul · Bosch) · Taladro Percutor (Gris · Truper)
- **Tronzadora**: Tronzadora (Amarillo · Dwalt)
- **Vibro**: Vibro (Negro · Nn) · Vibro Compactador (Negro · Nn)

### EPP

- **Gafas**: Gafas · Gafas de seguridad
- **Guantes**: Guantes · Guantes goma · Guantes naranja
- **Línea de vida**: Línea de vida con arnes
- **Tapabocas**: Tapabocas

## 10. Personas (36)

Abel · Adrián Echeverry · Albeiro · **Alex (OFICIAL)** · Alexander Contreras ·
Alexander Ferreiro · Anderson · Andrés Hernández · Brian Sánchez · Camilo ·
Carlos García · Carlos Torrealba · Dani · Diego · Duván · Evelio · Ferney
Giraldo · Geovany · Haider · Héctor · Hugo · Jesús Vázquez · Jhon jader ·
Jorge / Germán · Jorman · Juan Echeverry · Juan Salazar · Mello · Rafael · Raúl
· Ricardo · Sebastián · William · Yeiner · Yesid · Yesid carpintero

- **Alex es el único OFICIAL.** A un oficial la app le pregunta «¿para quién de
  su cuadrilla?».
- **Persona que no está en la lista:** se escribe como la dijeron. La app
  pregunta si la crea, y en qué cuadrilla.

## 11. Proyecto habitual por trabajador

El asistente **NUNCA pregunta el proyecto**: lo saca de acá. Si el trabajador
no está en esta tabla o su casilla está vacía, va `ZONA GENERAL` y se avisa en
«Lo que supuse».

| Trabajador | Proyecto habitual |
|---|---|
| Abel | |
| Adrián Echeverry | |
| Albeiro | |
| Alex (OFICIAL) | |
| Alexander Contreras | |
| Alexander Ferreiro | |
| Anderson | |
| Andrés Hernández | |
| Brian Sánchez | |
| Camilo | |
| Carlos García | |
| Carlos Torrealba | |
| Dani | |
| Diego | |
| Duván | |
| Evelio | |
| Ferney Giraldo | |
| Geovany | |
| Haider | |
| Héctor | |
| Hugo | |
| Jesús Vázquez | |
| Jhon jader | |
| Jorge / Germán | |
| Jorman | |
| Juan Echeverry | |
| Juan Salazar | |
| Mello | |
| Rafael | |
| Raúl | |
| Ricardo | |
| Sebastián | |
| William | |
| Yeiner | |
| Yesid | |
| Yesid carpintero | |

## 12. Obras activas (9)

BOX CULVERT · CRISTO · HELIPUERTO · LODGES · Mantenimiento General ·
Remodelación Oficinas · SALVADOR BAHIA · Torre Residencial Norte · **ZONA
GENERAL**

## 13. Devoluciones, traslados, daños, hallazgos y pedidos

**No van en el bloque.** Van debajo, como fichas, con «No especificado» en lo
que no se dijo:

```
Fecha · Hora · Movimiento · Elemento · Cantidad · Marca · Color ·
Responsable anterior · Responsable nuevo · Quién entrega · Quién recibe ·
Origen · Destino · Estado · Observación
```

- **Una devolución parcial no cierra el préstamo.** «De 3 palas devolvió 1»
  deja 2 afuera.
- **Lo que no está confirmado** se escribe «posible asignación: Jesús →
  verificar», nunca «lo tiene Jesús».

## 14. Prueba del asistente (antes de usarlo en la obra)

Pasale la mañana del 3-oct (sección 8) tal cual.

| # | Qué se prueba | Aprobado si… |
|---|---|---|
| A1 | Corrige solo | Escribe Silicona negra, Espuma de poliuretano y Alexander Ferreiro sin preguntar. En «Lo que supuse» van solo los que la tabla de la sección 6 marca «se avisa» (Alex F) y los errores que NO están en la tabla |
| A2 | Pregunta poco | «Lo que falta» trae SOLO Ricardo nuevo. Nada de proyecto, medidas, categorías ni cuál taladro |
| A3 | Medida | Brocha sin medida (hay tres). `Lija 180` y `LED 24 W` sin `"` |
| A4 | Clasificación | Tapa plus → Consumibles; pistola de calafateo → Herramientas manuales; LED 24 W → Consumibles. Sin preguntar |
| A5 | Fecha | Cada trabajador dice Fecha: 03/10/2026 en la revisión y `FECHA: 03/10/2026` en su entrega |
| A6 | Formato | Sin emojis, un ítem por renglón con asterisco, «FALTA» en vez de «?» |
| A7 | Proyecto deducido | Ningún trabajador queda sin proyecto y NO se pregunta: sale el habitual o ZONA GENERAL, avisado en «Lo que supuse» |
| A9 | El bloque en la app | Pegado en 📋 Bloque, cada trabajador sale en su tarjeta, agrupado por categoría, sin «no leídos» |
| A10 | Material a granel | «1 acero 1-1/2"» sale como `1 Clavos acero 1.5"`, avisado |
| A11 | Renglón suelto | Una línea sin trabajador NO se adjudica a nadie: sale bajo «Renglones sueltos» |
| A12 | Mensaje nuevo de un trabajador ya atendido | Pregunta en «Lo que falta»: «¿ya la registraste en la app o la junto con esta?». Con «ya la registré» sale entrega nueva solo con lo nuevo; con «no» sale una sola entrega que reemplaza la anterior |
| A13 | Entrega de una vez | Sin que Juli diga «confirmado», la respuesta trae la revisión y el bloque. Si hay pregunta pendiente, el bloque sale sin esa entrega y lo avisa. Cierra con «Si está malo, decime qué le modificamos. Si está bueno, dejalo así, Juli.» |
| A14 | Tubo sin color | «2 tubos de 2» pregunta en «Lo que falta»: ¿verde, rojo, amarillo, azul o violeta? Con el color, «- 2 Tubo verde 2"» |
| A15 | Tubo en metros | «12 metros de tubo naranja de 2» sale como «- 2 Tubos Naranja 2"», con la cuenta avisada |
| A16 | Fecha futura | «[20/12, …]» con hoy 14/11: pregunta «¿qué fecha es?» y esa entrega no sale |
