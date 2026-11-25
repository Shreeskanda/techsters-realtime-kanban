import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

const databaseUrl = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;

export const prisma =
  global.__prisma ??
  new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);

global.__prisma = prisma;
