import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import nock from 'nock';
import request from 'supertest';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { IntegrationStore } from '../src/modules/integrations/integration-store.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { TransfersService } from '../src/modules/payments/transfers.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PAYMENTS_QUEUE } from '../src/queue/queue.module';
import { REDIS } from '../src/redis/redis.module';
import { createStaff, freshIp, lastEmail, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

const MOYASAR = 'https://api.moyasar.com';
const WEBHOOK_SECRET = 'whsec_moyasar_test_0123456789';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const tick = (ms = 200) => new Promise((r) => setTimeout(r, ms));

describe('Bookings & payments (e2e, Phase 5)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let manager = '';
  let agent = '';
  let agentId = '';
  let financeId = '';
  let districtId = '';
  let bankAccountId = '';
  const customers: Record<string, string> = {};

  const as = (token: string, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) =>
    http[method](`/api/v1${path}`).set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${token}`);
  const pub = (path: string) => http.post(`/api/v1${path}`).set('X-Forwarded-For', freshIp());
  const login = async (email: string, password: string) =>
    (await pub('/auth/staff/login').send({ email, password }).expect(200)).body.accessToken as string;

  async function customerToken(email: string, phone: string): Promise<string> {
    await pub('/auth/customer/otp/send').send({ channel: 'email', destination: email }).expect(204);
    const code = /(\d{6})/.exec(lastEmail(app, email)!.text)![1]!;
    const v = await pub('/auth/customer/otp/verify').send({ destination: email, code }).expect(200);
    const r = await pub('/auth/customer/register')
      .send({ registrationToken: v.body.registrationToken, name: 'عميل اختبار', phone, consent: true })
      .expect(200);
    return r.body.accessToken as string;
  }

  let nextId = 7000;
  async function property(over: Record<string, unknown> = {}) {
    const id = nextId++;
    return prisma.property.create({
      data: {
        id,
        code: `MZ-${id}`,
        slug: `عقار-${id}`,
        type: 'villa',
        offer: 'sale',
        status: 'available',
        visibility: 'published',
        title: `فيلا الحجز ${id}`,
        description: 'وصف',
        cityId: 'riyadh',
        districtId,
        lat: 24.8,
        lng: 46.6,
        price: 300_000_000n,
        annualisedPrice: 300_000_000n,
        specs: { area: 400, adLicense: '7200000001', falLicense: '1100000001' },
        area: 400,
        adLicenseNo: '7200000001',
        falLicenseNo: '1100000001',
        agentId,
        createdById: agentId,
        publishedAt: new Date(),
        ...over,
      },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
    await prisma.propertyStatusHistory.deleteMany();
    await app.get<Queue>(PAYMENTS_QUEUE).obliterate({ force: true });
    await prisma.city.upsert({
      where: { id: 'riyadh' },
      create: { id: 'riyadh', nameAr: 'الرياض', lat: 24.7, lng: 46.6 },
      update: {},
    });
    districtId = (
      await prisma.district.upsert({
        where: { cityId_nameAr: { cityId: 'riyadh', nameAr: 'الملقا' } },
        create: { cityId: 'riyadh', nameAr: 'الملقا' },
        update: {},
      })
    ).id;
    await createStaff(app, 'sales_manager', 'mgr@nx.test', 'Manager-Password-26');
    agentId = (await createStaff(app, 'agent', 'agent@nx.test', 'Agent-One-Pass-2026')).id;
    financeId = (await createStaff(app, 'finance', 'finance@nx.test', 'Finance-Pass-20266')).id;
    manager = await login('mgr@nx.test', 'Manager-Password-26');
    agent = await login('agent@nx.test', 'Agent-One-Pass-2026');

    const settings = app.get(SettingsService);
    await settings.update('booking', {}, null); // defaults: sale deposit 50,000 SAR (moyasar | transfer), full (transfer)
    await settings.update('payments', { moyasar: { enabled: true } }, null);
    await settings.update('bank_transfer', {}, null);
    const store = app.get(IntegrationStore);
    await store.update(
      'payments.moyasar',
      { config: { mode: 'invoice' }, secrets: { secretKey: 'sk_test_abc123', webhookSecret: WEBHOOK_SECRET } },
      financeId,
    );
    await store.setEnabled('payments.moyasar', true, financeId);
    bankAccountId = (
      await prisma.bankAccount.create({
        data: { bankName: 'مصرف الراجحي', beneficiaryName: 'منزلة العقارية', iban: 'SA0380000000608010167519' },
      })
    ).id;
    customers.a = await customerToken('a@example.sa', '0551110001');
    customers.b = await customerToken('b@example.sa', '0551110002');
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  });

  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await app.close();
  });

  it('quote: server-computed amounts and the methods that are really available', async () => {
    const p = await property();
    const q = await as(customers.a!, 'post', '/me/bookings/quote').send({ propertyId: p.id }).expect(200);
    expect(q.body).toMatchObject({
      paymentType: 'deposit',
      paymentTypes: ['deposit', 'full'],
      options: { deposit: 5_000_000, full: 300_000_000 },
      amountDue: 5_000_000,
      termsVersion: '1',
    });
    expect(q.body.methods.map((m: { method: string }) => m.method)).toEqual(['moyasar', 'bank_transfer']);
    expect(q.body.bankAccounts[0]).toMatchObject({ bankName: 'مصرف الراجحي', iban: expect.stringMatching(/^SA/) });
    const full = await as(customers.a!, 'post', '/me/bookings/quote')
      .send({ propertyId: p.id, paymentType: 'full' })
      .expect(200);
    expect(full.body.methods.map((m: { method: string }) => m.method)).toEqual(['bank_transfer']);
    // The public property page gets the booking block.
    const pp = await http.get(`/api/v1/public/properties/${p.id}`).expect(200);
    expect(pp.body.booking).toMatchObject({ enabled: true, busy: false, depositAmount: 5_000_000 });
    // Staff cannot use customer endpoints.
    await as(manager, 'post', '/me/bookings/quote').send({ propertyId: p.id }).expect(403);
  });

  it('acceptance: two customers booking the same property at once → one 201, one 409', async () => {
    const p = await property();
    const body = { propertyId: p.id, paymentType: 'deposit', paymentMethod: 'bank_transfer', termsVersion: '1' };
    const [r1, r2] = await Promise.all([
      as(customers.a!, 'post', '/me/bookings').send(body),
      as(customers.b!, 'post', '/me/bookings').send(body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('BOOKING_PROPERTY_UNAVAILABLE');
    const winner = r1.status === 201 ? r1 : r2;
    expect(winner.body.booking.number).toMatch(/^B-\d{4}-\d{6}$/);
    expect(winner.body.nextAction).toMatchObject({
      type: 'bank_transfer',
      amount: 5_000_000,
      reference: winner.body.booking.number,
    });
    expect(winner.body.nextAction.accounts[0]).toMatchObject({ bankName: 'مصرف الراجحي' });
    // Reopening the booking page gives the same transfer details (read-only).
    const winnerAs = r1.status === 201 ? customers.a! : customers.b!;
    const again = await as(winnerAs, 'get', `/me/bookings/${winner.body.booking.id}`).expect(200);
    expect(again.body.nextAction).toMatchObject({ type: 'bank_transfer', reference: winner.body.booking.number });
    expect(again.body.payments).toHaveLength(1);
    const pp = await http.get(`/api/v1/public/properties/${p.id}`).expect(200);
    expect(pp.body.booking.busy).toBe(true);
    // Terms must be the current version; idempotent replays return the same booking.
    const p2 = await property();
    await as(customers.a!, 'post', '/me/bookings')
      .send({ ...body, propertyId: p2.id, termsVersion: '0' })
      .expect(409);
    const once = await as(customers.a!, 'post', '/me/bookings')
      .set('Idempotency-Key', 'abcdef123456')
      .send({ ...body, propertyId: p2.id })
      .expect(201);
    const twice = await as(customers.a!, 'post', '/me/bookings')
      .set('Idempotency-Key', 'abcdef123456')
      .send({ ...body, propertyId: p2.id })
      .expect(201);
    expect(twice.body.booking.id).toBe(once.body.booking.id);
  });

  describe('acceptance: Moyasar payment confirms the booking and reserves the property', () => {
    let bookingId = '';
    let paymentId = '';
    let propertyId = 0;

    it('creates a hosted invoice and redirects', async () => {
      const p = await property();
      propertyId = p.id;
      const scope = nock(MOYASAR)
        .post(
          '/v1/invoices',
          (b) => b.amount === 5_000_000 && b.currency === 'SAR' && b.metadata.bookingNumber?.startsWith('B-'),
        )
        .basicAuth({ user: 'sk_test_abc123', pass: '' })
        .reply(201, {
          id: 'inv_1',
          status: 'initiated',
          amount: 5_000_000,
          currency: 'SAR',
          url: 'https://checkout.moyasar.com/invoices/inv_1',
        });
      const r = await as(customers.a!, 'post', '/me/bookings')
        .send({ propertyId: p.id, paymentType: 'deposit', paymentMethod: 'moyasar', termsVersion: '1' })
        .expect(201);
      expect(scope.isDone()).toBe(true);
      expect(r.body.nextAction).toEqual({ type: 'redirect', url: 'https://checkout.moyasar.com/invoices/inv_1' });
      bookingId = r.body.booking.id;
      paymentId = r.body.booking.payments[0].id;
      expect(r.body.booking).toMatchObject({ status: 'pending_payment', amountDue: 5_000_000 });
    });

    it('a webhook is verified, stored once and queues a reconcile; forgeries are rejected', async () => {
      const event = {
        id: 'evt_1',
        type: 'payment_paid',
        secret_token: WEBHOOK_SECRET,
        data: { id: 'pay_1', invoice_id: 'inv_1', metadata: { paymentId } },
      };
      await pub('/webhooks/moyasar')
        .send({ ...event, secret_token: 'wrong' })
        .expect(401);
      await pub('/webhooks/moyasar').send(event).expect(200, { received: true });
      await pub('/webhooks/moyasar').send(event).expect(200, { received: true, duplicate: true });
      const jobs = await app.get<Queue>(PAYMENTS_QUEUE).getJobs(['waiting', 'delayed']);
      expect(jobs.some((j) => j.name === 'reconcile' && j.data.paymentId === paymentId)).toBe(true);
    });

    it('the callback re-fetches from Moyasar; paid → confirmed, property reserved; repeats are idempotent', async () => {
      const paidInvoice = {
        id: 'inv_1',
        status: 'paid',
        amount: 5_000_000,
        currency: 'SAR',
        metadata: { paymentId, bookingId },
        payments: [
          {
            id: 'pay_1',
            status: 'paid',
            amount: 5_000_000,
            currency: 'SAR',
            source: { type: 'creditcard', company: 'mada' },
          },
        ],
      };
      nock(MOYASAR).get('/v1/invoices/inv_1').times(2).reply(200, paidInvoice);
      const [v1, v2] = await Promise.all([
        as(customers.a!, 'post', `/me/payments/${paymentId}/verify`).send({}),
        app.get(PaymentsService).reconcile(paymentId, { source: 'webhook' }),
      ]);
      expect(v1.body.status).toBe('paid');
      expect(v2.status).toBe('paid');
      const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
      expect(b).toMatchObject({ status: 'confirmed', amountPaid: 5_000_000n });
      expect(b.payments[0]).toMatchObject({
        status: 'paid',
        providerPaymentId: 'pay_1',
        receiptNumber: expect.stringMatching(/^R-\d{4}-\d{6}$/),
      });
      const prop = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
      expect(prop.status).toBe('reserved');
      const hist = await prisma.propertyStatusHistory.findFirstOrThrow({ where: { propertyId, to: 'reserved' } });
      expect(hist).toMatchObject({ reason: 'booking_confirmed', bookingId });
      expect(await prisma.auditLog.count({ where: { entityId: bookingId, action: 'booking.confirmed' } })).toBe(1);
      await tick(400);
      const notes = await as(customers.a!, 'get', '/me/notifications').expect(200);
      expect(notes.body.items.map((n: { eventKey: string }) => n.eventKey)).toEqual(
        expect.arrayContaining(['booking.confirmed', 'payment.paid']),
      );
      expect(lastEmail(app, 'a@example.sa')!.subject).toMatch(/تم (تأكيد حجز|استلام دفعتك)/);
    });

    it('the receipt PDF is rendered (Arabic RTL), stored and downloadable by its owner only', async () => {
      const { ReceiptsService } = await import('../src/modules/payments/receipts.service');
      const receipts = app.get(ReceiptsService);
      const html = await receipts.html(paymentId);
      expect(html).toContain('dir="rtl"');
      expect(html).toContain('50,000.00 ر.س');
      if (!receipts.enabled) return; // CHROMIUM_PATH not set in this environment
      await receipts.generateAndSend(paymentId);
      const mail = lastEmail(app, 'a@example.sa')!;
      expect(mail.attachments?.[0]).toMatchObject({
        contentType: 'application/pdf',
        filename: expect.stringMatching(/^R-\d{4}-\d{6}\.pdf$/),
      });
      const pdf = await as(customers.a!, 'get', `/me/payments/${paymentId}/receipt.pdf`).buffer(true).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await as(customers.b!, 'get', `/me/payments/${paymentId}/receipt.pdf`).expect(404);
    }, 60_000);

    it('admin completes → sold; refunds go through Moyasar and are audited', async () => {
      // Refund needs payments.refund (finance/owner), not available to a sales manager.
      await as(manager, 'post', `/admin/payments/${paymentId}/refund`)
        .send({ amount: 100, reason: 'اختبار' })
        .expect(403);
      await as(agent, 'post', `/admin/bookings/${bookingId}/complete`).expect(403);
      const done = await as(manager, 'post', `/admin/bookings/${bookingId}/complete`).expect(200);
      expect(done.body.status).toBe('completed');
      expect((await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })).status).toBe('sold');
      await as(manager, 'post', `/admin/bookings/${bookingId}/cancel`).send({ reason: 'محاولة' }).expect(422);
    });
  });

  it('cancel after payment, then a full Moyasar refund → payment refunded, booking refunded, audited', async () => {
    const p = await property();
    nock(MOYASAR).post('/v1/invoices').reply(201, {
      id: 'inv_r',
      status: 'initiated',
      amount: 5_000_000,
      currency: 'SAR',
      url: 'https://checkout.moyasar.com/invoices/inv_r',
    });
    const r = await as(customers.b!, 'post', '/me/bookings')
      .send({ propertyId: p.id, paymentType: 'deposit', paymentMethod: 'moyasar', termsVersion: '1' })
      .expect(201);
    const paymentId = r.body.booking.payments[0].id as string;
    nock(MOYASAR)
      .get('/v1/invoices/inv_r')
      .reply(200, {
        id: 'inv_r',
        status: 'paid',
        amount: 5_000_000,
        currency: 'SAR',
        metadata: { paymentId },
        payments: [{ id: 'pay_r', status: 'paid', amount: 5_000_000, currency: 'SAR' }],
      });
    await as(customers.b!, 'post', `/me/payments/${paymentId}/verify`).send({}).expect(200);
    const payments = app.get(PaymentsService);
    await as(manager, 'post', `/admin/bookings/${r.body.booking.id}/cancel`)
      .send({ reason: 'تعذّر إكمال الصفقة' })
      .expect(200);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('available');
    await expect(payments.refund(financeId, paymentId, 6_000_000n, 'أكثر من المدفوع')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const refund = nock(MOYASAR)
      .post('/v1/payments/pay_r/refund', { amount: 5_000_000 })
      .reply(201, { id: 'pay_r', status: 'refunded', amount: 5_000_000, currency: 'SAR' });
    const out = await payments.refund(financeId, paymentId, 5_000_000n, 'إلغاء الحجز');
    expect(refund.isDone()).toBe(true);
    expect(out).toMatchObject({ status: 'refunded', refundedAmount: 5_000_000n });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: r.body.booking.id } })).status).toBe('refunded');
    expect(await prisma.auditLog.count({ where: { entityId: paymentId, action: 'payment.refund' } })).toBe(1);
  });

  it('amount mismatch → payment failed, booking not confirmed, finance alerted', async () => {
    const p = await property();
    nock(MOYASAR).post('/v1/invoices').reply(201, {
      id: 'inv_2',
      status: 'initiated',
      amount: 5_000_000,
      currency: 'SAR',
      url: 'https://checkout.moyasar.com/invoices/inv_2',
    });
    const r = await as(customers.b!, 'post', '/me/bookings')
      .send({ propertyId: p.id, paymentType: 'deposit', paymentMethod: 'moyasar', termsVersion: '1' })
      .expect(201);
    const paymentId = r.body.booking.payments[0].id;
    nock(MOYASAR)
      .get('/v1/invoices/inv_2')
      .reply(200, {
        id: 'inv_2',
        status: 'paid',
        amount: 100,
        currency: 'SAR',
        metadata: { paymentId },
        payments: [{ id: 'pay_2', status: 'paid', amount: 100, currency: 'SAR' }],
      });
    const v = await as(customers.b!, 'post', `/me/payments/${paymentId}/verify`).send({}).expect(200);
    expect(v.body.status).toBe('failed');
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(pay).toMatchObject({ status: 'failed', failureReason: 'AMOUNT_MISMATCH' });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: r.body.booking.id } })).status).toBe(
      'pending_payment',
    );
    await tick(400);
    expect(await prisma.notification.count({ where: { recipientId: financeId, eventKey: 'payment.anomaly' } })).toBe(1);
    // Another customer cannot verify or see this payment/booking.
    await as(customers.a!, 'post', `/me/payments/${paymentId}/verify`).send({}).expect(404);
    await as(customers.a!, 'get', `/me/bookings/${r.body.booking.id}`).expect(404);
  });

  describe('acceptance: bank transfer approve/reject notify the customer', () => {
    let bookingId = '';
    let paymentId = '';
    let propertyId = 0;

    const upload = (fields: Record<string, string>, file: Buffer | null = PNG) => {
      let req = as(customers.a!, 'post', `/me/payments/${paymentId}/transfer`);
      for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
      if (file) req = req.attach('receipt', file, { filename: 'r.png', contentType: 'image/png' });
      return req;
    };
    const fields = () => ({
      bankAccountId,
      senderName: 'عميل اختبار',
      senderBank: 'البنك الأهلي',
      transferredAt: new Date().toISOString().slice(0, 10),
      amount: '50000',
    });

    it('upload validates amount and file type, then waits for review with an extended hold', async () => {
      const p = await property();
      propertyId = p.id;
      const r = await as(customers.a!, 'post', '/me/bookings')
        .send({ propertyId: p.id, paymentType: 'deposit', paymentMethod: 'bank_transfer', termsVersion: '1' })
        .expect(201);
      bookingId = r.body.booking.id;
      paymentId = r.body.booking.payments[0].id;
      const wrongAmount = await upload({ ...fields(), amount: '49999' }).expect(400);
      expect(wrongAmount.body.error.details.fields.amount).toBe('amount_mismatch');
      const exe = await upload(fields(), Buffer.from('MZ\x90\x00 not an image')).expect(400);
      expect(exe.body.error.details.fields.receipt).toBe('invalid_type');
      const before = (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).holdExpiresAt;
      await upload(fields()).expect(200, { status: 'under_review' });
      const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(b.status).toBe('awaiting_transfer_review');
      expect(b.holdExpiresAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      await tick(300);
      expect(
        await prisma.notification.count({ where: { recipientId: financeId, eventKey: 'payment.transfer_submitted' } }),
      ).toBe(1);
    });

    it('reject → back to pending payment, customer told why; re-upload allowed', async () => {
      await as(manager, 'post', `/admin/payments/${paymentId}/transfer/reject`)
        .send({ reason: 'المبلغ غير واضح' })
        .expect(403);
      // The finance role requires 2FA to sign in; the review itself is exercised at service level.
      await app.get(TransfersService).reject(financeId, paymentId, 'المبلغ غير واضح');
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('pending_payment');
      await tick(300);
      const n = await as(customers.a!, 'get', '/me/notifications').expect(200);
      expect(n.body.items[0].title).toBe('لم يتم اعتماد التحويل: المبلغ غير واضح');
      await upload(fields()).expect(200);
    });

    it('approve → paid + confirmed + property reserved + customer notified', async () => {
      await app.get(TransfersService).approve(financeId, paymentId);
      const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
      expect(b.status).toBe('confirmed');
      expect(b.payments[0]).toMatchObject({ status: 'paid', receiptNumber: expect.any(String) });
      expect((await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })).status).toBe('reserved');
      await expect(app.get(TransfersService).approve(financeId, paymentId)).rejects.toMatchObject({
        code: 'TRANSFER_ALREADY_REVIEWED',
      });
      await tick(300);
      const n = await as(customers.a!, 'get', '/me/notifications').expect(200);
      expect(n.body.items.map((x: { eventKey: string }) => x.eventKey)).toEqual(
        expect.arrayContaining(['payment.transfer_approved', 'booking.confirmed']),
      );
    });

    it('admin cancel after confirmation releases the property (only if reserved by this booking)', async () => {
      const r = await as(manager, 'post', `/admin/bookings/${bookingId}/cancel`)
        .send({ reason: 'طلب العميل' })
        .expect(200);
      expect(r.body.status).toBe('cancelled');
      expect((await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })).status).toBe('available');
      const h = await prisma.propertyStatusHistory.findMany({ where: { propertyId }, orderBy: { createdAt: 'asc' } });
      expect(h.map((x) => `${x.from}>${x.to}:${x.reason}`)).toEqual([
        'available>reserved:booking_confirmed',
        'reserved>available:booking_cancelled',
      ]);
    });
  });

  it('acceptance: expired holds release; the customer is told', async () => {
    const p = await property();
    const r = await as(customers.b!, 'post', '/me/bookings')
      .send({ propertyId: p.id, paymentType: 'deposit', paymentMethod: 'bank_transfer', termsVersion: '1' })
      .expect(201);
    await prisma.booking.update({
      where: { id: r.body.booking.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await app.get(BookingsService).expireHolds()).toBe(1);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: r.body.booking.id }, include: { payments: true } });
    expect(b.status).toBe('expired');
    expect(b.payments[0]!.status).toBe('cancelled');
    expect((await prisma.property.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('available');
    // The property can be booked again.
    await as(customers.a!, 'post', '/me/bookings/quote').send({ propertyId: p.id }).expect(200);
    await tick(300);
    expect(await prisma.notification.count({ where: { eventKey: 'booking.expired' } })).toBe(1);
  });

  it('customer cancel; agents only see bookings of their listings', async () => {
    const own = await property();
    const r = await as(customers.b!, 'post', '/me/bookings')
      .send({ propertyId: own.id, paymentType: 'deposit', paymentMethod: 'bank_transfer', termsVersion: '1' })
      .expect(201);
    const list = await as(agent, 'get', '/admin/bookings').expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const otherAgent = await createStaff(app, 'agent', 'agent2@nx.test', 'Agent-Two-Pass-2026');
    void otherAgent;
    const agent2 = await login('agent2@nx.test', 'Agent-Two-Pass-2026');
    expect((await as(agent2, 'get', '/admin/bookings').expect(200)).body.items).toHaveLength(0);
    await as(agent2, 'get', `/admin/bookings/${r.body.booking.id}`).expect(404);
    const c = await as(customers.b!, 'post', `/me/bookings/${r.body.booking.id}/cancel`).expect(200);
    expect(c.body.status).toBe('cancelled');
    await as(customers.b!, 'post', `/me/bookings/${r.body.booking.id}/cancel`).expect(422);
  });
});
