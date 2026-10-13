import type { Db } from '../../lib/prisma';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** Xodimlarga (ularning foydalanuvchi hisoblariga) bildirishnoma yaratadi. `exceptUserId` — amalni bajargan shaxs. */
export async function notifyEmployees(
  db: Db,
  employeeIds: string[],
  input: NotificationInput,
  exceptUserId?: string,
): Promise<void> {
  if (employeeIds.length === 0) return;
  const employees = await db.employeeProfile.findMany({
    where: { id: { in: [...new Set(employeeIds)] }, isActive: true },
    select: { userId: true },
  });
  await notifyUsers(
    db,
    employees.map((e) => e.userId),
    input,
    exceptUserId,
  );
}

export async function notifyUsers(
  db: Db,
  userIds: string[],
  input: NotificationInput,
  exceptUserId?: string,
): Promise<void> {
  const recipients = [...new Set(userIds)].filter((id) => id !== exceptUserId);
  if (recipients.length === 0) return;
  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  });
}
