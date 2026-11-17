import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Staff } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app-exception';
import { plainText } from '../../common/security/zod-helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PropertiesService } from '../properties/properties.service';

const lat = z.number().min(16).max(33);
const lng = z.number().min(34).max(56);
class CityDto extends createZodDto(
  z
    .object({
      id: z.string().regex(/^[a-z_]{2,40}$/),
      nameAr: plainText(60).pipe(z.string().min(2)),
      lat,
      lng,
      sort: z.number().int().min(0).max(999).default(0),
    })
    .strict(),
) {}
class CityUpdateDto extends createZodDto(
  z
    .object({
      nameAr: plainText(60).pipe(z.string().min(2)).optional(),
      lat: lat.optional(),
      lng: lng.optional(),
      sort: z.number().int().min(0).max(999).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
) {}
class DistrictDto extends createZodDto(
  z
    .object({
      cityId: z.string().regex(/^[a-z_]{2,40}$/),
      nameAr: plainText(60).pipe(z.string().min(2)),
      lat: lat.nullable().default(null),
      lng: lng.nullable().default(null),
    })
    .strict(),
) {}
class DistrictUpdateDto extends createZodDto(
  z
    .object({
      nameAr: plainText(60).pipe(z.string().min(2)).optional(),
      lat: lat.nullable().optional(),
      lng: lng.nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
) {}

/** docs/02 §6 Locations [settings.locations]; the editor's «إضافة حي» also uses POST /admin/districts. */
@ApiTags('admin/locations')
@Controller('admin')
export class LocationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly properties: PropertiesService,
  ) {}

  /** Read access for anyone who edits listings (city/district pickers). */
  @Staff('properties.view')
  @Get('cities')
  async cities() {
    const rows = await this.prisma.city.findMany({
      orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
      include: { districts: { orderBy: { nameAr: 'asc' } } },
    });
    return {
      items: rows.map((c) => ({
        ...c,
        lat: Number(c.lat),
        lng: Number(c.lng),
        districts: c.districts.map((d) => ({
          ...d,
          lat: d.lat === null ? null : Number(d.lat),
          lng: d.lng === null ? null : Number(d.lng),
        })),
      })),
    };
  }

  @Staff('settings.locations')
  @Post('cities')
  async createCity(@Body() b: CityDto) {
    if (await this.prisma.city.findUnique({ where: { id: b.id } }))
      throw new AppException('CONFLICT', 409, 'المدينة موجودة');
    const c = await this.prisma.city.create({ data: b });
    await this.audit.record({ action: 'city.create', entityType: 'city', entityId: c.id, after: b });
    await this.properties.invalidatePublic();
    return c;
  }

  @Staff('settings.locations')
  @Patch('cities/:id')
  async updateCity(@Param('id') id: string, @Body() b: CityUpdateDto) {
    const c = await this.prisma.city.update({ where: { id }, data: b }).catch(() => {
      throw new AppException('NOT_FOUND', 404, 'المدينة غير موجودة');
    });
    await this.audit.record({ action: 'city.update', entityType: 'city', entityId: id, after: b });
    await this.properties.invalidatePublic();
    return c;
  }

  /** Agents/editors may add a district inline from the property editor (docs/07 §3 «إضافة حي»). */
  @Staff('properties.edit')
  @Post('districts')
  async createDistrict(@Body() b: DistrictDto) {
    if (!(await this.prisma.city.findUnique({ where: { id: b.cityId } })))
      throw new AppException('NOT_FOUND', 404, 'المدينة غير موجودة');
    try {
      const d = await this.prisma.district.create({ data: b });
      await this.audit.record({ action: 'district.create', entityType: 'district', entityId: d.id, after: b });
      await this.properties.invalidatePublic();
      return d;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new AppException('CONFLICT', 409, 'الحي موجود في هذه المدينة');
      throw e;
    }
  }

  @Staff('settings.locations')
  @Patch('districts/:id')
  async updateDistrict(@Param('id') id: string, @Body() b: DistrictUpdateDto) {
    const d = await this.prisma.district.update({ where: { id }, data: b }).catch(() => {
      throw new AppException('NOT_FOUND', 404, 'الحي غير موجود');
    });
    await this.audit.record({ action: 'district.update', entityType: 'district', entityId: id, after: b });
    await this.properties.invalidatePublic();
    return d;
  }
}
