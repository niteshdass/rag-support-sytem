# Design: Admin Dashboard SPA Scaffold

**Date:** 2026-05-05
**Status:** Approved

---

## Goal

Create `/web` — a Vite + React SPA scaffold for the SupportPilot admin dashboard. Placeholders only; no real feature logic yet. Wires into the existing Express API at `:3000`.

---

## Architecture

`/web` is a fully independent frontend package. The Express backend (`/src`) stays untouched except for one new script in root `package.json`. During development Vite's dev server proxies all `/api/*` requests to `http://localhost:3000`, so the browser never sees a CORS issue.

### shadcn approach: manual config (no CLI)

`shadcn/ui` is configured by hand:
- `tailwind.config.js` — content paths + CSS variable extension
- `components.json` — style, baseColor, paths for shadcn's own tooling
- `src/index.css` — Tailwind directives + shadcn HSL CSS variable block
- `src/lib/utils.ts` — `cn()` helper (`clsx` + `tailwind-merge`)

No interactive `npx shadcn init` needed. Components added via `npx shadcn add <component>` later.

---

## File Structure

```
web/
├── package.json              # deps + scripts: dev, build, preview
├── vite.config.ts            # server.proxy: /api → :3000
├── tsconfig.json             # strict, paths alias @/ → src/
├── tailwind.config.js        # content: ['./src/**/*.{ts,tsx}']
├── postcss.config.js         # autoprefixer + tailwindcss
├── components.json           # shadcn manual config
├── index.html
├── .env.example              # VITE_API_URL=http://localhost:3000
└── src/
    ├── main.tsx              # createRoot + QueryClientProvider
    ├── App.tsx               # BrowserRouter, routes
    ├── index.css             # @tailwind directives + CSS vars
    ├── lib/utils.ts          # cn() helper
    └── pages/
        ├── Login.tsx         # centered card, no form logic
        └── Dashboard.tsx     # sidebar + header shell, no logic
```

---

## Routing

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `Dashboard.tsx` | placeholder layout |
| `/login` | `Login.tsx` | placeholder card, no auth logic |

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `react`, `react-dom` | UI runtime |
| `react-router-dom` v6 | client-side routing |
| `@tanstack/react-query` | server state (wired in `main.tsx`, used later) |
| `tailwindcss`, `autoprefixer`, `postcss` | styling |
| `clsx`, `tailwind-merge` | `cn()` helper |
| `@types/react`, `@types/react-dom` | TS types |

---

## Root Package Change

```json
"dev:web": "cd web && npm run dev"
```

Added to root `package.json` `scripts`.

---

## Acceptance Criteria

- `cd web && npm install && npm run dev` → loads at `:5173`
- Browser requests to `/api/health` proxy to `:3000` and return `{ ok: true }`
- TypeScript strict mode, no errors on `tsc --noEmit`
- No shadcn CLI needed; `components.json` present for future `npx shadcn add`

---

## Out of Scope

- Real auth logic in Login.tsx
- Any data fetching (TanStack Query wired but unused)
- Additional pages (Sources, Documents, Activity, etc.) — future prompts
- Widget (`/widget`) — separate build, separate prompt
