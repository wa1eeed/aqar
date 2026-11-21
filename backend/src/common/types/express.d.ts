import type { AuthUser } from '../../modules/auth/auth-user.js';

// توسيع نوع طلب Express بمعرّف الارتباط والمستخدم الحالي.
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: AuthUser;
    }
  }
}

export {};
