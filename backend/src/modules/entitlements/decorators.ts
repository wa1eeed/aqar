import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'entitlement:feature';

/** يتطلّب أن تشمل باقة المشترك هذه الميزة (طبقة Entitlements، منفصلة عن الصلاحيات). */
export const RequireFeature = (feature: string) => SetMetadata(REQUIRE_FEATURE_KEY, feature);
