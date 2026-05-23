# AUDITORÍA TÉCNICA — Inventario Montecielo
**Fecha:** 2026-05-21  
**Auditor:** Revisión estática automatizada + análisis manual  
**Versión auditada:** rama `main`, commit `a8ec647`  
**Stack:** React 18 + TypeScript 5.2 + Vite + Supabase (PostgreSQL) + localStorage  

---

## RESUMEN EJECUTIVO

La app funciona para uso liviano de 1-2 usuarios. Tiene lógica de negocio útil y una UX razonablemente trabajada. Sin embargo, presenta **vulnerabilidades críticas de integridad de datos** que en producción real pueden corromper el inventario silenciosamente. El problema central es que las operaciones de stock no son atómicas y los errores se silencian sistemáticamente.

**Lo que está bien:**
- Sanitización HTML con DOMPurify en exports
- `.env.local` excluido de git
- RPC `get_users_safe()` no expone contraseñas al cliente
- Validación de stock en el modal `LogMovementModal` (caso feliz)
- Sistema de export/import JSON como backup manual
- Arquitectura dual localStorage + Supabase con fallback funcional

---

## HALLAZGOS

### 🔴 CRÍTICO — Rompen la integridad del inventario

---

**[C-1] Borrar un movimiento NO revierte el stock**  
*Qué es:* `handleDeleteMovement` en `App.tsx:210-213` elimina el registro del movimiento pero no ajusta la cantidad del ítem.  
*Por qué importa:* Si se borra una salida de 5 unidades, el stock no vuelve a subir 5. El inventario queda incorrecto de forma permanente. No hay forma de detectarlo.  
*Dónde:* `App.tsx:209-213`, `MovementsView.tsx:200-204`  
*Cómo arreglarlo:* Al borrar un movimiento, calcular el delta inverso y aplicarlo al ítem. O directamente prohibir borrar movimientos y usar un movimiento de corrección en su lugar.

---

**[C-2] Stock puede quedar negativo por el chat (FloatingChat)**  
*Qué es:* `handleConfirmExit` y `handleConfirmBulk` en `FloatingChat.tsx:365-427` crean movimientos de salida sin validar si hay stock suficiente.  
*Por qué importa:* El modal `LogMovementModal` sí valida, pero el chat (que es la vía más usada) no. Se puede despachar 10 palas cuando hay 2 disponibles.  
*Dónde:* `FloatingChat.tsx:368-378`, `FloatingChat.tsx:395-414`  
*Cómo arreglarlo:* Agregar la misma validación `quantity > item.quantity → error` antes de llamar `onLogMovements()`.

---

**[C-3] Movimiento + actualización de stock no son atómicos**  
*Qué es:* `handleLogMovement` hace dos llamadas Supabase independientes: primero `addMovement()`, luego `updateItemQuantity()`. Si falla la segunda, el movimiento queda registrado pero el stock no se actualiza.  
*Por qué importa:* El inventario puede quedar con movimientos que no se reflejan en el stock, o viceversa. No hay transacción que los agrupe.  
*Dónde:* `App.tsx:192-207`  
*Cómo arreglarlo:* Crear una función RPC en Supabase que ejecute ambas operaciones en una sola transacción PostgreSQL. `CALL log_movement_and_update_stock(...)`.

---

**[C-4] Race condition: dos usuarios sobre el mismo ítem**  
*Qué es:* Si dos usuarios sacan el mismo ítem simultáneamente, ambos leen `quantity = 5`, ambos calculan `5 - 3 = 2`, el segundo `updateItemQuantity` sobrescribe al primero. Stock final: 2 en lugar de -1 que debería dar error.  
*Por qué importa:* En escenarios reales (bodeguero en campo + supervisor en oficina) esto ocurre. El stock mostrado es incorrecto sin que nadie lo note.  
*Dónde:* `App.tsx:196-204`, `supabaseService.ts:141-147`  
*Cómo arreglarlo:* Usar `UPDATE items SET quantity = quantity - $delta WHERE id = $id AND quantity >= $delta` con check en el resultado. Si 0 rows afectadas → conflicto.

---

**[C-5] Errores de Supabase silenciados sistemáticamente**  
*Qué es:* Múltiples `.catch(() => {})` vacíos que descartan errores sin log ni feedback.  
*Por qué importa:* Si Supabase está caído o hay un error de DB, la app muestra datos correctos (localStorage) pero nada se está guardando. El usuario no sabe que está perdiendo datos.  
*Dónde:*  
- `App.tsx:86-91` — todos los fetches iniciales  
- `App.tsx:201` — `updateItemQuantity`  
- `App.tsx:298` — `deleteUser`  
- Múltiples handlers en `App.tsx`  
*Cómo arreglarlo:* Reemplazar `.catch(() => {})` por `.catch(err => console.error('[Supabase]', err))` como mínimo. Idealmente mostrar un toast con "Error al guardar, reintentando...".

---

### 🟡 IMPORTANTE — Degradan seguridad, confiabilidad o UX

---

**[I-1] Contraseñas en texto plano**  
*Qué es:* `AppUser.password: string` en `types.ts:11`. `addUser()` en `supabaseService.ts:384` inserta la contraseña tal cual. `realData.ts` tiene contraseñas hardcodeadas en el seed.  
*Por qué importa:* Si alguien accede a la tabla `app_users` en Supabase (por RLS mal configurado o acceso directo), ve las contraseñas.  
*Dónde:* `types.ts:11`, `supabaseService.ts:381-388`, `realData.ts`  
*Cómo arreglarlo:* Usar `bcrypt` antes de insertar. O migrar completamente a Supabase Auth (la solución correcta a largo plazo).

---

**[I-2] Autenticación 100% client-side**  
*Qué es:* Login es hacer clic en una tarjeta. La sesión se guarda en localStorage como `{"role":"owner","name":"Juli"}`. Cualquiera puede abrir DevTools y cambiar el rol.  
*Por qué importa:* Un usuario EMPLOYEE puede convertirse en OWNER en 3 segundos. No hay validación server-side del rol en ninguna operación.  
*Dónde:* `LoginView.tsx:9-12`, `App.tsx:55-68`  
*Cómo arreglarlo:* Migrar a Supabase Auth + JWT. El rol debería viajar en el token firmado, no en localStorage.

---

**[I-3] Anon key de Supabase hardcodeada en código fuente**  
*Qué es:* `lib/supabase.ts` tiene la URL y anon key hardcodeadas como fallback si las variables de entorno no están.  
*Por qué importa:* Estas credenciales quedan en el historial de git para siempre. El anon key en sí es público (es el design de Supabase), pero cualquier lógica de RLS que dependa del origen del request puede ser eludida.  
*Dónde:* `lib/supabase.ts:3-8`  
*Cómo arreglarlo:* Eliminar el fallback hardcodeado. Si no hay `.env`, lanzar error claro en dev y fallar el build.

---

**[I-4] Sin rollback optimista: UI muestra estado incorrecto si Supabase falla**  
*Qué es:* El estado local se actualiza inmediatamente (optimistic update), pero si la llamada a Supabase falla, no hay rollback. La UI muestra el stock "correcto" pero la DB tiene el dato viejo.  
*Por qué importa:* Al recargar la app (que carga desde Supabase si hay datos), el estado vuelve al anterior. El usuario cree que guardó, no guardó.  
*Dónde:* `App.tsx:192-207` (handleLogMovement)  
*Cómo arreglarlo:* En el `catch` del `withSync`, revertir el estado local al valor anterior.

---

**[I-5] TypeScript strict: false**  
*Qué es:* `tsconfig.json` tiene `"strict": false`. Desactiva null checks, implicit any, y otras protecciones.  
*Por qué importa:* Abre la puerta a errores de runtime que TypeScript normalmente detectaría en compilación (undefined access, wrong types).  
*Dónde:* `tsconfig.json`  
*Cómo arreglarlo:* Activar `"strict": true` e ir corrigiendo los errores que aparezcan. La mayoría serán `?.` opcionales faltantes.

---

**[I-6] El empleado (EMPLOYEE) ve datos sensibles**  
*Qué es:* El rol EMPLOYEE tiene acceso de lectura a `MovementsView`, `LoansView` y puede ver teléfonos de personal en `PersonnelDetailModal`.  
*Por qué importa:* En una obra con contratistas, exponer el kardex completo, los nombres de todos los trabajadores y sus teléfonos puede no ser deseable.  
*Dónde:* `LoansView.tsx`, `MovementsView.tsx`, `PersonnelDetailModal.tsx`  
*Cómo arreglarlo:* Definir explícitamente qué puede ver cada rol. Ocultar kardex y teléfonos a EMPLOYEE.

---

**[I-7] Timestamp de movimientos siempre a medianoche**  
*Qué es:* `LogMovementModal` construye el timestamp como `new Date(movDate + 'T00:00:00')`. Todos los movimientos del mismo día tienen exactamente la misma hora.  
*Por qué importa:* El kardex pierde orden intradiario. Si se registran 5 movimientos el mismo día, no hay forma de saber cuál fue primero.  
*Dónde:* `LogMovementModal.tsx:50`  
*Cómo arreglarlo:* Cambiar el input de `date` a `datetime-local`, o al menos agregar un campo de hora separado.

---

**[I-8] Sin audit log de usuario: ¿quién hizo qué?**  
*Qué es:* El modelo `Movement` no registra qué usuario (AppUser) creó el movimiento. Solo registra el `personnelId` (trabajador que recibe), no el `userId` (operador que registró).  
*Por qué importa:* En cualquier auditoría real, la pregunta "¿quién sacó estas 10 palas?" tiene dos partes: el trabajador que las llevó Y el bodeguero que lo registró. Solo existe la primera.  
*Dónde:* `types.ts:Movement`  
*Cómo arreglarlo:* Agregar `createdBy?: string` al modelo Movement. Poblar con el `userName` de sesión al crear.

---

**[I-9] Borrar un ítem elimina su historial de movimientos en cascada**  
*Qué es:* Si se borra un ítem, todos sus movimientos quedan huérfanos (o se eliminan por CASCADE en DB). No hay soft-delete.  
*Por qué importa:* Se pierde la trazabilidad. Si un taladro se dio de baja, ya no se puede saber quién lo tuvo prestado.  
*Dónde:* `App.tsx:185-190`, `supabaseService.ts:136-139`  
*Cómo arreglarlo:* Implementar soft-delete con campo `deletedAt`. Los ítems eliminados se ocultan pero se conserva el historial.

---

**[I-10] window.confirm() en 5 lugares diferentes**  
*Qué es:* Se usa el dialog nativo del browser para confirmaciones críticas.  
*Por qué importa:* `window.confirm()` está bloqueado en algunos navegadores móviles cuando la app está embebida en WebView. En Safari iOS puede no mostrarse.  
*Dónde:* `MovementsView.tsx`, `LoansView.tsx`, `PersonnelDetailModal.tsx`, `App.tsx:139`, `UserManagementModal.tsx`  
*Cómo arreglarlo:* Reemplazar con un modal de confirmación React (ya existe el patrón en el codebase, ej: `OnboardingModal`).

---

### 🟢 DESEABLE — Mejoran calidad, escalabilidad o funcionalidad

---

**[D-1] Cero tests**  
No hay un solo archivo de test en el proyecto. No hay configuración de Vitest, Jest ni ningún framework. La lógica crítica (stock mutations, loan tracking, date parsing) no tiene cobertura.  
*Cómo arreglarlo:* Empezar con tests unitarios para `handleLogMovement`, `groupLoans` (PersonnelDetailModal) y los parsers del copilot.

---

**[D-2] App.tsx monolítico (>500 líneas de estado)**  
Todo el estado de la app, todos los handlers y todo el routing viven en un solo archivo. Dificulta el mantenimiento y el onboarding.  
*Cómo arreglarlo:* Extraer el estado en contextos o un custom hook `useInventoryState()`. Dividir handlers por dominio (useItemHandlers, useMovementHandlers).

---

**[D-3] 7 componentes muertos (~700 líneas)**  
`FilteredInventoryView`, `ReportView`, `PrintReportView`, `PersonnelDetailModal`, `StartBusinessModal`, `StatisticsView`, `StockAnalysisView` — importados en algún momento pero ya no usados.  
*Nota:* `PersonnelDetailModal` SÍ se usa (importado en `PersonnelView.tsx`). Los demás son candidatos a eliminar.  
*Cómo arreglarlo:* Verificar imports con `grep -r "import.*ComponentName"` y eliminar los confirmados como muertos.

---

**[D-4] localStorage sin límite de crecimiento**  
El storage guarda todos los movimientos históricos. Con ~10k movimientos el JSON supera los 5MB del límite de localStorage.  
*Cómo arreglarlo:* Paginar movimientos históricos. Solo guardar en localStorage los últimos 90 días; los anteriores solo en Supabase.

---

**[D-5] GEMINI_API_KEY ausente en .env.local**  
El copilot AI (`copilotService.ts`) requiere `GEMINI_API_KEY` pero no está en `.env.local`. La feature falla silenciosamente en producción.  
*Dónde:* `vite.config.ts`, `services/copilotService.ts`  
*Cómo arreglarlo:* Agregar la key al `.env.local`. Agregar validación en startup: si no existe, deshabilitar el botón del copilot con tooltip.

---

**[D-6] Funcionalidades estándar ausentes vs. apps comerciales**  

| Funcionalidad | Apps comerciales | Esta app |
|---|---|---|
| Historial de edición por campo | ✅ | ❌ |
| Multi-almacén / multi-sede | ✅ | ❌ |
| Transferencias entre bodegas | ✅ | ❌ |
| Alertas automáticas de stock bajo (email/push) | ✅ | ❌ |
| Export a Excel/CSV | ✅ | Solo JSON |
| Foto de ítem | ✅ | ❌ |
| QR/código de barras por ítem | ✅ | ❌ |
| Número de serie por herramienta | ✅ | ❌ |
| Historial de mantenimiento de equipos | ✅ | ❌ |
| Gestión de proveedores completa | ✅ | Parcial |
| Firma digital en entregas | ✅ | ❌ |
| App nativa (offline first) | ✅ | ❌ (PWA parcial) |
| Reportes automáticos programados | ✅ | ❌ |
| Integración contable | ✅ | ❌ |

*Nota: no todas son necesarias para el caso de uso actual. Las más prioritarias para una bodega de construcción: alertas de stock + export Excel + número de serie.*

---

## ROADMAP DE MEJORA

### Fase 1 — URGENTE (esta semana)
Estos bugs pueden corromper datos hoy mismo:

1. **[C-1]** Revertir stock al borrar movimiento
2. **[C-2]** Validar stock en FloatingChat antes de confirmar salidas
3. **[C-5]** Agregar logging a todos los `.catch(() => {})` — al menos `console.error`
4. **[I-10]** Reemplazar `window.confirm()` con modal React

### Fase 2 — MEDIANO PLAZO (próximas 2-4 semanas)
Mejoras de confiabilidad y seguridad:

5. **[C-3]** Crear RPC Supabase que agrupe movimiento + stock en una transacción
6. **[C-4]** Actualizar stock con `UPDATE ... WHERE quantity >= delta` (optimistic lock)
7. **[I-4]** Implementar rollback de UI cuando Supabase falla
8. **[I-7]** Cambiar input de fecha a `datetime-local` para preservar hora
9. **[I-8]** Agregar `createdBy` a Movement para audit log
10. **[I-5]** Activar TypeScript strict y corregir errores

### Fase 3 — A FUTURO (cuando escale)
Inversión justificada si el uso crece:

11. **[I-1] + [I-2]** Migrar a Supabase Auth (elimina problema de contraseñas y autenticación client-side)
12. **[I-9]** Soft-delete para ítems y movimientos
13. **[D-1]** Agregar Vitest + tests unitarios para lógica crítica
14. **[D-2]** Refactorizar App.tsx en contextos/hooks por dominio
15. **[D-6]** Export a Excel, alertas de stock bajo, números de serie

---

## MÉTRICAS RÁPIDAS

| Métrica | Valor |
|---|---|
| Archivos TypeScript | ~45 |
| Líneas de código (sin node_modules) | ~6.000 |
| Tests | **0** |
| Hallazgos críticos | 5 |
| Hallazgos importantes | 10 |
| Hallazgos deseables | 6 |
| Componentes muertos | 6-7 |
| Cobertura de errores Supabase | ~10% (casi todo silenciado) |
| TypeScript strict | **Desactivado** |
