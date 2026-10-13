import {
  AppWindow,
  Bell,
  Building2,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/pages/Notifications';
import { BrandMark, BrandTitle } from './Brand';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Ko'rsatilmasa — har bir kirgan foydalanuvchiga ko'rinadi. */
  permissions?: string[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Bosh sahifa', icon: LayoutDashboard },
  {
    to: '/xodimlar',
    label: 'Xodimlar',
    icon: Users,
    permissions: ['employees.view.all', 'employees.view.department'],
  },
  {
    to: '/topshiriqlar',
    label: 'Topshiriqlar',
    icon: ClipboardList,
    permissions: ['tasks.view.all', 'tasks.view.department', 'tasks.view.self'],
  },
  {
    to: '/akkreditatsiya',
    label: 'Akkreditatsiya',
    icon: GraduationCap,
    permissions: ['accreditation.view', 'accreditation.manage'],
  },
  { to: '/bolimlar', label: 'Bo‘limlar', icon: Building2 },
  {
    to: '/agentlar',
    label: 'Agentlar',
    icon: MonitorSmartphone,
    permissions: ['employees.view.all', 'employees.view.department'],
  },
  {
    to: '/siyosat',
    label: 'Monitoring siyosati',
    icon: ShieldCheck,
    permissions: ['policy.manage', 'agents.manage'],
  },
  { to: '/dasturlar', label: 'Dasturlar', icon: AppWindow },
  { to: '/audit', label: 'Audit jurnali', icon: ScrollText, permissions: ['audit.view'] },
];

export function Layout() {
  const { me, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = useNotifications().data?.unreadCount ?? 0;
  if (!me) return null;

  const items = NAV.filter((item) => !item.permissions || can(...item.permissions));
  // Faqat o'zini ko'ra oladigan xodim uchun ro'yxat o'rniga o'z profili.
  if (!can('employees.view.all', 'employees.view.department')) {
    items.splice(1, 0, { to: `/xodimlar/${me.id}`, label: 'Mening faoliyatim', icon: Users });
  }
  items.push({ to: '/hisob', label: 'Hisobim', icon: UserCircle });

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Asosiy menyu">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              isActive ? 'bg-primary text-white' : 'text-ink hover:bg-primary-soft',
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white lg:block">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <BrandMark />
          <BrandTitle />
        </div>
        {nav}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            className="absolute inset-0 bg-ink/40"
            aria-label="Menyuni yopish"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-72 max-w-[85vw] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line p-4">
              <BrandTitle />
              <button
                className="rounded-md p-1 hover:bg-surface"
                aria-label="Menyuni yopish"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
          <button
            className="rounded-md p-2 hover:bg-surface lg:hidden"
            aria-label="Menyuni ochish"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-medium">{me.fullName}</p>
            <p className="truncate text-xs text-muted">{me.email}</p>
          </div>
          <Link
            to="/bildirishnomalar"
            className="relative rounded-md border border-line p-2 hover:bg-surface"
            aria-label={unread > 0 ? `Bildirishnomalar, ${unread} ta yangi` : 'Bildirishnomalar'}
          >
            <Bell className="h-4 w-4" aria-hidden />
            {unread > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </Link>
          <button
            className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Chiqish</span>
          </button>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
