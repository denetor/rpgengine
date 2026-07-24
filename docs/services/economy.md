# ECO — Economia e commercio

**Area:** Regole · **Natura:** di dominio · **Priorità:** 4 · **Stato:** proposto
**Prefisso requisiti:** `ECO-*`

## Scopo

Determinare i prezzi e regolare gli scambi. Un mercante ha un assortimento e una **liquidità
finita**: non può comprare oltre il denaro che possiede, e si rifornisce dopo un certo tempo.

Il prezzo non è una proprietà dell'oggetto ma il risultato di una relazione: chi vende, a chi, in
quale città, con quale reputazione, con quale abilità di mercanteggiare.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | uno stream `RND` (per la variabilità del rifornimento) |
| NON dipende da | `excalibur`, `INV`, `FAC`, `STAT`, altri servizi |
| Consumato da | orchestrazione, HUD (schermata di commercio) |
| Stato dinamico | liquidità dei mercanti, assortimento, tempi di rifornimento, storico degli scambi |
| Stato statico | prezzi base, profili di mercante, moltiplicatori, tabelle di rifornimento |
| Dati esterni | `content/economy/prices.json`, `merchants.json`, `restock.json` |
| Eventi emessi | `trade-completed`, `trade-refused`, `merchant-restocked`, `price-quoted` |

## API pubblica (indicativa)

```ts
interface PriceContext {
  readonly merchant: MerchantProfile;
  readonly reputation: number;        // fornito dal chiamante, non letto da FAC
  readonly bargainSkill: number;      // fornito dal chiamante, non letto da STAT
  readonly demand: number;
  readonly itemCondition: number;
}

interface EconomyService {
  quoteBuy(item: ItemId, ctx: PriceContext): Price;      // quanto chiede il mercante
  quoteSell(item: ItemId, ctx: PriceContext): Price;     // quanto offre il mercante

  canAfford(buyer: WalletRef, price: Price): boolean;
  /** Restituisce l'intento di scambio; a spostare oggetti e denaro è l'orchestrazione. */
  proposeTrade(t: TradeProposal, ctx: PriceContext): CommandResult<TradeVerdict>;

  liquidity(merchant: MerchantId): number;
  restock(merchant: MerchantId, now: GameTimeMs): CommandResult<readonly RestockEntry[]>;
  nextRestockAt(merchant: MerchantId): GameTimeMs;
}
```

## Requisiti

**ECO-1** — I prezzi **DEVONO** essere modulati da reputazione, fazione del mercante, abilità di
mercanteggiare, condizione dell'oggetto e domanda locale, secondo una formula dichiarata nei dati
(GP-45).

**ECO-2** — I fattori **DEVONO** essere **forniti dal chiamante** in un contesto: il servizio **NON
DEVE** interrogare `FAC` né `STAT` (ARC-4.1). È ciò che lo rende testabile con valori sintetici.

**ECO-3** — **DEVE** esistere uno **scarto tra prezzo di acquisto e di vendita** configurabile per
mercante: comprare e rivendere allo stesso mercante **DEVE** essere in perdita, o l'economia si
rompe.

**ECO-4** — Ogni mercante **DEVE** avere una **liquidità finita**: non può acquistare oltre il denaro
posseduto. L'esito **DEVE** dirlo esplicitamente, con la possibilità di uno scambio parziale
(GP-28, GP-46).

**ECO-5** — Ogni mercante **DEVE** avere un **assortimento finito**, che si rigenera dopo un timeout
tramite `TIME` (TIME-7), con variabilità da `RND` (GP-28).

**ECO-6** — Il rifornimento **DEVE** avvenire anche mentre il giocatore è altrove, senza simulare
tutti i mercanti a ogni tick: il calcolo **DEVE** essere **pigro**, alla prima interazione, in
funzione del tempo trascorso.

**ECO-7** — I mercanti **DEVONO** poter rifiutare categorie di merce (un armaiolo non compra erbe) e
merce **rubata**, secondo profilo (collegamento con `CRM`, tramite il contesto).

**ECO-8** — Il servizio **NON DEVE** spostare oggetti né denaro: emette un **verdetto** e l'intento
di scambio; l'esecuzione, atomica, è dell'orchestrazione tramite `INV` (ARC-4.2, INV-13).

**ECO-9** — Il prezzo **DEVE** essere una funzione deterministica del contesto: due preventivi
consecutivi con lo stesso contesto **DEVONO** dare lo stesso valore. La variabilità appartiene al
rifornimento, non alla trattativa.

**ECO-10** — I preventivi **DEVONO** essere ispezionabili: il servizio **DOVREBBE** poter restituire
la scomposizione del prezzo (base, reputazione, abilità, condizione), sia per l'interfaccia sia per
la messa a punto del bilanciamento.

**ECO-11** — Il servizio **DEVE** prevenire gli exploit di arbitraggio: acquisto e rivendita ripetuti
tra due mercanti **NON DEVONO** poter generare denaro. Il vincolo **DEVE** essere verificato da un
test dedicato, non solo affermato.

**ECO-12** — Il denaro **DEVE** essere modellato come risorsa esplicita con portafogli identificati,
non come un numero su un componente qualsiasi.

**ECO-13** — Lo stato **DEVE** essere serializzabile, incluse liquidità, assortimenti e prossimi
rifornimenti.

## Criteri di test

- Un ciclo di 10³ acquisti e rivendite non genera denaro (ECO-11).
- Un mercante senza liquidità rifiuta l'acquisto o propone lo scambio parziale atteso.
- Il rifornimento pigro dopo N ore di assenza produce lo stesso risultato del calcolo continuo.
- La scomposizione del prezzo somma esattamente al prezzo finale.
- Stesso contesto → stesso preventivo.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-28, GP-45, GP-46, GP-48
- [`inventory.md`](./inventory.md) · [`faction.md`](./faction.md) · [`stats.md`](./stats.md) ·
  [`time.md`](./time.md)
