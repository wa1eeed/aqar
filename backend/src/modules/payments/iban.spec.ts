import { formatIban, isValidSaudiIban } from './iban';

describe('Saudi IBAN (ISO 13616 mod-97)', () => {
  it('accepts valid IBANs with or without spaces', () => {
    expect(isValidSaudiIban('SA0380000000608010167519')).toBe(true);
    expect(isValidSaudiIban('sa03 8000 0000 6080 1016 7519')).toBe(true);
  });
  it('rejects wrong check digits, length or country', () => {
    expect(isValidSaudiIban('SA0480000000608010167519')).toBe(false);
    expect(isValidSaudiIban('SA038000000060801016751')).toBe(false);
    expect(isValidSaudiIban('AE070331234567890123456')).toBe(false);
  });
  it('formats in groups of four', () => {
    expect(formatIban('SA0380000000608010167519')).toBe('SA03 8000 0000 6080 1016 7519');
  });
});
