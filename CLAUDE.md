# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Vite, localhost:5173)
npm run build        # Production build ONLY — does NOT check types
npm run lint         # Type-check (tsc --noEmit, no ESLint configured)
npm run test         # Run the test suite (tsx, no framework)
npm run preview      # Preview production build locally
```

**`build` does not type-check.** It is `vite build` and nothing else. Run
`npm run lint` **and** `npm run build` separately — a type error will not fail
the build, and this file used to claim otherwise.

Environment variables required (`.env.local`):
```
VITE_SUPABASE_URL=...        # Supabase project URL
VITE_SUPABASE_ANON_KEY=...   # Supabase public key
```

`GEMINI_API_KEY` appears in the README but is **not read anywhere in the code**.
It is leftover from the AI Studio template. Likewise `@huggingface/transformers`
and `initModel()` in `services/copilotService.ts`: nothing calls them. The
copilot answers through `warehouseQA.ts`, which is plain TypeScript.

## Tests

`tests/` holds plain `tsx` scripts with a thirty-line runner (`tests/correr.ts`),
not Vitest or Jest. `tsx` is invoked through `npx`, **not** declared as a
devDependency: adding it to `package.json` without regenerating the lockfile
broke `npm ci` entirely. `npm install` cannot run here (`xlsx` comes from a
blocked CDN), **but the lockfile CAN be regenerated without installing**:
`npm install --package-lock-only` / `npm audit fix --package-lock-only` reuse
the `xlsx` entry already in the lock. That is how the 3-oct-2026 lock was made;
validate by installing from it in a scratch copy before committing.

Add a `tests/*.test.ts` file and `npm run test` picks it up.

**Why no framework:** `npm install` fails in some sandboxes because `xlsx` is
fetched from `cdn.sheetjs.com`. A framework that could not be executed there
would mean writing tests nobody ran.

**The suites used to cover only the core.** An external audit found eight
defects in a tree whose suites were fully green — every one of them lived in the
UI, in the HTTP handler, or in the ORDER of network writes. Two things changed
because of that, and both are load-bearing:

- `tests/pantalla.test.ts` runs the real batch-dispatch handlers out of
  `FloatingChat.tsx`, extracted with the TypeScript AST and executed with their
  dependencies supplied by hand. It is not a copy: rename or move a handler and
  the test **throws by name** instead of silently passing against old code.
- The identity that prevents double-registration lives in `api/identidad.ts`,
  separate from `api/despacho.ts`, so `tests/endpoint.test.ts` can import the
  deployed function. It previously re-implemented the formula inline and stayed
  green while the shipped one was reporting phantom writes.

Every suite also has a **mutation check** behind it: the fix was reverted on
purpose and the suite was watched to go red. This is not ceremony — one suite
here passed with its defect inside because the fixture used ids that did not
reproduce the condition, and only the mutation check caught it.

`tests/correr.ts` awaits async group bodies and runs groups **serially**. Call it
as `await cerrar()`. An earlier version ignored a promise-returning body: the
group printed "✓ todo bien" before a single assertion had run.

**Run `node verificar-lint.cjs`, and judge it by its EXIT CODE.** Plain
`npm run lint` always exits 2 here — six real dependencies cannot be installed
(`xlsx` comes from a blocked CDN and kills any `npm install`), so a permanently
red exit code trains you to read the output by eye, which is how the break below
shipped. The wrapper separates environment errors from code errors, and **fails
loudly when tsc aborts without checking anything**.

**Run `npm run lint` by its EXIT CODE, never by reading its output.** In a
sandbox without `vite` installed, `tsconfig.json`'s `types: ["vite/client"]`
makes tsc abort with TS2688 and check **nothing** — it looks clean and is not.
That hid a shipped break where a changed return type left two of three callers
broken. If `vite` cannot be installed (the `xlsx` CDN is blocked, which kills any
`npm install`), install the type-bearing packages into a scratch directory and
copy them into `node_modules`.

Still uncovered: browser-level journeys (clicking, reloading, verifying what
persisted) and a true two-session concurrency test — PGlite runs on one
exclusive connection, so it cannot prove a race.

## Architecture

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS. No router — single-page app with manual view state. No test framework configured.

**State management:** All app state lives in `App.tsx` as `useState` hooks. State is persisted to `localStorage` on every change via a `useEffect` that calls `storage.ts`. On mount, state initializes from localStorage, falling back to `mockData.ts`.

**One writer per row.** The startup merge and the queue both fire when the signal
returns, and they used to race: the merge uploaded a movement row through
`bulkUpsertMovements` — which writes **without the stock RPC** — and the queue
then found the id already present and skipped it, so **the row landed and the
quantity never moved**. `idsTocados(cola)` in `core/cola.ts` lists what the queue
owns; the merge skips those ids, and `procesarCola()` runs *before* the merge
rather than beside it.

**Writes go through a durable queue.** `withSync(tipo, args, descripcion)` records
*what* the app wants to do — not a launched promise — into `core/cola.ts`
**before** attempting it, so a write in flight when the app closes survives and
is retried. `tipo` names a function in `services/supabaseService.ts`; `args` must
be serializable (Dates are revived on read). Failures count up to
`LIMITE_INTENTOS` and then **block rather than disappear**, surfacing in
`components/PendientesView.tsx`, where a person can retry or discard **with a
stated reason**. The previous `withSync(promise)` could not retry anything: a
launched promise has already run and is not data.

**Data flow:** `App.tsx` owns all data and passes handlers down as props. There is no context, Redux, or other state library.

### Core data model (`types.ts`)

| Entity | Key fields |
|---|---|
| `AppUser` | id, username, password (plain text), role (owner/employee) |
| `Item` | id, name, category, subCategory, inventoryType, quantity, minStock, price, unit |
| `Movement` | id, itemId, type, quantity, timestamp, personnelId?, projectId?, isLoan?, isReturned? |
| `Personnel` | id, name |
| `PurchaseOrder` | id, supplier, items[], status, orderDate, expectedDeliveryDate?, receivedDate? |
| `Project` | id, name, description?, status (active/completed) |

**Inventory types** (`InventoryType` enum): `HAND_TOOL`, `ELECTRICAL_TOOL`, `PPE`, `SINGLE_USE`. The first two are treated as capital assets; the latter two as consumable expenses in analytics.

**Movement types** (`MovementType` enum): `PURCHASE`, `CHECK_IN`, `CHECK_OUT`, `WASTE`. `CHECK_OUT` and `WASTE` decrease item quantity; others increase it.

**Loan tracking:** A `Movement` with `isLoan: true` and `type: CHECK_OUT` represents a loan.
**A return is its own `CHECK_IN` movement pointing at the loan through `devuelveA`**
(since 28 Sep 2026). The loan row is never mutated in quantity: what is still out
is `quantity − sum(returns)`, computed by `pendienteDe`. Lend 3, return 1, return 1
→ one loan of 3, two return rows, 1 pending. `isReturned` is set only when nothing
is left out, and is kept because thousands of older rows were closed that way
(all-or-nothing, stock restored by `return_loan_and_restore_stock` with **no**
entrada row).

**Always ask `getActiveLoans` what is out — never filter `isLoan && !isReturned`
by hand.** It returns each loan with `quantity` set to what is STILL out (a copy
only when something came back). There were ~20 hand-rolled filters; they were
all routed through it when partial returns landed, because a hand-rolled one
shows "Pala ×3" after one of the three came back.

Closing a loan after its last return uses `markMovementReturned` (a plain
update), **not** `returnLoanAndRestoreStock` — the return's entrada already
restored the stock, and that function would restore it a second time.

**The pasted block («Despacho por bloque») follows the CHAT's logic, all of it.**
Headers `@ obra · hora · lugar` set project, time and place for the lines below;
`Name (cuadrilla de X)` names a crew. Project is ASKED like the chat's step (the
top select starts unanswered; «Sin proyecto» is an answer) and is mandatory only
for `SINGLE_USE` — one rule, `tipoExigeObra` in `core/despacho.ts`, used by the
chat, the block and `/api/despacho`. An oficial asks «¿para quién de su
cuadrilla?»; a new person is created only when someone picks «➕ Crear» on
screen. `core/verificacion.ts` checks the block against the warehouse (already
lent to someone else, duplicate, missing stock…); only READY items register, the
rest stays on screen. `tests/pantalla.test.ts` proves the chat's real
`handleConfirmWizard` and the block produce the same movements.

**The block has a second, official format since 5 Oct 2026: `=== ENTREGA ===`,
one per worker** (`TRABAJADOR:`, `PROYECTO:`, optional `HORA:`/`LUGAR:`, then
`[CONSUMIBLES]`/`[HERRAMIENTAS MANUALES]`/`[HERRAMIENTAS ELÉCTRICAS]`/`[EPP]`
and `- qty name` lines). `leerLote` reads both formats and turns each entrega
into the SAME `LineaLote` the old one produces — verification, summary,
register and `/api/despacho` are untouched; `tests/pantalla.test.ts` proves both
formats register identical movements. `ItemLote.categoria` only decides how a
NEW item is born (`marcarNuevo`); for an existing item the warehouse type wins
(loan vs expense) and a mismatch raises `categoria` at level `mirar` (Accesorio
vs Consumible is not a mismatch). The assistant's prompt and knowledge are
`asistente/INSTRUCCIONES.md` + `asistente/BODEGA-MONTECIELO.md`;
`tests/documentos.test.ts` parses the blocks written in them with the real
reader, so the docs and the app cannot drift. «Zona general» is the project
`ZONA GENERAL` (created 5 Oct): consumables need a project and that one counts.

**`FECHA: DD/MM/AAAA` inside an entrega (since 6 Oct 2026)** registers that
entrega on that day (with its `HORA:`); without it, the block's date (today),
as before. `fechaDe(l, general)` (core/verificacion.ts) is the ONE rule for the
timestamp, the «ya le salió» same-day check and the confirmation fingerprint.
`problemaDeFecha` (utils/lote.ts) — shared by the screen and `/api/despacho` —
turns an impossible date (`31/02/2026`) or a future one into a `fecha` alert at
level `decidir`: shown on the worker's card, nothing of that entrega registers,
and it is NEVER silently replaced by today. The API leaves those lines pending.

A bare trailing number is inches only for pipe families (`seMideEnPulgadas`) or
when `"`/«pulgadas» was said: «lija 180» is grit (medida `180`, no quote — still
never swapped for «Lija 240»). Unit abbreviations without «de» (`10 kg lechada`)
are stripped for search and for the new item's name (`sinUnidadDicha`).

**Node is 24.x** (`package.json` engines). Vercel discontinued 20.x on
1 Oct 2026 and every build pinned to it fails before compiling.

**Custody lives in `core/custodia.ts`** (shared by the app and the API, like
`core/despacho.ts`). A transfer between people or worksites is **not** a new
movement type: the stock functions treat anything that is not `Salida`/`Merma`
as an entry, so a `Traslado` type would ADD a tool to the warehouse on every
transfer. Instead the old loan is settled by a linked return and a new loan is
opened with `vieneDe` (the previous loan) and `responsableAnterior` — both rows
`esTraslado`, in ONE batch, stock net zero. Changing the project of a loan that
already had one is a transfer; only filling an empty project overwrites.

**`asignaciones`** holds what is out WITHOUT a confirmed loan — Juli's three
levels: `confirmada` / `posible` / `pendiente_verificar`. Those units are **not
in the book** (not stock, not a loan). They enter it only when resolved, always
through a movement (`Hallazgo` entrada, plus a loan salida if someone has it).
Resolving never rewrites: the original row is closed as it was and any
remainder opens as a new row. A `posible` never becomes a loan by itself.
Unknown fields stay empty and render as «No especificado» — note that `sello()`
fills *now*, so it must never be used for `desde` or `cerrada_en`.

**Géneros above the family: `Item.ruta`** (since 1 Oct 2026, column `items.ruta`).
Text with levels separated by « / », general → particular: `"Tubería / Accesorios"`.
Then `familia` (Codos), then the species = the item with its size (2"). Depth is
free. `construirRuta` (utils/arbol.ts) builds the nested tree; **with no `ruta`
anywhere it returns exactly `construirArbol`'s families** — tested. Editing lives
in `core/organizar.ts` (pure, returns only the changed items) and the «Organizar»
tab of `ReviewFamiliesView` (sidebar: «Organizar bodega»). Every operation shows
a preview and saves through `handleEditItem`. **Reorganizing never touches
`quantity`** — a quantity change writes an adjustment movement to the Kardex.
`ponerMedida` only adds a size to an item WITHOUT one: turning a 2" elbow into a
4" one would carry the 2" stock.

**A dudoso match is a DECISION, not a pick.** `escoger` (utils/lote.ts) returns
the first of two equally good candidates *with* `dudoso: true`; until 1 Oct the
block registered that first one silently (22 of 60 items in the real-data
volume test — «1 pulidora grande» when there are four). `verificarLote` now
raises `elemento`/`persona` at level `decidir` for dudoso, and the selects show
nothing preselected so picking the guessed one fires a change.

**Accessory first, then the size.** `medidaDicha` reads «codos de 4», «codo de
media», «tres cuartos», «2 pulgadas»; `buscarItem` then picks the item of THAT
size among the family. If no item has it, nothing is chosen — never the nearest
size, even when it is the only candidate. When the doubt is only the size, the
`elemento` alert carries `medidas` and the block shows them as buttons.
«2 Y de 2» is the Y fitting, not a conjunction (`partirItems`).

**The block ends like the chat's «Confirmar», per worker** (since 2 Oct 2026).
`components/ResumenTrabajador.tsx` shows worker (crew), project, time, and each
item with quantity, unit and Préstamo/Gasto (`resumenDeLinea`). Only lines with
«✓ Pedido correcto» register. The confirmation is stored with the line's
`huellaDeLinea` and is valid only while the fingerprint matches — moving an
item, changing a quantity, the item or who it is for unconfirms it without any
handler having to remember. It REPLACES the per-item «Verificar» (the summary
shows the `mirar` warnings); `decidir` still blocks. A new item is born through
`core/crearItem.ts` (`fichaDelBloque`: canonical family, corrected name, family +
género + medida, the sibling's `ruta`) and never as a twin (`identicoDe`).
«Sin asignar trabajador» (`l.sinPersona`) and «➕ Obra nueva…» mirror chat steps
2 and 3. Phase B (after Friday): the chat's «+ Crear nuevo» moves onto
`core/crearItem.ts` too.

**`falta_stock` is level `aviso`**: shown, not blocking. No stock → «entra lo que
falta y sale» is the normal case and is consented by «Lo que no haya, cargalo»;
one tap per item was 30 taps per morning. `ya_la_tiene` stays `mirar`.

`seMideEnPulgadas` compares the first word singularized: the real families are
PLURAL («Codos», «Bujes», «Uniones») and none of them used to match.

### Views (`App.tsx` `View` type)

`dashboard` | `inventory` | `movements` | `purchaseOrders` | `personnel` | `projects` | `loans` | `copilot`

Inventory view additionally uses `selectedInventoryType` to filter by category from the sidebar.

### Key files

- `App.tsx` — root component, all state, routing logic, modal orchestration
- `types.ts` — all TypeScript interfaces and enums
- `storage.ts` — localStorage persistence, JSON export/import
- `mockData.ts` — seed data used when localStorage is empty
- `constants.ts` — category list, purchase order status color map
- `services/geminiService.ts` — pure TypeScript analytics engine (no external API despite the filename; generates markdown reports from item/movement data)
- `services/copilotService.ts` — Gemini API integration for the AI copilot chat

### Authentication

**Accounts are managed BY THE SERVER since 2 Oct 2026** (migration
`20261002120000_accesos_por_el_servidor.sql`). `crear_acceso`,
`nuevo_codigo_de_alta`, `editar_acceso` and `borrar_acceso` require an
authenticated administrator (`es_administrador()` → `auth.uid()`); the public key
cannot execute them. `dar_de_alta(id, código, clave)` is the first login: the
server checks the one-time code (bcrypt, 10 attempts), creates the `auth.users`
identity with the SAME e-mail formula as `core/identidad.ts` (tested in
`tests/accesos.test.ts`), and stores the password in NO table. Before this, a new
account could never log in: the code was compared on the phone against a column
the cloud never sends, and no server identity was created. `borrar_acceso` bans
the identity; `restore_user` unbans it. `authenticate_user` (old path) rejects
**L4 is closed (3-oct-2026, `20261003120000` + `20261003130000`):**
`app_users` has no public write policies, `authenticate_user` is DROPPED, every
`app_users.password` is `''`, `restore_user` and `get_deleted_users_safe` are
admin-only, and a wrong `dar_de_alta` code returns EMPTY instead of raising (a
raise rolled back the attempt counter: the 10-attempt cap never counted). Juli's
decision: only Juli has a password; Kate went back to «first time» (her old
two-letter password no longer works; `dar_de_alta` reuses her identity) and,
like Camilo, enters with a code from «🔑 Código». `migrateUsers` uses `??`, not
`||`: deducing «set up» from having a username showed Kate the password screen.
PIN and two-person confirmations verify with `verificarClave` (a separate,
non-persisting client), never with the session in use. «Cerrar sesión» calls
`cerrarIdentidad()` (`signOut` scope `local`).

`index.html` is `lang="es" translate="no"`: it said `en`, the login screen had no
`translate="no"`, and Chrome showed «Juli» as «Julio».

Login is handled entirely in the frontend. `LoginView` receives the `users` array and validates credentials client-side. Passwords are stored in plain text in localStorage. The logged-in role (`owner` | `employee`) gates certain UI actions (delete, add items, etc.) checked via `userRole` prop throughout components.

### Supabase is live, not a future migration

This section used to say the move to Supabase was "planned". It already
happened. The app writes to Supabase **and** keeps localStorage, and `App.tsx`
merges the two on mount — local rows missing from the cloud are uploaded, not
deleted (that merge exists because two users were once lost by replacing the
local list wholesale).

`supabase/migrations/` now opens with **`00000000000000_baseline.sql`**, read
from production on 12 Sep 2026 with `pg_catalog` — types, tables, keys,
constraints, indexes, triggers, policies and functions, copied from what is
installed rather than written from memory. The repo **can** rebuild the server
now; it could not before, and that meant a disaster had no way back.

Verified, not assumed: `node supabase/verificar-baseline.cjs` applies every
migration to an empty PostgreSQL in order and then registers a dispatch to
prove the result is usable. It loads `pgcrypto`, imitates Supabase's default
grants to `anon`/`authenticated` (without that, «the public key cannot read»
passes even with no migration closing it), and EXECUTES the access functions
and the Kardex migration — 20 checks with the role and `sub` set as Supabase
sends them. Install with `npm i --no-save @electric-sql/pglite`. **Run it whenever you add a migration** — one that
only works against the existing database breaks the rebuild silently, and nobody
finds out until the day it matters. `supabase/RESTAURAR.md` is the recovery
procedure, including the kardex reconciliation query that must return zero rows.

One deliberate difference: production generates ids with `uuid_generate_v4()`
(extension `uuid-ossp`); the baseline uses the native `gen_random_uuid()`, so it
runs anywhere.

Before changing the schema, **read what is actually installed** — that is not
advice, it is how the last two findings were resolved. Production was read on 12
Sep 2026 and two beliefs in this file turned out backwards:

- `delete_movement_and_revert_stock` **does** use a tombstone in production. The
  repo was the one lying: it was missing `borrar_movimiento_con_lapida`, applied
  on the server since 6 Sep but never committed. Anyone applying the repo's
  migrations to a fresh project installed the version that **really deletes**.
  The file is now in Git.
- There was **not one `CHECK`** in the whole database. There are two now
  (`movements.quantity > 0`, `items.quantity >= 0`).

`log_movements_and_update_stock` applies a whole dispatch **in one transaction**:
one RPC per movement let the network reorder an automatic entry after its own
checkout. `log_movement_and_update_stock` stays for single movements and as the
fallback path.

**Every relative import reachable from `api/` MUST end in `.js`.** `package.json`
is `"type": "module"` and Vercel compiles each file separately, so Node's ESM
resolver runs for real: `'../core/despacho'` does not exist, `'../core/despacho.js'`
does. All three endpoints crashed in production with `ERR_MODULE_NOT_FOUND` from
PR #76 until 28 Sep 2026 while every suite was green, because `tsx` fills in the
missing extension. `tests/servidor.test.ts` transpiles the whole import graph and
loads each handler in a **separate plain `node`** process (inside tsx the same
check passes with the defect in — it did). Vite and tsc resolve `.js` to `.ts`.

**There IS a backend now**, added in PR #76: `api/despacho.ts` is a Vercel
serverless function that lets an external AI assistant register dispatches
without opening the web app. It uses the Supabase **service role key** and is
gated by `BODEGA_API_TOKEN`, both of which live only in Vercel's environment
variables. See `api/README.md`. This file used to say no backend existed; it did
by the time anyone read that sentence.

**The public key no longer moves inventory (since 3-oct-2026,
`20261003130000_solo_la_bodega.sql`).** Every data table has ONE policy,
`solo_la_bodega`, for `authenticated` with `es_de_la_bodega()`: a session whose
`auth.uid()` is a LIVE `app_users` row (an identity alone — a public sign-up, a
deleted account — is not enough). The five stock functions carry the same guard
and no `anon` EXECUTE. `anon` keeps only `get_users_safe` (the login list) and
`dar_de_alta` (first login, protected by the code). The API uses the service
role and is unaffected.

**The app therefore needs an identity SESSION to read or write.** `App.tsx`
keeps `sesionRef`/`sesionAbierta` from `onAuthStateChange`. Without a session:
`sincronizar` only reads the user list (RLS returns EMPTY lists without error,
and the merge would take them for «the cloud has nothing»), `procesarCola` and
`withSync` do not attempt (nothing burns attempts), and a banner says «Sin
sesión con el servidor». Logging in with the phone fallback (no signal) keeps
the password IN MEMORY ONLY (`recordarParaReconectar`) and `reconectar()` opens
the session when `online` fires. `tests/sesion.test.ts` runs the real
`withSync`/`procesarCola`.

**Reorganizing never sends quantity.** «Organizar bodega» and «Revisar familias»
go through `handleReorganizar` → `reclasificarItem` (name, familia, ruta only),
applied over the mirror (`itemActual`). `updateItem` sends the whole row, and a
stale preview or a lagging phone wrote an old quantity into the cloud.
`gemelosQueNacerian` (core/organizar.ts) blocks renames that would leave two
identical items.

**Kardex is zero** after `20261003140000_kardex_en_cero.sql` (entries added,
stock untouched). `api/latido.ts` + `vercel.json` cron reads one row a day so the
free plan does not pause the project again.

`storage.ts`'s `AppData` interface is still the canonical shape of persisted
data.
