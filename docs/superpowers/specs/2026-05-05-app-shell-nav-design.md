# App Shell + Navigation — Design Spec

**Date:** 2026-05-05
**Scope:** Prompt 36 — persistent sidebar nav + user menu for all authed pages

---

## Problem

`Dashboard.tsx` has an inline layout prototype (sidebar + topbar). As more pages are added (Documents, Upload, Sources, Activity, Settings) every page would duplicate this shell. Extract it into a shared `AppShell` component that all protected routes render inside.

---

## Architecture

```
App.tsx
└── <ProtectedRoute>
    └── <AppShell>          ← new wrapper, renders <Outlet />
        ├── Sidebar         ← NavLink items, active highlighting
        ├── TopBar          ← logo + <UserMenu>
        └── <Outlet />      ← page-specific content
```

`AppShell` is a layout route — it wraps the `<Outlet />` from React Router v6. No page component renders its own shell.

---

## Components

### `web/src/components/AppShell.tsx`

- Fixed 256px sidebar, full viewport height, `border-r`
- Logo/brand at top of sidebar: "SupportPilot" text
- `<nav>` with `NavLink` items (in order): Documents, Upload, Sources, Activity, Settings
- Active link: `bg-accent text-accent-foreground font-medium`
- Inactive link: `text-muted-foreground hover:bg-accent hover:text-accent-foreground`
- Topbar: 56px height, `border-b`, flex row — left: page title area (empty, pages own it), right: `<UserMenu />`
- Main content: `flex-1 overflow-auto p-6`
- Renders `<Outlet />` inside main

Routes for nav links:
| Label     | Path         |
|-----------|--------------|
| Documents | `/documents` |
| Upload    | `/upload`    |
| Sources   | `/sources`   |
| Activity  | `/activity`  |
| Settings  | `/settings`  |

### `web/src/components/UserMenu.tsx`

- `useState` toggle — no Radix/shadcn dependency
- Trigger: circular avatar with user initials (derived from `user.name`), `useAuth()` to get user data
- Dropdown panel: user name (bold), email (muted), divider, "Sign out" button
- Sign out calls `useAuth().signOut()`
- Closes on outside click via `useEffect` + `ref`
- Positioned `absolute right-0 top-full mt-1`, `z-50`, `shadow-md border rounded-md bg-background`

---

## App.tsx Changes

Add routes for all protected pages inside the `AppShell` layout route:

```tsx
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
```

Stub pages (Documents, Upload, Sources, Activity, Settings) return a minimal placeholder `<div>` until implemented.

---

## Dashboard.tsx

Strip the inline shell (sidebar + header wrapper). Keep only the page-specific inner content (`<main>` body). AppShell owns the outer layout.

---

## Styling Decisions

- No new CSS — pure Tailwind utility classes using existing shadcn tokens
- No shadcn component package required — tokens already in `index.css` + `tailwind.config.js`
- Nav icons: text-only labels for now (icons deferred — adds a dep, low value at this stage)

---

## Acceptance Criteria

- Sidebar appears on every protected route
- Active `NavLink` visually distinguished
- Logout from UserMenu dropdown works (calls `signOut()`, redirects to `/login`)
- `Dashboard.tsx` no longer contains layout markup
- All six routes render without errors

---

## Out of Scope

- Icons in sidebar (deferred)
- Collapsed/mobile sidebar (deferred)
- Dark mode toggle in UserMenu (deferred)
