# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Vite, localhost:5173)
npm run build        # Production build (vite build only — does NOT type-check)
npm run lint         # Type-check (tsc --noEmit). No ESLint configured.
npm run preview      # Preview production build locally
```

Always run `npm run lint` before considering a change done — `build` alone will not catch type errors. There is no test framework configured (0 tests).

Environment variables (in `.env.local`, required — `lib/supabase.ts` throws on startup if missing):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`GEMINI_API_KEY` / `process.env.API_KEY` (still referenced in `vite.config.ts`) are legacy and no longer used — the AI copilot now runs a local in-browser model.

## What this app is

Warehouse/inventory management ("Bodega Inventario") for **Grupo Montecielo**, a construction company. Tracks tools, PPE and consumables; loans to personnel; purchase orders; projects; and traceability. UI text, domain terms, code comments, and commit messages are in **Spanish**. Real production users are seeded in `realData.ts` (owner "Juli", employees "Camilo" and "Kate").

## Architecture

**Stack:** React 18 + TypeScript + Vite + Supabase (Postgres). Tailwind is loaded via CDN `<script>` in `index.html` (the `tailwindcss` devDependency is not the styling path — don't add a Tailwind build step without checking `index.html`). No router — single-page app with manual view state. TypeScript `strict` is off.

**State management:** All app state lives in `App.tsx` (~1100 lines) as `useState` hooks, passed down as props. No context, Redux, or state library.

### Persistence: dual-layer (Supabase + localStorage)

Supabase is the **primary store**; localStorage is an offline cache and instant-load layer. The flow:

1. **Synchronous init:** `useState` initializers call `loadInitialData()` (`storage.ts`, cached single parse of localStorage), falling back to seeds from `realData.ts` (re-exported by `mockData.ts` under `mock*` names).
2. **Auto-save:** a `useEffect` writes all state to localStorage on every change (`saveToLocalStorage`). Passwords are blanked before persisting; only SHA-256 hashes (`utils/hash.ts`) are kept for offline login.
3. **Mount-time hydration/merge:** a `useEffect` in `App.tsx` fetches all entities from Supabase, dedupes personnel/projects by name, remaps legacy non-UUID ids (`i-…`, `mov-…`, etc.) to `crypto.randomUUID()`, merges local-only records, and bulk-upserts them back to Supabase.
4. **Writes:** every handler does an **optimistic local `setState` first**, then fires the Supabase call in the background wrapped in `withSync(...)`, which drives the `syncStatus` indicator (`idle | syncing | error`). Follow this pattern for any new mutation.

**Atomic stock operations:** movement logging and deletion go through Postgres RPCs (`log_movement_and_update_stock`, `delete_movement_and_revert_stock` in `supabase/migrations/20260610120000_atomic_stock_movements.sql`) so stock updates and movement rows change in one transaction, with server-side protection against negative stock and races. Do not reintroduce separate `addMovement` + `updateItemQuantity` calls for stock-affecting movements.

**ID convention:** new entities get `crypto.randomUUID()` client-side, passed to the insert so local and DB ids match.

**Naming convention:** DB columns are `snake_case`, TypeScript is `camelCase`. All mapping lives in `services/supabaseService.ts` (`dbToItem`/`itemToDb` etc.) — when adding a field, update both mappers, `types.ts`, and a migration.

### Core data model (`types.ts`)

| Entity | Key fields |
|---|---|
| `AppUser` | id, username, passwordHash (SHA-256, local), role (owner/employee/visitor), name, setupComplete |
| `Item` | id, name, category, subCategory, inventoryType, quantity, minStock, price, unit, color?, brand?, requiresReturnNote? |
| `Movement` | id, itemId, type, quantity, timestamp, personnelId?, projectId?, isLoan?, isReturned?, pendingPickup?, returnCondition?, returnNotes? |
| `Personnel` | id, name, phone?, isTeamLeader?, teamLeaderId? |
| `PurchaseOrder` | id, supplier, items[], status, orderDate, expectedDeliveryDate?, receivedDate? |
| `Project` | id, name, description?, status (active/completed) |
| `AuditLog` | id, timestamp, action, actor, description — synced to Supabase |
| `BehaviorLog` | id, timestamp, actor, action, detail — local only |

`AppData` in `storage.ts` is the canonical shape of everything persisted locally.

**Enum values are Spanish strings persisted in the database** (`InventoryType`, `MovementType`, `PurchaseOrderStatus` — e.g. `CHECK_OUT = 'Salida'`). Never rename these values; it would corrupt stored data and break the SQL RPCs, which match on the literal strings `'Salida'`/`'Merma'`.

**Inventory types:** `HAND_TOOL` and `ELECTRICAL_TOOL` are capital assets; `PPE` and `SINGLE_USE` are consumable expenses (analytics in `services/geminiService.ts` rely on this split).

**Movement types:** `CHECK_OUT` and `WASTE` decrease item quantity; `PURCHASE` and `CHECK_IN` increase it. A loan is a `CHECK_OUT` movement with `isLoan: true`; `isReturned`, `pendingPickup`, and `returnCondition` track its lifecycle (LoansView, PickupView).

**Genus/species grouping:** `utils/genus.ts` clusters item variants — `getGenus()` strips a trailing parenthetical (`"Martillo (grande)"` → `"Martillo"`), and fuzzy matching (edit distance ≤ 1 on normalized names) merges near-duplicate genera. Used by inventory and loans views for grouped display.

### Views (`App.tsx` `View` type)

`dashboard` | `kardex` | `personnel` | `copilot` | `help` | `whatsapp` | `pickup` | `traceability`

`kardex` is a hub (`components/KardexHub.tsx`) with tabs: `movements` | `loans` | `inventory` | `projects`. Purchase orders, statistics, reports, and stock analysis are reached through these views/components rather than top-level routes.

### Authentication & roles

- Login validates against the Supabase RPC `authenticate_user` (passwords live only in the database, never in source — `realData.ts` seeds have empty `password` fields). The SHA-256 hash kept in localStorage enables offline fallback login.
- Session persists in localStorage under `bodega_session`.
- Three roles (`UserRole`): `owner` (everything), `employee` and `visitor` gated by per-role view allowlists in `App.tsx` (`EMPLOYEE_VIEWS`, `VISITOR_VIEWS`) plus `userRole` checks throughout components.
- Destructive actions (delete item/movement, etc.) require PIN re-confirmation via `requirePin` → `PinConfirmModal`.
- Legacy user names are normalized on load (`Julio`/`Administrador` → `Juli`) — keep the `NAME_FIX` maps in mind when touching user/audit data.

### Services (`services/`)

- `supabaseService.ts` — all Supabase CRUD + RPC calls + bulk upserts; the only file that talks to the DB besides `lib/supabase.ts` (client singleton).
- `geminiService.ts` — **misnamed**: pure TypeScript analytics engine, no external API. Generates markdown inventory reports (COP currency, asset/expense split).
- `copilotService.ts` — AI copilot chat running **locally in the browser** via `@huggingface/transformers` (model `Xenova/LaMini-Flan-T5-248M`, ~250MB downloaded on first use). No API key, no server calls.
- `documentParserService.ts` — parses invoices/inventory docs fully client-side: PDF (pdfjs-dist), images via OCR (tesseract.js), DOCX (mammoth), XLSX (SheetJS), CSV/TXT.
- `docxExportService.ts` — Word report generation (`docx` lib) matching the Montecielo brand template.
- `whatsappService.ts` — loan-reminder messages via `wa.me` links; reminder log in localStorage (8-day interval).
- `notificationService.ts` — Web Notifications through the service worker (`public/sw.js`) for pending-pickup alerts.

### Key files

- `App.tsx` — root component: all state, view routing, role gating, Supabase hydration/merge, all mutation handlers, modal orchestration
- `types.ts` — all interfaces and enums
- `storage.ts` — localStorage persistence, JSON export/import backup
- `realData.ts` — production seed data (users, personnel, projects, items, movements); `mockData.ts` just re-exports it
- `constants.ts` — category list, purchase order status colors
- `utils/genus.ts` — item name clustering/fuzzy matching; `utils/hash.ts` — SHA-256 helper
- `supabase/migrations/` — SQL migrations (atomic stock RPCs)

## Audits and known issues

`AUDITORIA.md` (2026-05-21) and `AUDITORIA-2026-06-10.md` track security/integrity findings with IDs (C-1…, N-…, D-…). Read the latest one before touching stock logic, auth, or the startup merge — several fixes reference these IDs in commit messages. Known accepted issues: `xlsx` has an unfixed high-severity advisory; the production JS chunk is large (~1.1 MB).

## Deployment

Deployed on Vercel (env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` configured there). `netlify.toml` is an empty leftover. The app registers `public/sw.js` for push/pickup notifications.
