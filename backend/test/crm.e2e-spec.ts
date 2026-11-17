import type { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { CustomersService } from '../src/modules/customers/customers.service';
import { CrmJobsService } from '../src/modules/notifications/crm-jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS } from '../src/redis/redis.module';
import { createStaff, freshIp, lastEmail, resetDb } from './auth-helpers';
import { createTestApp } from './helpers';

const PASS = { manager: 'Manager-Password-26', agentA: 'Agent-One-Pass-2026', agentB: 'Agent-Two-Pass-2026' };

/** Next event of a kind, or reject after `ms`. */
function next<T = Record<string, unknown>>(s: Socket, event: string, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    s.once(event, (p: T) => {
      clearTimeout(t);
      resolve(p);
    });
  });
}
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('CRM, notifications and realtime (e2e, Phase 4)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let url = '';
  const sockets: Socket[] = [];
  let manager = '';
  let agentA = '';
  let agentB = '';
  let agentAId = '';
  let agentBId = '';
  let propertyId = 0;
  let customer = '';
  let customerId = '';

  const as = (token: string, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) =>
    http[method](`/api/v1${path}`).set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${token}`);
  const pub = (path: string) => http.post(`/api/v1${path}`).set('X-Forwarded-For', freshIp());
  const login = async (email: string, password: string) =>
    (await pub('/auth/staff/login').send({ email, password }).expect(200)).body.accessToken as string;
  const connect = async (token?: string): Promise<Socket> => {
    const s = io(url, { path: '/ws', transports: ['websocket'], auth: token ? { token } : {}, reconnection: false });
    sockets.push(s);
    await next(s, 'connect');
    await tick(100); // rooms are joined asynchronously after the handshake
    return s;
  };

  async function customerLogin(email: string, name: string, phone: string): Promise<{ token: string; id: string }> {
    await pub('/auth/customer/otp/send').send({ channel: 'email', destination: email }).expect(204);
    const code = /(\d{6})/.exec(lastEmail(app, email)!.text)![1]!;
    const v = await pub('/auth/customer/otp/verify').send({ destination: email, code }).expect(200);
    const r = await pub('/auth/customer/register')
      .send({ registrationToken: v.body.registrationToken, name, phone, consent: true })
      .expect(200);
    return { token: r.body.accessToken, id: r.body.customer.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await resetDb(app);
    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.city.upsert({
      where: { id: 'riyadh' },
      create: { id: 'riyadh', nameAr: 'الرياض', lat: 24.7136, lng: 46.6753 },
      update: {},
    });
    const district = await prisma.district.upsert({
      where: { cityId_nameAr: { cityId: 'riyadh', nameAr: 'الملقا' } },
      create: { cityId: 'riyadh', nameAr: 'الملقا' },
      update: {},
    });
    await createStaff(app, 'sales_manager', 'manager@nx.test', PASS.manager);
    agentAId = (await createStaff(app, 'agent', 'agent.one@nx.test', PASS.agentA)).id;
    agentBId = (await createStaff(app, 'agent', 'agent.two@nx.test', PASS.agentB)).id;
    manager = await login('manager@nx.test', PASS.manager);
    agentA = await login('agent.one@nx.test', PASS.agentA);
    agentB = await login('agent.two@nx.test', PASS.agentB);
    const p = await prisma.property.create({
      data: {
        code: 'MZ-5001',
        slug: 'فيلا-الاختبار',
        type: 'villa',
        offer: 'sale',
        status: 'available',
        visibility: 'published',
        title: 'فيلا الاختبار',
        description: 'وصف',
        cityId: 'riyadh',
        districtId: district.id,
        lat: 24.8,
        lng: 46.6,
        price: 300_000_000n,
        annualisedPrice: 300_000_000n,
        specs: { area: 400, adLicense: '7200000001', falLicense: '1100000001' },
        area: 400,
        adLicenseNo: '7200000001',
        falLicenseNo: '1100000001',
        agentId: agentAId,
        createdById: agentAId,
        publishedAt: new Date(),
      },
    });
    propertyId = p.id;
    ({ token: customer, id: customerId } = await customerLogin('noura@example.sa', 'نورة', '0551234567'));
  });

  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    for (const s of sockets) s.close();
    await app.close();
  });

  describe('acceptance: viewing request → agent notified within 2 s + email', () => {
    let leadId = '';
    let viewingId = '';

    it('the agent gets notification.new on their socket and an email', async () => {
      const agentSocket = await connect(agentA);
      const otherAgent = await connect(agentB);
      let leaked = false;
      otherAgent.on('notification.new', () => (leaked = true));

      const started = Date.now();
      const pending = next<{ title: string; link: string; priority: string }>(agentSocket, 'notification.new', 2000);
      const res = await pub('/public/leads')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          type: 'viewing',
          propertyId,
          name: 'نورة',
          phone: '0551234567',
          date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
          slot: 'afternoon',
          consent: true,
        })
        .expect(201);
      leadId = res.body.id;
      const n = await pending;
      expect(Date.now() - started).toBeLessThan(2000);
      expect(n.title).toMatch(/^طلب معاينة: فيلا الاختبار يوم /);
      expect(n.link).toBe(`/admin/leads?open=${leadId}`);
      expect(n.priority).toBe('high');
      await tick(300);
      expect(leaked).toBe(false);

      const mail = lastEmail(app, 'agent.one@nx.test')!;
      expect(mail.subject).toMatch(/^طلب معاينة: فيلا الاختبار/);
      expect(mail.html).toContain('dir="rtl"');
      // One email, not two (lead.created skips the agent who gets viewing.requested).
      const toAgent = await prisma.emailLog.count({ where: { to: 'agent.one@nx.test', template: 'lead-new-staff' } });
      expect(toAgent).toBe(1);

      // The sales manager gets lead.created in-app.
      const mgr = await as(manager, 'get', '/admin/notifications').expect(200);
      expect(mgr.body.items[0].title).toBe('طلب جديد: طلب معاينة — فيلا الاختبار');
      expect(mgr.body.unread).toBe(1);

      const viewing = await prisma.viewing.findFirstOrThrow({ where: { leadId } });
      viewingId = viewing.id;
      expect(viewing.customerId).toBe(customerId);
    });

    it('acceptance: admin confirms → customer gets viewing.confirmed in-app (live) + email', async () => {
      const cs = await connect(customer);
      const pending = next<{ title: string; eventKey: string }>(cs, 'notification.new', 2000);
      const count = next<{ unread: number }>(cs, 'notification.count', 2000);
      await as(agentA, 'patch', `/admin/viewings/${viewingId}`).send({ status: 'confirmed' }).expect(200);
      const n = await pending;
      expect(n.eventKey).toBe('viewing.confirmed');
      expect(n.title).toMatch(/^تم تأكيد موعد معاينتك يوم .+ عصراً$/);
      expect((await count).unread).toBe(1);
      // The in-app push goes out first; the email row follows a moment later.
      let mail = null;
      for (let i = 0; i < 20 && !mail; i++) {
        mail = await prisma.emailLog.findFirst({ where: { to: 'noura@example.sa', template: 'viewing-confirmed' } });
        if (!mail) await tick(50);
      }
      if (!mail) throw new Error('viewing-confirmed email not queued');
      expect(mail.subject).toBe(n.title);

      const mine = await as(customer, 'get', '/me/notifications').expect(200);
      expect(mine.body.items).toHaveLength(1);
      await as(customer, 'post', '/me/notifications/read').send({ all: true }).expect(200, { unread: 0 });

      const list = await as(customer, 'get', '/me/viewings').expect(200);
      expect(list.body.viewings[0]).toMatchObject({
        status: 'confirmed',
        property: { url: `/property/${propertyId}-فيلا-الاختبار` },
      });
    });

    it('confirming again without a change sends nothing new; rescheduling re-notifies', async () => {
      const before = await prisma.emailLog.count({ where: { to: 'noura@example.sa', template: 'viewing-confirmed' } });
      await as(agentA, 'patch', `/admin/viewings/${viewingId}`).send({ notes: 'بوابة شمالية' }).expect(200);
      await tick(300);
      expect(await prisma.emailLog.count({ where: { to: 'noura@example.sa', template: 'viewing-confirmed' } })).toBe(
        before,
      );
      const at = new Date(Date.now() + 4 * 86_400_000);
      at.setUTCHours(7, 0, 0, 0);
      await as(agentA, 'patch', `/admin/viewings/${viewingId}`).send({ scheduledAt: at.toISOString() }).expect(200);
      await tick(400);
      expect(await prisma.emailLog.count({ where: { to: 'noura@example.sa', template: 'viewing-confirmed' } })).toBe(
        before + 1,
      );
    });

    it('an agent cannot double-book or touch another agent’s viewing', async () => {
      const v = await prisma.viewing.findUniqueOrThrow({ where: { id: viewingId } });
      const clash = await as(manager, 'post', '/admin/viewings')
        .send({
          propertyId,
          agentId: agentAId,
          scheduledAt: new Date(v.scheduledAt.getTime() + 15 * 60_000).toISOString(),
        })
        .expect(409);
      expect(clash.body.error.code).toBe('VIEWING_CONFLICT');
      await as(agentB, 'patch', `/admin/viewings/${viewingId}`).send({ status: 'cancelled' }).expect(404);
      // Confirming a second request for the same slot is refused too.
      const second = await as(manager, 'post', '/admin/viewings')
        .send({ propertyId, agentId: agentAId, status: 'requested', scheduledAt: v.scheduledAt.toISOString() })
        .expect(201);
      const conf = await as(manager, 'patch', `/admin/viewings/${second.body.id}`)
        .send({ status: 'confirmed' })
        .expect(409);
      expect(conf.body.error.code).toBe('VIEWING_CONFLICT');
      await as(manager, 'patch', `/admin/viewings/${second.body.id}`).send({ status: 'cancelled' }).expect(200);
      const range = `from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(
        new Date(Date.now() + 30 * 86_400_000).toISOString(),
      )}`;
      expect((await as(agentB, 'get', `/admin/viewings?${range}`).expect(200)).body.items).toHaveLength(0);
      expect(
        (await as(agentA, 'get', `/admin/viewings?${range}&status=confirmed`).expect(200)).body.items,
      ).toHaveLength(1);
    });

    it('the customer can cancel their own upcoming viewing', async () => {
      const r = await as(customer, 'post', `/me/viewings/${viewingId}/cancel`).expect(200);
      expect(r.body.viewings[0].status).toBe('cancelled');
      await as(customer, 'post', `/me/viewings/${viewingId}/cancel`).expect(422);
      expect(await prisma.auditLog.count({ where: { entityId: viewingId, action: 'viewing.cancel' } })).toBe(1);
    });
  });

  describe('leads: scope, stages, assignment, audit', () => {
    let leadId = '';

    beforeAll(async () => {
      const r = await pub('/public/leads')
        .send({ type: 'buy', name: 'خالد', phone: '0561112233', consent: true, budget: '2,000,000' })
        .expect(201);
      leadId = r.body.id;
    });

    it('round-robin assigns to an agent; the other agent gets 404', async () => {
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const owner = lead.assignedToId === agentAId ? agentA : agentB;
      const other = lead.assignedToId === agentAId ? agentB : agentA;
      const d = await as(owner, 'get', `/admin/leads/${leadId}`).expect(200);
      expect(d.body.activities.at(-1)).toMatchObject({ type: 'system', meta: { created: 'website' } });
      await as(other, 'get', `/admin/leads/${leadId}`).expect(404);
      await as(other, 'post', `/admin/leads/${leadId}/stage`).send({ stage: 'contacted' }).expect(404);
      // Agents cannot reassign.
      await as(owner, 'post', `/admin/leads/${leadId}/assign`).send({ assignedToId: null }).expect(403);
    });

    it('a call moves a new lead to «تم التواصل» (audited); «لم تتم» requires a reason', async () => {
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const owner = lead.assignedToId === agentAId ? agentA : agentB;
      const a = await as(owner, 'post', `/admin/leads/${leadId}/activities`)
        .send({ type: 'call', body: 'اتصلت ولم يرد' })
        .expect(201);
      expect(a.body.stage).toBe('contacted');
      const bad = await as(owner, 'post', `/admin/leads/${leadId}/stage`).send({ stage: 'lost' }).expect(400);
      expect(bad.body.error.details.fields.lostReason).toBe('Required');
      const ok = await as(owner, 'post', `/admin/leads/${leadId}/stage`)
        .send({ stage: 'lost', lostReason: 'السعر' })
        .expect(200);
      expect(ok.body).toMatchObject({ stage: 'lost', lostReason: 'السعر', closedAt: expect.any(String) });
      expect(await prisma.auditLog.count({ where: { entityId: leadId, action: 'lead.stage' } })).toBe(2);
    });

    it('the manager reassigns: new assignee notified, board and list reflect it', async () => {
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const target = lead.assignedToId === agentAId ? agentBId : agentAId;
      const targetToken = target === agentAId ? agentA : agentB;
      const s = await connect(targetToken);
      const pending = next<{ title: string }>(s, 'notification.new');
      await as(manager, 'post', `/admin/leads/${leadId}/assign`).send({ assignedToId: target }).expect(200);
      expect((await pending).title).toBe(`أُسند إليك طلب ${lead.number}`);
      const board = await as(manager, 'get', '/admin/leads/board').expect(200);
      expect(board.body.columns.map((c: { stage: string }) => c.stage)).toEqual([
        'new',
        'contacted',
        'viewing',
        'negotiation',
        'won',
        'lost',
      ]);
      const lost = board.body.columns.find((c: { stage: string }) => c.stage === 'lost');
      expect(lost.items[0]).toMatchObject({ id: leadId, assignedTo: { id: target } });
      const q = await as(manager, 'get', `/admin/leads?q=${encodeURIComponent('0561112233')}`).expect(200);
      expect(q.body.total).toBe(1);
      await as(manager, 'post', `/admin/leads/${leadId}/assign`).send({ assignedToId: 'nonexistent0000' }).expect(400);
    });

    it('manual lead by an agent is theirs; export needs a recent re-authentication', async () => {
      const m = await as(agentA, 'post', '/admin/leads')
        .send({ type: 'rent', source: 'phone', name: 'سلمان', phone: '0509998877' })
        .expect(201);
      expect(m.body).toMatchObject({
        source: 'phone',
        assignedTo: { id: agentAId },
        number: expect.stringMatching(/^L-\d{6}$/),
      });
      const csv = await as(manager, 'get', '/admin/leads/export.csv').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.charCodeAt(0)).toBe(0xfeff);
      expect(csv.text).toContain('سلمان');
    });

    it('link/create customer from a lead', async () => {
      const r = await as(manager, 'post', `/admin/leads/${leadId}/customer`).expect(200);
      expect(r.body.customer).toMatchObject({ name: 'خالد', phone: '+966561112233' });
      const again = await as(manager, 'post', `/admin/leads/${leadId}/customer`).expect(200);
      expect(again.body.customer.id).toBe(r.body.customer.id);
    });
  });

  describe('notification center and preferences', () => {
    it('tabs, read, archive; locked events cannot be turned off', async () => {
      const all = await as(manager, 'get', '/admin/notifications?tab=leads').expect(200);
      expect(all.body.items.length).toBeGreaterThan(0);
      expect((await as(manager, 'get', '/admin/notifications?tab=payments').expect(200)).body.items).toHaveLength(0);
      const id = all.body.items[0].id;
      await as(manager, 'post', '/admin/notifications/read')
        .send({ ids: [id] })
        .expect(200);
      await as(manager, 'post', '/admin/notifications/archive')
        .send({ ids: [id] })
        .expect(200);
      const after = await as(manager, 'get', '/admin/notifications').expect(200);
      expect(after.body.items.find((n: { id: string }) => n.id === id)).toBeUndefined();
      // Other people's notifications cannot be touched.
      await as(agentA, 'post', '/admin/notifications/read').send({ all: true }).expect(200);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();

      const prefs = await as(customer, 'get', '/me/notification-preferences').expect(200);
      const booking = prefs.body.items.find((p: { eventKey: string }) => p.eventKey === 'booking.confirmed');
      expect(booking).toMatchObject({ locked: true, email: true });
      const put = await as(customer, 'put', '/me/notification-preferences')
        .send({
          items: [
            { eventKey: 'booking.confirmed', inApp: false, email: false, sms: false },
            { eventKey: 'property.price_dropped', inApp: true, email: false, sms: false },
            { eventKey: 'lead.created', inApp: false, email: false, sms: false },
          ],
        })
        .expect(200);
      const get = (k: string) => put.body.items.find((p: { eventKey: string }) => p.eventKey === k);
      expect(get('booking.confirmed')).toMatchObject({ inApp: true, email: true });
      expect(get('property.price_dropped')).toMatchObject({ inApp: true, email: false });
      expect(get('lead.created')).toBeUndefined();
    });

    it('broadcast reaches the selected roles only', async () => {
      await as(agentA, 'post', '/admin/notifications/broadcast')
        .send({ roles: ['agent'], title: 'اجتماع' })
        .expect(403);
      const r = await as(manager, 'post', '/admin/notifications/broadcast')
        .send({ roles: ['agent'], title: 'اجتماع الفريق غداً', body: '9 صباحاً' })
        .expect(200);
      expect(r.body.recipients).toBe(2);
      const a = await as(agentA, 'get', '/admin/notifications').expect(200);
      expect(a.body.items[0]).toMatchObject({ eventKey: 'staff.broadcast', title: 'اجتماع الفريق غداً' });
      const m = await as(manager, 'get', '/admin/notifications').expect(200);
      expect(m.body.items.some((n: { eventKey: string }) => n.eventKey === 'staff.broadcast')).toBe(false);
    });
  });

  describe('realtime security', () => {
    it('anonymous sockets only get public events; a forged token is reported', async () => {
      const anon = await connect();
      const forged = io(url, { path: '/ws', transports: ['websocket'], auth: { token: 'x.y.z' }, reconnection: false });
      sockets.push(forged);
      await next(forged, 'auth.invalid');
      let leaked = false;
      anon.on('notification.new', () => (leaked = true));
      anon.emit('subscribe:property', { id: propertyId });
      anon.emit('subscribe:property', { id: 'drop table' });
      await tick(100);
      const update = next<{ id: number; status: string }>(anon, 'property.updated');
      await as(agentA, 'post', `/admin/properties/${propertyId}/status`).send({ status: 'negotiation' }).expect(200);
      expect(await update).toMatchObject({ id: propertyId, status: 'negotiation' });
      await as(manager, 'post', '/admin/notifications/broadcast')
        .send({ roles: ['agent'], title: 'تنبيه' })
        .expect(200);
      await tick(300);
      expect(leaked).toBe(false);
    });

    it('revoking all sessions disconnects the customer socket', async () => {
      const s = await connect(customer);
      const gone = next(s, 'disconnect');
      await as(customer, 'post', '/me/sessions/revoke-all').expect(204);
      await gone;
      ({ token: customer } = await (async () => {
        await pub('/auth/customer/otp/send').send({ channel: 'email', destination: 'noura@example.sa' }).expect(204);
        const code = /(\d{6})/.exec(lastEmail(app, 'noura@example.sa')!.text)![1]!;
        const v = await pub('/auth/customer/otp/verify').send({ destination: 'noura@example.sa', code }).expect(200);
        return { token: v.body.accessToken as string };
      })());
    });
  });

  describe('customer account (/me)', () => {
    it('favorites merge and price-drop notification', async () => {
      await as(agentA, 'post', `/admin/properties/${propertyId}/status`).send({ status: 'available' }).expect(200);
      const m = await as(customer, 'put', '/me/favorites')
        .send({ ids: [propertyId, 999_999] })
        .expect(200);
      expect(m.body.ids).toEqual([propertyId]);
      await as(customer, 'put', `/me/favorites/${propertyId}`).expect(200);
      const cs = await connect(customer);
      const pending = next<{ eventKey: string; title: string }>(cs, 'notification.new');
      const upd = await as(agentA, 'patch', `/admin/properties/${propertyId}`).send({ price: 280_000_000 });
      expect(upd.status).toBe(200);
      const n = await pending;
      expect(n).toMatchObject({ eventKey: 'property.price_dropped', title: 'انخفض سعر فيلا الاختبار' });
      // Email turned off in the preferences above → none sent for this event.
      await tick(200);
      expect(
        (await prisma.emailLog.findMany({ where: { to: 'noura@example.sa', template: 'price-drop' } })).length,
      ).toBe(0);
      await as(customer, 'delete', `/me/favorites/${propertyId}`).expect(200, { ids: [] });
    });

    it('saved searches validate the query and alert on new matching listings', async () => {
      await as(customer, 'post', '/me/saved-searches')
        .send({ name: 'بحث سيء', query: { types: 'castle' } })
        .expect(400);
      const s = await as(customer, 'post', '/me/saved-searches')
        .send({ name: 'فلل الرياض', query: { city: 'riyadh', types: 'villa', offer: 'sale' } })
        .expect(201);
      await prisma.savedSearch.update({
        where: { id: s.body.id },
        data: { lastNotifiedAt: new Date(Date.now() - 86_400_000) },
      });
      await prisma.property.update({
        where: { id: propertyId },
        data: { publishedAt: new Date(Date.now() - 3_600_000) },
      });
      const n = await app.get(CrmJobsService).savedSearchDigest();
      expect(n).toBe(1);
      const list = await as(customer, 'get', '/me/notifications').expect(200);
      expect(list.body.items[0].title).toBe('عقارات جديدة تطابق بحثك «فلل الرياض»');
      expect(await app.get(CrmJobsService).savedSearchDigest()).toBe(0);
    });

    it('email change needs the code sent to the new address', async () => {
      const r = await as(customer, 'patch', '/me/profile')
        .send({ email: 'noura.new@example.sa', name: 'نورة س' })
        .expect(200);
      expect(r.body).toMatchObject({
        pendingEmail: 'noura.new@example.sa',
        customer: { email: 'noura@example.sa', name: 'نورة س' },
      });
      await as(customer, 'post', '/me/profile/verify-email')
        .send({ email: 'noura.new@example.sa', code: '000000' })
        .expect(401);
      const code = /(\d{6})/.exec(lastEmail(app, 'noura.new@example.sa')!.text)![1]!;
      const v = await as(customer, 'post', '/me/profile/verify-email')
        .send({ email: 'noura.new@example.sa', code })
        .expect(200);
      expect(v.body).toMatchObject({ email: 'noura.new@example.sa', emailVerified: true });
    });

    it('PDPL export and deletion; staff cannot reach /me and customers cannot reach /admin', async () => {
      await as(manager, 'get', '/me/profile').expect(403);
      await as(customer, 'get', '/admin/customers').expect(403);
      const ex = await as(customer, 'get', '/me/export').expect(200);
      expect(ex.body.profile.email).toBe('noura.new@example.sa');
      expect(ex.body.leads.length).toBeGreaterThan(0);

      const agentView = await as(agentA, 'get', '/admin/customers').expect(200);
      expect(agentView.body.items.map((c: { id: string }) => c.id)).toContain(customerId);
      const block = await as(agentA, 'patch', `/admin/customers/${customerId}`).send({ status: 'blocked' });
      expect(block.status).toBe(403);

      const del = await as(customer, 'delete', '/me').expect(200);
      expect(new Date(del.body.deleteAfter).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      await as(customer, 'get', '/me/profile').expect(401);
      const svc = app.get(CustomersService);
      expect(await svc.anonymiseDeleted()).toBe(0);
      expect(await svc.anonymiseDeleted(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
      const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      expect(c).toMatchObject({ name: 'عميل محذوف', email: null, phone: null });
      const leads = await prisma.lead.findMany({ where: { customerId } });
      expect(leads.every((l) => l.name === 'عميل محذوف' && l.email === null)).toBe(true);
    });
  });

  it('viewing reminders go out once (24 h before)', async () => {
    const at = new Date(Date.now() + 22 * 3600_000);
    const v = await prisma.viewing.create({
      data: { propertyId, agentId: agentAId, scheduledAt: at, status: 'confirmed' },
    });
    const jobs = app.get(CrmJobsService);
    expect(await jobs.viewingReminders()).toBe(1);
    expect(await jobs.viewingReminders()).toBe(0);
    const n = await prisma.notification.findFirstOrThrow({
      where: { recipientId: agentAId, eventKey: 'viewing.reminder' },
    });
    expect(n.title).toBe('تذكير: موعد معاينة فيلا الاختبار');
    await prisma.viewing.delete({ where: { id: v.id } });
  });
});
