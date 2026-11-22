import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RegistrationService } from './registration.service.js';
import { Public } from '../auth/decorators.js';

// تسجيل ذاتي عام للمكاتب العقارية (بلا مصادقة، بلا مشترك).
@ApiTags('public:registration')
@Public()
@Controller('public')
export class PublicRegistrationController {
  constructor(private readonly svc: RegistrationService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() body: unknown) {
    return this.svc.register(body);
  }
}
