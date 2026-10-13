export const ROLE_CODES = [
  'SUPER_ADMIN',
  'LEADERSHIP',
  'DEPARTMENT_HEAD',
  'ACCREDITATION_COORDINATOR',
  'HR_ANALYST',
  'EMPLOYEE',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];
