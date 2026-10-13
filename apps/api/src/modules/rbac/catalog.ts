import { type RoleCode } from '@nwi/shared';

// Ruxsatlar va tizim rollari katalogi. Bazaga `syncRbacCatalog` orqali yoziladi.
// Matritsa: docs/SECURITY.md, 5-bo'lim.

interface PermissionDef {
  description: string;
  /** Shu ruxsatga ega foydalanuvchi uchun MFA majburiy. */
  requiresMfa?: boolean;
}

export const PERMISSIONS = {
  'users.manage': { description: 'Foydalanuvchilarni yaratish va tahrirlash', requiresMfa: true },
  'roles.manage': { description: 'Rollar va alohida ruxsatlarni biriktirish', requiresMfa: true },
  'departments.manage': { description: 'Bo‘limlarni boshqarish' },
  'employees.view.all': { description: 'Barcha xodimlarni ko‘rish' },
  'employees.view.department': { description: 'O‘z bo‘limi xodimlarini ko‘rish' },
  'employees.view.self': { description: 'O‘z profilini ko‘rish' },
  'policy.manage': { description: 'Monitoring siyosatini boshqarish', requiresMfa: true },
  'agents.manage': { description: 'Agentlarni ro‘yxatdan o‘tkazish va bekor qilish' },
  'applications.manage': { description: 'Dasturlar katalogi va kategoriyalarini boshqarish' },
  'activity.view.all': { description: 'Barcha xodimlar faoliyat statistikasi', requiresMfa: true },
  'activity.view.department': { description: 'O‘z bo‘limi faoliyat statistikasi' },
  'activity.view.self': { description: 'O‘z faoliyat statistikasi' },
  'screenshots.view': {
    description: 'Ekran tasvirlarini ko‘rish (alohida beriladi)',
    requiresMfa: true,
  },
  'tasks.view.all': { description: 'Barcha topshiriqlarni ko‘rish' },
  'tasks.view.department': { description: 'O‘z bo‘limi topshiriqlarini ko‘rish' },
  'tasks.view.self': { description: 'O‘ziga biriktirilgan topshiriqlarni ko‘rish' },
  'tasks.manage.all': { description: 'Topshiriq yaratish va biriktirish' },
  'tasks.manage.department': { description: 'O‘z bo‘limida topshiriq yaratish va biriktirish' },
  'tasks.approve.all': { description: 'Natijalarni tasdiqlash' },
  'tasks.approve.department': { description: 'O‘z bo‘limi natijalarini tasdiqlash' },
  'accreditation.view': { description: 'Akkreditatsiya mezonlarini ko‘rish' },
  'accreditation.manage': { description: 'Akkreditatsiya mezonlarini boshqarish' },
  'ai.view.all': { description: 'Barcha xodimlar AI foydalanish statistikasi' },
  'ai.view.department': { description: 'O‘z bo‘limi AI foydalanish statistikasi' },
  'ai.view.self': { description: 'O‘z AI foydalanish statistikasi' },
  'reports.view.all': { description: 'Barcha hisobotlar va eksport' },
  'reports.view.department': { description: 'O‘z bo‘limi hisobotlari' },
  'reports.view.self': { description: 'O‘z hisobotlari' },
  'reports.accreditation': { description: 'Akkreditatsiya hisobotlari' },
  'audit.view': { description: 'Audit jurnalini ko‘rish', requiresMfa: true },
  'settings.manage': { description: 'Tizim sozlamalarini boshqarish', requiresMfa: true },
} as const satisfies Record<string, PermissionDef>;

export type PermissionCode = keyof typeof PERMISSIONS;

const SELF: PermissionCode[] = [
  'employees.view.self',
  'activity.view.self',
  'tasks.view.self',
  'ai.view.self',
  'reports.view.self',
  'accreditation.view',
];

interface RoleDef {
  name: string;
  requiresMfa: boolean;
  permissions: PermissionCode[];
}

export type { RoleCode };

export const ROLES: Record<RoleCode, RoleDef> = {
  SUPER_ADMIN: {
    name: 'Super administrator',
    requiresMfa: true,
    // Ekran tasvirlari hech bir rolda sukut bo'yicha yo'q — faqat alohida beriladi.
    permissions: (Object.keys(PERMISSIONS) as PermissionCode[]).filter(
      (p) => p !== 'screenshots.view',
    ),
  },
  LEADERSHIP: {
    name: 'Universitet rahbariyati',
    requiresMfa: true,
    permissions: [
      ...SELF,
      'employees.view.all',
      'activity.view.all',
      'tasks.view.all',
      'tasks.manage.all',
      'tasks.approve.all',
      'ai.view.all',
      'reports.view.all',
      'reports.accreditation',
    ],
  },
  DEPARTMENT_HEAD: {
    name: 'Bo‘lim rahbari',
    requiresMfa: false,
    permissions: [
      ...SELF,
      'employees.view.department',
      'activity.view.department',
      'tasks.view.department',
      'tasks.manage.department',
      'tasks.approve.department',
      'ai.view.department',
      'reports.view.department',
    ],
  },
  ACCREDITATION_COORDINATOR: {
    name: 'Akkreditatsiya koordinatori',
    requiresMfa: false,
    permissions: [
      ...SELF,
      'employees.view.all',
      'tasks.view.all',
      'tasks.manage.all',
      'tasks.approve.all',
      'accreditation.manage',
      'reports.accreditation',
    ],
  },
  HR_ANALYST: {
    name: 'HR / vakolatli tahlilchi',
    requiresMfa: true,
    permissions: [
      ...SELF,
      'employees.view.all',
      'activity.view.all',
      'ai.view.all',
      'reports.view.all',
    ],
  },
  EMPLOYEE: {
    name: 'Xodim',
    requiresMfa: false,
    permissions: SELF,
  },
};
