import dotenv from "dotenv";
dotenv.config({ path: "../.vercel/.env.production.local", override: true });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fakeSlugs = ["techsters-avishkar26", "enterprise-alpha"];
  const delWs = await prisma.workspace.deleteMany({
    where: { slug: { in: fakeSlugs } },
  });
  console.log(`Deleted ${delWs.count} seeded fake workspaces`);

  const fakeEmails = ["alice@techsters.dev", "bob@techsters.dev", "carol@techsters.dev"];
  const delUsers = await prisma.user.deleteMany({
    where: { email: { in: fakeEmails } },
  });
  console.log(`Deleted ${delUsers.count} seeded demo users`);

  const upgraded = await prisma.user.updateMany({
    where: { email: "nshreeskanda@gmail.com" },
    data: { systemRole: "ADMIN" },
  });
  console.log(`Upgraded nshreeskanda@gmail.com to ADMIN (${upgraded.count} row)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
