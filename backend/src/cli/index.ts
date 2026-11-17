import { PrismaClient } from '@prisma/client';
import { rotateEncryptionKey } from './rotate-encryption-key';
import { seedDemo } from './seed-demo';

/** `pnpm cli <command>` — operational commands (docs/10). */
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'rotate-encryption-key') {
    const i = args.indexOf('--new');
    const newKey = i >= 0 ? args[i + 1] : undefined;
    const current = process.env.APP_ENCRYPTION_KEY;
    if (!newKey || !current)
      throw new Error('usage: APP_ENCRYPTION_KEY=<current> pnpm cli rotate-encryption-key --new <key>');
    const prisma = new PrismaClient();
    try {
      const r = await rotateEncryptionKey(current, newKey, prisma);
      console.log(`re-encrypted: ${r.integrations} integration secret sets, ${r.totp} TOTP secrets`);
      console.log(
        'next: deploy with APP_ENCRYPTION_KEY=<new> and APP_ENCRYPTION_KEY_PREVIOUS=<old>, then remove the previous key.',
      );
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  if (command === 'seed-demo') {
    const prisma = new PrismaClient();
    try {
      const i = args.indexOf('--from');
      const r = await seedDemo(prisma, { from: i >= 0 ? args[i + 1] : undefined });
      console.log(`demo: ${r.agents} agents, ${r.properties} properties created`);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  throw new Error('commands: rotate-encryption-key --new <key> | seed-demo [--from <file>]');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
