import { useEffect } from 'react';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import { Layout } from '@/components/Layout';
import { NotificationsPage } from '@/pages/Notifications';
import { Empty, ErrorState, Loading } from '@/components/States';
import {
  ForcedMfaSetupScreen,
  ForcedPasswordScreen,
  LoginScreen,
  MfaVerifyScreen,
} from '@/pages/AuthScreens';

function NotFound() {
  return (
    <Empty
      title="Sahifa topilmadi"
      action={
        <Link to="/" className="text-sm text-primary underline">
          Bosh sahifaga qaytish
        </Link>
      }
    />
  );
}

// Sahifalar alohida bo'laklarga ajratiladi: har biri faqat ochilganda yuklanadi.
const router = createBrowserRouter([
  {
    element: <Layout />,
    hydrateFallbackElement: <Loading />,
    children: [
      {
        path: '/',
        lazy: async () => ({ Component: (await import('@/pages/Dashboard')).DashboardPage }),
      },
      {
        path: '/xodimlar',
        lazy: async () => ({ Component: (await import('@/pages/Employees')).EmployeesPage }),
      },
      {
        path: '/xodimlar/:id',
        lazy: async () => ({
          Component: (await import('@/pages/EmployeeProfile')).EmployeeProfilePage,
        }),
      },
      {
        path: '/topshiriqlar',
        lazy: async () => ({ Component: (await import('@/pages/Tasks')).TasksPage }),
      },
      {
        path: '/topshiriqlar/:id',
        lazy: async () => ({ Component: (await import('@/pages/TaskDetail')).TaskDetailPage }),
      },
      {
        path: '/akkreditatsiya',
        lazy: async () => ({
          Component: (await import('@/pages/Accreditation')).AccreditationPage,
        }),
      },
      { path: '/bildirishnomalar', element: <NotificationsPage /> },
      {
        path: '/bolimlar',
        lazy: async () => ({ Component: (await import('@/pages/Departments')).DepartmentsPage }),
      },
      {
        path: '/agentlar',
        lazy: async () => ({ Component: (await import('@/pages/Agents')).AgentsPage }),
      },
      {
        path: '/siyosat',
        lazy: async () => ({ Component: (await import('@/pages/Policies')).PoliciesPage }),
      },
      {
        path: '/dasturlar',
        lazy: async () => ({ Component: (await import('@/pages/Applications')).ApplicationsPage }),
      },
      {
        path: '/audit',
        lazy: async () => ({ Component: (await import('@/pages/Audit')).AuditPage }),
      },
      {
        path: '/hisob',
        lazy: async () => ({ Component: (await import('@/pages/Account')).AccountPage }),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

/** Sessiya holatiga qarab mos ekranni tanlaydi. Sahifalarga ruxsatni har doim server tekshiradi. */
export function App() {
  const { me, loading, error, refresh } = useAuth();
  // Chiqilganda manzil bosh sahifaga qaytariladi: keyingi kirgan foydalanuvchi oldingisining sahifasiga tushib qolmasin.
  const signedOut = !loading && !me;
  useEffect(() => {
    if (signedOut) void router.navigate('/', { replace: true });
  }, [signedOut]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refresh()} />;
  if (!me) return <LoginScreen />;
  if (me.mfaPending) return <MfaVerifyScreen />;
  if (me.mustChangePassword) return <ForcedPasswordScreen />;
  if (me.mfaSetupRequired) return <ForcedMfaSetupScreen />;
  return <RouterProvider router={router} />;
}
