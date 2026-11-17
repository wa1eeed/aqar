import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { themeCss, themeVersion } from './theme';

/** Builds /theme.css from the branding settings; memoised per settings value (cache is per instance). */
@Injectable()
export class ThemeService {
  private memo: { key: string; css: string; version: string } | null = null;

  constructor(private readonly settings: SettingsService) {}

  async current(): Promise<{ css: string; version: string }> {
    const b = await this.settings.get('branding');
    const key = JSON.stringify([b.theme, b.fontDisplay, b.fontBody, b.radius]);
    if (this.memo?.key !== key) {
      const css = themeCss(b);
      this.memo = { key, css, version: themeVersion(css) };
    }
    return { css: this.memo.css, version: this.memo.version };
  }
}
