import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service.js';
import { Public } from '../auth/decorators.js';

@ApiTags('webhooks')
@Public()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly svc: BookingsService) {}

  @Post('moyasar')
  @HttpCode(200)
  async moyasar(@Body() body: Record<string, unknown>) {
    // نحدّد المشترك من الحمولة؛ المعالجة idempotent. نردّ 200 دائماً.
    await this.svc.handleMoyasarWebhook(body).catch(() => undefined);
    return { received: true };
  }
}
