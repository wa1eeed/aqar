import { ForbiddenException } from '@nestjs/common';

/** الميزة غير مشمولة بالباقة → ترقية مطلوبة. */
export class FeatureNotIncludedException extends ForbiddenException {
  constructor(feature: string) {
    super({
      code: 'FEATURE_NOT_INCLUDED',
      message: 'هذه الميزة غير مشمولة بباقتك الحالية',
      upgradeRequired: true,
      feature,
    });
  }
}

/** بلوغ الحدّ العددي للباقة. */
export class LimitReachedException extends ForbiddenException {
  constructor(feature: string, limit: number) {
    super({
      code: 'LIMIT_REACHED',
      message: 'بلغتَ الحدّ الأقصى المسموح في باقتك',
      upgradeRequired: true,
      feature,
      limit,
    });
  }
}
