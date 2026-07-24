# INP — Input

**Area:** Core · **Natura:** generico · **Priorità:** 2 · **Stato:** proposto
**Prefisso requisiti:** `INP-*`

## Scopo

Tradurre gli input fisici (tastiera, mouse, gamepad, touch) in **azioni astratte** di gioco, e
consegnarle come intenzioni all'orchestrazione. Gestisce contesti (esplorazione, dialogo, menu),
rimappatura e buffering.

Il dominio non sa che esiste una barra spaziatrice: sa che è arrivata l'azione `attack`.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | una **porta di input** implementata dalla presentazione (l'unica che tocca il DOM) |
| NON dipende da | `excalibur`, DOM, altri servizi |
| Consumato da | `presentation` (raccolta), orchestrazione (consumo delle azioni) |
| Stato dinamico | contesto attivo, buffer delle azioni, stato degli assi |
| Stato statico | mappature di default, definizione delle azioni |
| Dati esterni | `bindings.json` (default) + rebinding utente in `UserSettings` |
| Eventi emessi | `action-triggered`, `binding-changed` |

## API pubblica (indicativa)

```ts
type Action = 'move' | 'attack' | 'interact' | 'block' | 'use-item' | 'open-inventory' | …;
type InputContext = 'exploration' | 'dialog' | 'menu' | 'inventory';

interface InputService {
  /** La presentazione inietta gli eventi grezzi; è l'unico punto di ingresso. */
  feed(raw: RawInputEvent): void;

  pushContext(ctx: InputContext): void;   // il dialogo sospende i comandi di movimento
  popContext(): void;

  /** Azioni maturate in questo frame, in ordine. Svuota il buffer consumato. */
  consume(now: GameTimeMs): readonly ActionIntent[];

  axis(action: Action): Vector2;          // stick e WASD normalizzati
  isHeld(action: Action): boolean;

  rebind(action: Action, binding: Binding): Result<void, BindingConflict>;
}
```

## Requisiti

**INP-1** — Nessun tasto fisico **DEVE** comparire nella logica di gioco: la logica reagisce solo ad
azioni astratte (GP-62).

**INP-2** — Ogni azione **DEVE** essere rimappabile su tastiera, mouse e gamepad; i conflitti
**DEVONO** essere rilevati e riportati, non risolti silenziosamente (GP-63).

**INP-3** — Il servizio **DEVE** gestire uno **stack di contesti**: aprire un dialogo o un menu
sospende le azioni di esplorazione senza che il codice del dialogo debba disattivare nulla. La
chiusura ripristina esattamente il contesto precedente.

**INP-4** — **DEVE** esistere **input buffering** con finestra configurabile: un'azione impartita
durante un'animazione viene accodata ed eseguita appena la finestra si apre (GP-64).

**INP-5** — Le azioni bufferizzate **DEVONO** scadere dopo una durata configurabile: un attacco
premuto due secondi prima non **DEVE** partire.

**INP-6** — Il buffer **DEVE** distinguere azioni **istantanee** (attacco, interagisci) da azioni
**mantenute** (movimento, blocco): solo le prime si accodano.

**INP-7** — Gli assi analogici e le combinazioni direzionali di tastiera **DEVONO** essere
normalizzati alla stessa rappresentazione: il dominio non distingue lo stick dal WASD. **DEVE**
essere prevista una zona morta configurabile.

**INP-8** — Il servizio **DEVE** essere **testabile headless**: la porta di input consente di
iniettare una sequenza di input sintetici con marca temporale, senza browser.

**INP-9** — Una **sequenza registrata di azioni** riapplicata alla stessa partita **DEVE** produrre
lo stesso risultato (ARC-9.1): è la base per i test di regressione del gameplay.

**INP-10** — La rimappatura **DEVE** essere persistita nelle impostazioni utente, non nel
salvataggio di partita (CFG-5).

**INP-11** — Il servizio **NON DEVE** eseguire azioni né conoscerne il significato: produce
intenzioni. Decidere se l'attacco è possibile spetta all'orchestrazione e ai servizi di regole.

**INP-12** — Il servizio **DOVREBBE** esporre le associazioni correnti in forma leggibile, perché
l'HUD possa mostrare i suggerimenti contestuali con il tasto giusto per la periferica in uso.

## Criteri di test

- Una sequenza sintetica produce le azioni attese, nell'ordine e con i tempi attesi.
- Un attacco impartito 80 ms prima della fine di un'animazione con finestra 150 ms viene eseguito;
  a 400 ms con finestra 150 ms scade.
- Aprire e chiudere un dialogo ripristina il contesto precedente, incluse le azioni mantenute.
- Un conflitto di rimappatura viene riportato con entrambe le azioni coinvolte.
- Stick e WASD producono lo stesso vettore normalizzato a parità di direzione.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-1 (separazione), ARC-9 (determinismo)
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-54, GP-62, GP-63, GP-64
- [`config.md`](./config.md) · [`hud.md`](./hud.md)
