import { prisma } from '../lib/prisma';
import { syncRbacCatalog } from '../modules/rbac/sync';

await syncRbacCatalog(prisma);
await prisma.$disconnect();
console.log('Rollar va ruxsatlar yangilandi.');
