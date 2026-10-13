import type { RoleCode } from '@nwi/shared';

export const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Super administrator',
  LEADERSHIP: 'Universitet rahbariyati',
  DEPARTMENT_HEAD: 'Bo‘lim rahbari',
  ACCREDITATION_COORDINATOR: 'Akkreditatsiya koordinatori',
  HR_ANALYST: 'HR / tahlilchi',
  EMPLOYEE: 'Xodim',
};

export const CATEGORY_LABELS: Record<string, string> = {
  OFFICE: 'Ofis dasturlari',
  BROWSER: 'Brauzer',
  AI: 'AI vositalari',
  COMMUNICATION: 'Aloqa',
  PDF: 'PDF',
  DEVELOPMENT: 'Dasturlash',
  SYSTEM: 'Tizim',
  OTHER: 'Boshqa',
};

export const RELEVANCE_LABELS: Record<string, string> = {
  WORK: 'Ishga oid',
  NEUTRAL: 'Neytral',
  NON_WORK: 'Ishga oid emas',
  UNCLASSIFIED: 'Tasniflanmagan',
};

export const STATE_LABELS: Record<string, string> = {
  ACTIVE: 'Faol',
  IDLE: 'Nofaol',
  LOCKED: 'Ekran qulflangan',
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: 'Yuqori',
  MEDIUM: 'O‘rta',
  LOW: 'Past',
};

export const OUTCOME_LABELS: Record<string, string> = {
  SUCCESS: 'Muvaffaqiyatli',
  FAILURE: 'Muvaffaqiyatsiz',
  DENIED: 'Rad etilgan',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  NEW: 'Yangi',
  PLANNED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Jarayonda',
  IN_REVIEW: 'Tekshiruvda',
  NEEDS_FIX: 'Tuzatish talab qilinadi',
  APPROVED: 'Tasdiqlangan',
  DONE: 'Bajarildi',
  DELAYED: 'Kechiktirilgan',
  CANCELLED: 'Bekor qilingan',
};

// Holatni o'zgartirish tugmalaridagi yozuv (buyruq shaklida).
export const TASK_ACTION_LABELS: Record<string, string> = {
  PLANNED: 'Rejaga kiritish',
  IN_PROGRESS: 'Ishni boshlash / davom ettirish',
  IN_REVIEW: 'Tekshiruvga yuborish',
  NEEDS_FIX: 'Tuzatishga qaytarish',
  APPROVED: 'Natijani tasdiqlash',
  DONE: 'Bajarildi deb yakunlash',
  DELAYED: 'Kechikayotganini bildirish',
  CANCELLED: 'Bekor qilish',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Past',
  MEDIUM: 'O‘rta',
  HIGH: 'Yuqori',
  CRITICAL: 'Juda muhim',
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Qoralama',
  SUBMITTED: 'Tekshiruvga yuborilgan',
  IN_REVIEW: 'Tekshiruvda',
  NEEDS_FIX: 'Tuzatish talab qilinadi',
  APPROVED: 'Tasdiqlangan',
};

// Manba ishonchli bo'lmasa taxmin qilinmaydi — "Aniqlanmadi" ko'rsatiladi.
export const AI_ASSISTED_LABELS: Record<string, string> = {
  YES: 'AI yordamida tayyorlangan',
  NO: 'AI ishlatilmagan',
  UNKNOWN: 'AI ishlatilgani: aniqlanmadi',
};

export const DAY_LABELS: Record<number, string> = {
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
  7: 'Yakshanba',
};

// Audit jurnalidagi amal kodlarining o'qiladigan nomi. Ro'yxatda yo'q kod o'zicha ko'rsatiladi.
export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Tizimga kirish',
  'auth.logout': 'Tizimdan chiqish',
  'auth.password.change': 'Parolni almashtirish',
  'auth.mfa.setup': 'MFA sozlashni boshlash',
  'auth.mfa.enable': 'MFA yoqish',
  'auth.mfa.verify': 'MFA kodini tasdiqlash',
  'auth.session.revoke': 'Sessiyani bekor qilish',
  'user.create': 'Foydalanuvchi yaratish',
  'user.update': 'Foydalanuvchini tahrirlash',
  'user.password.reset': 'Parolni tiklash',
  'user.mfa.reset': 'MFA ni tiklash',
  'user.sessions.revoke': 'Sessiyalarni bekor qilish',
  'user.permissions.set': 'Alohida ruxsatlarni o‘zgartirish',
  'department.create': 'Bo‘lim yaratish',
  'department.update': 'Bo‘limni tahrirlash',
  'department.delete': 'Bo‘limni o‘chirish',
  'policy.create': 'Siyosat yaratish',
  'policy.update': 'Siyosatni o‘zgartirish',
  'policy.delete': 'Siyosatni o‘chirish',
  'policy.assign': 'Siyosatni biriktirish',
  'agent.enroll': 'Agent ro‘yxatdan o‘tdi',
  'agent.enrollment_code.create': 'Agent kodi yaratish',
  'agent.revoke': 'Agentni bekor qilish',
  'application.update': 'Dastur kategoriyasini o‘zgartirish',
  'screenshot.view': 'Ekran tasvirini ko‘rish',
  'task.create': 'Topshiriq yaratish',
  'task.update': 'Topshiriqni tahrirlash',
  'task.status': 'Topshiriq holatini o‘zgartirish',
  'document.create': 'Hujjat yuklash',
  'document.version.add': 'Hujjatning yangi versiyasi',
  'document.submit': 'Hujjatni tekshiruvga yuborish',
  'document.review': 'Hujjatni tekshirish',
  'document.download': 'Hujjatni yuklab olish',
  'criterion.create': 'Mezon yaratish',
  'criterion.update': 'Mezonni tahrirlash',
  'criterion.delete': 'Mezonni o‘chirish',
  'retention.screenshots.purge': 'Muddati o‘tgan tasvirlarni o‘chirish',
};
