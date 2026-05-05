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
        aria-haspopup="menu"
      >
        {initials(user.name)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 z-50 bg-background border rounded-md shadow-md p-1" role="menu">
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
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
