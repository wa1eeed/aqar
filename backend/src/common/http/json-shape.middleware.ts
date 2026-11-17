import type { NextFunction, Request, Response } from 'express';
import { AppException } from '../errors/app-exception';

/** No legitimate request needs more (largest real arrays: media reorder ≤ 40, bulk actions ≤ 500). */
export const MAX_ARRAY_LENGTH = 1000;
export const MAX_DEPTH = 32;

/**
 * Rejects JSON bodies with huge arrays or deep nesting before validation runs. Zod 3 records one
 * issue per failing array element even when `.max()` is set (GHSA-mrhx-c7xc-m3w5), so a 1 MB body of
 * failing elements could cost ~80 MB of memory per request. Iterative walk: no recursion limits.
 */
export function exceedsJsonShape(body: unknown): boolean {
  const stack: Array<{ v: unknown; d: number }> = [{ v: body, d: 0 }];
  while (stack.length) {
    const { v, d } = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (d > MAX_DEPTH) return true;
    if (Array.isArray(v)) {
      if (v.length > MAX_ARRAY_LENGTH) return true;
      for (const item of v) stack.push({ v: item, d: d + 1 });
    } else {
      for (const item of Object.values(v as Record<string, unknown>)) stack.push({ v: item, d: d + 1 });
    }
  }
  return false;
}

export function jsonShapeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object' && exceedsJsonShape(req.body)) {
    next(new AppException('PAYLOAD_TOO_COMPLEX', 413, 'حجم البيانات المرسلة أكبر من المسموح'));
    return;
  }
  next();
}
