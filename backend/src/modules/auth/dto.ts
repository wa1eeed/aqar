import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { email, plainText } from '../../common/security/zod-helpers';
import { SAUDI_MOBILE } from '../../common/security/phone';

const password = z.string().min(1).max(128);
const challengeId = z.string().min(20).max(64);
const code = z.string().trim().min(6).max(20);
const token = z.string().min(20).max(200);
const newPassword = z.string().min(1).max(128); // policy enforced in the service (needs the email)
const name = plainText(80).pipe(z.string().min(2));
const phone = z.string().trim().max(20).regex(SAUDI_MOBILE, 'invalid_phone');

export class StaffLoginDto extends createZodDto(z.object({ email, password }).strict()) {}
export class ChallengeCodeDto extends createZodDto(z.object({ challengeId, code }).strict()) {}
export class ChallengeDto extends createZodDto(z.object({ challengeId }).strict()) {}
export class ChallengePasswordDto extends createZodDto(z.object({ challengeId, newPassword }).strict()) {}
export class ForgotDto extends createZodDto(z.object({ email }).strict()) {}
export class ResetDto extends createZodDto(z.object({ token, newPassword }).strict()) {}
export class AcceptInviteDto extends createZodDto(z.object({ token, password: newPassword }).strict()) {}
export class CodeDto extends createZodDto(z.object({ code }).strict()) {}
export class ChangePasswordDto extends createZodDto(z.object({ currentPassword: password, newPassword }).strict()) {}
export class ReauthDto extends createZodDto(
  z
    .object({ password: password.optional(), code: code.optional() })
    .strict()
    .refine((v) => !!v.password !== !!v.code, 'password_or_code'),
) {}
export class RefreshDto extends createZodDto(
  z.object({ audience: z.enum(['staff', 'customer']).default('customer') }).strict(),
) {}

export class OtpSendDto extends createZodDto(
  z
    .object({ channel: z.enum(['email', 'sms']).default('email'), destination: z.string().trim().min(3).max(254) })
    .strict()
    .superRefine((v, ctx) => {
      if (v.channel === 'email' && !email.safeParse(v.destination).success) {
        ctx.addIssue({ code: 'custom', path: ['destination'], message: 'invalid_email' });
      }
    }),
) {}
export class OtpVerifyDto extends createZodDto(
  z
    .object({
      destination: email,
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'invalid_code'),
      name: name.optional(),
      phone: phone.optional(),
      consent: z.boolean().optional(),
      marketingConsent: z.boolean().optional(),
    })
    .strict(),
) {}
export class RegisterDto extends createZodDto(
  z
    .object({
      registrationToken: token,
      name,
      phone,
      consent: z.literal(true, { errorMap: () => ({ message: 'consent_required' }) }),
      marketingConsent: z.boolean().optional(),
    })
    .strict(),
) {}
export class CustomerPasswordLoginDto extends createZodDto(z.object({ email, password }).strict()) {}
export class SetPasswordDto extends createZodDto(z.object({ newPassword }).strict()) {}
