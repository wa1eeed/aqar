import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ controllers: [MediaController], providers: [MediaService], exports: [MediaService] })
export class MediaModule {}

/** Worker-side (no controllers). */
@Module({ providers: [MediaService], exports: [MediaService] })
export class MediaCoreModule {}
