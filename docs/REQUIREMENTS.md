# Requirements

## Desired features

### Giocatore
- [ ] Non struttura a livelli ma a caratteristiche singole
- [ ] Le caratteristiche migliorano con la formazione dai maestri
- [ ] Alcuni perk che arrivano con il tempo o dopo aver migliorato alcune caratteristiche

### Mappa

- [ ] Aree con mappa generata a mano con Tiled
- [ ] Aree con mappe generate casualmente
- [ ] Aree con mappe generate casualmente da un pool di aree da connettere tra loro
- [ ] Gli oggetti delle mappe respawnano dopo un certo tempo: poco se è mappa casuale e infinito se è mappa fissa

> **Struttura mappa e rendering del terreno**: i requisiti di dettaglio (organizzazione a livelli,
> Dual Grid System a 3 livelli di terreno, ordinamento per Y, overhead, collisione) sono in un
> documento a parte: [`MAP-REQUIREMENTS.md`](./MAP-REQUIREMENTS.md).

### Quest
- [ ] Quest predeterminate

### Inventario
- [ ] Stato di "quest item", che rende l'oggetto pesante 0 e non droppabile se la quest non è chiusa

### NPC
- [ ] Stato di 'quest NPC' per gli NPC che non ne permette l'uccisione
- [ ] I mercanti hanno soldi e inventario finiti, e si approvigionano di nuovo dopo un timeout
- [ ] IA in grado di reagire alle condizioni: se il giocatore mi ferisce scappo o lo attacco; se

### Gilde e fazioni
- [ ] Esistenza di fazioni, che possono essere sia "cittadini di X" che membri di una corporazione o anche membri di un gruppo criminale o religioso
- [ ] Ogni fazione ha N livelli che possono dare vantaggi o opzioni di dialogo

### Dialoghi

- [ ] Dialoghi con opzioni diverse a seconda dei precedenti dialoghi
- [ ] Dialoghi con opzioni diverse a seconda dello stato delle quest
- [ ] Dialoghi con opzioni diverse a seconda della reputazione tra giocatore e NPC

### Reputazione

- [ ] Sistema di reputazione del giocatore rispetto alle varie fazioni
- [ ] Modificatore della reputazione tra il giocatore e il singolo NPC

---

## Feature aggiuntive proposte

> Feature non presenti nell'elenco originale ma utili o fondamentali per rendere il gioco
> giocabile end-to-end e con la profondità tipica di un action-RPG. Sono raggruppate per area e
> marcate come **(fondamentale)** o **(profondità)** a seconda del ruolo.

### Salvataggio e persistenza *(fondamentale)*
- [ ] Salvataggio/caricamento della partita (stato giocatore, quest, dialoghi, inventario, mondo)
- [ ] Slot di salvataggio multipli + autosave
- [ ] Versionamento del formato di salvataggio (migrazione tra versioni del gioco)
- Nota: condiziona come si modella lo stato (vedi Technical requirements → *serializzabilità*),
  quindi va progettata **prima**, non aggiunta alla fine.

### Combattimento *(profondità)*
- [ ] Tipi di danno (taglio, perforazione, contundente, fuoco, veleno…) e relative resistenze/vulnerabilità
- [ ] Status effect a tempo (avvelenamento, sanguinamento, stordimento, rallentamento, buff/debuff)
- [ ] Knockback e reazioni al colpo (hitstun) parametrizzati dall'arma
- [ ] Blocco/parata e/o schivata con finestra temporale (i-frames)
- [ ] Attacchi a distanza e magia per il giocatore (non solo per i nemici)
- [ ] Formula di danno formalizzata e deterministica-testabile (RNG seedabile, vedi §RNG)

### Progressione del personaggio *(profondità)*
- [ ] Abilità/skill oltre alle caratteristiche di base (es. scasso, alchimia, persuasione)
- [ ] Le abilità migliorano con l'uso e/o con la formazione dai maestri
- [ ] Requisiti su stat/abilità per equipaggiare oggetti o sbloccare opzioni
- [ ] Punti vita/energia/mana derivati dalle caratteristiche

### Inventario ed equipaggiamento *(profondità)*
- [ ] Peso trasportabile e sovraccarico (encumbrance)
- [ ] Slot di equipaggiamento (arma, armatura, accessori) con effetti sulle stat
- [ ] Oggetti consumabili (pozioni, cibo) con effetti/status
- [ ] Stack di oggetti identici; oggetti unici/leggendari
- [ ] Loot table per nemici, casse e forzieri (drop pesati)
- [ ] Crafting/riparazione (opzionale, profondità)

### Economia e commercio *(profondità)*
- [ ] Prezzi di acquisto/vendita modulati da reputazione, fazione e abilità di mercanteggio
- [ ] Mercanti con liquidità e assortimento finiti che si rigenerano a timeout (già in NPC)

### Mondo e simulazione *(profondità)*
- [ ] Ciclo giorno/notte e, opzionalmente, orario che influenza NPC e spawn
- [ ] Routine giornaliere degli NPC (casa/lavoro/taverna) legate all'orario
- [ ] Timer di respawn di nemici/oggetti differenziato per tipo di area (già accennato in Mappa)
- [ ] Oggetti interattivi del mondo: porte, leve, forzieri chiusi (scasso), trappole

### Sistema di crimine/notorietà *(profondità)*
- [ ] Azioni illegali (furto, aggressione, omicidio) osservabili dagli NPC
- [ ] Taglia/notorietà per fazione con conseguenze (guardie ostili, prezzi, dialoghi)

### Interfaccia e feedback *(fondamentale)*
- [ ] HUD: barre di vita/energia, indicatore di stato, arma/abilità attiva
- [ ] Diario/log delle quest con obiettivi e stato
- [ ] Schermata di inventario ed equipaggiamento
- [ ] Minimappa e/o mappa del mondo
- [ ] Menu di pausa, opzioni, salva/carica
- [ ] Interazione contestuale con bersaglio selezionato (attacca / parla / usa / deruba)

### Audio *(fondamentale per l'esperienza)*
- [ ] Musica di sottofondo per area/situazione (esplorazione, combattimento)
- [ ] Effetti sonori per azioni, colpi, UI, ambiente
- [ ] Controllo volume separato (master/musica/effetti)

### Morte e fallimento *(fondamentale)*
- [ ] Gestione morte del giocatore (game over / respawn / caricamento ultimo salvataggio)
- [ ] Conseguenze del fallimento delle quest (rami alternativi o chiusura)

### Accessibilità e localizzazione *(qualità)*
- [ ] Testi esternalizzati e localizzabili (i18n), nessuna stringa di gioco hardcoded
- [ ] Rebinding dei comandi e supporto gamepad
- [ ] Opzioni di accessibilità (dimensione testo, riduzione shake/effetti)

### Input *(fondamentale)*
- [ ] Layer di mappatura azione-astratta (input → azione), non tasti hardcoded
- [ ] Input buffering (accodare un attacco durante un'animazione)

---

## Technical requirements

> Questa sezione definisce le **strutture tecniche** con cui realizzare le feature sopra. Il
> principio guida, coerente con la critica alla versione precedente
> (`docs/previous-version/REPORT-VALUTAZIONE.md`), è uno solo:
>
> **separare nettamente la *presentazione* dalla *struttura* (logica di dominio + dati), così che
> ogni parte sia il più possibile isolata, sostituibile e testabile senza il motore grafico.**> In pratica: la logica di gioco (regole, stato, calcoli) deve poter girare, ed essere testata, in
> un semplice runner Node **senza istanziare Excalibur, canvas o asset**.

### TR1 — Separazione presentazione / dominio (principio cardine)

- [ ] Il codice è organizzato in **tre strati** con dipendenze a senso unico:
  - **Presentation** (Excalibur `Actor`, `Scene`, sprite, animazioni, input, audio): può dipendere
    dal dominio, **mai viceversa**.
  - **Domain** (regole ed entità di gioco: salute, stat, combattimento, IA, quest, dialoghi,
    inventario): puro TypeScript, **nessun `import` da Excalibur**.
  - **Data/Content** (definizioni di quest, dialoghi, oggetti, nemici come file dati).
- [ ] Regola verificabile: nessun file in `domain/` importa `excalibur`. La presentazione osserva il
  dominio ed emette eventi; il dominio non conosce gli `Actor`.
- [ ] Lo stato di dominio **non contiene riferimenti a `Actor`** (né a nodi di rendering). Il legame
  runtime Actor↔Model è mantenuto solo dallo strato di presentazione (es. una mappa `id → Actor`).

### TR2 — Composizione a componenti invece di ereditarietà (ECS)

- [ ] Modellare le entità come **composizione di componenti/behavior** riusabili
  (`HealthComponent`, `CombatComponent`, `AIComponent`, `InventoryComponent`, `DialogComponent`,
  `FactionComponent`, `LootComponent`, `InteractableComponent`, …) anziché con gerarchie profonde
  (`NpcActor → Slime/Merchant`, `Item → Weapon → Sword`).
- [ ] Sfruttare l'ECS che Excalibur offre già, senza remare controcorrente; promuovere le interfacce
  di capacità esistenti (`Hittable`, `Talkable`) a **veri componenti**.
- [ ] Obiettivo: comporre casi come "mercante che sa combattere" o "slime amichevole"
  aggiungendo/togliendo componenti, senza duplicare rami di classi.
- [ ] La logica dei componenti di dominio è testabile in isolamento (nessuna dipendenza dal motore).

### TR3 — Contenuti data-driven + schema tipizzato + interprete

- [ ] Quest, dialoghi, definizioni di oggetti, nemici, loot table, tabelle di prezzi risiedono in
  **file dati** (JSON/YAML) caricati come risorse, **non** come letterali TS nel corpo delle classi.
- [ ] Precondizioni ed effetti modellati con **union discriminate tipizzate** (es.
  `{ type: 'player-in-area', area: string }`), validate a caricamento (schema/parse, es. Zod).
- [ ] Un **interprete di effetti/precondizioni** (pattern Command/Effect) valuta ed esegue le regole:
  i repository **leggono** i dati, non li contengono e non li interpretano.
- [ ] I contenuti sono modificabili da un game/narrative designer **senza ricompilare** il gioco.

### TR4 — Comunicazione a eventi (EventBus) e riferimenti stabili

- [ ] Un **EventBus** tipizzato per gli eventi di gioco (danno inflitto, entità morta, quest
  avanzata, dialogo aperto, oggetto raccolto): disaccoppia mittente e destinatario e abilita il test
  della logica osservando gli eventi emessi.
- [ ] **Nessuna ricerca di entità per nome-stringa** né stringhe magiche per stati/direzioni/tag:
  usare **enum/costanti**, **collision group** di Excalibur per i collider, e un riferimento stabile
  al player mantenuto dalla scena (non ricercato ogni tick).
- [ ] Query spaziali/di prossimità efficienti (evitare scansioni O(n) della scena a ogni tick per NPC).

### TR5 — Niente stato globale: GameContext e Dependency Injection

- [ ] Nessun singleton mutabile esportato dal bootstrap (`game`, `status`) importato in profondità;
  nessuna dipendenza circolare `main → Scene → Actor → main`.
- [ ] Un **GameContext**/container di servizi iniettato via costruttore (repository, service,
  EventBus, RNG, SaveService). Lo stato di selezione UI appartiene alla scena/input-controller.
- [ ] Consente scene/partite multiple indipendenti e test dei sistemi con dipendenze finte (fake/mock).

### TR6 — IA a Utility-AI (logica pura, disaccoppiata dal motore)

I PNG (Personaggi Non Giocanti) prendono decisioni tramite un sistema di **Utility-AI**: ogni azione
possibile riceve un punteggio in base allo stato corrente di agente e mondo, e viene selezionata
quella a punteggio massimo.

Il sistema decisionale è implementato come **logica pura**, completamente disaccoppiata dal framework
Excaliburjs. Il layer di utilità opera su **modelli/dati** (snapshot read-only del contesto) e non
dipende da `Actor` né da alcuna API di rendering. L'integrazione con Excalibur avviene tramite un
sottile **adattatore ECS** che (a) costruisce il contesto dai `Component` e (b) applica al mondo
l'azione selezionata. Ne consegue che l'intera logica decisionale è **testabile headless**
(Node/Vitest), senza browser né loop di rendering.

Il modello si articola in **4 mattoni concettuali**, mantenuti separati anche a livello di codice:

- [ ] **Bisogni / input** — stato di agente e mondo espresso come **valori normalizzati 0..1**.
- [ ] **Considerations (curve di risposta)** — funzioni che trasformano un input in un contributo di
  utilità 0..1; sono la **superficie di tuning** del comportamento.
- [ ] **Azioni / intenti** — ciascuna con una lista di considerations; il punteggio è la loro
  **combinazione** (prodotto, con proprietà di **veto** se un fattore è 0).
- [ ] **Selector** — confronta i punteggi e seleziona l'azione (con opzionale **randomizzazione**
  entro una soglia dal massimo).

Vincoli trasversali:

- [ ] Nessun `import` da Excalibur nel layer di utilità (coerente con TR1): il contesto è uno
  **snapshot read-only** di dati, non riferimenti a `Actor`.
- [ ] I parametri delle curve di risposta e i pesi delle azioni sono **data-driven** (coerente con
  TR3), tarabili senza ricompilare.
- [ ] Mantenere il **throttling dell'IA** (raggio di attivazione + intervallo discreto di
  rivalutazione), compatibile con query spaziali efficienti; nessun logging in hot path.
- [ ] Prevedere un'inerzia per non far saltare il PNG da un obiettivo all'altro
- [ ] Prevedere, ove possibile, il bucketing delle azioni da scegliere
- [ ] Prevedere la scelta casuale pesata tra quelle migliori, in modo da non eseguire sempre l'azione più prevedibile

### TR7 — Combattimento centralizzato

- [ ] Un unico `CombatComponent`/servizio con una struttura **`DamageInfo`** (quantità, tipo,
  sorgente, knockback, status applicati); un **solo punto** di calcolo del danno.
- [ ] Eliminare le implementazioni duplicate di `takeHit`; il danno passa per un contratto tipizzato,
  non per `(other as any).model`.
- [ ] Regole (dadi, resistenze, status) formalizzate e coperte da unit test.

### TR8 — Input centralizzato

- [ ] Un **InputController** che mappa input fisici → **azioni astratte** (rebindabili, gamepad).
- [ ] **Input buffering** per accodare azioni durante le animazioni.
- [ ] Lo stato del player gestito come **componente FSM riusabile** (come per gli NPC), non come
  metodo `onPreUpdate` monolitico che mescola input, fisica, animazione e attacco.

### TR9 — Persistenza e serializzabilità

- [ ] Un **SaveService** che serializza/deserializza lo stato dinamico (giocatore, quest, dialoghi,
  inventario, mondo) verso `localStorage`/file, con **versionamento** e migrazioni.
- [ ] Distinzione netta tra **dati statici** (definizioni, da file di contenuto) e **stato dinamico**
  (salvabile): solo il secondo viene serializzato, con **ID stabili** per referenziare i dati statici.
- [ ] Nessun riferimento a `Actor`/oggetti runtime dentro lo stato serializzabile (vedi TR1).

### TR10 — RNG deterministico e seedabile

- [ ] Un servizio RNG **seedabile** iniettato (non `Math.random()` sparso): rende deterministici
  combattimento, loot, wandering e la generazione procedurale delle mappe.
- [ ] Abilita test riproducibili e la rigenerazione delle aree casuali da seed salvato.

### TR11 — Testabilità e qualità *(trasversale, abilita tutto il resto)*

- [ ] **Test runner** e unit test sul layer di dominio (matematica del combattimento, transizioni IA,
  progressione quest, interprete effetti, serializzazione): è il layer più delicato ed è puro TS.
- [ ] **Rigore di tipo**: eliminare `as any`/`undefined as any`; sfruttare TypeScript come rete di
  sicurezza per il codice in crescita.
- [ ] `dist/`/artefatti di build in `.gitignore`; naming e convenzioni coerenti.
- [ ] Ove utile, test di caratterizzazione per "congelare" il comportamento prima di rifattorizzare.

### TR12 — Configurazione, localizzazione e asset centralizzati

- [ ] `config.ts` come unico punto per i **parametri di bilanciamento**, assorbendo i magic number
  residui (z-order, griglie sprite).
- [ ] **Testi esternalizzati e localizzabili** (i18n): nessuna stringa di gioco hardcoded nel codice.
- [ ] Caricamento **data-driven degli asset** (sprite/audio) coerente con il caricamento da Tiled già
  in uso per il posizionamento spaziale delle entità.

### Struttura delle cartelle (indicativa)

```
src/
├─ presentation/     Excalibur: Actor, Scene, componenti di rendering/animazione, audio, HUD
│   └─ map/          rendering terreno (TileMap DGS), z-order per Y, overhead (MAP-REQUIREMENTS)
├─ domain/           Puro TS, nessun import da Excalibur
│   ├─ entities/     componenti (health, combat, ai, inventory, dialog, faction, loot…)
│   ├─ combat/       DamageInfo, calcolo danno, status effect
│   ├─ ai/           utility-ai: input/bisogni, considerations, azioni, selector
│   ├─ map/          griglia dati terreno, indici DGS, maschere di priorità, collisione da griglia
│   ├─ quests/       modelli + interprete precondizioni/effetti
│   ├─ dialogs/      modelli + interprete
│   └─ services/     EventBus, RNG, SaveService, GameContext
├─ content/          Dati esterni: quests, dialogs, items, npcs, loot, prices, maps (JSON/YAML) + schema
├─ input/            InputController, mappatura azioni, buffering
├─ config.ts         Parametri di bilanciamento (incl. TS, z-band, INDEX_TO_TILE)
└─ resources.ts      Asset, mappa Tiled, registrazione factory
```

### Priorità di adozione (sintesi)

| Priorità | Requisito |
|---|---|
| Alta | TR1 (separazione), TR2 (componenti), TR3 (dati esterni), TR4 (eventi/riferimenti), TR5 (DI), TR6 (Utility-AI) |
| Media/Alta | TR9 (persistenza), TR11 (test) |
| Media | TR7 (combattimento), TR8 (input), TR10 (RNG), TR12 (config/i18n/asset) |

### Requisiti correlati (documenti separati)

- [`MAP-REQUIREMENTS.md`](./MAP-REQUIREMENTS.md) — Struttura della mappa a livelli e rendering del
  terreno con Dual Grid System (autoring, formato dati, ordinamento per Y, overhead, collisione).
  Numerazione propria `MAP-1…MAP-9`, distinta dai `TR*` di questo file.

Priorità relativa dei requisiti mappa (rispetto ai TR sopra):

| Priorità | Requisito mappa |
|---|---|
| Alta | MAP-1 (livelli/z-band), MAP-2/MAP-3 (DGS + griglia dati), MAP-5 (ordinamento per Y), MAP-7 (collisione), MAP-8 (formato dati) |
| Media | MAP-4 (transizioni per priorità), MAP-6 (overhead), MAP-9 (non funzionali/performance) |

> Coerenza con i TR: la **griglia dati** e la **collisione** (MAP-2, MAP-7) sono dominio puro e
> testabile (TR1/TR11); i parametri (TS, z-band, `INDEX_TO_TILE`) vivono in `config.ts` (TR12); il
> caricamento delle mappe è data-driven da file/Tiled (TR3, TR12).

