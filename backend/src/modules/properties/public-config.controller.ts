import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { schemaData } from '@manzilah/schema';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { Public } from '../auth/decorators.js';

@ApiTags('public:config')
@Public()
@Controller('public')
export class PublicConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get('config')
  async config() {
    const [branding, contact, licensing, maps, booking, features] = (await Promise.all([
      this.settings.get('branding'),
      this.settings.get('contact'),
      this.settings.get('licensing'),
      this.settings.get('maps'),
      this.settings.get('booking'),
      this.settings.get('features'),
    ])) as [
      Record<string, unknown> & { colors: Record<string, string>; fonts: Record<string, string>; radius: string },
      Record<string, unknown>,
      Record<string, unknown>,
      { nearbyRadius: number },
      { enabled: boolean },
      Record<string, unknown>,
    ];
    const mapsPublic = await this.integrations.mapsPublicConfig();
    const radiusByShape: Record<string, number> = { sharp: 6, soft: 16, round: 24 };

    return {
      brand: {
        name: branding.name,
        fullName: branding.fullName,
        tagline: branding.tagline,
        logoUrl: null,
        logoLightUrl: null,
        faviconUrl: null,
      },
      theme: {
        ...branding.colors,
        radius: radiusByShape[branding.radius] ?? 16,
        fontDisplay: branding.fonts.display,
        fontBody: branding.fonts.body,
      },
      contact,
      licensing: {
        regaFalLicense: licensing.regaFalLicense,
        regaVerifyUrl: licensing.regaVerifyUrl,
        showRegaInFooter: licensing.showRegaInFooter,
        ejarMembership: licensing.ejarMembership,
        showEjarInFooter: licensing.showEjarInFooter,
        cr: licensing.crNumber,
        vatNumber: licensing.vatNumber,
      },
      map: {
        provider: mapsPublic.provider,
        tilesUrl: mapsPublic.tilesUrl,
        attribution: mapsPublic.attribution,
        googleBrowserKey: mapsPublic.browserKey ?? null,
      },
      nearby: { radius: maps.nearbyRadius },
      booking: { enabled: booking.enabled },
      features,
      currency: 'ر.س',
      realtime: { url: '/ws' },
    };
  }

  @Get('schema')
  async schema() {
    const cities = await this.prisma.city.findMany({
      where: { isActive: true },
      include: { districts: { where: { isActive: true }, orderBy: { nameAr: 'asc' } } },
      orderBy: { sort: 'asc' },
    });
    return {
      offers: schemaData.offers,
      statuses: schemaData.statuses,
      closedStatuses: schemaData.closedStatuses,
      categories: schemaData.categories,
      types: schemaData.types,
      rentPeriods: schemaData.rentPeriods,
      fieldGroups: schemaData.fieldGroups,
      fields: schemaData.fields,
      nearby: schemaData.nearby,
      cities: cities.map((c) => ({
        id: c.id,
        label: c.nameAr,
        center: [Number(c.lat), Number(c.lng)],
        districts: c.districts.map((d) => d.nameAr),
      })),
    };
  }

  @Get('agents/:id')
  async agent(@Param('id') id: string) {
    const a = await this.prisma.scoped.staffUser.findFirst({
      where: { id, isActive: true, showOnWebsite: true, deletedAt: null },
    });
    if (!a) throw new NotFoundException('غير موجود');
    return { id: a.id, name: a.name, title: a.title, falLicense: a.falLicense, phone: a.phone, whatsapp: a.whatsapp, avatar: a.avatarKey };
  }
}
