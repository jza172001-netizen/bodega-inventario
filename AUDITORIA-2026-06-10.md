# AUDITORÍA TÉCNICA — Inventario Montecielo (seguimiento)
**Fecha:** 2026-06-10
**Versión auditada:** rama `claude/app-audit-firewall-cinco-umejia`, commit `bd1fa43`
**Auditoría anterior:** `AUDITORIA.md` (2026-05-21, commit `a8ec647`)
**Stack:** React 18 + TypeScript 5.2 + Vite + Supabase (PostgreSQL) + localStorage

---

## RESUMEN EJECUTIVO

Desde la auditoría de mayo se corrigieron varios puntos (fallback hardcodeado del anon key eliminado, contraseñas ya no se guardan en localStorage, login contra RPC `authenticate_user`, modales de confirmación propios). Sin embargo, **los 4 hallazgos críticos de integridad de inventario siguen abiertos** (C-1, C-3, C-4 y parcialmente C-2), y esta revisión encontró **3 hallazgos críticos nuevos**: credenciales de administrador hardcodeadas en el código fuente público, un modal de confirmación multi-usuario que quedó funcionalmente roto por el borrado de contraseñas en localStorage, y una lógica de merge al arranque que **borra datos de Supabase** desde cualquier dispositivo con localStorage desactualizado.

**Verificaciones automáticas ejecutadas:**

| Verificación | Resultado |
|---|---|
| `npm run lint` (tsc --noEmit) | ✅ Pasa sin errores |
| `npm run build` (Vite producción) | ✅ Compila (chunk de 1.1 MB, ver D-2) |
| `npm audit --omit=dev` | ⚠️ 1 alta (`xlsx`, sin fix), 2 moderadas (`protobufjs`, `ws`) |
| Tests | ❌ Siguen siendo 0 |

---

## ESTADO DE LOS HALLAZGOS DE LA AUDITORÍA ANTERIOR

| ID | Hallazgo | Estado |
|---|---|---|
| C-1 | Borrar movimiento no revierte stock | 🔴 **ABIERTO** — `App.tsx:575-587` sigue eliminando el registro sin ajustar cantidad |
| C-2 | Stock negativo desde el chat | 🟡 PARCIAL — los inputs tienen `max={item.quantity}` y `handleLogMovement` ahora hace `Math.max(0, …)`, pero no hay validación programática (ver N-5) |
| C-3 | Movimiento + stock no atómicos | 🔴 **ABIERTO** — `App.tsx:548-563`: `addMovement` y `updateItemQuantity` siguen siendo dos llamadas independientes |
| C-4 | Race condition entre dos usuarios | 🔴 **ABIERTO** — `updateItemQuantity` (`supabaseService.ts:150`) sigue escribiendo cantidad absoluta, no delta |
| C-5 | Errores Supabase silenciados | 🟡 PARCIAL — los bulk-upserts ya hacen `console.error` y varios handlers marcan `syncStatus('error')`, pero quedan 5 `.catch(() => {})` en `App.tsx` (líneas 122, 193, 330-332) |
| I-1 | Contraseñas en texto plano | 🟡 PARCIAL — localStorage ya las borra (`storage.ts:34`) y el login usa RPC, pero `addUser`/`updateUser` siguen insertando la contraseña tal cual en `app_users`, y hay credenciales en el código (ver N-1) |
| I-2 | Autenticación 100% client-side | 🔴 ABIERTO — el rol sigue en localStorage (`bodega_session`) editable desde DevTools; ninguna operación valida rol en servidor |
| I-3 | Anon key hardcodeada como fallback | ✅ **CORREGIDO** — `lib/supabase.ts` ahora exige las variables de entorno |
| I-5 | TypeScript `strict: false` | 🔴 ABIERTO |
| I-7 | Timestamps a medianoche | 🟡 PARCIAL — `FloatingChat` usa `T12:00:00`, pero `LogMovementModal.tsx:62` sigue con `T00:00:00`; sin orden intradiario |
| I-8 | Sin registro de quién operó | 🟡 PARCIAL — ahora existe `AuditLog` con actor, pero `Movement` sigue sin `createdBy` |
| I-10 | `window.confirm()` | 🟡 PARCIAL — se agregaron `PinConfirmModal` y `MultiUserConfirmModal`, pero quedan 6 usos: `App.tsx:624`, `UserManagementModal.tsx:192`, `LogMovementModal.tsx:52`, `PickupView.tsx:177`, `PurchaseOrdersView.tsx:69`, `PersonnelView.tsx:71` |
| D-1 | Cero tests | 🔴 ABIERTO |

---

## HALLAZGOS NUEVOS

### 🔴 CRÍTICO

---

**[N-1] Credenciales de administrador hardcodeadas en el código fuente**
*Qué es:* `PinConfirmModal.tsx:10-11` contiene `ADMIN_USER = 'Juli'` y `ADMIN_PIN = '6274'`. `realData.ts:11` tiene el usuario owner con `username: 'july', password: '6274'`.
*Por qué importa:* Estas credenciales viajan en el bundle JavaScript público (cualquiera que abra la app puede leerlas con "ver código fuente") y quedan en el historial de git para siempre. El PIN autoriza **todas las acciones destructivas** de la app: eliminar ítems, trabajadores, usuarios, movimientos y limpiar la bitácora. Además es la misma contraseña real del owner.
*Dónde:* `PinConfirmModal.tsx:10-11`, `realData.ts:11`.
*Cómo arreglarlo:* Validar el PIN contra el RPC `authenticate_user` (ya existe) en lugar de comparar contra constantes. Rotar la contraseña '6274' inmediatamente. Eliminar la contraseña del seed.

---

**[N-2] MultiUserConfirmModal quedó funcionalmente roto (reset de bodega bloqueado o trivial)**
*Qué es:* `MultiUserConfirmModal.tsx:13,24` filtra usuarios por `u.password` y compara `user.password !== currentPassword`. Pero `storage.ts:34` guarda todos los usuarios con `password: ''` y `fetchUsers` también devuelve `password: ''`.
*Por qué importa:* Tras cualquier recarga, ningún usuario cumple el filtro → `required = []` → el modal muestra "✅ Todos confirmados" pero `onConfirm` nunca se ejecuta: **"Borrar toda la bodega" y "Restablecer materiales" quedan inservibles**. Y en una instalación fresca (datos del seed aún en memoria), la comparación es en texto plano client-side.
*Dónde:* `MultiUserConfirmModal.tsx:13-41`, `storage.ts:34`, `supabaseService.ts:396`.
*Cómo arreglarlo:* Validar cada confirmación contra el RPC `authenticate_user(username, password)` en vez de comparar en memoria. Manejar explícitamente el caso `required.length === 0`.

---

**[N-3] El merge de arranque BORRA datos de Supabase desde dispositivos desactualizados**
*Qué es:* En el `useEffect` de sincronización (`App.tsx:326-333`), si el localStorage del dispositivo no está completamente vacío, se considera "fuente de verdad" y se ejecuta `db.deleteProject / deletePersonnel / deletePurchaseOrder` sobre todo lo que exista en Supabase pero no localmente.
*Por qué importa:* Escenario real con 2+ usuarios (Juli y Camilo): Camilo crea un trabajador y un proyecto hoy; mañana Juli abre la app en un navegador donde entró hace un mes → su localStorage viejo no conoce esos registros → **la app los borra de Supabase silenciosamente** (además con `.catch(() => {})`). Es pérdida de datos multi-dispositivo por diseño.
*Dónde:* `App.tsx:283-333`.
*Cómo arreglarlo:* No usar localStorage como fuente de verdad para borrados. Las eliminaciones deben ser eventos explícitos (soft-delete con `deletedAt`, o una tabla de tombstones). Como mínimo, eliminar el bloque de "limpiar Supabase" del arranque.

---

### 🟡 IMPORTANTE

---

**[N-4] El login offline de respaldo quedó roto silenciosamente**
*Qué es:* `LoginView.tsx:66-80` usa `selectedUser.password` como respaldo cuando Supabase no responde, pero esa contraseña siempre es `''` después de recargar (la borra `storage.ts:34`).
*Por qué importa:* Sin internet, nadie puede entrar a la app aunque conozca su contraseña ("Sin conexión y contraseña incorrecta"). La app se anuncia como utilizable offline (datos en localStorage), pero la puerta de entrada no lo es.
*Dónde:* `LoginView.tsx:66-80`, `storage.ts:34`.
*Cómo arreglarlo:* Guardar un hash (p. ej. SHA-256 con sal) de la contraseña en localStorage para el fallback offline, nunca el texto plano ni cadena vacía.

---

**[N-5] El clamp `Math.max(0, …)` desincroniza kardex y stock**
*Qué es:* `handleLogMovement` (`App.tsx:555-557`) recorta la cantidad resultante a 0, pero **el movimiento se registra con la cantidad completa**. Una salida de 10 unidades con stock 2 registra "salió 10" y descuenta 2.
*Por qué importa:* Evita stock negativo, pero el kardex deja de cuadrar con el inventario: la suma de movimientos ya no reproduce el stock. En una auditoría física la diferencia es indetectable.
*Dónde:* `App.tsx:548-563`.
*Cómo arreglarlo:* Rechazar el movimiento con error si `quantity > item.quantity` (para salidas), en el handler central — no solo en cada formulario.

---

**[N-6] Toda la seguridad de datos depende de las políticas RLS de Supabase — VERIFICADO: las políticas son permisivas**
*Qué es:* La autorización es 100% client-side; el anon key viaja en el bundle. Cualquiera con la URL del proyecto puede llamar la API REST de Supabase directamente, sin pasar por la UI.
*Verificación (Security Advisor de Supabase, 2026-06-10):* Todas las tablas tienen RLS habilitado pero con políticas `USING (true)` / `WITH CHECK (true)` para INSERT/UPDATE/DELETE (`service_access` en `items`, `movements`, `personnel`, `projects`, `purchase_orders`, `purchase_order_items`, `audit_logs`; `allow_insert/update/delete` en `app_users`). En la práctica el RLS está anulado: un anónimo con el anon key puede leer y escribir todas las tablas, incluida `app_users` con las contraseñas.
*Cómo arreglarlo:* Migrar a Supabase Auth y reescribir las políticas por rol (la app actual no tiene sesión server-side, así que restringir las políticas hoy rompería la app — debe hacerse junto con la migración de auth). Mientras tanto, no almacenar datos sensibles adicionales y rotar la contraseña expuesta.

---

**[N-7] Código ejecutable cargado en runtime desde CDN sin integridad**
*Qué es:* `copilotService.ts:21` hace `import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2')` en tiempo de ejecución.
*Por qué importa:* Riesgo de cadena de suministro: si el CDN o el paquete se compromete, ejecuta JS arbitrario con acceso a la sesión y al anon key. Además el copiloto no funciona sin internet ni si el CDN cae.
*Cómo arreglarlo:* Instalar `@xenova/transformers` como dependencia npm y dejar que Vite lo empaquete (con code-splitting para no inflar el bundle inicial).

---

**[N-8] Vulnerabilidades de dependencias y dependencia muerta**
*Qué es:* `npm audit`: `xlsx` (alta — prototype pollution + ReDoS, **sin fix disponible** en la versión 0.18.x del registro npm), `protobufjs` y `ws` (moderadas, fix con `npm audit fix`). Además `@google/genai` está declarado con versión `latest` y **no se usa en ningún archivo** del proyecto.
*Cómo arreglarlo:* Ejecutar `npm audit fix`; migrar `xlsx` al build oficial de SheetJS (cdn.sheetjs.com) o a `exceljs`; eliminar `@google/genai` del `package.json`.

---

**[N-9] Datos personales reales y contraseña en el repositorio**
*Qué es:* `realData.ts` contiene nombres reales de ~29 trabajadores, un teléfono y la contraseña del owner, versionados en git.
*Por qué importa:* Cualquiera con acceso al repo (o a un fork) obtiene datos personales y credenciales. Si el repo se hace público alguna vez, quedan expuestos en el historial.
*Cómo arreglarlo:* Mover el seed real a un archivo no versionado o a Supabase; dejar en git solo datos ficticios. Rotar la contraseña.

---

### 🟢 DESEABLE

---

**[D-1] Lógica duplicada de "registrar salida" en 3 lugares** — `LogMovementModal`, `FloatingChat` (wizard + panel) y `CopilotView` construyen movimientos cada uno por su cuenta, con validaciones distintas (por eso C-2/N-5). Centralizar en una sola función `registrarSalida()` con validación única.

**[D-2] Bundle de 1.1 MB minificado** — `tesseract.js`, `pdfjs-dist`, `mammoth`, `docx` y `xlsx` se empaquetan en el chunk principal. Cargarlos con `import()` dinámico solo cuando se abre el lector de facturas/exportación reduciría el arranque ~60%.

**[D-3] `loadFromLocalStorage()` se invoca 9 veces al montar** — cada `useState` inicializador parsea el JSON completo de nuevo. Parsear una vez y compartir.

**[D-4] Sin paginación de movimientos** — `fetchAuditLogs` ya limita a 1000, pero `fetchMovements` trae todo el historial; con el crecimiento actual el arranque y el localStorage (límite ~5 MB) van a degradarse. Sigue pendiente de la auditoría anterior (D-4).

---

## ROADMAP RECOMENDADO

### Fase 1 — Esta semana (seguridad y pérdida de datos)
1. **[N-1]** Quitar PIN/credenciales hardcodeadas; validar contra `authenticate_user`. Rotar '6274'.
2. **[N-3]** Eliminar el borrado automático de Supabase en el arranque.
3. **[N-2]** Reparar `MultiUserConfirmModal` con validación por RPC.
4. **[N-6]** Auditar políticas RLS en el dashboard de Supabase.

### Fase 2 — Próximas 2-4 semanas (integridad de inventario, pendiente desde mayo)
5. **[C-3]+[C-4]** RPC transaccional `log_movement_and_update_stock` con `UPDATE … WHERE quantity >= delta`.
6. **[C-1]** Revertir stock al borrar movimiento (o prohibir borrado y usar movimiento de corrección).
7. **[N-5]+[C-2]** Validación de stock centralizada en `handleLogMovement`.
8. **[N-4]** Fallback offline con hash de contraseña.

### Fase 3 — Mediano plazo
9. **[I-2]+[I-1]** Migrar a Supabase Auth.
10. **[N-8]** Sanear dependencias (`xlsx`, `@google/genai`, `npm audit fix`).
11. **[I-5]** Activar `strict: true`.
12. **[D-1]** Centralizar registro de salidas; **[D-2]** code-splitting; tests (Vitest) para la lógica de stock.

---

## MÉTRICAS

| Métrica | 2026-05-21 | 2026-06-10 |
|---|---|---|
| Hallazgos críticos abiertos | 5 | 4 previos (1 parcial) + 3 nuevos |
| Hallazgos importantes abiertos | 10 | 7 previos + 6 nuevos |
| Tests | 0 | 0 |
| TypeScript strict | Desactivado | Desactivado |
| `tsc --noEmit` | — | ✅ Sin errores |
| Build producción | — | ✅ OK (chunk 1.1 MB) |
| Vulnerabilidades npm (prod) | — | 1 alta, 2 moderadas |
