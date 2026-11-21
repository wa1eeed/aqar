import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// معاملات Argon2id حسب docs/03 §1.
const OPTS: argon2.Options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 };

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
