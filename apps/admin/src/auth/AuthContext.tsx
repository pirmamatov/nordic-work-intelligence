import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken } from '@/lib/api';
import type { AuthResponse, Me } from '@/lib/types';

interface AuthValue {
  me: Me | null;
  loading: boolean;
  error: unknown;
  can: (...permissions: string[]) => boolean;
  /** Kirish yoki holat o'zgargandan keyin serverdagi holatni qayta o'qiydi. */
  refresh: () => Promise<void>;
  accept: (response: AuthResponse) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function fetchMe(): Promise<Me | null> {
  try {
    const response = await api.get<AuthResponse>('/auth/me');
    setCsrfToken(response.csrfToken);
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000 });
  const me = query.data ?? null;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const accept = useCallback(
    (response: AuthResponse) => {
      setCsrfToken(response.csrfToken);
      queryClient.setQueryData(['me'], response.user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setCsrfToken(null);
      // Boshqa foydalanuvchining keshlangan ma'lumoti qolmasligi kerak. `me` so'rovi o'chirilmaydi:
      // unga obuna bo'lgan komponentlar yangi holatni (null) ko'rishi kerak.
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    }
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loading: query.isPending,
      error: query.error,
      can: (...permissions) => permissions.some((p) => me?.permissions.includes(p) ?? false),
      refresh,
      accept,
      logout,
    }),
    [me, query.isPending, query.error, refresh, accept, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth faqat AuthProvider ichida ishlatiladi');
  return value;
}
