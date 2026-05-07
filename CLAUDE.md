# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Vite, localhost:5173)
npm run build        # TypeScript check + production build
npm run lint         # Type-check only (tsc --noEmit, no ESLint configured)
npm run preview      # Preview production build locally
```

Environment variable required:
```
GEMINI_API_KEY=...   # Set in .env.local for AI copilot features
```

## Architecture

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS. No router — single-page app with manual view state. No test framework configured.

**State management:** All app state lives in `App.tsx` as `useState` hooks. State is persisted to `localStorage` on every change via a `useEffect` that calls `storage.ts`. On mount, state initializes from localStorage, falling back to `mockData.ts`.

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

### Supabase migration target

The app currently uses localStorage. The planned migration to Supabase should map the six `AppData` entities to database tables, replacing `saveToLocalStorage`/`loadFromLocalStorage` in `storage.ts` with Supabase client calls. The `AppData` interface in `storage.ts` is the canonical shape of all persisted data.
