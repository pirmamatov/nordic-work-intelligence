import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { purgeExpiredScreenshots } from './modules/screenshots/service';

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API ishga tushdi');
});

// Saqlash muddati tugagan ma'lumotlar ishga tushganda va keyin har soatda tozalanadi.
function runRetention(): void {
  purgeExpiredScreenshots().catch((err: unknown) => {
    logger.error({ err }, 'Saqlash muddati bo‘yicha tozalash bajarilmadi');
  });
}
runRetention();
setInterval(runRetention, 3_600_000).unref();

function shutdown(signal: string): void {
  logger.info({ signal }, 'API to‘xtatilmoqda');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Ochiq ulanishlar yopilmasa, majburan to'xtatiladi.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
