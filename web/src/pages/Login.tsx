import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { AUTH_QUERY_KEY } from '../hooks/useAuth';

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, tenantSlug);
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-8 space-y-4 rounded-lg border bg-card text-card-foreground shadow"
      >
        <h1 className="text-2xl font-semibold tracking-tight">SupportPilot</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Tenant slug (e.g. acme-saas)"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-md text-sm bg-background"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-md text-sm bg-background"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-md text-sm bg-background"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
