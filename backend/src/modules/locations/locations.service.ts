import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';

// ملاحظة: City/District مرجعية مشتركة (بلا tenantId). إدارتها متاحة لمن يملك settings.locations.
export const districtSchema = z.object({
  cityId: z.string().min(1),
  nameAr: z.string().min(2).max(60),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCities() {
    const cities = await this.prisma.city.findMany({
      include: { districts: { orderBy: { nameAr: 'asc' } } },
      orderBy: { sort: 'asc' },
    });
    // Prisma Decimal يُسلسَل نصّاً؛ اللوحة تتوقّع lat/lng أرقاماً.
    const num = (v: unknown): number | null => (v == null ? null : Number(v));
    return cities.map((c) => ({
      ...c,
      lat: num(c.lat),
      lng: num(c.lng),
      districts: c.districts.map((d) => ({ ...d, lat: num(d.lat), lng: num(d.lng) })),
    }));
  }

  async createDistrict(input: unknown) {
    const data = districtSchema.parse(input);
    const city = await this.prisma.city.findUnique({ where: { id: data.cityId } });
    if (!city) throw new BadRequestException('المدينة غير موجودة');
    const exists = await this.prisma.district.findFirst({ where: { cityId: data.cityId, nameAr: data.nameAr } });
    if (exists) throw new BadRequestException('الحي موجود مسبقاً');
    return this.prisma.district.create({ data });
  }

  async updateDistrict(id: string, input: unknown) {
    const data = districtSchema.partial().parse(input);
    const d = await this.prisma.district.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('الحي غير موجود');
    return this.prisma.district.update({ where: { id }, data });
  }

  async setDistrictActive(id: string, isActive: boolean) {
    const d = await this.prisma.district.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('الحي غير موجود');
    return this.prisma.district.update({ where: { id }, data: { isActive } });
  }
}
