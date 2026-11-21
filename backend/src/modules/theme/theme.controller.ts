import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThemeService } from './theme.service.js';
import { Public } from '../auth/decorators.js';

@ApiTags('theme')
@Public()
@Controller()
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  @Get('theme.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  css(): Promise<string> {
    return this.theme.generateCss();
  }
}
