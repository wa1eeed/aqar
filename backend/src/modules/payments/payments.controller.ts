import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Prisma, type PaymentMethod, type PaymentStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Customer, RecentAuth, Staff } from '../../common/auth/decorators';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { plainText } from '../../common/security/zod-helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENTS_QUEUE } from '../../queue/queue.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { IntegrationsGateway } from '../integrations/gateway.service';
import { moyasarVerifyWebhook } from '../integrations/providers/moyasar';
import { formatIban, isValidSaudiIban, normaliseIban } from './iban';
import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';
import { TransfersService } from './transfers.service';

const MAX_UPLOAD = 10 * 1024 * 1024;

function sendPdf(res: Response, body: Buffer, filename: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(body);
}
const cuid = z.string().regex(/^[a-z0-9]{10,40}$/i);

class TransferDto extends createZodDto(
  z
    .object({
      bankAccountId: cuid,
      senderName: plainText(80).pipe(z.string().min(2)),
      senderBank: plainText(80).pipe(z.string().min(2)),
      transferReference: z.union([z.literal(''), plainText(60)]).nullish(),
      transferredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'invalid_date'),
      amount: z.coerce.number().positive().max(1e12),
    })
    .strict(),
) {}
class VerifyDto extends createZodDto(
  z
    .object({
      providerPaymentId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{6,80}$/)
        .optional(),
    })
    .strict(),
) {}
class RefundDto extends createZodDto(
  z
    .object({
      amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      reason: plainText(300).pipe(z.string().min(2)),
    })
    .strict(),
) {}
class RejectDto extends createZodDto(z.object({ reason: plainText(300).pipe(z.string().min(2)) }).strict()) {}
class PaymentsQuery extends createZodDto(
  z
    .object({
      status: z
        .enum([
          'initiated',
          'pending',
          'paid',
          'failed',
          'under_review',
          'rejected',
          'cancelled',
          'refunded',
          'partially_refunded',
        ])
        .optional(),
      method: z.enum(['moyasar', 'bank_transfer', 'rize']).optional(),
      q: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict(),
) {}
const bankAccountFields = {
  bankName: plainText(80).pipe(z.string().min(2)),
  beneficiaryName: plainText(120).pipe(z.string().min(2)),
  iban: z.string().max(40).transform(normaliseIban).refine(isValidSaudiIban, 'invalid_iban'),
  accountNumber: z.union([z.literal(''), z.string().regex(/^[0-9-]{4,30}$/, 'invalid_account_number')]).nullish(),
  swift: z.union([z.literal(''), z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'invalid_swift')]).nullish(),
  isActive: z.boolean(),
  sort: z.number().int().min(0).max(999),
};
class BankAccountDto extends createZodDto(
  z
    .object({
      ...bankAccountFields,
      isActive: bankAccountFields.isActive.default(true),
      sort: bankAccountFields.sort.default(0),
    })
    .strict(),
) {}
class BankAccountUpdateDto extends createZodDto(z.object(bankAccountFields).partial().strict()) {}

/** Customer payment actions (docs/02 §5). */
@ApiTags('me/payments')
@Controller('me/payments')
export class MePaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly transfers: TransfersService,
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptsService,
  ) {}

  /** Payment receipt PDF of one of the customer's paid payments. */
  @Customer()
  @RateLimit({ name: 'receipt-download', limit: 30, windowSec: 3600, by: 'ip' })
  @Get(':id/receipt.pdf')
  async receipt(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.payment.findFirst({
      where: { id, booking: { customerId: user.id }, receiptNumber: { not: null } },
      select: { receiptNumber: true },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'لا يوجد إيصال لهذه الدفعة');
    sendPdf(res, await this.receipts.file(id), `${p.receiptNumber}.pdf`);
  }

  /** Upload a bank transfer receipt (multipart: receipt + fields); the booking waits for review. */
  @Customer()
  @RateLimit({ name: 'transfer-upload', limit: 10, windowSec: 3600, by: 'ip' })
  @HttpCode(200)
  @Post(':id/transfer')
  @UseInterceptors(
    FileInterceptor('receipt', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1, fields: 10 } }),
  )
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() b: TransferDto,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return this.transfers.submit(user, id, b, file);
  }

  /** Called by the result page after a provider redirect: re-fetches the payment from the provider. */
  @Customer()
  @RateLimit({ name: 'payment-verify', limit: 30, windowSec: 60, by: 'ip' })
  @HttpCode(200)
  @Post(':id/verify')
  async verify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: VerifyDto) {
    const p = await this.prisma.payment.findFirst({
      where: { id, booking: { customerId: user.id } },
      select: { id: true },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'الدفعة غير موجودة');
    return this.payments.reconcile(id, {
      source: 'callback',
      ...(b.providerPaymentId ? { hintPaymentId: b.providerPaymentId } : {}),
    });
  }
}

/** Payments administration (docs/02 §6, docs/07 §6). */
@ApiTags('admin/payments')
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly transfers: TransfersService,
    private readonly audit: AuditService,
    private readonly receipts: ReceiptsService,
  ) {}

  /** Payment receipt PDF (staff copy). */
  @Staff('payments.view')
  @Get('payments/:id/receipt.pdf')
  async receiptPdf(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.payment.findFirst({
      where: { id, receiptNumber: { not: null } },
      select: { receiptNumber: true },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'لا يوجد إيصال لهذه الدفعة');
    sendPdf(res, await this.receipts.file(id), `${p.receiptNumber}.pdf`);
  }

  /** Payments with filters (status, method, search) and this month's totals; `status=under_review` is the transfer review queue. */
  @Staff('payments.view')
  @Get('payments')
  async list(@Query() q: PaymentsQuery) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status as PaymentStatus } : {}),
      ...(q.method ? { method: q.method as PaymentMethod } : {}),
      ...(q.q
        ? {
            OR: [
              { receiptNumber: { contains: q.q.toUpperCase() } },
              { booking: { number: { contains: q.q.toUpperCase() } } },
              { booking: { customer: { name: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [items, total, month, review] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          method: true,
          status: true,
          amount: true,
          refundedAmount: true,
          receiptNumber: true,
          paidAt: true,
          createdAt: true,
          failureReason: true,
          booking: {
            select: {
              id: true,
              number: true,
              customer: { select: { id: true, name: true } },
              property: { select: { id: true, code: true, title: true } },
            },
          },
          transfer: { select: { status: true, createdAt: true } },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { status: { in: ['paid', 'partially_refunded', 'refunded'] }, paidAt: { gte: monthStart } },
        _sum: { amount: true, refundedAmount: true },
      }),
      this.prisma.payment.count({ where: { status: 'under_review' } }),
    ]);
    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      pages: Math.ceil(total / q.pageSize),
      month: month.map((m) => ({ method: m.method, paid: m._sum.amount ?? 0n, refunded: m._sum.refundedAmount ?? 0n })),
      underReview: review,
    };
  }

  /** Payment details with provider ids, events and the transfer submission. */
  @Staff('payments.view')
  @Get('payments/:id')
  async get(@Param('id') id: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        transfer: { include: { bankAccount: true } },
        booking: {
          include: {
            customer: { select: { id: true, name: true, email: true, phone: true } },
            property: { select: { id: true, code: true, title: true } },
          },
        },
      },
    });
    if (!p) throw new AppException('NOT_FOUND', 404, 'الدفعة غير موجودة');
    const { idempotencyKey: _k, providerPayload: _pp, transfer, ...rest } = p;
    void _k;
    void _pp;
    return {
      ...rest,
      transfer: transfer ? { ...transfer, receiptKey: undefined, hasReceipt: !!transfer.receiptKey } : null,
    };
  }

  /** Refund all or part of a paid payment (Moyasar via the gateway; bank transfers recorded as refunded by finance). */
  @Staff('payments.refund')
  @RecentAuth()
  @HttpCode(200)
  @Post('payments/:id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: RefundDto) {
    return this.payments.refund(user.id, id, BigInt(b.amount), b.reason);
  }

  /** Re-check a pending online payment with the provider now. */
  @Staff('payments.view')
  @HttpCode(200)
  @Post('payments/:id/reconcile')
  reconcile(@Param('id') id: string) {
    return this.payments.reconcile(id, { source: 'admin' });
  }

  /** Approve a bank transfer receipt: payment paid, booking confirmed, customer notified. */
  @Staff('payments.review')
  @HttpCode(200)
  @Post('payments/:id/transfer/approve')
  async approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.transfers.approve(user.id, id);
    return this.get(id);
  }

  /** Reject a bank transfer receipt with a reason; the customer may upload again until the hold expires. */
  @Staff('payments.review')
  @HttpCode(200)
  @Post('payments/:id/transfer/reject')
  async reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: RejectDto) {
    await this.transfers.reject(user.id, id, b.reason);
    return this.get(id);
  }

  /** The uploaded receipt file (streamed after the permission check; never cached). */
  @Staff('payments.review')
  @Get('payments/:id/transfer/receipt')
  async receipt(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const f = await this.transfers.receiptFile(id);
    await this.audit.record({
      action: 'payment.transfer_receipt_viewed',
      entityType: 'payment',
      entityId: id,
      actor: { type: 'staff', id: user.id },
    });
    res.setHeader('Content-Type', f.type);
    res.setHeader('Content-Disposition', `inline; filename="receipt-${id}.${f.ext}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.send(f.body);
  }

  // ───────────── bank accounts (settings → التحويل البنكي) ─────────────

  /** Company bank accounts shown to customers for transfers. */
  @Staff('settings.payments')
  @Get('bank-accounts')
  async accounts() {
    const items = await this.prisma.bankAccount.findMany({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
    return { items: items.map((a) => ({ ...a, ibanFormatted: formatIban(a.iban) })) };
  }

  /** Add a bank account (IBAN validated with mod-97; re-authentication required). */
  @Staff('settings.payments')
  @RecentAuth()
  @Post('bank-accounts')
  async createAccount(@CurrentUser() user: AuthUser, @Body() b: BankAccountDto) {
    const a = await this.prisma.bankAccount.create({
      data: { ...b, accountNumber: b.accountNumber || null, swift: b.swift || null },
    });
    await this.audit.record({
      action: 'bank_account.create',
      entityType: 'bank_account',
      entityId: a.id,
      after: { bankName: a.bankName, iban: `…${a.iban.slice(-4)}` },
      actor: { type: 'staff', id: user.id },
    });
    return a;
  }

  /** Edit a bank account (re-authentication required). */
  @Staff('settings.payments')
  @RecentAuth()
  @Patch('bank-accounts/:id')
  async updateAccount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: BankAccountUpdateDto) {
    const data = {
      ...b,
      ...(b.accountNumber !== undefined ? { accountNumber: b.accountNumber || null } : {}),
      ...(b.swift !== undefined ? { swift: b.swift || null } : {}),
    };
    const a = await this.prisma.bankAccount.update({ where: { id }, data }).catch(() => {
      throw new AppException('NOT_FOUND', 404, 'الحساب غير موجود');
    });
    await this.audit.record({
      action: 'bank_account.update',
      entityType: 'bank_account',
      entityId: id,
      after: { ...b, ...(b.iban ? { iban: `…${b.iban.slice(-4)}` } : {}) },
      actor: { type: 'staff', id: user.id },
    });
    return a;
  }

  /** Delete a bank account that has no transfer submissions (otherwise deactivate it). */
  @Staff('settings.payments')
  @RecentAuth()
  @HttpCode(204)
  @Delete('bank-accounts/:id')
  async deleteAccount(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    if (await this.prisma.bankTransferSubmission.count({ where: { bankAccountId: id } })) {
      throw new AppException('BANK_ACCOUNT_IN_USE', 409, 'الحساب مرتبط بتحويلات سابقة، يمكنك تعطيله بدلاً من حذفه');
    }
    await this.prisma.bankAccount.delete({ where: { id } }).catch(() => {
      throw new AppException('NOT_FOUND', 404, 'الحساب غير موجود');
    });
    await this.audit.record({
      action: 'bank_account.delete',
      entityType: 'bank_account',
      entityId: id,
      actor: { type: 'staff', id: user.id },
    });
  }
}

/** Moyasar webhook (docs/02 §7): verify the shared secret → store once → queue a reconcile → 200. */
@ApiTags('webhooks')
@Controller('webhooks')
export class MoyasarWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntegrationsGateway,
    @Inject(PAYMENTS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Moyasar payment events; the payment is re-fetched from Moyasar before anything changes. */
  @Public()
  @RateLimit({ name: 'webhook-moyasar', limit: 600, windowSec: 60, by: 'ip' })
  @HttpCode(200)
  @Post('moyasar')
  async moyasar(@Req() req: Request) {
    const v = moyasarVerifyWebhook(await this.gateway.payments().webhookSecret(), req.body);
    if (!v.valid || !v.externalId) throw new AppException('INVALID_SIGNATURE', 401, 'توقيع غير صالح');
    const { secret_token: _s, ...payload } = (req.body ?? {}) as Record<string, unknown>;
    void _s;
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: 'moyasar',
          externalId: v.externalId,
          type: v.type,
          payload: payload as Prisma.InputJsonValue,
          signatureValid: true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return { received: true, duplicate: true };
      throw e;
    }
    const metaId = typeof v.payment?.metadata?.paymentId === 'string' ? v.payment.metadata.paymentId : null;
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          ...(metaId ? [{ id: metaId }] : []),
          ...(v.payment?.id ? [{ providerPaymentId: v.payment.id }] : []),
          ...(v.payment?.invoice_id ? [{ providerInvoiceId: v.payment.invoice_id }] : []),
        ],
      },
      select: { id: true },
    });
    if (payment) {
      await this.prisma.paymentEvent.create({
        data: { paymentId: payment.id, type: 'webhook', payload: { type: v.type } },
      });
      await this.queue.add(
        'reconcile',
        { paymentId: payment.id, hintPaymentId: v.payment?.id ?? null },
        {
          jobId: `reconcile-${payment.id}-${v.externalId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
        },
      );
    }
    await this.prisma.webhookEvent.update({
      where: { provider_externalId: { provider: 'moyasar', externalId: v.externalId } },
      data: { processedAt: new Date() },
    });
    return { received: true };
  }
}
