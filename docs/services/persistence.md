# SAVE — Persistenza

**Area:** Core · **Natura:** generico · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `SAVE-*`

## Scopo

Trasformare lo stato dinamico di una partita in un documento salvabile e ricostruire da esso una
partita identica. Gestisce slot multipli, autosave, versionamento e migrazione.

Va progettata **prima**, non alla fine: decidere che una partita deve essere salvabile determina
come si modella lo stato in ogni servizio (niente riferimenti runtime, ID stabili, nessuna closure
nello stato). Aggiungere il salvataggio dopo significa riscrivere i modelli.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | uno **storage port** astratto (`localStorage`, file, memoria per i test) |
| NON dipende da | `excalibur`, altri servizi |
| Consumato da | `game/bootstrap`, orchestrazione, HUD |
| Stato dinamico | indice degli slot, metadati (data, tempo giocato, area, screenshot) |
| Stato statico | catalogo delle migrazioni |
| Dati esterni | nessuno |
| Eventi emessi | `game-saved`, `game-loaded`, `save-failed` |

## API pubblica (indicativa)

```ts
interface SaveDocument {
  formatVersion: number;                       // versione dell'involucro
  createdAt: string;
  meta: SaveMeta;                              // per la schermata di caricamento
  services: Record<ServiceId, ServiceSnapshot>;
}

interface ServiceSnapshot { version: number; data: unknown; }

/** Ogni servizio con stato dinamico implementa questa interfaccia. */
interface Persistable<S> {
  readonly serviceId: ServiceId;
  readonly stateVersion: number;
  serialize(): S;
  deserialize(snapshot: unknown, version: number): Result<void, MigrationError>;
}

interface SaveService {
  save(slot: SlotId, ctx: GameContext): Promise<Result<SaveMeta, SaveError>>;
  load(slot: SlotId): Promise<Result<SaveDocument, SaveError>>;
  list(): Promise<readonly SaveMeta[]>;
  delete(slot: SlotId): Promise<void>;
}
```

## Requisiti

**SAVE-1** — **DEVE** essere salvato **solo lo stato dinamico**. Le definizioni statiche (oggetti,
quest, dialoghi, nemici, mappe disegnate a mano) **NON DEVONO** finire nel salvataggio: sono
referenziate per **ID stabile** (ARC-10.3).

**SAVE-2** — Lo stato serializzabile **NON DEVE** contenere riferimenti a `Actor`, funzioni, `Map`,
`Set` o valori derivati che possono divergere dal ricalcolo (ARC-10.4).

**SAVE-3** — Ogni servizio **DEVE** serializzare **solo la propria porzione**, con un **numero di
versione proprio**: la versione dell'inventario evolve senza toccare quella delle quest.

**SAVE-4** — Il documento **DEVE** avere una versione di formato dell'involucro, distinta dalle
versioni dei singoli servizi.

**SAVE-5** — **DEVONO** esistere **migrazioni** da versione a versione, per servizio, applicate in
catena. Una migrazione mancante **DEVE** produrre un rifiuto diagnostico, mai un caricamento
parziale (GP-61).

**SAVE-6** — Il caricamento **DEVE** essere **atomico**: o la partita è ricostruita per intero, o
lo stato precedente resta intatto. Nessuno stato ibrido.

**SAVE-7** — Il salvataggio **DEVE** essere atomico anche rispetto allo storage: scrittura su chiave
temporanea e sostituzione, per non corrompere uno slot se l'operazione si interrompe.

**SAVE-8** — **DEVONO** esistere **slot multipli** più uno slot di **autosave** separato, non
sovrascrivibile da un salvataggio manuale (GP-60).

**SAVE-9** — I metadati **DEVONO** essere leggibili **senza deserializzare l'intera partita**, per
mostrare la schermata di caricamento in modo istantaneo.

**SAVE-10** — Lo storage **DEVE** essere dietro una porta astratta, con almeno tre implementazioni:
`localStorage`, file system e in-memory per i test.

**SAVE-11** — Il salvataggio **DEVE** includere lo stato dell'RNG (RND-3) e i timer pendenti
(TIME-7): senza di essi la partita ricaricata non è la stessa partita.

**SAVE-12** — Il round-trip **DEVE** essere verificato: `serialize → deserialize → serialize`
produce un documento **identico**. È il test che protegge dai campi dimenticati.

**SAVE-13** — Il salvataggio **NON DEVE** bloccare il gioco in modo percettibile: se il documento
supera una soglia, la serializzazione **DOVREBBE** essere distribuita su più frame o delegata.

**SAVE-14** — Il servizio **NON DEVE** conoscere il contenuto dei dati che serializza: chiede a
ciascun servizio la propria fotografia e la ripone. La forma dello stato appartiene al servizio.

**SAVE-15** — Il salvataggio **DOVREBBE** registrare la versione del gioco e un hash del contenuto:
se il contenuto è cambiato in modo incompatibile (una quest referenziata non esiste più), il
caricamento **DEVE** avvisare invece di rompersi a metà partita.

## Criteri di test

- Round-trip identico su una partita ricca (inventario pieno, quest a metà, mondo alterato).
- Una partita salvata, ricaricata e proseguita per 1000 tick produce lo stesso stato di una partita
  proseguita senza salvare (verifica congiunta con `RND` e `TIME`).
- Caricare un documento di versione precedente applica le migrazioni attese.
- Caricare un documento corrotto lascia intatta la partita corrente.
- Un campo aggiunto a un servizio senza aggiornare `serialize()` fa fallire il test di round-trip.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-10 (serializzabilità)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-58, GP-59, GP-60, GP-61
- [`game-context.md`](./game-context.md) · [`random.md`](./random.md) · [`time.md`](./time.md)
