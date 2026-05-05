# App Shell + Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the layout shell from `Dashboard.tsx` into shared `AppShell` + `UserMenu` components so every protected route gets sidebar nav and a top bar automatically.

**Architecture:** `AppShell` is a React Router v6 layout route that wraps all protected pages via `<Outlet />`. `UserMenu` is a self-contained dropdown triggered by a user-initials avatar; it reads from `useAuth()` and calls `signOut()`. Page stubs are created for all five nav destinations so routes resolve without errors.

**Tech Stack:** React 18, react-router-dom v6 (`NavLink`, `Outlet`), Tailwind CSS (shadcn token system already in `index.css`), TypeScript strict mode. No additional packages needed — no shadcn component library is installed, tokens are used directly via Tailwind utilities.

> **Note:** The `web/` package has no test framework configured. Validation uses `tsc --noEmit` for type correctness and the Vite dev server for visual acceptance. Each task ends with a type-check commit.

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| CREATE | `web/src/components/AppShell.tsx` | Layout shell: sidebar nav + top bar + `<Outlet />` |
| CREATE | `web/src/components/UserMenu.tsx` | User avatar button + dropdown with sign-out |
| CREATE | `web/src/pages/Documents.tsx` | Stub page |
| CREATE | `web/src/pages/Upload.tsx` | Stub page |
| CREATE | `web/src/pages/Sources.tsx` | Stub page |
| CREATE | `web/src/pages/Activity.tsx` | Stub page |
| CREATE | `web/src/pages/Settings.tsx` | Stub page |
| MODIFY | `web/src/App.tsx` | Add `AppShell` layout route + all five page routes |
| MODIFY | `web/src/pages/Dashboard.tsx` | Strip inline shell, keep only page content |

---

## Task 1: Stub Pages

**Files:**
- Create: `web/src/pages/Documents.tsx`
- Create: `web/src/pages/Upload.tsx`
- Create: `web/src/pages/Sources.tsx`
- Create: `web/src/pages/Activity.tsx`
- Create: `web/src/pages/Settings.tsx`

- [ ] **Step 1: Create all five stub pages**

`web/src/pages/Documents.tsx`:
```tsx
export default function Documents() {
  return <p className="text-muted-foreground text-sm">Documents — coming soon.</p>
}
```

`web/src/pages/Upload.tsx`:
```tsx
export default function Upload() {
  return <p className="text-muted-foreground text-sm">Upload — coming soon.</p>
}
```

`web/src/pages/Sources.tsx`:
```tsx
export default function Sources() {
  return <p className="text-muted-foreground text-sm">Sources — coming soon.</p>
}
```

`web/src/pages/Activity.tsx`:
```tsx
export default function Activity() {
  return <p className="text-muted-foreground text-sm">Activity — coming soon.</p>
}
```

`web/src/pages/Settings.tsx`:
```tsx
export default function Settings() {
  return <p className="text-muted-foreground text-sm">Settings — coming soon.</p>
}
```

- [ ] **Step 2: Type-check**

Run from `web/`:
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Documents.tsx web/src/pages/Upload.tsx web/src/pages/Sources.tsx web/src/pages/Activity.tsx web/src/pages/Settings.tsx
git commit -m "feat(web): stub pages for Documents, Upload, Sources, Activity, Settings"
```

---

## Task 2: UserMenu Component

**Files:**
- Create: `web/src/components/UserMenu.tsx`

- [ ] **Step 1: Create `UserMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!user) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        aria-label="User menu"
        aria-expanded={open}
      >
        {initials(user.name)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 z-50 bg-background border rounded-md shadow-md p-1">
          <div className="px-3 py-2">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{user.email}</p>
          </div>
          <div className="border-t my-1" />
          <button
            onClick={() => signOut()}
            className={cn(
              'w-full text-left px-3 py-2 text-sm rounded-sm transition-colors',
              'text-destructive hover:bg-accent hover:text-destructive',
            )}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/UserMenu.tsx
git commit -m "feat(web): UserMenu component with initials avatar + sign-out dropdown"
```

---

## Task 3: AppShell Component

**Files:**
- Create: `web/src/components/AppShell.tsx`

- [ ] **Step 1: Create `AppShell.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/utils'
import UserMenu from './UserMenu'

const NAV_ITEMS = [
  { label: 'Documents', to: '/documents' },
  { label: 'Upload', to: '/upload' },
  { label: 'Sources', to: '/sources' },
  { label: 'Activity', to: '/activity' },
  { label: 'Settings', to: '/settings' },
] as const

export default function AppShell() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b shrink-0">
          <span className="text-sm font-semibold">SupportPilot</span>
        </div>
        <nav className="flex flex-col gap-1 p-2 flex-1">
          {NAV_ITEMS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center justify-end px-6 shrink-0">
          <UserMenu />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/AppShell.tsx
git commit -m "feat(web): AppShell layout component with sidebar NavLinks + top bar"
```

---

## Task 4: Wire Routes in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Replace `App.tsx` with updated routes**

```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Activity from './pages/Activity'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Sources from './pages/Sources'
import Upload from './pages/Upload'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): wire AppShell layout route + all protected page routes"
```

---

## Task 5: Strip Dashboard Shell

**Files:**
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace `Dashboard.tsx` — keep only page content**

```tsx
export default function Dashboard() {
  return (
    <p className="text-muted-foreground text-sm">
      Placeholder — dashboard content goes here.
    </p>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Dashboard.tsx
git commit -m "refactor(web): strip inline shell from Dashboard — AppShell owns layout"
```

---

## Task 6: Visual Acceptance

- [ ] **Step 1: Start dev server**

```bash
cd web && npm run dev
```
Open `http://localhost:5173`.

- [ ] **Step 2: Verify acceptance criteria**

| Check | Expected |
|-------|----------|
| Navigate to `/` (Dashboard) | Sidebar visible, "SupportPilot" brand in top-left |
| Click each nav link | URL changes, active link has `bg-accent font-medium` highlight |
| Click "Documents" | Renders "Documents — coming soon." inside main content area |
| Click "Upload" | Renders "Upload — coming soon." |
| Click "Sources" | Renders "Sources — coming soon." |
| Click "Activity" | Renders "Activity — coming soon." |
| Click "Settings" | Renders "Settings — coming soon." |
| User initials button visible top-right | Shows first two initials of logged-in user name |
| Click initials | Dropdown opens with name, email, "Sign out" |
| Click outside dropdown | Dropdown closes |
| Click "Sign out" | Redirects to `/login` |

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "feat(web): app shell + nav"
```

> Commit message matches the Prompt 36 acceptance spec. If there are no uncommitted changes, this empty commit marks the feature complete.
