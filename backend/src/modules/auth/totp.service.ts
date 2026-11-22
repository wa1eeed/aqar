import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

const ISSUER = 'عقار أونلاين';

/** مصادقة ثنائية TOTP (RFC 6238) عبر otplib. */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /** otpauth:// URI لتوليد رمز QR في الواجهة. */
  keyUri(accountName: string, secret: string): string {
    return authenticator.keyuri(accountName, ISSUER, secret);
  }

  verify(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }
}
