import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';
import { Prisma, PrismaClient } from '../generated/prisma/client';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

export type Db = PrismaClient | Prisma.TransactionClient;
export { Prisma };
