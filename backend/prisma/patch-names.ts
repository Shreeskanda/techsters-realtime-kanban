// Quick DB patch: remove parenthetical role suffixes from user names
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updates = [
    { email: "alice@techsters.dev", name: "Alice" },
    { email: "bob@techsters.dev",   name: "Bob"   },
    { email: "carol@techsters.dev", name: "Carol"  },
  ];

  for (const { email, name } of updates) {
    const result = await prisma.user.updateMany({
      where: { email },
      data: { name },
    });
    console.log(`Updated ${email} → ${name} (${result.count} row)`);
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
