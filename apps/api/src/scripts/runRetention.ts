// Saqlash muddati tugagan ma'lumotlarni o'chiradi. Server har soatda o'zi ham bajaradi;
// bu skript qo'lda yoki rejalashtiruvchi orqali ishga tushirish uchun.
import { prisma } from '../lib/prisma';
import { purgeExpiredScreenshots } from '../modules/screenshots/service';

const purged = await purgeExpiredScreenshots();
await prisma.$disconnect();
console.log(`O‘chirilgan ekran tasvirlari: ${purged}`);
