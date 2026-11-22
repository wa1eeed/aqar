import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

// تسلسل BigInt (الهللات) في JSON كسلسلة نصية لتفادي فقدان الدقّة؛
// باني حمولات الواجهة يحوّلها إلى أرقام ريال صراحةً (priceSar).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(this: bigint) {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  // مسارات تُخدَّم من الجذر (SEO + الثيم) خارج بادئة api/v1
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'theme.css',
      'robots.txt',
      'llms.txt',
      'sitemap.xml',
      'sitemap-properties.xml',
      'sitemap-pages.xml',
      'feeds/properties.json',
      { path: 'property/:idSlug', method: RequestMethod.GET },
    ],
  });
  app.use(helmet());
  app.use(cookieParser());

  const origins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins && origins.length > 0 ? origins : true, credentials: true });

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('عقار أونلاين API')
    .setDescription('واجهة برمجة منصة عقار أونلاين')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
