# ENT — Registro entità e componenti

**Area:** Mondo · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `ENT-*`

## Scopo

Essere l'anagrafe di tutto ciò che esiste nel mondo di gioco: assegna identità stabili, tiene i
**componenti** che ogni entità possiede e risponde alla domanda *"quali entità hanno questa
capacità?"*.

È il servizio che rende concreto il principio ARC-6.2: **un'entità partecipa a un'interazione perché
possiede il componente relativo, non perché appartiene a una classe.** Un barile esplosivo, una
serratura, una telecamera di sorveglianza e un PNG sono tutti bersagliabili se hanno
`Targetable`. Nessuno di essi eredita da `Character`.

Non è un motore ECS completo con scheduler di sistemi: è il **registro dei dati di dominio**. La
controparte in presentazione (l'ECS di Excalibur, gli `Actor`) è un'altra cosa e vive di là (ARC-1.3).

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, altri servizi |
| Consumato da | tutti i servizi di regole (che ricevono componenti, non il registro), orchestrazione |
| Stato dinamico | entità vive, valori dei componenti |
| Stato statico | **archetipi**: definizioni di entità come insiemi di componenti con valori iniziali |
| Dati esterni | `content/entities/*.json` — archetipi di PNG, oggetti del mondo, contenitori |
| Eventi emessi | `entity-spawned`, `entity-despawned`, `component-added`, `component-removed` |
| Ordine di grandezza | ~10³ entità vive per area |

## API pubblica (indicativa)

```ts
type EntityId = number & { readonly __brand: 'EntityId' };

interface EntityRegistry {
  spawn(archetype: ArchetypeId, overrides?: Partial<ComponentSet>): CommandResult<EntityId>;
  despawn(id: EntityId): CommandResult<void>;
  isAlive(id: EntityId): boolean;

  get<C extends ComponentKind>(id: EntityId, kind: C): ComponentOf<C> | undefined;
  has(id: EntityId, kind: ComponentKind): boolean;
  add<C extends ComponentKind>(id: EntityId, kind: C, value: ComponentOf<C>): CommandResult<void>;
  remove(id: EntityId, kind: ComponentKind): CommandResult<void>;

  /** Iterazione per capacità: il cuore di ARC-6.2. Ordine deterministico. */
  each<C extends readonly ComponentKind[]>(
    kinds: C, visit: (id: EntityId, ...c: ComponentsOf<C>) => void): void;

  capabilities(id: EntityId): TagMask;   // per l'indice spaziale
}
```

## Requisiti

**ENT-1** — Ogni entità **DEVE** essere identificata da un `EntityId` **opaco, stabile e non
riusato**: dopo la rimozione, il suo id **NON DEVE** essere riassegnato (le versioni generazionali
sono ammesse). Nessuna ricerca per nome-stringa (ARC-5.2).

**ENT-2** — Un'entità **DEVE** essere una semplice **composizione di componenti**. **NON DEVONO**
esistere gerarchie di classi di entità (ARC-6.1).

**ENT-3** — Un componente **DEVE** poter essere usato come **marcatore di capacità** anche senza
dati: `Targetable`, `Lockable`, `Flammable`, `Sittable`, `Lootable`, `Talkable`. Marcare è
dichiarare al mondo che l'entità partecipa a quell'interazione (ARC-6.2).

**ENT-4** — L'iterazione per capacità (`each`) **DEVE** essere efficiente e **DEVE** avere ordine
deterministico, indipendente dall'ordine di creazione e distruzione (ARC-9.4).

**ENT-5** — Il registro **DEVE** esporre le capacità di un'entità come **maschera di bit**, così che
l'indice spaziale possa filtrare senza interrogarlo entità per entità (SPX-2).

**ENT-6** — Componenti **DEVONO** poter essere aggiunti e rimossi a runtime: un PNG pacifico che
diventa ostile riceve `Combat`; un forziere scassinato perde `Lockable`. Ogni modifica emette
l'evento corrispondente, perché indice spaziale e presentazione si aggiornino (ARC-6.4).

**ENT-7** — Gli **archetipi DEVONO** essere dati validati: un PNG è una lista di componenti con
valori iniziali in un file, non una sottoclasse (ARC-7.1).

**ENT-8** — Gli archetipi **DEVONO** supportare la composizione e la sovrascrittura parziale
(`guardia` = `umanoide` + `combattente` + `fazione: guardie`), senza duplicare le definizioni.

**ENT-9** — Il registro **NON DEVE** contenere logica di gioco: non calcola danni, non decide chi
attacca chi. Conserva e restituisce dati. La logica sta nei servizi di regole, che ricevono i
componenti come argomenti.

**ENT-10** — Nessun componente **DEVE** contenere riferimenti a `Actor` o a oggetti di rendering
(ARC-1.3). Il legame `EntityId → Actor` è mantenuto dalla presentazione.

**ENT-11** — Ogni componente **DEVE** essere serializzabile; il registro serializza le entità vive
con i loro componenti e l'archetipo di origine, per differenza rispetto ai valori iniziali dove
conviene (ARC-10).

**ENT-12** — L'entità **giocatore DEVE** essere raggiungibile per riferimento stabile, mai cercata
scandendo il mondo (ARC-5.2).

**ENT-13** — Lo spawn e il despawn **DEVONO** emettere eventi: la presentazione crea e distrugge gli
`Actor` reagendo a essi, mai al contrario.

**ENT-14** — Il registro **DEVE** reggere lo spawn e il despawn di centinaia di entità in un frame
(caricamento di un'area) senza riorganizzazioni costose.

**ENT-15** — Un'entità **DEVE** poterne referenziare un'altra solo per `EntityId`, mai per
riferimento diretto all'oggetto: garantisce che i cicli non blocchino la serializzazione e che i
riferimenti pendenti siano rilevabili.

## Criteri di test

- Creare 10⁴ entità con archetipi diversi e iterare per capacità: risultati e ordine deterministici.
- Aggiungere e rimuovere un componente aggiorna la maschera delle capacità ed emette gli eventi.
- Un id rimosso non viene mai riassegnato; l'accesso a un id morto restituisce `undefined`, non
  lancia.
- Round-trip di serializzazione su un mondo popolato.
- Il registro funziona con un insieme di componenti inventato, estraneo a questo gioco (ARC-3.4).

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-6 (componenti e capacità), ARC-5.2 (riferimenti)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-11 (oggetti interattivi), GP-27 (quest NPC)
- [`spatial-index.md`](./spatial-index.md) · [`affordance.md`](./affordance.md) ·
  [`rendering.md`](./rendering.md)
