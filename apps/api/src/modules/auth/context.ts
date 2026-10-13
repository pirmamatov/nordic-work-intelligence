export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  employeeId: string | null;
  departmentId: string | null;
  roles: string[];
  permissions: ReadonlySet<string>;
  /** MFA yoqilgan, lekin bu sessiyada hali tasdiqlanmagan. */
  mfaPending: boolean;
  /** Rol yoki ruxsat MFA talab qiladi, lekin foydalanuvchi hali sozlamagan. */
  mfaSetupRequired: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  csrfToken: string;
}

export interface AgentContext {
  installationId: string;
  workstationId: string;
  employeeId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    auth?: AuthContext | undefined;
    agent?: AgentContext;
  }
}
