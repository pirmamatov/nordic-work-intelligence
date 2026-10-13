import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/auth/AuthContext';
import type { Me } from '@/lib/types';

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown };

function mockApi(handler: Handler) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      const { status, body } = handler(url, init);
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), { status }),
      );
    }),
  );
  return calls;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const me = (overrides: Partial<Me> = {}): Me => ({
  id: 'u1',
  email: 'aziz@nordic.uz',
  fullName: 'Aziz Karimov',
  roles: ['EMPLOYEE'],
  permissions: [
    'employees.view.self',
    'activity.view.self',
    'tasks.view.self',
    'accreditation.view',
  ],
  employeeId: 'e1',
  departmentId: null,
  mfaEnabled: false,
  mfaPending: false,
  mfaSetupRequired: false,
  mustChangePassword: false,
  ...overrides,
});

const dashboard = {
  date: '2026-10-13',
  timezone: 'Asia/Tashkent',
  generatedAt: '2026-10-13T06:00:00.000Z',
  employees: { total: 1, activeToday: 0 },
  tasks: { total: 0, done: 0, inReview: 0, overdue: 0, completionPct: null },
  agents: { online: 0, offline: 0 },
  today: { activeSec: 0, idleSec: 0 },
  week: [],
  topApplications: [],
};
const unauthenticated = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Tizimga kirish talab qilinadi' } },
};

afterEach(() => vi.unstubAllGlobals());

describe('kirish oqimi', () => {
  it('sessiya bo‘lmasa kirish formasi chiqadi va bo‘sh maydonlar tekshiriladi', async () => {
    const calls = mockApi(() => unauthenticated);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Kirish' }));
    expect(await screen.findByText('Parolni kiriting')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/auth/login'))).toBe(false);
  });

  it('server xatosini ko‘rsatadi; muvaffaqiyatli kirishdan keyin panel ochiladi va CSRF tokeni yuboriladi', async () => {
    let attempts = 0;
    const calls = mockApi((url, init) => {
      if (url.endsWith('/auth/login')) {
        attempts += 1;
        return attempts === 1
          ? {
              status: 401,
              body: {
                error: {
                  code: 'INVALID_CREDENTIALS',
                  message: 'Elektron pochta yoki parol noto‘g‘ri',
                },
              },
            }
          : { status: 200, body: { csrfToken: 'csrf-123', user: me() } };
      }
      if (url.endsWith('/auth/logout')) return { status: init?.method === 'POST' ? 204 : 405 };
      if (url.includes('/dashboard')) return { status: 200, body: dashboard };
      if (url.includes('/notifications'))
        return { status: 200, body: { items: [], nextCursor: null, unreadCount: 0 } };
      return unauthenticated;
    });
    renderApp();
    await userEvent.type(await screen.findByLabelText('Elektron pochta'), 'aziz@nordic.uz');
    await userEvent.type(screen.getByLabelText('Parol'), 'Notogri-Parol-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Elektron pochta yoki parol noto‘g‘ri',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    expect(await screen.findByRole('heading', { name: 'Bosh sahifa' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Chiqish/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kirish' })).toBeInTheDocument());
    const logout = calls.find((c) => c.url.endsWith('/auth/logout'));
    expect(new Headers(logout?.init?.headers).get('X-CSRF-Token')).toBe('csrf-123');
  });

  it.each([
    [{ mfaPending: true }, 'Ikki bosqichli tasdiqlash'],
    [{ mustChangePassword: true }, 'Parolni almashtiring'],
    [{ mfaSetupRequired: true }, 'Ikki bosqichli tasdiqlashni yoqing'],
  ])('oraliq holatda (%o) panel o‘rniga tegishli ekran chiqadi', async (state, heading) => {
    mockApi((url) =>
      url.endsWith('/auth/me')
        ? { status: 200, body: { csrfToken: 't', user: me(state) } }
        : unauthenticated,
    );
    renderApp();
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('menyu ruxsatlarga qarab ko‘rinadi', () => {
  const open = async (user: Me) => {
    mockApi((url) => {
      if (url.endsWith('/auth/me')) return { status: 200, body: { csrfToken: 't', user } };
      if (url.includes('/dashboard')) return { status: 200, body: dashboard };
      return unauthenticated;
    });
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Asosiy menyu' });
    return Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
  };

  it('oddiy xodim boshqaruv bo‘limlarini ko‘rmaydi', async () => {
    expect(await open(me())).toEqual([
      'Bosh sahifa',
      'Mening faoliyatim',
      'Topshiriqlar',
      'Akkreditatsiya',
      'Bo‘limlar',
      'Dasturlar',
      'Hisobim',
    ]);
  });

  it('administrator barcha bo‘limlarni ko‘radi', async () => {
    const admin = me({
      roles: ['SUPER_ADMIN'],
      permissions: [
        'employees.view.all',
        'tasks.view.all',
        'accreditation.manage',
        'policy.manage',
        'audit.view',
        'users.manage',
      ],
    });
    expect(await open(admin)).toEqual([
      'Bosh sahifa',
      'Xodimlar',
      'Topshiriqlar',
      'Akkreditatsiya',
      'Bo‘limlar',
      'Agentlar',
      'Monitoring siyosati',
      'Dasturlar',
      'Audit jurnali',
      'Hisobim',
    ]);
  });
});
