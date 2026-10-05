# HANDOFF — Bodega Montecielo (al 3-oct-2026)

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
  - PR, merge y Vercel READY;
  - comprobar las 3 ventanillas (`/api/*` responden 405 a GET).
- **Juli dijo el 2-oct: «estas son las últimas ediciones de código».** No
  proponer funciones nuevas. Solo auditar, arreglar lo roto y cerrar lo pendiente.

## 2. Producción y cierre del 3-oct

- App: `bodega-montecielo.vercel.app` (Vercel, Node 24). Base: Supabase
  `xmizawuhiounkiaqrwxd` (`sa-east-1`).
- **Datos (2-oct):** 129 ítems, 234 movimientos, 35 personas, 8 obras activas.
  El último movimiento es del 8-sep.
- **Cierre del 3-oct (rama `claude/final-audit-defects-89pl3v`):** todos los
  huecos de la auditoría del 2-oct.
  - Nadie se vuelve administrador editando la tabla de accesos.
  - La llave pública ya no lee ni mueve inventario: hace falta la sesión de
    alguien de la bodega.
  - La entrada vieja (`authenticate_user`) y las claves en texto plano se
    retiraron.
  - El tope de intentos del código de alta cuenta de verdad.
  - El bloque no crea gemelos; la API no adivina personas; Organizar no toca
    cantidades.
  - El Kardex queda en cero, sin mover stock.
  - Un latido diario evita que Supabase se pause.
- **Accesos:** solo Juli tiene clave. Kate y Camilo entran como primera vez,
  con el código que Juli genera en Accesos → «🔑 Código».
- **Orden de despliegue:** primero el código (PR, merge, Vercel), después las 3
  migraciones `20261003*`. El código nuevo funciona con la base vieja; al revés,
  no.

## 3. Cómo funciona (mapa corto; el detalle está en CLAUDE.md)

- **Toda la UI y el estado viven en `App.tsx`.** Las escrituras van por la cola
  durable `withSync` (`core/cola.ts`).
- **Las reglas compartidas entre la app y la API están en `core/`:**
  - `despacho.ts`: préstamo o gasto, obra obligatoria solo para consumo;
  - `custodia.ts`: traslados y asignaciones;
  - `verificacion.ts`: alertas del bloque, resumen y huella;
  - `crearItem.ts`: cómo nace un ítem;
  - `organizar.ts`: géneros y familias;
  - `consultas.ts` y `registro.ts`: el asistente.
- **El chat** (`components/FloatingChat.tsx`, unas 3.000 líneas) tiene 4 botones:
  - **📋 Bloque:** se pega lo que entrega el Gem;
  - **🚀 Despacho:** el flujo de 4 pasos, el mejor diseñado según Juli;
  - **⚡ Rápido;**
  - **➕ Agregar.**
- **El flujo de Juli:** dicta al Gem durante la mañana → «unificá» → verifica
  contra los audios → «confirmado» → el Gem entrega el bloque → se pega en 📋
  Bloque → la app verifica contra la bodega → «✓ Pedido correcto» por trabajador
  → Registrar.
- **El asistente (Gem / Proyecto, desde el 5-oct):** `asistente/INSTRUCCIONES.md`
  es el system prompt; `asistente/BODEGA-MONTECIELO.md` es el conocimiento único
  (reglas, sinónimos, ejemplo del 3-oct y catálogo de producción, que se regenera
  cuando cambia el inventario). Entrega el bloque nuevo `=== ENTREGA ===`, uno
  por trabajador y agrupado por categoría; la app lee también el formato viejo.
  `tests/documentos.test.ts` lee los bloques escritos en los documentos con el
  lector de la app.

## 4. Pendientes, en orden

1. **Si las migraciones `20261003*` no están aplicadas** (comprobar: en
   `pg_policies` las tablas tienen `solo_la_bodega`), ensayarlas con `raise` y
   aplicarlas, en orden.
2. **Juli:** generar el código de Kate y el de Camilo, y que entren.
3. **Inventario definitivo.**
   - **Decisión de Juli:** la Lista 5 (lo que cada uno tiene hoy o lo que tuvo
     alguna vez).
   - **Pendiente de su revisión:** `herramientas/INFORME-VINCULACION.md`.
   - Se aplica con una entrada de apertura por unidad; la consulta 4 de
     `supabase/RESTAURAR.md` tiene que seguir en cero.
4. **Recorridos R1–R19 en el teléfono** (`VERIFICACION-ENTREGA.md`); nunca hubo
   prueba en navegador real. Incluye la prueba de dos teléfonos a la vez.
5. **pdfjs-dist:** la única vulnerabilidad que queda; su arreglo es la versión 6
   (cambio mayor). Probarla en navegador antes de subirla.
6. **Opcional:**
   - `CRON_SECRET` en Vercel, para que solo Vercel llame el latido;
   - desconectar Netlify, que falla en cada PR;
   - fase B: el «+ Crear nuevo» del chat pasa a `core/crearItem.ts`.

## 5. Prompt para abrir el chat nuevo (copiar y pegar)

```
Recupera sesión. Leé HANDOFF.md y CLAUDE.md completos.

Primero una AUDITORÍA FINAL, solo lectura, sin tocar nada:
1. Estado real de producción (Supabase y Vercel): accesos (quién entró ya por
   la identidad nueva), conteos, que las migraciones del repo coincidan con lo
   instalado, y que la reconciliación del Kardex de supabase/RESTAURAR.md dé
   cero filas (descontando los préstamos viejos sin entrada).
2. Corré npm run test, node verificar-lint.cjs, npm run build y
   node supabase/verificar-baseline.cjs, y juzgalos por su código de salida.
3. Revisá por defectos (no por estilo) lo que cambió en los PR #100 a #103:
   el bloque (FloatingChat renderLote/registrarLote, core/verificacion,
   core/crearItem, utils/lote), los accesos (migración 20261002120000,
   LoginView, UserManagementModal) y Organizar bodega.
4. Entregá una lista de fallas reales con su evidencia (archivo:línea, consulta
   o prueba), de la más grave a la menor, y qué propondrías. No arregles nada
   todavía.

Juli no quiere funciones nuevas: solo cerrar lo roto y lo pendiente.
```

## 6. Cosas que ya se aprendieron (no volver a caer)

- **«Julio» en la pantalla de entrada era el traductor de Chrome.** La página
  decía `lang="en"`. Ya está en español y sin traducción.
- **Lo dudoso se decide, no se adivina.** El bloque registraba el primer
  parecido: 22 de 60 elementos en la prueba con datos reales.
- **Las familias reales están en plural** («Codos»). Las obras se escriben como
  en el catálogo («CRISTO»): «El Cristo» no la reconoce.
- **Un `CHECK` o un `NOT NULL` de la base puede tumbar una función nueva.**
  `app_users.password` es NOT NULL: por eso se usa `''`, y `authenticate_user`
  rechaza las claves vacías.
- **Antes de aplicar una migración en producción**, se prueba dentro de una
  transacción que termina en `raise exception` con los resultados: así se
  revierte sola.
