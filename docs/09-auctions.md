# 09 — Auctions module (advanced package, feature flag `features.auctions`)

Build only after phases 1–5 are accepted. Everything is hidden (API 404, no UI) while the flag is off.
Real-estate auctions in Saudi Arabia are regulated by REGA (auction regulation and licence); the
admin must enter the auction licence number before an auction can be scheduled.

## 1. Lifecycle

`draft → scheduled → live → ended → awarded | cancelled` (job transitions by time; admin awards).

## 2. Bidder onboarding

1. Customer opens auction page → «سجّل للمزايدة».
2. Identity: Nafath verification required (`identity.nafath`), result stored on `Customer.nafathVerifiedAt`.
3. Guarantee (admin chooses per auction, one or both):
   - **Wallet**: top up via Moyasar (`WalletTransaction topup`), hold `depositAmount` (`hold`).
   - **Nafith** promissory note (`gov.nafith`): create note, customer signs on Nafith, status polled/webhook.
4. Registration `approved` → bidder alias «مزايد #NN».

## 3. Bidding (Socket.IO room `auction:{id}`)

- Client emits `auction:bid { auctionId, amount }`; server validates (approved registration, live,
  `amount ≥ current + minIncrement`, rate limit 1 bid/sec/customer) inside a Redis lock + DB
  transaction; persists `AuctionBid`; broadcasts `auction.bid { amount, alias, at, endsAt }`.
- Anti-sniping: a bid within the last `antiSnipingSec` extends `endsAt` by `antiSnipingSec` and
  broadcasts `auction.extended`.
- Proxy (auto) bidding: out of scope v1.
- Server clock is authoritative; broadcast `auction.tick` every 5 s with server time.

## 4. Closing

At `endsAt`: status `ended`; highest bid ≥ reserve → admin «ترسية» → `awarded`, winner notified,
booking created for the winner with `paymentType = deposit` per auction settings; property status
`reserved` (reason `auction_awarded`). Release wallet holds of non-winners (`release`), winner's hold
captured or applied per admin choice. Below reserve → `ended` without award.

## 5. Admin

Auctions list, editor (property, licence number, schedule, prices, increments, guarantee options,
terms), live monitor (bids feed, registrants, extend/stop), results and settlement.

## 6. Public

Auctions listing page and auction page reusing the brochure mock-up layout: photo, live countdown
(server-synced), current highest bid, increment chips, «زايد الآن», wallet balance, verification
chips «موثّق عبر النفاذ الوطني», «سند لأمر عبر نافذ», bids history with aliases.
