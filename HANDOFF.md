# HANDOFF — Bodega Montecielo (al 14-nov-2026)

> Traspaso para un chat nuevo. **Leé esto completo, y después `CLAUDE.md`, antes
> de tocar nada.** El historial largo (hasta el 2-oct) está entero en
> `historial/HANDOFF-hasta-2026-10-02.md`: se consulta, no se carga completo.

## 1. Quién y cómo

- **Juli** (Julián Bermúdez) es el dueño. No es programador. Escribe por
  voz-a-texto. Español paisa, directo, sin relleno; firma «atento».
- Debate antes de producir. Para producir: plan, estimación y esperar «Ejecuta».
- **Todos los datos son reales**: nunca reiniciar inventario ni borrar historial.
  Lo técnico lo decide Claude; lo de negocio se pregunta (una sola pregunta, con
  recomendación).
- **Cada entrega:**
  - `npm run test` y `node verificar-lint.cjs` con código de salida 0;
  - `npm run build` con código de salida 0;
  - cada arreglo con prueba de mutación;
  - recorridos del navegador (`tests/navegador/recorrido.mjs`);
  - PR, merge y Vercel READY;
  - comprobar las 3 ventanillas (`/api/*` responden 405 a GET).

## 2. Producción al 14-nov

- App: `bodega-montecielo.vercel.app` (Vercel, Node 24). Base: Supabase
  `xmizawuhiounkiaqrwxd` (`sa-east-1`), plan gratis: se ha pausado varias
  veces pese al latido.
- **Datos:** 152 ítems vivos, 36 personas, 9 obras activas, 376 movimientos.
- **Préstamos restablecidos el 13-nov** (permiso de Juli): los 34 abiertos
  (40 unidades, 17 personas) se cerraron con su devolución ligada (`devuelve_a`)
  y la nota «Cierre por reconteo 13-nov-2026». Nada se borró. Stock 92 → 132.
  **Falta el conteo físico de herramientas de Juli** para ajustar lo que no
  esté.
- **⚠ EL CIERRE DEL 3-OCT SIGUE SIN APLICAR.** Los asesores de Supabase del
  14-nov lo confirman: la llave pública ejecuta las funciones de stock y
  `authenticate_user`, y lee y escribe las tablas. `supabase/APLICAR-3-OCT.sql`
  cierra cada uno de esos hallazgos (revisado el 14-nov). Quedan públicos a
  propósito solo `get_users_safe` y `dar_de_alta`.
- **Kardex:** 21 ítems descuadrados, todos de antes. Los cuadra la migración
  `20261003140000` incluida en ese mismo SQL.

## 3. Cómo funciona (mapa corto; el detalle está en CLAUDE.md)

- **Toda la UI y el estado viven en `App.tsx`.** Las escrituras van por la cola
  durable `withSync` (`core/cola.ts`).
- **Las reglas compartidas entre la app y la API están en `core/`:**
  - `despacho.ts`: préstamo o gasto, obra obligatoria solo para consumo;
  - `custodia.ts`: traslados y asignaciones;
  - `verificacion.ts`: alertas del bloque, resumen y huella;
  - `crearItem.ts`: cómo nace un ítem;
  - `organizar.ts`: géneros y familias;
  - `taxonomia.ts` (13-nov): el árbol de la bodega, el color y el largo del tubo;
  - `consultas.ts` y `registro.ts`: el asistente.
- **El árbol (13-nov):** Herramientas › Manuales | Eléctricas | Accesorios ·
  Materiales de consumo › Tubería y accesorios | Pinturas y líquidos | Polvos |
  Eléctricos | Varios (Brochas y rodillos, Fijaciones, Abrasivos, Adhesivos y
  selladores, Otros) · EPP. Se aplica con «🪄 Agrupar solo» en Organizar
  bodega, con vista previa; **Juli todavía no lo ha aplicado.**
- **Tubo:** va por color (verde, rojo, amarillo, azul, violeta, naranja, gris,
  blanco) y por tubo entero de 6 m; el eléctrico, de 2 m. Los metros dichos se
  pasan a tubos.
- **El asistente** (Gem / Proyecto): `asistente/INSTRUCCIONES.md` es el system
  prompt y `asistente/BODEGA-MONTECIELO.md` el conocimiento. **Desde el 14-nov
  son las versiones de Juli del 19-oct conciliadas con la app** (supone y
  avisa; no pregunta el proyecto; revisión y bloque de una vez; la `FECHA` va
  en el bloque). Hay que **volver a subir los dos** al Gem.
- **Banco de pruebas del asistente** (`asistente/banco/`, 14-nov): 20
  escenarios y un verificador que lee con el lector real de la app lo que
  responde un agente que hace de asistente. Cómo correrlo, en el encabezado de
  `verificar.ts`.

## 4. Pendientes, en orden

1. **Juli pega `supabase/APLICAR-3-OCT.sql`** en supabase.com → SQL Editor →
   New query → Run. Debe salir «LISTO»; «NO SE APLICÓ NADA» = no quedó nada.
   No se puede desde una sesión remota de Claude. Después, comprobar
   `pg_policies` (`solo_la_bodega`) y volver a pedir los asesores.
2. **Juli sube al Gem** los dos archivos de `asistente/` del 14-nov.
3. **Conteo físico de herramientas** (después del cierre de préstamos):
   lo que esté queda; lo que alguien tenga se vuelve a prestar; lo que falte se
   da de baja con su ajuste.
4. **«🪄 Agrupar solo»** en Organizar bodega, mirando la vista previa.
5. **Confirmar el largo del tubo eléctrico** (Juli dijo «como de 2 metros»).
   Es una constante en `core/taxonomia.ts`.
6. **Decisiones de negocio que salieron del banco de pruebas** (14-nov):
   - el proyecto habitual de cada trabajador (sección 11 del conocimiento) está
     VACÍO: hoy todo sale a ZONA GENERAL;
   - unidades dichas distintas a las de la app: «2 galones de thinner» (la app
     cuenta unidades), «1 libra de clavos de 3"» (se cuentan por unidad);
   - «Almadana nueva»: ahora hay «Almadana» en el catálogo;
   - nombres dobles: «Estuco tipo 3» / «Estuco Tipo 3», «clavos hierro 2» sin `"`.
7. **Opcional:** plan Pro de Supabase (se pausa); protección de claves filtradas
   en Supabase Auth; `CRON_SECRET` en Vercel; pdfjs-dist 6 (probar en navegador).
8. **Juli:** pasar `Copia-bodega` a privado y revocar la llave de Google que
   quedó en el historial.

## 5. Prompt para abrir el chat nuevo (copiar y pegar)

```
Recupera sesión. Leé HANDOFF.md y CLAUDE.md completos.

Primero, solo lectura:
1. Estado real de producción: ¿ya se aplicó APLICAR-3-OCT.sql? (pg_policies,
   asesores de seguridad de Supabase), conteos, Kardex descuadrado.
2. Corré npm run test, node verificar-lint.cjs, npm run build y los recorridos
   del navegador, y juzgalos por su código de salida.
3. Decime qué de la sección 4 del HANDOFF sigue pendiente y qué ya hizo Juli.
No toques nada sin plan y «Ejecuta».
```

## 6. Cosas que ya se aprendieron (no volver a caer)

- **«Julio» en la pantalla de entrada era el traductor de Chrome.** La página
  decía `lang="en"`. Ya está en español y sin traducción.
- **Lo dudoso se decide, no se adivina.** El bloque registraba el primer
  parecido: 22 de 60 elementos en la prueba con datos reales.
- **Las familias reales están en plural** («Codos»), y los colores también se
  dicen en plural («tubos verdes»): el 14-nov no se reconocían.
- **Un `CHECK` o un `NOT NULL` de la base puede tumbar una función nueva.**
- **Antes de tocar datos de producción**, se ensaya dentro de una transacción
  que termina en `raise exception` con los resultados: así se revierte sola.
  Así se cerraron los préstamos el 13-nov.
- **Que esté en el repo no es que esté en producción.** El estado se lee en la
  base, nunca en CLAUDE.md ni acá.
- **Las instrucciones que usa Juli pueden no ser las del repo.** El 14-nov las
  del Gem eran del 19-oct y el repo tenía las del 6-oct; las de Juli habían
  sacado la `FECHA` del bloque. Antes de tocar el asistente, pedirle las que
  usa.
- **La API no pasa por `verificarLote`.** Lo que en pantalla es «mirar» (tubo
  sin color, metros no exactos) en la API tiene que ir a pendientes a mano.
