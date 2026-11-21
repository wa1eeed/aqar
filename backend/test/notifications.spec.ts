import { describe, it, expect } from 'vitest';
import { normalizeSaudiPhone } from '../src/modules/leads/phone.js';
import { defaultChannels, isTransactional } from '../src/modules/notifications/events.js';

describe('normalizeSaudiPhone', () => {
  it('يطبّع الصيغ المختلفة إلى E.164', () => {
    expect(normalizeSaudiPhone('0501234567')).toBe('+966501234567');
    expect(normalizeSaudiPhone('501234567')).toBe('+966501234567');
    expect(normalizeSaudiPhone('+966501234567')).toBe('+966501234567');
    expect(normalizeSaudiPhone('966 50 123 4567')).toBe('+966501234567');
    expect(normalizeSaudiPhone('05 01-23 45 67')).toBe('+966501234567');
  });
  it('يرفض غير الجوال السعودي', () => {
    expect(normalizeSaudiPhone('0401234567')).toBeNull();
    expect(normalizeSaudiPhone('12345')).toBeNull();
    expect(normalizeSaudiPhone('+14155552671')).toBeNull();
  });
});

describe('notification channels', () => {
  it('الافتراضيات من الكتالوج', () => {
    expect(defaultChannels('viewing.confirmed')).toEqual({ inApp: true, email: true, sms: true });
    expect(defaultChannels('lead.stage_changed')).toEqual({ inApp: true, email: false, sms: false });
    expect(defaultChannels('unknown.event')).toEqual({ inApp: true, email: false, sms: false });
  });
  it('الأحداث المعاملاتية', () => {
    expect(isTransactional('payment.paid')).toBe(true);
    expect(isTransactional('booking.confirmed')).toBe(true);
    expect(isTransactional('security.new_login')).toBe(true);
    expect(isTransactional('lead.created')).toBe(false);
  });
});
