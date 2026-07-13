# AUDITORÍA MAESTRA — Inventario Montecielo
**Fecha:** 2026-07-10
**Versión auditada:** rama `main`, commit `39d1284`
**Auditorías anteriores:** `AUDITORIA.md` (2026-05-21), `AUDITORIA-2026-06-10.md` (2026-06-10)
**Alcance:** código + **base de datos en vivo** + **app corriendo (pruebas e2e con navegador)** — las dos auditorías anteriores solo revisaron código.

---

> **ADENDA (2026-07-10, mismo día):** B-1 y B-2 fueron **corregidos y verificados** después de emitir este informe.
> - B-1: nueva migración `20260710200000_fix_movement_type_cast.sql` (cast `p_type::movement_type` + `search_path` fijo), aplicada a la BD real. Re-ejecutada la prueba e2e T3: el movimiento ahora **sí persiste** (SQL: `quantity=6`, 1 movimiento `Salida x4`).
> - B-2: `migrateUsers` reescrito y el fetch de usuarios ya no depende de `local === null` (`App.tsx`); el `passwordHash` local se preserva para el respaldo offline. Re-ejecutada la prueba e2e T1 **sin workaround**: el usuario creado en la BD aparece con su propia tarjeta y autentica.
> - T6 re-verificada (cero DELETEs en arranque limpio) y datos de prueba eliminados (BD final: 33 ítems, 3 usuarios, 0 movimientos).
> Con esto, los bloqueantes del veredicto quedan resueltos; siguen pendientes H-1 (rotar contraseñas — lo hace el dueño), H-2 (RLS) y H-3 (feedback de sync).

## VEREDICTO DE ENTREGABILIDAD

**🔴 NO ENTREGABLE HOY.** Las pruebas con la app corriendo contra la base de datos real encontraron dos defectos que las auditorías de código no podían ver:

1. **Ningún movimiento de inventario se está guardando en la base de datos** (B-1): el RPC atómico introducido en junio falla siempre con error 400 por un cast faltante, el error se silencia y la UI muestra el movimiento como exitoso. El kardex vive solo en el navegador: al cambiar de dispositivo o limpiar el navegador, se pierde.
2. **Los usuarios de la base de datos nunca aparecen en el login** (B-2): la lista de usuarios se colapsa sobre los 3 usuarios fijos del seed; crear usuarios nuevos no sirve y las credenciales pueden quedar bajo la tarjeta con el nombre equivocado.

Ambos tienen arreglo pequeño y localizado (un cast de una línea en una migración; rehacer `migrateUsers`). Con B-1 y B-2 corregidos + las contraseñas rotadas (H-1), la app queda entregable para uso interno de confianza; el endurecimiento de RLS (H-2) sigue siendo la deuda estructural para exponerla más allá.

---

## 1. ESTADO REAL DE LOS HALLAZGOS ANTERIORES

Verificado contra el código actual, la base de datos en producción y la app corriendo — no contra mensajes de commit.

### Críticos de integridad (mayo)

| ID | Hallazgo | Estado verificado |
|---|---|---|
| C-1 | Borrar movimiento no revierte stock | ✅ **CORREGIDO** — `handleDeleteMovement` (`App.tsx:591-613`) revierte el stock y llama al RPC `delete_movement_and_revert_stock` (existe en la BD, verificado por SQL) |
| C-2 | Stock negativo posible | ✅ **CORREGIDO** — validación central en `handleLogMovement` (`App.tsx:561-564`) rechaza salidas mayores al stock; BD en vivo: 0 ítems con stock negativo |
| C-3 | Movimiento + stock no atómicos | 🔴 **REGRESIÓN** — el diseño es correcto (RPC transaccional aplicado y usado por `App.tsx:576`) pero el RPC **falla siempre en runtime** por un cast faltante: ver B-1 |
| C-4 | Race condition entre dos usuarios | 🔴 En la práctica ABIERTO — la protección vive en el mismo RPC roto (B-1); hoy ningún movimiento llega al servidor |
| C-5 | Errores Supabase silenciados | ✅ CORREGIDO en lo esencial — quedan 2 `.catch(() => {})` menores (`notificationService.ts:7`, `StatisticsView.tsx:197`), ninguno en rutas de datos |

### Críticos nuevos de junio

| ID | Hallazgo | Estado verificado |
|---|---|---|
| N-1 | PIN/credenciales de admin hardcodeadas | ✅ **CORREGIDO** — `PinConfirmModal.tsx` ya no contiene PIN ni usuario; valida contra RPC `authenticate_user`. `realData.ts:12` sin contraseña. ⚠️ La contraseña '6274' sigue en el **historial de git**: rotarla (ver H-1) |
| N-2 | MultiUserConfirmModal roto | ✅ CORREGIDO — valida por RPC con respaldo por hash |
| N-3 | Merge de arranque borraba datos de Supabase | ✅ **CORREGIDO** — el merge es aditivo (`App.tsx:310-344`); verificado además en runtime con un navegador de localStorage vacío (prueba T6) |
| N-4 | Login offline roto | ✅ CORREGIDO — respaldo por hash SHA-256 (`LoginView.tsx:91`, `utils/hash.ts`) |
| N-5 | Clamp desincronizaba kardex | ✅ CORREGIDO — el movimiento se rechaza en vez de recortarse |
| N-6 | Políticas RLS permisivas | 🔴 **SIGUE ABIERTO** — ver H-2 |
| N-7 | Código desde CDN sin integridad | ✅ CORREGIDO — `@huggingface/transformers` empaquetado por npm (`copilotService.ts:21`) |
| N-8 | Vulnerabilidades npm | ✅ CASI — xlsx migrado al build oficial 0.20.3 (CVE alta resuelta); queda **1 moderada** (dompurify, `npm audit fix` disponible) |
| N-9 | Datos personales y contraseña en el repo | 🟡 PARCIAL — contraseña y teléfono real eliminados (placeholder `TEST_PHONE`); los **nombres de ~29 trabajadores siguen** en `realData.ts` y todo sigue en el historial de git |

### Importantes / deseables aún abiertos

| ID | Hallazgo | Estado |
|---|---|---|
| I-1 | Contraseñas en texto plano | 🔴 ABIERTO en servidor — ver H-1 |
| I-2 | Autenticación 100% client-side | 🔴 ABIERTO — el rol sigue siendo un dato del cliente; sin Supabase Auth ninguna política puede distinguir owner de employee |
| I-5 | TypeScript `strict: false` | 🔴 ABIERTO (`tsconfig.json:15`) |
| I-7 | Timestamps a medianoche | ✅ CORREGIDO — hora real para hoy, `T12:00:00` para fechas pasadas |
| I-10 | `window.confirm()` | ✅ CORREGIDO — 0 usos; todo pasa por `ConfirmDialog`/modales |
| D-2 | Bundle 1.1 MB monolítico | 🟡 MEJORADO — code-splitting aplicado (xlsx/pdf/docx en chunks aparte); el chunk mayor quedó en 742 kB (195 kB gzip) |
| D-3 | 9 parses de localStorage al montar | ✅ CORREGIDO — carga inicial cacheada (`storage.ts:85-90`) |
| D-4 | Sin paginación de movimientos | 🟡 ABIERTO — `fetchMovements` sigue sin límite (hoy la tabla tiene 0 filas; será problema con el uso) |
| D-1 (jun) | Cero tests | 🔴 ABIERTO — 0 tests |

---

## 2. AUDITORÍA DE LA BASE DE DATOS EN VIVO (2026-07-10)

Proyecto Supabase `bodega-inventario` (`xmizawuhiounkiaqrwxd`, sa-east-1). **Nota:** el proyecto estaba **pausado por inactividad** (plan gratuito) y fue reactivado hoy — mientras estuvo pausado, la app solo funcionaba con localStorage.

**Integridad (SQL directo):**

| Verificación | Resultado |
|---|---|
| Ítems duplicados (mismo nombre) | ✅ 0 |
| Movimientos huérfanos (ítem inexistente) | ✅ 0 |
| Stock negativo | ✅ 0 |
| Migraciones del repo aplicadas | ✅ `atomic_stock_movements` aplicada (9 migraciones en total) |
| RPCs `log_movement_and_update_stock`, `delete_movement_and_revert_stock`, `authenticate_user` | ✅ Existen (SECURITY DEFINER) |
| Datos | 33 ítems, 3 usuarios, 0 movimientos |

**Security Advisor de Supabase:** ver hallazgos H-1 y H-2.

---

## 3. VERIFICACIÓN ESTÁTICA

| Verificación | 2026-06-10 | Hoy |
|---|---|---|
| `npm run lint` (tsc --noEmit) | ✅ | ✅ Sin errores |
| `npm run build` | ✅ (chunk 1.1 MB) | ✅ Chunk mayor 742 kB, code-splitting activo |
| `npm audit --omit=dev` | 1 alta + 2 moderadas | **1 moderada** (dompurify, fix disponible) |
| Tests | 0 | 0 |

---

## 4. PRUEBAS END-TO-END (APP CORRIENDO + BD REAL)

Ejecutadas con Chromium controlado por Playwright contra `npm run dev` + el Supabase de producción, con un usuario e ítem de prueba (`PRUEBA-AUDITORIA`) creados y **eliminados al final** (BD verificada idéntica a su estado inicial: 33 ítems, 3 usuarios, 0 movimientos, 31 personal, 7 proyectos).

| Prueba | Resultado | Evidencia |
|---|---|---|
| T1 · Login contra Supabase (RPC `authenticate_user`) | ✅ PASÓ* | Autenticación real end-to-end. *Solo tras inyectar el usuario en localStorage: sin ese workaround el usuario de la BD **no aparece en el login** (ver B-2) |
| T2 · Crear ítem desde la UI | ✅ PASÓ | Ítem visible en UI y confirmado por SQL en `items` |
| T3 · Salida de 4 unidades (RPC atómico) | 🔴 **FALLÓ** | La UI mostró stock 10→6 y el movimiento en el historial, pero por SQL: `quantity=10`, `0 movimientos`. El RPC devolvió **400** y el error se silenció (ver B-1) |
| T4 · Salida mayor al stock (debe rechazarse) | ✅ PASÓ | Alerta "Stock insuficiente. Disponible: 6 unidades"; sin movimiento fantasma en BD |
| T5 · Borrar movimiento revierte stock | ✅ PASÓ (RPC directo) | `delete_movement_and_revert_stock` sobre un movimiento sintético: stock revertido correctamente. No se pudo probar vía UI porque ningún movimiento persiste (B-1) |
| T6 · Dispositivo nuevo no destruye datos (ex-N-3) | ✅ PASÓ | Contexto de navegador virgen + 12s de sincronización: **cero peticiones DELETE** a Supabase y conteos idénticos antes/después |

**Nota de entorno:** el navegador del sandbox no puede salir a internet directamente; las peticiones se resolvieron vía interceptación de Playwright. Esto no afecta la validez: los fallos B-1/B-2 se reprodujeron también con llamadas REST directas a Supabase.

---

## 5. HALLAZGOS NUEVOS

### 🔴 CRÍTICO

**[B-1] NINGÚN movimiento de inventario se guarda en la base de datos (RPC roto + error silenciado)**
*Qué es:* La función `log_movement_and_update_stock` declara `p_type text` pero lo inserta en la columna `movements.type` (enum `movement_type`) **sin cast** (`supabase/migrations/20260610120000_atomic_stock_movements.sql:39`). Postgres responde `42804: column "type" is of type movement_type but expression is of type text` → HTTP 400 en **todos** los movimientos. El cliente (`supabaseService.ts:199-213`) solo usa el fallback si el RPC "no existe"; ante este error lanza, y `withSync` lo traga sin avisar al usuario.
*Reproducido:* prueba e2e T3 (UI dice éxito, SQL dice nada) y llamada REST directa (400 con el mensaje exacto).
*Por qué importa:* El kardex completo vive solo en localStorage desde que se aplicó la migración (11 de junio). Cambio de dispositivo, limpieza del navegador o pérdida del equipo = **pérdida total del historial de movimientos**. Además los otros dispositivos nunca ven los movimientos de este. Es la causa más probable del síntoma "cada vez que entro después de una auditoría hay algo raro".
*Cómo arreglarlo (1 línea):* en la migración, `values (p_id, p_item_id, p_type::movement_type, …)`. Aplicar como nueva migración (`create or replace function`). El RPC gemelo `delete_movement_and_revert_stock` NO tiene este problema (verificado: funciona).

**[B-2] Los usuarios reales de la base de datos nunca aparecen en el login (gestión de usuarios inoperante)**
*Qué es:* Dos defectos encadenados. (1) `App.tsx:204` solo aplica los usuarios de Supabase si localStorage está vacío (`local === null`), condición que casi nunca se da porque el efecto de persistencia escribe el seed antes. (2) Aunque llegaran, `migrateUsers` (`App.tsx:51-62`) **mapea sobre los 3 usuarios del seed**: toma credenciales del usuario almacenado que coincida por id o por rol, le pone el nombre del seed, y **descarta cualquier usuario extra**.
*Reproducido:* e2e con navegador limpio — `get_users_safe` respondió 200 con los usuarios reales y aun así el login mostró "Juli/Camilo/Kate" del seed; el usuario de prueba (owner) quedó escondido bajo la tarjeta "Juli".
*Por qué importa:* Crear/renombrar usuarios desde la app no tiene ningún efecto visible; las credenciales de un usuario pueden quedar bajo la tarjeta con el nombre de otro (rol repetido); y el seed tiene `username: 'july'` mientras la BD tiene `'juli'`, así que en un dispositivo nuevo el login del owner depende de a qué tarjeta le tocaron sus credenciales. Con un 4º usuario, directamente desaparece.
*Cómo arreglarlo:* usar la lista de la BD como fuente de verdad del login (quitar la condición `local === null` y dejar de colapsar sobre `seedUsers`; el seed solo debe usarse cuando la BD está vacía e inaccesible).

**[H-1] Las contraseñas reales son de 2 caracteres, en texto plano, y el RPC de login permite fuerza bruta anónima**
*Qué es:* Los 3 usuarios de `app_users` tienen contraseñas de **2 caracteres** almacenadas en texto plano (verificado por SQL: `length(password)=2` en los tres). `authenticate_user` compara `password = p_password` en claro y es ejecutable por el rol `anon` (confirmado por el Security Advisor). Además `addUser`/`updateUser` (`supabaseService.ts:470,479`) siguen insertando la contraseña tal cual.
*Por qué importa:* Cualquiera con la URL del proyecto (que viaja en el bundle público) puede probar las ~9.000 combinaciones de 2 caracteres contra el RPC en segundos y obtener el rol `owner` — con el que la UI permite borrar toda la bodega.
*Cómo arreglarlo:* Contraseñas de mínimo 8 caracteres YA (mitigación inmediata, sin tocar código); después, hashear en el RPC (`crypt()` de pgcrypto) y a mediano plazo migrar a Supabase Auth. Rotar también '6274' que quedó en el historial de git.

**[H-2] Un anónimo puede escribir TODAS las tablas, incluida la de usuarios (RLS anulado)**
*Qué es:* Confirmado hoy por el Security Advisor y por SQL: todas las tablas (`items`, `movements`, `personnel`, `projects`, `purchase_orders`, `purchase_order_items`, `audit_logs`, `push_subscriptions`) tienen políticas `USING (true)` para ALL, y `app_users` permite INSERT/UPDATE/DELETE sin restricción al rol `public`. Mejora desde junio: `app_users` ya **no** tiene política SELECT (las contraseñas no se pueden leer directo) y la app usa `get_users_safe`. Pero cualquiera con el anon key puede **crearse un usuario owner, cambiar contraseñas ajenas o borrar los usuarios** vía la API REST, sin pasar por la UI.
*Por qué importa:* Es el mismo N-6 de junio, sigue abierto y es la vulnerabilidad estructural de la app: la autorización solo existe en el cliente.
*Cómo arreglarlo:* Requiere migrar a Supabase Auth y reescribir políticas por rol (documentado en junio). Mitigación parcial inmediata: quitar las políticas INSERT/UPDATE/DELETE de `app_users` y mover altas/cambios de usuario a RPCs SECURITY DEFINER que validen la contraseña del owner.

### 🟡 IMPORTANTE

**[H-3] Los fallos de escritura a Supabase son invisibles y no revierten la UI**
*Qué es:* `withSync` (`App.tsx:376-388`) descarta el error (`catch` sin argumento, ni `console.error`), enciende un indicador en el header y lo **apaga solo a los 8 segundos** (`App.tsx:386`). El estado optimista de la UI nunca se revierte.
*Escenario:* exactamente B-1 — un mes entero de movimientos "exitosos" que nunca llegaron al servidor, sin que nadie viera un error.
*Cómo arreglarlo:* registrar el error (`console.error`), mantener el indicador en rojo mientras haya escrituras fallidas, mostrar un toast con "reintentar", y encolar las escrituras fallidas para reintento (o revertir el cambio local).

### 🟢 MENOR

- **[H-m1]** Funciones `authenticate_user` y `get_users_safe` sin `search_path` fijo (WARN del advisor; en SECURITY DEFINER es superficie de escalamiento). Fix: `ALTER FUNCTION … SET search_path = public, pg_temp;`
- **[H-m2]** `dompurify` con vulnerabilidad moderada — `npm audit fix` la resuelve.
- **[H-m3]** Los nombres de ~29 trabajadores reales siguen versionados en `realData.ts` (resto del N-9).

---

## 6. RECOMENDACIONES PRIORIZADAS

1. **BLOQUEANTE — antes de registrar un solo movimiento más:** corregir el cast del RPC (B-1, 1 línea de SQL). Sin esto, todo el kardex se está perdiendo. Segundo: exportar/respaldar el localStorage del dispositivo que hoy tiene el historial real, si existe.
2. **BLOQUEANTE para multi-usuario:** rehacer `migrateUsers` para que la BD sea la fuente de verdad del login (B-2).
3. **Hoy, sin código:** cambiar las 3 contraseñas a ≥8 caracteres (H-1). Ejecutar `npm audit fix` (H-m2).
4. **Esta semana:** endurecer políticas de `app_users` (H-2 mitigación) y fijar `search_path` en los RPC (H-m1). Además: que `withSync` muestre un aviso visible cuando una escritura a Supabase falle — B-1 pasó inadvertido un mes precisamente porque el error se traga.
5. **Antes de crecer:** paginar `fetchMovements` (D-4); primer test automatizado de la lógica de stock (D-1 jun) — un test de integración del RPC habría detectado B-1 el mismo día.
6. **Mediano plazo:** Supabase Auth + políticas por rol (cierra I-1, I-2, H-1, H-2 de raíz).
7. **Operativo:** el plan gratuito de Supabase pausa el proyecto tras ~1 semana sin uso (hoy estaba pausado y hubo que reactivarlo). Si la app va a uso real, plan Pro o ping periódico.

---

_Metodología: cada afirmación de este informe proviene de un comando ejecutado hoy (SQL contra la BD de producción, build real, navegador real controlado por Playwright), no de la lectura de mensajes de commit._
