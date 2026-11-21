// حساب عرض الحجز (docs/04 §2 Policy + §3). كل المبالغ بالهللات.

export interface DepositPolicy {
  mode: 'fixed' | 'percent';
  fixedAmount: number;
  percent: number;
  min: number | null;
  max: number | null;
}

export interface Policy {
  paymentTypes: string[];
  defaultPaymentType: string;
  deposit: DepositPolicy;
  methods: { deposit: string[]; full: string[] };
}

export interface Quote {
  fullAmount: number;
  depositAmount: number;
  amountDue: number;
}

/** price = سعر فترة واحدة للإيجار، أو السعر للبيع/الاستثمار (هللات). */
export function computeQuote(policy: Policy, price: number, paymentType: 'deposit' | 'full'): Quote {
  const full = price;
  let deposit =
    policy.deposit.mode === 'fixed'
      ? policy.deposit.fixedAmount
      : Math.round((price * policy.deposit.percent) / 100);
  if (policy.deposit.min != null) deposit = Math.max(deposit, policy.deposit.min);
  if (policy.deposit.max != null) deposit = Math.min(deposit, policy.deposit.max);
  deposit = Math.min(deposit, full); // العربون لا يتجاوز الكامل
  return {
    fullAmount: full,
    depositAmount: deposit,
    amountDue: paymentType === 'deposit' ? deposit : full,
  };
}
