# AFF — Affordance e percezione

**Area:** Agenti · **Natura:** generico · **Priorità:** 4 · **Stato:** proposto
**Prefisso requisiti:** `AFF-*`

## Scopo

Permettere agli elementi del mondo di **pubblicizzare cosa offrono**, e agli agenti di scoprirlo
senza conoscerli.

Una sorgente d'acqua dichiara «riduco la sete». Un coniglio dichiara «sono cibo, per chi è abbastanza
forte da prendermi». Una sedia dichiara «ci si può sedere». Un fuoco dichiara «scaldo, e brucio chi
si avvicina troppo».

Il guadagno è strutturale: **aggiungere un oggetto al mondo aggiunge un comportamento possibile a
tutti i PNG, senza toccare l'IA.** Senza questo servizio, ogni nuovo oggetto richiederebbe una nuova
azione cablata nel ragionatore, e l'IA crescerebbe insieme al catalogo degli oggetti.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | porte astratte per prossimità e per lettura dei componenti (non `SPX` né `ENT` diretti) |
| NON dipende da | `excalibur`, `AI`, altri servizi |
| Consumato da | orchestrazione, che ne compone i risultati nel contesto di `AI` |
| Stato dinamico | prenotazioni in corso, disponibilità, tempi di ricarica |
| Stato statico | catalogo delle affordance e dei loro requisiti |
| Dati esterni | `content/ai/affordances.json` |
| Eventi emessi | `affordance-claimed`, `affordance-released`, `affordance-consumed` |
| Ordine di grandezza | ~10² affordance attive per area |

## API pubblica (indicativa)

```ts
interface AffordanceOffer {
  readonly provider: EntityId;
  readonly kind: AffordanceKind;                  // 'drink' | 'sit' | 'eat' | 'warm' | 'hide' | …
  readonly satisfies: Partial<Record<NeedId, number>>;   // quanto riduce quale bisogno, 0..1
  readonly requires?: readonly Requirement[];     // forza minima, oggetto posseduto, fazione…
  readonly cost?: { timeMs: number; risk: number };
  readonly capacity: number;                      // quanti agenti insieme
  readonly exclusive: boolean;
}

interface AffordanceService {
  /** Offerte percepibili da un agente: filtrate per distanza, requisiti e disponibilità. */
  query(seeker: SeekerSnapshot, near: readonly EntityId[], now: GameTimeMs): readonly AffordanceOffer[];

  claim(offer: AffordanceOffer, seeker: EntityId, now: GameTimeMs): CommandResult<ClaimId | 'unavailable'>;
  release(claim: ClaimId, now: GameTimeMs): CommandResult<void>;
  consume(claim: ClaimId, now: GameTimeMs): CommandResult<void>;
}
```

## Requisiti

**AFF-1** — Un'entità **DEVE** poter dichiarare le proprie affordance tramite un componente
(`Provides`), come dato dell'archetipo: è la forma concreta di ARC-6.2 applicata alle intenzioni
(GP-32).

**AFF-2** — Un'affordance **DEVE** dichiarare **quali bisogni soddisfa e in che misura**, in una
scala comparabile con gli input dell'IA (`0..1`): è ciò che permette al ragionatore di confrontare
bere, mangiare e riposare senza conoscerne la natura.

**AFF-3** — Un'affordance **DEVE** poter dichiarare **requisiti** sul richiedente — forza minima,
dieta (carnivoro), oggetto posseduto, appartenenza a una fazione, non essere ostile al fornitore.
Il coniglio è cibo, ma solo per chi è abbastanza forte da prenderlo.

**AFF-4** — Un'affordance **DEVE** poter dichiarare un **costo**: tempo richiesto e rischio. Un
ragionatore deve poter preferire una pozza vicina a un fiume lontano, e un fiume sicuro a uno
sorvegliato.

**AFF-5** — Il servizio **DEVE** gestire **capacità e prenotazione**: una sedia accoglie una
persona, un fuoco quattro. Un'affordance esclusiva già prenotata **NON DEVE** essere offerta ad
altri, evitando che dieci PNG convergano sullo stesso oggetto.

**AFF-6** — Le prenotazioni **DEVONO** scadere: un agente che muore, cambia idea o viene interrotto
**NON DEVE** bloccare l'oggetto per sempre. La scadenza passa da `TIME`.

**AFF-7** — Un'affordance **DEVE** poter essere **consumabile** (una bacca sparisce, una pozza si
prosciuga) o **rigenerabile** con tempo di ricarica.

**AFF-8** — Il fornitore **NON DEVE** conoscere il richiedente e viceversa: il collegamento avviene
per **tipo di affordance**, mai per identità. Un nuovo oggetto potabile è immediatamente utilizzabile
da tutti gli agenti assetati esistenti, senza modificare nulla.

**AFF-9** — Il servizio **NON DEVE** decidere: propone opzioni valutabili. La scelta è di `AI`
(separazione delle responsabilità).

**AFF-10** — La ricerca **DEVE** partire dai candidati già filtrati dall'indice spaziale, non da una
scansione del mondo (ARC-13.1), ed essere limitata da un numero massimo di offerte restituite.

**AFF-11** — Il servizio **DEVE** modellare la **percezione**: un'affordance è offerta solo se il
richiedente può accorgersene, secondo distanza, angolo di vista, ostruzione o memoria (l'ha vista
in passato, `BB`). Un PNG **NON DEVE** conoscere magicamente ogni fonte d'acqua della mappa.

**AFF-12** — Il servizio **DEVE** poter modellare anche affordance **negative** o pericolose (il
fuoco brucia, il precipizio uccide), perché il ragionatore possa evitarle con lo stesso meccanismo
con cui cerca le altre.

**AFF-13** — Il catalogo delle affordance **DEVE** essere dato validato (ARC-7): tipi di affordance,
bisogni soddisfatti, requisiti e costi non **DEVONO** essere cablati nel codice.

**AFF-14** — Le prenotazioni **DEVONO** essere serializzate o annullate in modo pulito al
salvataggio: nessuna prenotazione orfana dopo il caricamento.

**AFF-15** — Anche il **giocatore DOVREBBE** poter interrogare le affordance vicine: è ciò che
alimenta l'interazione contestuale dell'interfaccia — «bevi», «siediti», «parla», «scassina»
(GP-54).

## Criteri di test

- Un agente assetato riceve la sorgente d'acqua tra le offerte; un agente sazio no.
- Un requisito non soddisfatto esclude l'offerta (il lupo debole non vede il coniglio come cibo).
- Un'affordance esclusiva prenotata non compare ad altri richiedenti; alla scadenza ricompare.
- Un'affordance consumata sparisce; una rigenerabile ricompare dopo la ricarica.
- Un'affordance dietro un muro non è percepita; se già nota per memoria, sì.
- Aggiungere un nuovo tipo di affordance ai dati non richiede modifiche al codice dell'IA (ARC-3.4).

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-32, GP-47, GP-54
- [`utility-ai.md`](./utility-ai.md) · [`blackboard.md`](./blackboard.md) ·
  [`entity-registry.md`](./entity-registry.md) · [`spatial-index.md`](./spatial-index.md)
