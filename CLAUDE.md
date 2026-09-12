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
broke `npm ci` entirely, and the sandbox that writes this code cannot regenerate
the lockfile because `xlsx` is fetched from a blocked CDN.

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

**Loan tracking:** A `Movement` with `isLoan: true` and `type: CHECK_OUT` represents a loan. `isReturned: true` marks it as returned. `LoansView` filters movements by these flags.

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

Verified, not assumed: `node supabase/verificar-baseline.cjs` applies all 18
migrations to an empty PostgreSQL in order and then registers a dispatch to
prove the result is usable. **Run it whenever you add a migration** — one that
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

**There IS a backend now**, added in PR #76: `api/despacho.ts` is a Vercel
serverless function that lets an external AI assistant register dispatches
without opening the web app. It uses the Supabase **service role key** and is
gated by `BODEGA_API_TOKEN`, both of which live only in Vercel's environment
variables. See `api/README.md`. This file used to say no backend existed; it did
by the time anyone read that sentence.

The browser still talks to Supabase directly with `VITE_SUPABASE_ANON_KEY`,
which is public by design. The stock functions are `security definer` and carry
`anon=X` (verified against production, not inferred): **anyone holding the public
key can move inventory.**

**This cannot be fixed by revoking.** The app *is* `anon`. The eight functions
`anon` can execute are exactly the eight the browser calls — login, log movement,
log batch, delete movement, return loan, read users, read deleted, restore user.
Revoking leaves the app dead, not safer. Closing it requires server-side identity
that does not exist: either moving writes behind `api/despacho.ts` with its
token, or Supabase Auth. Both change how everyone logs in. It is the largest open
risk and it is a project, not a migration.

`storage.ts`'s `AppData` interface is still the canonical shape of persisted
data.
