# ECO — Economy and trading

**Area:** Game rules · **Nature:** domain · **Priority:** 4 · **Status:** proposed
**Requirement prefix:** `ECO-*`

## Purpose

Determine prices and regulate exchanges. A merchant has a stock and a **finite liquidity**: they
cannot buy beyond the money they hold, and they restock after a certain time.

Price is not a property of the item but the result of a relationship: who sells, to whom, in which
town, with what reputation, with what bargaining skill.

## Contract

| Item | Value |
|---|---|
| Depends on | an `RND` stream (for restocking variability) |
| Does NOT depend on | `excalibur`, `INV`, `FAC`, `STAT`, other services |
| Consumed by | orchestration, HUD (trading screen) |
| Dynamic state | merchant liquidity, stock, restock timings, exchange history |
| Static state | base prices, merchant profiles, multipliers, restock tables |
| External data | `content/economy/prices.json`, `merchants.json`, `restock.json` |
| Events emitted | `trade-completed`, `trade-refused`, `merchant-restocked`, `price-quoted` |

## Public API (indicative)

```ts
interface PriceContext {
  readonly merchant: MerchantProfile;
  readonly reputation: number;        // supplied by the caller, not read from FAC
  readonly bargainSkill: number;      // supplied by the caller, not read from STAT
  readonly demand: number;
  readonly itemCondition: number;
}

interface EconomyService {
  quoteBuy(item: ItemId, ctx: PriceContext): Price;      // what the merchant asks
  quoteSell(item: ItemId, ctx: PriceContext): Price;     // what the merchant offers

  canAfford(buyer: WalletRef, price: Price): boolean;
  /** Returns the trade intent; moving items and money is up to the orchestration. */
  proposeTrade(t: TradeProposal, ctx: PriceContext): CommandResult<TradeVerdict>;

  liquidity(merchant: MerchantId): number;
  restock(merchant: MerchantId, now: GameTimeMs): CommandResult<readonly RestockEntry[]>;
  nextRestockAt(merchant: MerchantId): GameTimeMs;
}
```

## Requirements

**ECO-1** — Prices **MUST** be modulated by reputation, the merchant's faction, bargaining skill,
item condition and local demand, according to a formula declared in data (GP-45).

**ECO-2** — The factors **MUST** be **supplied by the caller** in a context: the service **MUST NOT**
query `FAC` or `STAT` (ARC-4.1). That is what makes it testable with synthetic values.

**ECO-3** — There **MUST** be a **spread between buying and selling price**, configurable per
merchant: buying and reselling to the same merchant **MUST** be a loss, or the economy breaks.

**ECO-4** — Every merchant **MUST** have a **finite liquidity**: they cannot buy beyond the money
they hold. The outcome **MUST** say so explicitly, with the possibility of a partial trade (GP-28,
GP-46).

**ECO-5** — Every merchant **MUST** have a **finite stock**, which regenerates after a timeout, with
variability from `RND` (GP-28). The timeout is a duration of game time read from `TIME` (TIME-14),
**not** a scheduled timer: ECO-6 requires the regeneration to be computed lazily, and a timer per
merchant is exactly what it forbids.

**ECO-6** — Restocking **MUST** happen even while the player is elsewhere, without simulating all
merchants on every tick: the computation **MUST** be **lazy**, on first interaction, as a function
of the elapsed time.

**ECO-7** — Merchants **MUST** be able to refuse categories of goods (an armourer does not buy herbs)
and **stolen** goods, according to their profile (connection with `CRM`, through the context).

**ECO-8** — The service **MUST NOT** move items or money: it emits a **verdict** and the trade
intent; execution, atomically, belongs to the orchestration through `INV` (ARC-4.2, INV-13).

**ECO-9** — Price **MUST** be a deterministic function of the context: two consecutive quotes with
the same context **MUST** give the same value. Variability belongs to restocking, not to the
negotiation.

**ECO-10** — Quotes **MUST** be inspectable: the service **SHOULD** be able to return the price
breakdown (base, reputation, skill, condition), both for the interface and for balancing work.

**ECO-11** — The service **MUST** prevent arbitrage exploits: repeated buying and reselling between
two merchants **MUST NOT** be able to generate money. The constraint **MUST** be verified by a
dedicated test, not merely asserted.

**ECO-12** — Money **MUST** be modelled as an explicit resource with identified wallets, not as a
number on some arbitrary component.

**ECO-13** — The state **MUST** be serializable, including liquidity, stocks and next restocks.

## Test criteria

- A cycle of 10³ purchases and resales generates no money (ECO-11).
- A merchant with no liquidity refuses the purchase or proposes the expected partial trade.
- Lazy restocking after N hours of absence produces the same result as the continuous computation.
- The price breakdown sums exactly to the final price.
- Same context → same quote.

## Links

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-28, GP-45, GP-46, GP-48
- [`inventory.md`](./inventory.md) · [`faction.md`](./faction.md) · [`stats.md`](./stats.md) ·
  [`time.md`](./time.md)
