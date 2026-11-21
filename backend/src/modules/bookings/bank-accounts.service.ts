import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantContext } from '../../common/tenant/tenant-context.js';
import { isValidSaudiIban } from './iban.js';

export const bankAccountSchema = z.object({
  bankName: z.string().min(2),
  beneficiaryName: z.string().min(2),
  iban: z.string().min(10),
  accountNumber: z.string().optional(),
  swift: z.string().optional(),
  isActive: z.boolean().optional(),
  sort: z.number().int().optional(),
});

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  list() {
    return this.prisma.scoped.bankAccount.findMany({ orderBy: { sort: 'asc' } });
  }

  async create(input: unknown) {
    const tenantId = this.tenant.requireTenantId();
    const data = bankAccountSchema.parse(input);
    if (!isValidSaudiIban(data.iban)) throw new BadRequestException('IBAN غير صالح');
    return this.prisma.scoped.bankAccount.create({
      data: { tenantId, ...data, iban: data.iban.replace(/\s/g, '').toUpperCase() },
    });
  }

  async update(id: string, input: unknown) {
    const data = bankAccountSchema.partial().parse(input);
    if (data.iban && !isValidSaudiIban(data.iban)) throw new BadRequestException('IBAN غير صالح');
    const existing = await this.prisma.scoped.bankAccount.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('الحساب غير موجود');
    return this.prisma.scoped.bankAccount.update({
      where: { id },
      data: { ...data, iban: data.iban ? data.iban.replace(/\s/g, '').toUpperCase() : undefined },
    });
  }

  async remove(id: string) {
    await this.prisma.scoped.bankAccount.deleteMany({ where: { id } });
    return { deleted: true };
  }
}
