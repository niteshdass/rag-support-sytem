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
