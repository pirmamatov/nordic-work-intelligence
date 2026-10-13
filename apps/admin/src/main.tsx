import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ApiError } from './lib/api';
import './index.css';

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Ruxsat yoki "topilmadi" xatolarini qayta urinish tuzatmaydi.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
  queryCache: new QueryCache({
    // Sessiya tugagan yoki holati o'zgargan bo'lsa (MFA, parol), kirish ekraniga qaytariladi.
    onError: (error, query) => {
      if (query.queryKey[0] === 'me' || !(error instanceof ApiError)) return;
      const sessionChanged = [
        'MFA_REQUIRED',
        'MFA_SETUP_REQUIRED',
        'PASSWORD_CHANGE_REQUIRED',
      ].includes(error.code);
      if (error.status === 401 || sessionChanged)
        void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  }),
});

const root = document.getElementById('root');
if (!root) throw new Error('#root elementi topilmadi');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
