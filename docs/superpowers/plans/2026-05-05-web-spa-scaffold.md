# Web SPA Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `/web` — a Vite + React + TypeScript SPA scaffold with Tailwind, shadcn/ui (manual config), TanStack Query, and react-router-dom v6 for the SupportPilot admin dashboard.

**Architecture:** `/web` is a self-contained frontend package. Vite dev server proxies `/api/*` → `http://localhost:3000` (stripping the `/api` prefix) so the browser never hits a CORS issue. Backend code is untouched except for one new `dev:web` script in the root `package.json`.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), Tailwind CSS 3, shadcn/ui (manual, no CLI), TanStack Query v5, react-router-dom v6, clsx + tailwind-merge.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `web/package.json` | deps + scripts |
| Create | `web/vite.config.ts` | dev server + proxy |
| Create | `web/tsconfig.json` | TS strict + `@/` alias |
| Create | `web/tsconfig.node.json` | TS for vite.config.ts |
| Create | `web/index.html` | SPA shell |
| Create | `web/.env.example` | env var documentation |
| Create | `web/tailwind.config.js` | content paths + CSS var tokens |
| Create | `web/postcss.config.js` | autoprefixer + tailwindcss |
| Create | `web/components.json` | shadcn manual config |
| Create | `web/src/index.css` | Tailwind directives + shadcn HSL vars |
| Create | `web/src/lib/utils.ts` | `cn()` helper |
| Create | `web/src/main.tsx` | React root + QueryClientProvider |
| Create | `web/src/App.tsx` | BrowserRouter + routes |
| Create | `web/src/pages/Login.tsx` | placeholder login card |
| Create | `web/src/pages/Dashboard.tsx` | placeholder sidebar layout |
| Modify | `package.json` (root) | add `dev:web` script |

---

## Task 1: web/package.json

**Files:**
- Create: `web/package.json`

> Note: This scaffold has no testable units — config files and placeholder UI don't admit unit tests. Verification is done via `tsc --noEmit` and smoke-testing the dev server in Task 8.

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "supportpilot-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.56.2",
    "clsx": "^2.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "tailwind-merge": "^2.5.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.5.3",
    "vite": "^5.4.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd web && npm install
```

Expected: `node_modules/` created, no peer dep errors.

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat(web): add package.json and install deps"
```

---

## Task 2: Vite + TypeScript config + index.html + .env.example

**Files:**
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.node.json`
- Create: `web/index.html`
- Create: `web/.env.example`

- [ ] **Step 1: Create `web/vite.config.ts`**

The proxy strips the `/api` prefix so `/api/health` hits `http://localhost:3000/health`.

```ts
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SupportPilot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/.env.example`**

```
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add web/vite.config.ts web/tsconfig.json web/tsconfig.node.json web/index.html web/.env.example
git commit -m "feat(web): vite config, tsconfig, index.html"
```

---

## Task 3: Tailwind + PostCSS + shadcn components.json

**Files:**
- Create: `web/tailwind.config.js`
- Create: `web/postcss.config.js`
- Create: `web/components.json`

- [ ] **Step 1: Create `web/tailwind.config.js`**

Extends Tailwind with shadcn's CSS variable–based color tokens and border-radius.

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Create `web/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Create `web/components.json`**

This is what `npx shadcn add <component>` reads to know where to place files.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add web/tailwind.config.js web/postcss.config.js web/components.json
git commit -m "feat(web): tailwind + postcss + shadcn components.json"
```

---

## Task 4: src/index.css + src/lib/utils.ts

**Files:**
- Create: `web/src/index.css`
- Create: `web/src/lib/utils.ts`

- [ ] **Step 1: Create `web/src/index.css`**

HSL variable values match shadcn's default slate/white palette.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 2: Create `web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/index.css web/src/lib/utils.ts
git commit -m "feat(web): tailwind CSS vars + cn() util"
```

---

## Task 5: src/main.tsx + src/App.tsx

**Files:**
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 2: Create `web/src/App.tsx`**

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/main.tsx web/src/App.tsx
git commit -m "feat(web): React root + router shell"
```

---

## Task 6: Login.tsx + Dashboard.tsx pages

**Files:**
- Create: `web/src/pages/Login.tsx`
- Create: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create `web/src/pages/Login.tsx`**

Centered card, no logic. Inputs and button are `disabled` to make placeholder status obvious.

```tsx
export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-4 rounded-lg border bg-card text-card-foreground shadow">
        <h1 className="text-2xl font-semibold tracking-tight">SupportPilot</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account</p>
        <div className="space-y-2">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-3 py-2 border rounded-md text-sm"
            disabled
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-3 py-2 border rounded-md text-sm"
            disabled
          />
          <button
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium opacity-50 cursor-not-allowed"
            disabled
          >
            Sign in
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Placeholder — no auth logic yet
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `web/src/pages/Dashboard.tsx`**

Sidebar + header + main area shell.

```tsx
export default function Dashboard() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r flex flex-col gap-2 p-4 shrink-0">
        <span className="text-lg font-semibold">SupportPilot</span>
        <nav className="flex flex-col gap-1 mt-4">
          {['Dashboard', 'Sources', 'Documents', 'Activity', 'Settings'].map((item) => (
            <button
              key={item}
              className="text-left px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-6 shrink-0">
          <span className="text-sm text-muted-foreground">Admin Dashboard</span>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <p className="text-muted-foreground text-sm">
            Placeholder — dashboard content goes here.
          </p>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Login.tsx web/src/pages/Dashboard.tsx
git commit -m "feat(web): Login + Dashboard placeholder pages"
```

---

## Task 7: Root package.json — add dev:web script

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add `dev:web` to root `package.json` scripts**

Open `package.json` in the project root. In the `"scripts"` block, add:

```json
"dev:web": "cd web && npm run dev"
```

The full scripts block should look like:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "lint": "eslint src --ext .ts",
  "format": "prettier --write src",
  "test": "vitest run",
  "seed": "tsx scripts/seed/index.ts",
  "seed:reset": "tsx scripts/seed/index.ts --reset",
  "seed:tenant": "tsx scripts/seed/index.ts --tenant",
  "dev:web": "cd web && npm run dev"
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat(web): add dev:web script to root package.json"
```

---

## Task 8: Verification

**Goal:** Confirm all acceptance criteria pass before declaring done.

- [ ] **Step 1: TypeScript type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no output, exit code 0. Fix any type errors before proceeding.

- [ ] **Step 2: Smoke-test dev server**

In one terminal:
```bash
cd web && npm run dev
```

Expected output includes:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173/` in browser → Dashboard placeholder renders.
Open `http://localhost:5173/login` → Login card renders.

- [ ] **Step 3: Verify proxy**

With the Express API running (`npm run dev` in the project root in another terminal), run:

```bash
curl http://localhost:5173/api/health
```

Expected:
```json
{"ok":true}
```

If the API isn't running you'll get a 502 — that's expected; start the API first.

- [ ] **Step 4: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "fix(web): address type-check issues from verification"
```

Only needed if Step 1 required changes. Skip if `tsc --noEmit` was clean.
