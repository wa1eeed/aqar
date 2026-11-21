import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.js';

const RADIUS: Record<string, number> = { sharp: 6, soft: 16, round: 24 };
const BODY_STACK = ", Tahoma, 'Segoe UI', system-ui, sans-serif";
const DISPLAY_STACK = ", 'IBM Plex Sans Arabic', Tahoma, sans-serif";

interface Branding {
  colors: Record<string, string>;
  fonts: { display: string; body: string };
  radius: string;
}

/** يولّد /theme.css: متغيّرات CSS من إعدادات الهوية (docs/07 §10.1، docs/08 §1.2). */
@Injectable()
export class ThemeService {
  constructor(private readonly settings: SettingsService) {}

  async generateCss(): Promise<string> {
    const b = (await this.settings.get('branding')) as Branding;
    return ThemeService.render(b);
  }

  static render(b: Branding): string {
    const c = b.colors;
    const r = RADIUS[b.radius] ?? 16;
    return `/* GENERATED theme — من إعدادات الهوية */
:root{
  --green:${c.primary};
  --green-900:${c.primaryDark};
  --green-2:color-mix(in srgb, ${c.primary} 82%, white);
  --green-50:color-mix(in srgb, ${c.primary} 10%, white);
  --gold:${c.accent};
  --gold-ink:${c.accentInk};
  --gold-50:color-mix(in srgb, ${c.accent} 18%, white);
  --bg:${c.background};
  --surface:${c.surface};
  --ink:${c.ink};
  --muted:${c.muted};
  --r:${r}px;
  --r-lg:${r + 8}px;
  --f-display:'${b.fonts.display}'${DISPLAY_STACK};
  --f-body:'${b.fonts.body}'${BODY_STACK};
}
`;
  }
}
