# LOOT — Loot table e drop

**Area:** Regole · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `LOOT-*`

## Scopo

Decidere **cosa cade** quando un nemico muore, un forziere si apre, un'erba viene raccolta. Prende
una tabella e un contesto, restituisce un elenco di oggetti.

Il servizio è piccolo per scelta: non crea entità, non riempie contenitori, non conosce
l'inventario. Estrae da tabelle. Ma è il punto in cui la **casualità percepita** conta più che
altrove, perché il bottino è ciò che il giocatore osserva con più attenzione e su cui costruisce
teorie riguardo al funzionamento del gioco.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | uno stream `RND` |
| NON dipende da | `excalibur`, `INV`, `ENT`, altri servizi |
| Consumato da | orchestrazione (alla morte di un'entità, all'apertura di un contenitore) |
| Stato dinamico | contatori di pietà · lo stato dei canali filtrati appartiene a `RND` (RND-9) |
| Stato statico | loot table |
| Dati esterni | `content/loot/*.json` |
| Eventi emessi | nessuno: restituisce un risultato |

## API pubblica (indicativa)

```ts
interface LootTable {
  id: LootTableId;
  rolls: { min: number; max: number };            // quante estrazioni
  entries: readonly LootEntry[];
  guaranteed?: readonly LootEntry[];              // sempre presenti
}

type LootEntry =
  | { kind: 'item'; item: ItemId; weight: number; quantity: { min: number; max: number };
      conditions?: readonly LootCondition[] }
  | { kind: 'table'; table: LootTableId; weight: number }      // tabelle annidate
  | { kind: 'nothing'; weight: number };

interface LootService {
  roll(table: LootTableId, ctx: LootContext): Result<readonly LootDrop[], LootError>;
}

interface LootContext {
  readonly channel: string;            // per la casualità filtrata (RND-9)
  readonly luck?: number;
  readonly tags?: readonly string[];   // condizioni: area, ora, difficoltà
}
```

## Requisiti

**LOOT-1** — Le loot table **DEVONO** essere **dati validati**, mai codice (ARC-7.1). Ogni `ItemId`
citato **DEVE** esistere, verificato dal controllo di integrità dei contenuti (ARC-7.5).

**LOOT-2** — Le tabelle **DEVONO** supportare l'**annidamento**: una tabella può estrarre da altre
tabelle. La ricorsione **DEVE** essere rilevata in validazione, non a runtime.

**LOOT-3** — L'estrazione **DEVE** usare i pesi tramite la primitiva di `RND` (RND-8), senza
reimplementarla.

**LOOT-4** — Le voci **DEVONO** poter avere **condizioni** (area, ora del giorno, tag del
richiedente, stato di quest) valutate con l'interprete di precondizioni condiviso (ARC-7.3). Il
servizio **NON DEVE** valutarle da sé: riceve un contesto già risolto o un valutatore iniettato.

**LOOT-5** — Il servizio **DEVE** supportare la **casualità filtrata** per canale (RND-9): il
bottino dello stesso tipo di nemico non **DEVE** ripetere lo stesso oggetto molte volte di seguito,
anche quando la probabilità lo consentirebbe. Il servizio si limita a passare il `channel` a
`RND.filtered()`: non tiene memoria propria e non reimplementa il filtro.

**LOOT-6** — Il servizio **DOVREBBE** supportare un meccanismo di **pietà**: la probabilità di un
oggetto raro cresce a ogni estrazione senza successo e si azzera all'ottenimento. Riduce la
frustrazione della coda lunga senza alterare la media dichiarata.

**LOOT-7** — Lo stato dei **contatori di pietà** **DEVE** essere serializzato: salvare e ricaricare
**NON DEVE** poter essere usato per manipolare gli esiti. Lo stato del **filtro** non è di questo
servizio: le memorie di canale appartengono a `RND`, che le mantiene (RND-9) e le serializza
(RND-13). LOOT passa un `channel` e nient'altro.

La divisione non è arbitraria. La **pietà** è una regola di gioco — «dopo N tentativi a vuoto il
raro è garantito» — e vive dove vivono le regole del bottino. Il **filtro** è una tecnica di
casualità, e vive nell'unica sorgente di casualità del gioco.

**LOOT-8** — Un'estrazione **DEVE** essere riproducibile dato lo stream `RND` e il contesto.

**LOOT-9** — Il servizio **DEVE** restituire **descrizioni di drop** (oggetto, quantità, stato
iniziale), non istanze inserite in contenitori: creare le entità o riempire l'inventario spetta
all'orchestrazione (ARC-4.1).

**LOOT-10** — **DEVE** essere possibile dichiarare voci **garantite**, che non passano
dall'estrazione: il boss lascia sempre la sua chiave.

**LOOT-11** — Le tabelle **DEVONO** poter esprimere un numero variabile di estrazioni e la
possibilità di non estrarre nulla, senza artifici come una voce "vuoto" implicita.

**LOOT-12** — Il servizio **DEVE** offrire uno strumento offline di **analisi statistica** di una
tabella: probabilità effettive, valore atteso, oggetti irraggiungibili. Le tabelle annidate con pesi
rendono la probabilità reale poco intuitiva, ed è così che nascono i drop mai visti da nessuno.

## Criteri di test

- Su 10⁶ estrazioni, le frequenze coincidono con i pesi dichiarati entro tolleranza.
- Le tabelle annidate producono le probabilità composte attese.
- Il filtro riduce le ripetizioni consecutive rispetto all'estrazione pesata non filtrata. La
  distribuzione risultante **non** coincide con i pesi nominali — il filtro la sposta per
  costruzione (RND-9); si asserisce la monotonia e un vettore d'oro, come in `random.md`.
- Il contatore di pietà garantisce l'oggetto entro il massimo dichiarato.
- Una tabella ricorsiva è rifiutata in validazione.
- Stesso seed e stesso contesto → stesso bottino.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-25
- [`random.md`](./random.md) · [`inventory.md`](./inventory.md) · [`combat.md`](./combat.md)
