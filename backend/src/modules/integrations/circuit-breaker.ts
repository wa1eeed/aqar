/**
 * قاطع دائرة بسيط في الذاكرة لكل تكامل: يفتح بعد 5 إخفاقات متتالية لمدّة 60ث (docs/05 §3).
 * أثناء الفتح → health = down ويُرفض الاستدعاء (fallback إن وُجد).
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  isOpen(now: number = Date.now()): boolean {
    return now < this.openUntil;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  recordFailure(now: number = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = now + this.cooldownMs;
      this.failures = 0;
    }
  }
}
