# HANDOFF — Bodega Montecielo (al 2-oct-2026)

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

## 2. Producción, verificada el 2-oct

- App: `bodega-montecielo.vercel.app` (Vercel, Node 24). Base: Supabase
  `xmizawuhiounkiaqrwxd` (`sa-east-1`).
- **Datos:** 129 ítems, 234 movimientos, 35 personas, 8 obras activas. El último
  movimiento es del 8-sep: la app todavía casi no se usa. Juli estima que la
  operación real ronda los 60 movimientos al día.
- **Accesos:** Administrador maestro (usuario `juli`), Kate (debe cambiar su
  clave al entrar) y Camilo (papá de Juli, administrador; espera código de
  alta). «KATE» y «Visitante» están en la papelera.
- **Últimos PR:**
  - **#100:** el bloque sigue la lógica del chat, con verificación; Gem en 4 momentos.
  - **#101:** géneros, familias y pulgadas editables; lo dudoso se decide, no se adivina.
  - **#102:** los accesos los maneja el servidor (`dar_de_alta`, `crear_acceso`…); Camilo ya puede entrar.
  - **#103:** el bloque cierra con «✓ Pedido correcto» por trabajador y crea ítems con las reglas del chat.
  - **#104:** este HANDOFF, el catálogo del Gem y el plan de verificación.

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
- **Instrucciones del Gem:** `asistente/GEM.md`. Catálogo real:
  `asistente/CATALOGO.md`; se regenera desde producción cuando cambia el
  inventario.

## 4. Pendientes, en orden

1. **L4, el cierre de seguridad.** Solo cuando Juli, Kate y Camilo hayan entrado
   por la vía nueva (comprobable en la base: `auth.users.last_sign_in_at`):
   - quitar las políticas públicas `allow_insert`, `allow_update` y
     `allow_delete` de `app_users`;
   - retirar `authenticate_user`;
   - vaciar las claves en texto plano que quedan.

   La vuelta atrás está en el baseline (las políticas originales).
2. **La llave pública todavía mueve inventario.** Las funciones de stock son
   `security definer` con `anon`. Cerrarlo es un proyecto (ver CLAUDE.md): las
   escrituras pasan por la identidad del servidor.
3. **Inventario definitivo.**
   - **Decisión de Juli pendiente:** la Lista 5 (lo que cada uno tiene hoy o lo
     que tuvo alguna vez).
   - **Pendiente de su revisión:** `herramientas/INFORME-VINCULACION.md`.
   - **Aplicar** primero en una copia y después en producción, con una entrada de
     apertura por unidad. El Kardex tiene que cuadrar.
4. **Supabase se pausa solo** (pasó del 12 al 28 de sep). Hace falta un aviso o un
   plan pago.
5. **Nunca hubo una prueba en navegador real.** Los recorridos R1–R19 están en
   `VERIFICACION-ENTREGA.md`.
6. **Opcional:**
   - fase B: el «+ Crear nuevo» del chat pasa a `core/crearItem.ts`;
   - desconectar Netlify, que falla en cada PR;
   - `npm audit`;
   - prueba de dos teléfonos a la vez.

## 5. Prompt para abrir el chat nuevo (copiar y pegar)

```
Recupera sesión. Leé HANDOFF.md y CLAUDE.md completos.

Paso 0, antes de todo: traeme al chat y transcribime COMPLETOS, sin resumir ni
recortar, uno por uno, estos cuatro archivos del repo, para leerlos y
verificarlos acá:
  1. HANDOFF.md
  2. VERIFICACION-ENTREGA.md (mínimo la sección «Plan de Juli» del principio)
  3. asistente/GEM.md (las instrucciones del Gem, listas para copiar)
  4. asistente/CATALOGO.md (el catálogo que se le sube al Gem)
Mandámelos también como archivo. Después de transcribirlos, seguí.

Luego una AUDITORÍA FINAL, solo lectura, sin tocar nada:
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
