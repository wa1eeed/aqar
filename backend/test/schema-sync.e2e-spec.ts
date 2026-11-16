import { OFFER_KEYS, STATUS_KEYS, TYPE_KEYS } from '@nx/schema';
import { PrismaClient, PropertyOffer, PropertyStatus } from '@prisma/client';

/** docs/01: Prisma enums and allowed Property.type values must equal packages/schema keys. */
describe('schema-sync', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('PropertyOffer and PropertyStatus equal packages/schema', () => {
    expect(Object.values(PropertyOffer).sort()).toEqual([...OFFER_KEYS].sort());
    expect(Object.values(PropertyStatus).sort()).toEqual([...STATUS_KEYS].sort());
  });

  it('the Property.type CHECK constraint allows exactly the schema types', async () => {
    const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'Property_type_check'`;
    const allowed = [...row!.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(allowed).toEqual([...TYPE_KEYS].sort());
  });

  it('listing ids start at 1001 and one active booking per property is enforced by index', async () => {
    const [seq] = await prisma.$queryRaw<Array<{ start: bigint }>>`
      SELECT start_value AS start FROM pg_sequences WHERE sequencename = 'Property_id_seq'`;
    // RESTART WITH changes the next value, not start_value; check via the sequence state instead.
    const [state] = await prisma.$queryRaw<Array<{ last: bigint | null; called: boolean }>>`
      SELECT last_value AS last, is_called AS called FROM "Property_id_seq"`;
    expect(seq).toBeDefined();
    if (!state!.called) expect(Number(state!.last)).toBe(1001);
    else expect(Number(state!.last)).toBeGreaterThanOrEqual(1001);

    const [idx] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'one_active_booking'`;
    expect(idx!.def).toMatch(/UNIQUE INDEX/);
    expect(idx!.def).toMatch(/pending_payment.*awaiting_transfer_review.*confirmed/);
  });
});
