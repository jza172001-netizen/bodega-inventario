# BODEGA MONTECIELO — Conocimiento del asistente de despacho

> **Qué es este archivo:** lo que el asistente sabe de la bodega. Se sube como
> **conocimiento** (archivo) al Gem, Proyecto o GPT. El comportamiento —qué hace,
> cuándo pregunta, el formato exacto— está en `asistente/INSTRUCCIONES.md`, que
> va en **Instrucciones**.
>
> **Catálogo, personas y obras leídos de producción el 5-oct-2026.** Cuando
> cambie el inventario, pedir en Claude Code: «regenerá el catálogo de
> asistente/BODEGA-MONTECIELO.md desde producción», y volver a subirlo.

---

## 1. Quién hace qué

```
JULI / ENCARGADA → dicta o pega, regado
        ↓
ASISTENTE → corrige preguntando · pide la medida · clasifica · pregunta el proyecto
          → muestra la revisión por trabajador → espera «CONFIRMADO»
        ↓
BLOQUE (=== ENTREGA ===, uno por trabajador)
        ↓
APP (chat → 📋 Bloque) → verifica contra la bodega: existencias, quién tiene qué,
                          oficial y cuadrilla, duplicados del día, ítems nuevos
        ↓
«✓ Pedido correcto» por trabajador → Registrar
```

- **El asistente** revisa contra **lo que se dijo**. Atrapa «¿silicoma o
  silicona?», la medida que falta, el proyecto que falta y la entrega repetida
  entre dos audios.
- **La app** revisa contra **la bodega**:
  - ¿esa pulidora la tiene otro?;
  - ¿hay existencias? (si no hay, «entra lo que falta y sale»);
  - ¿Alex es oficial?, y entonces ¿para quién de su cuadrilla?;
  - ¿el ítem existe? Si no existe, pregunta «¿lo creo?».
- **Las dos verificaciones hacen falta.** El asistente no sabe qué hay en la
  bodega hoy, y la app no oyó los audios.

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
  - `TRABAJADOR` y `PROYECTO` van siempre;
  - `FECHA` (DD/MM/AAAA), `HORA` (HH:MM) y `LUGAR` (contenedor, segundo piso…)
    son opcionales;
  - **`FECHA`** es el día en que salió. Si no viene, la app registra con la
    fecha de hoy. Si es futura o no es una fecha (`31/02/2026`), la tarjeta
    del trabajador lo avisa y esa entrega **no se registra** hasta corregirla;
  - van en cualquier orden.
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

- **Lo que diga el catálogo (sección 9) manda.** Por ejemplo, «Rodilleras» está
  como Herramienta manual, aunque parezca EPP.
- **Los discos** de pulidora o radial van como CONSUMIBLES. La app los tiene
  como Accesorio, que también es gasto, y no lo marca como contradicción.

## 4. Medidas y unidades

- **`"` es pulgada** y va pegada: `Brocha 2"`, `Codos 4"`, `Tornillos 1"`.
- **Se pregunta la medida** cuando el ítem va por medida y no la dijeron:
  - brochas, codos, semicodos, tubos, uniones, Y, T, bujes, sifones;
  - tornillos y clavos;
  - lijas (grano).

  Se ofrecen las que hay en el catálogo y se acepta otra.
- **No son pulgadas:**
  - el grano de la lija: `Lija 180`;
  - los vatios: `LED 24 W`;
  - los kilos: `10 kg Lechada veige`;
  - los metros, las libras, los bultos.
- **Nunca se cambia una medida por la más parecida.** Si piden «Codos 5"» y no
  hay, el bloque dice `Codos 5"` y la app pregunta si lo crea.
- **Las unidades de la app** están entre corchetes en el catálogo: `[Kg]`,
  `[m]`, `[libras]`, `[caja]`, `[Cuñete]`. Sin corchete, son unidades.

## 5. Proyectos

- **Las 9 obras activas** están en la sección 11. Se escriben exactamente así:
  `CRISTO`, no «El Cristo».
- **«Zona general» = la obra `ZONA GENERAL`**, creada el 5-oct por decisión de
  Juli. Es para consumo de la bodega sin obra específica. Los consumibles salen
  ahí y en el Kardex quedan agrupados.
- **Un CONSUMIBLE sin proyecto no sale.** La app tampoco lo deja pasar.
- **Si dicen «todo lo de hoy es para CRISTO»**, se aplica a todos los que
  siguen, hasta que digan otra cosa.

## 6. Sinónimos y correcciones conocidas

| Dicho | Es | Nota |
|---|---|---|
| Soudal | **Consumible** (sellador/espuma) | Confirmado por Juli el 5-oct |
| silicoma | ¿Silicona? | **Preguntar**, no corregir solo |
| Jhorman | Jorman | Persona del catálogo |
| Alex F | ¿Alexander Ferreiro? | **Preguntar**. «Alex» solo es Alex, el OFICIAL |
| Taladro i stanley | Taladro Inhalambrico (Amarillo · Stanley) | Es el único Stanley inalámbrico |
| Almadana nuevo | ¿Almadana nueva (otra unidad) o la de la bodega? | **Preguntar** |
| Ricardo nuevo | ¿Otro Ricardo, que no está en la bodega? | **Preguntar**: Ricardo ya existe |
| Lechada veige | Lechada veige `[Kg]` | Se pide en kilos |
| espuma polibreta | ¿Espuma de poliuretano? | **Preguntar**. No está en el catálogo |
| pistola de calafateo | Herramienta manual | **Preguntar** la primera vez. No está en el catálogo |
| Lija 180 | Lija de grano 180 | No existe. Hay `Lija 240` y `Lijas 150` |

Cada respuesta nueva de Juli se agrega a esta tabla la próxima vez que se
regenere el archivo.

## 7. Casos que SIEMPRE se preguntan

1. Un nombre que no está en el catálogo pero se parece a uno.
2. Una persona con dos parecidas: Alex / Alexander Ferreiro / Alexander
   Contreras; Juan Echeverry / Juan Salazar; Yesid / Yesid carpintero; Carlos
   García / Carlos Torrealba.
3. Una herramienta con varias iguales, sin color ni marca: pulidoras (9),
   taladros (11), radiales (6), lijadoras (6), soldadores (3).
4. La medida que falta.
5. La categoría, si no es inequívoca.
6. El proyecto de cada trabajador.
7. «nuevo» o «nueva» pegado a un nombre.
8. La misma cosa a la misma persona dos veces: ¿son dos entregas o un audio
   repetido?

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

**Lo que el asistente pregunta, todo junto:**

```
⚠ Adrián: ¿«silicomas» es Silicona negra?
⚠ Adrián: brochas, ¿cuántas y de qué medida? En bodega hay de 2".
⚠ Adrián: ¿pistola de calafateo la dejamos como herramienta manual?
⚠ Adrián: «almadana nuevo», ¿es la almadana de la bodega o una nueva?
⚠ Adrián: ¿«espuma polibreta» es espuma de poliuretano? ¿Cuántas?
⚠ Ricardo nuevo: ¿es el Ricardo de la bodega u otro? ¿Cuántos Soudal?
⚠ Alex F: ¿Alexander Ferreiro? (Alex solo es el oficial)
⚠ Alex F: estopa, espátula y hoja de sierra, ¿una de cada una?
⚠ Jhorman: ¿«tapa plus» qué es y de qué categoría?
⚠ Cantidades supuestas en 1: cincel, rodillo…
📍 Proyecto de cada uno: ¿cuál, o ZONA GENERAL?
```

**Con las respuestas y «CONFIRMADO»**, sale un bloque así (solo se muestran
dos trabajadores):

```
=== ENTREGA ===
TRABAJADOR: Adrián Echeverry
PROYECTO: CRISTO
FECHA: 03/10/2026
HORA: 08:04

[CONSUMIBLES]
- 2 Soudal
- 4 Silicona negra
- 1 Brocha 2"
- 1 Rodillo pequeño
- 1 Espuma de poliuretano

[HERRAMIENTAS MANUALES]
- 1 Pistola de calafateo
- 1 Cincel
- 1 Almadana
=== FIN ===

=== ENTREGA ===
TRABAJADOR: Jorman
PROYECTO: ZONA GENERAL
FECHA: 03/10/2026
HORA: 09:07

[CONSUMIBLES]
- 50 Tornillos 1"
- 5 Lija 180

[HERRAMIENTAS ELÉCTRICAS]
- 1 Taladro Inhalambrico Amarillo Stanley
=== FIN ===
```

**En la app pasa esto:**
- pregunta si crea lo que no existe (Soudal, Silicona negra, Lija 180…) y lo
  crea con la categoría del bloque;
- avisa si no hay existencias;
- muestra la tarjeta de cada trabajador, agrupada por categoría, con
  «✓ Pedido correcto».

## 9. Catálogo (por categoría y familia)

`[unidad]` = cómo se cuenta en la app. Sin corchete, son unidades. Entre
paréntesis, color · marca.

### CONSUMIBLES

- **Barniz**: Barniz
- **Bisturi**: Bisturi
- **Bombillos**: Bombillos vintage grandes
- **Brocha**: Brocha 2"
- **Bujes**: Bujes pvc · Bujes tapa de 6"
- **Cinta**: Cinta (negra) · Cinta bandy [m]
- **Clabe**: Clabe #12
- **Clavos**: Clavos [libras] · clavos 2 acero [libras] · Clavos acero 1 [libras] · Clavos acero 1.5" · clavos hierro 2 [libras] · Clavos hierro 3" · Clavos Tiro
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
- **Pega**: Pega pvc
- **Pintura**: Pintura Tipo 1
- **Polvo**: Polvo enchape
- **Rejillas**: Rejillas
- **Rodillo**: Rodillo
- **Semicodos**: Semicodos 6"
- **Sifón**: Sifón 2"
- **T**: T 2"
- **Tiros**: Tiros [caja]
- **Tornillos**: Tornillos autoperforantes con tuerca
- **Tubos**: Tubos Naranja 2"
- **Unión**: Unión 2"
- **Y**: Y 4_4 · Y 4-2 · Y 6"-6"
- *Discos que salen con su herramienta (en la app, Accesorio):* Disco corte lámina · Disco diamante · Disco fla

### HERRAMIENTAS MANUALES

- **Alicate**: Alicate (Verde · Siata)
- **Almadana**: Almadana
- **Arnés**: Arnés y slinga
- **Espátula**: Espátula pequeña
- **Lasos**: Lasos (Rojo con blanco)
- **Machete**: Machete
- **Martillo**: Martillo
- **Pala**: Pala
- **Palustre**: Palustre
- **Pica**: Pica
- **Pistola**: Pistola impacto ⚠ *(también existe como eléctrica: preguntar cuál)*
- **Rodilleras**: Rodilleras
- **Tenazas**: Tenazas

### HERRAMIENTAS ELÉCTRICAS

- **Canguro**: Canguro (Amarillo · Enermax)
- **Compresor**: Compresor (Amarillo · Nn)
- **Concretadora**: Concretadora (Amarilla · Nn) · Concretadora Electrica (Amarilla · Nn)
- **Equipo**: Equipo topografico (Azul · Nn)
- **Extension**: Extension (Blanca · Nn) · Extensiones (Negro · Nn)
- **Hidroflow**: Hidroflow (Azul · Nn)
- **Hidrolavadora**: Hidrolavadora (Negra · Black and decker) · Hidrolavadora (Negro · NN)
- **Lijadora**: Lijadora (Amarilla · Dwalt) · Lijadora (Amarilla · Pretul) · Lijadora (Amarilla · Stanley) · Lijadora (Azul · Bosch) · Lijadora (Naranja · Truper) · Lijadora (Verde · Prescott)
- **Mezcladora**: Mezcladora (Roja · Cinhell) · Mezcladora Electrica (Negra · Cinhell)
- **Motor**: Motor vibro (Negro · Nn)
- **Nivel**: Nivel laser (Amarillo · Dwalt)
- **Pesa**: Pesa Electricsv (Negra · Nn)
- **Pistola**: Pistola impacto ⚠ *(también existe como manual)*
- **Plomada**: Plomada de punto laser (Amarillo · Dwalt)
- **Pulidora**: Pulidora (Amarilla · Brickell) · Pulidora Grande (Amarillo · Dwalt) · Pulidora Grande (Amarillo · Stanley) · Pulidora Grande (Azul · Makita) · Pulidora Grande (Negra · Trupper) · Pulidora Pequeña (Amarilla · Dwalt) · Pulidora Pequeña (Gris · Truper) · Pulidora pequeña (Negro · Truper) · Pulidora Pequeña (Verde · Brickell)
- **Radial**: Radial (Amarilla · Dwalt) · Radial (Amarilla · Stanley) · Radial (Naranja · Black and decker) · Radial (Naranja · Trupper) · Radial (Negra · Trupee) · Radial (Roja · Cinhell)
- **Soldador**: Soldador grande (Gris · Neo) · Soldador pequeño (Naranja · Furius) · Soldador Pequeño (Rojo · Gamma)
- **Taladro**: Taladro Alambrico (Amarillo · Dwalt) · Taladro Alambrico (Azul · Bosch) · Taladro Alambrico (Gris · Truper) · Taladro Demoledor (Amarillo · Dwalt) · Taladro inhalambrico (Amarillo · Dwalt) · Taladro Inhalambrico (Amarillo · Stanley) · Taladro Inhalambrico (Verde · Bauker) · Taladro Inhalambrico (Verde · Brickell) · Taladro percutor (Amarillo · Davinci) · Taladro Percutor (Azul · Bosch) · Taladro Percutor (Gris · Truper)
- **Tronzadora**: Tronzadora (Amarillo · Dwalt)
- **Vibro**: Vibro (Negro · Nn) · Vibro Compactador (Negro · Nn)

### EPP

- **Gafas**: Gafas · Gafas de seguridad
- **Guantes**: Guantes · Guantes naranja
- **Línea de vida**: Línea de vida con arnes
- **Tapabocas**: Tapabocas

## 10. Personas (35)

Abel · Adrián Echeverry · Albeiro · **Alex (OFICIAL)** · Alexander Contreras ·
Alexander Ferreiro · Anderson · Andrés Hernández · Brian Sánchez · Camilo ·
Carlos García · Carlos Torrealba · Dani · Diego · Duván · Evelio · Ferney
Giraldo · Geovany · Haider · Héctor · Hugo · Jesús Vázquez · Jhon jader ·
Jorge / Germán · Jorman · Juan Echeverry · Juan Salazar · Mello · Rafael · Raúl
· Ricardo · Sebastián · William · Yesid · Yesid carpintero

- **Alex es el único OFICIAL.** A un oficial la app le pregunta «¿para quién de
  su cuadrilla?».
- **Persona que no está en la lista:** se escribe como la dijeron. La app
  pregunta si la crea, y en qué cuadrilla.

## 11. Obras activas (9)

BOX CULVERT · CRISTO · HELIPUERTO · LODGES · Mantenimiento General ·
Remodelación Oficinas · SALVADOR BAHIA · Torre Residencial Norte · **ZONA
GENERAL**

## 12. Devoluciones, traslados, daños, hallazgos y pedidos

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

## 13. Prueba del asistente (antes de usarlo en la obra)

Pasale la mañana del 3-oct (sección 8) tal cual.

| # | Qué se prueba | Aprobado si… |
|---|---|---|
| A1 | Corrección | Pregunta por «silicomas», «espuma polibreta», «tapa plus» y «Alex F». No los cambia solo |
| A2 | Medida | Pregunta la medida de las brochas, ofrece 2". Escribe `Lija 180` sin `"` |
| A3 | Clasificación | Soudal → consumible sin preguntar. Pistola de calafateo → pregunta. Solo muestra las categorías con algo |
| A4 | Proyecto | Pregunta el proyecto de cada uno. Con «zona general» escribe `ZONA GENERAL` |
| A5 | Consumible sin proyecto | Si contestás «sin proyecto» para Adrián, NO entrega el bloque y dice por qué |
| A6 | Confirmación | Sin «confirmado» no hay bloque |
| A7 | El bloque en la app | Pegado en 📋 Bloque, cada trabajador sale en su tarjeta, agrupado por categoría, sin «no leídos» |
