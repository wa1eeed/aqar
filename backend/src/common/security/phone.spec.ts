import { normaliseSaudiMobile } from './phone';

describe('normaliseSaudiMobile', () => {
  it.each([
    ['0501234567', '+966501234567'],
    ['501234567', '+966501234567'],
    ['966501234567', '+966501234567'],
    ['+966 50 123 4567', '+966501234567'],
    ['٠٥٠١٢٣٤٥٦٧', '+966501234567'],
  ])('%s → %s', (input, out) => expect(normaliseSaudiMobile(input)).toBe(out));

  it.each(['0401234567', '05012345', '+971501234567', '05012345678', 'abc'])('rejects %s', (input) =>
    expect(normaliseSaudiMobile(input)).toBeNull(),
  );
});
