import { useQuery, useQueryClient } from '@tanstack/react-query';
import { me, logout, type AuthUser, type AuthTenant } from '../api/auth';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

interface UseAuthResult {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  isLoading: boolean;
  isAuthed: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  async function signOut() {
    await logout().catch(() => {});
    queryClient.clear();
    window.location.href = '/login';
  }

  return {
    user: query.data?.user ?? null,
    tenant: query.data?.tenant ?? null,
    isLoading: query.isPending,
    isAuthed: query.isSuccess,
    signOut,
  };
}

export type { AuthUser, AuthTenant };
