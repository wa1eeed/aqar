import { Prisma } from '@prisma/client';
import type { Db } from '../prisma/prisma.service';

/** Atomic sequential numbers (L-, B-, R-) from the Counter table (docs/01). */
export async function nextCounter(db: Db, key: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ value: number }>>(Prisma.sql`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`);
  return rows[0]!.value;
}
