// توسيع نوع طلب Express بمعرّف الارتباط (correlation id).
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export {};
