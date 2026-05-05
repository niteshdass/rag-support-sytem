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
