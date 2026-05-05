import { Link, NavLink, Outlet } from 'react-router-dom'
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
          <Link to="/" className="text-sm font-semibold hover:opacity-80 transition-opacity">
            SupportPilot
          </Link>
        </div>
        <nav aria-label="Main navigation" className="flex flex-col gap-1 p-2 flex-1">
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
