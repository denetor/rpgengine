# TRPG — Documentazione tecnica del prototipo

> Prototipo di gioco di ruolo (top-down/action-RPG) in cui un personaggio si muove
> su una mappa realizzata con **Tiled** e interagisce con oggetti, NPC amichevoli e
> nemici dotati di intelligenza artificiale non banale.

Questo documento descrive:

1. Le **funzionalità** attualmente implementate (e quelle abbozzate).
2. Le **tecnologie** applicate.
3. Le **metodologie e le strutture** architetturali che rendono possibili le funzionalità.

---

## 1. Funzionalità

### 1.1 Mondo di gioco e movimento del personaggio

- Il mondo è una mappa **Tiled** (`res/test-level.tmx`, 64×64 tile da 16px) composta da più
  layer: `terrain`, `terrain2`, `solid` (collisioni) e un layer di oggetti `objects`.
- Il **giocatore** (`PlayerActor`) si muove nelle 4 direzioni con le frecce, con animazioni
  di *idle* e *walk* per ogni direzione (N/E/S/W). La velocità dipende dalle statistiche del
  personaggio (agilità → funzione di easing).
- La **camera segue elasticamente** il giocatore (`elasticToActor`).
- La visualizzazione è a schermo intero, in modalità *pixel art*.

### 1.2 Oggetti nel mondo

Gli oggetti vengono istanziati automaticamente dalla mappa Tiled in base al loro *type*, tramite
factory registrate (vedi §3.2). Sono presenti:

- **Oggetti fissi / decorativi**: casse, forzieri, cartelli, statue, funghi, libri, pozioni,
  scheletri, ecc. (definiti come oggetti Tiled; solo alcuni hanno un attore dedicato).
- **Oggetti mobili e distruggibili**: le **casse di legno** (`CrateActor` + modello `Crate`).
  Hanno punti vita e armatura, possono subire danni ed essere distrutte; alla distruzione
  compare un'animazione transitoria di "polvere" (`ItemDestroyedActor`).

### 1.3 Combattimento

- Il giocatore possiede una **spada** (`SwordActor`), attore figlio del giocatore, attivabile con
  la barra spaziatrice. L'attacco è gestito come una macchina a stati (`ContactAttackStatus`:
  `None → Init → Active → End`): durante lo *swing* viene attivato temporaneamente un collider
  circolare e riprodotta l'animazione direzionale.
- La collisione della spada con un'entità dotata di `model` invia danno tramite l'interfaccia
  `Hittable.takeHit()`. Il danno mostra una **label di danno fluttuante** (`DamageLabel`) e
  un'animazione di impatto (`SwordHitActor`).
- Il **danno è calcolato dal modello dell'arma** (es. la spada: somma di due tiri pseudo-casuali,
  in stile "dadi"), e attenuato dall'**armatura** del bersaglio.
- I nemici a distanza sparano **proiettili** (`MissileActor`, es. lo "splat" dello slime
  `SlimeSplatActor`) che, colpendo il giocatore, ne riducono i punti vita.
- Quando il giocatore subisce danni significativi, la camera **trema** (`camera.shake`) in
  proporzione al danno relativo.

### 1.4 NPC e IA (nemici e personaggi non ostili)

Gli NPC derivano da una classe base comune `NpcActor` e sono guidati da un **automa a stati
finiti** (FSM). Stati disponibili (`States`): `IDLE`, `TALK`, `WANDER`, `PATROL`, `FIGHT_PLAYER`,
`CHASE_PLAYER`, `FLEE_PLAYER`. Ogni tipo di NPC dichiara solo il **sottoinsieme** di stati che
può assumere.

Comportamenti implementati:

- **Slime (nemico ostile)** — stati: `IDLE`, `WANDER`, `CHASE_PLAYER`, `FIGHT_PLAYER`,
  `FLEE_PLAYER`. Comportamento non banale richiesto:
  - **insegue** il giocatore quando è nelle vicinanze (`CHASE_PLAYER`);
  - **combatte** quando il giocatore è a portata (`FIGHT_PLAYER`, spara *splat*);
  - **fugge** quando è troppo ferito (`FLEE_PLAYER`, quando `health < FLEE_HEALTH`);
  - **vaga** casualmente attorno alla posizione iniziale quando è tranquillo (`WANDER`).
- **Mercante (NPC non ostile)** — stati: `IDLE`, `WANDER`, `FLEE_PLAYER`. Non attacca; saluta
  il giocatore quando gli si avvicina.
- **Rilevamento di prossimità**: ogni NPC può avere un attore-figlio "detector" (collider
  circolare) che scatena eventi quando il giocatore entra nel raggio.
- **Ottimizzazione**: la routine di IA gira solo se il giocatore è entro `runAiRadius` e a
  intervalli discreti (`aiInterval`, es. 100–250 ms), non a ogni frame.

### 1.5 Dialoghi e interazione

- **Messaggi effimeri** sopra la testa dell'attore (`EphemeralMessage` + interfaccia `Talkable`):
  usati per far "parlare" NPC e giocatore (es. lo slime dice "Hi, player", il mercante "Hi,
  need to buy something?"). Anche i cambi di stato dell'IA possono essere annunciati a schermo.
- **Messaggi a schermo** a tutta larghezza (`ScreenMessage`), con sfondo semitrasparente,
  multi-linea e auto-nascondimento.
- **Menu contestuale dell'attore** (`ActorMenu`): cliccando su un NPC evidenziato dal puntatore
  appare un piccolo menu (attualmente placeholder grafico) con auto-hide dopo 3 secondi.
- Il sistema di dialoghi vero e proprio (albero di dialoghi, condizioni, stato) è **progettato ma
  non ancora implementato**: esiste solo lo scheletro `DialogsRepository`. Il design è descritto
  nel `README.md`.

### 1.6 Quest

Sistema di quest **strutturato ma parzialmente implementato**:

- Un **inventario di quest** disponibili nel mondo (`QuestsRepository`), ciascuna con `stages`
  (fasi progressive), `preconditions` (per avviarla) e, per ogni fase, `preconditions` e
  `onComplete` (azioni all'avanzamento). Sono già definite due quest di esempio a tema "trova i
  tuoi antenati".
- Uno **stato delle quest avviate** dal giocatore (`QuestsStatusRepository` + `QuestStatus`,
  con `currentStage`).
- Un **gestore** (`QuestManagerService`) che sa: avviare una quest (`startQuest`), recuperare la
  quest attiva (`activeQuest`), determinare la fase successiva (`nextStage`). Le funzioni
  `testPreconditions()` e `onComplete()` sono presenti come **placeholder** (logica ancora da
  implementare, come segnalato dai `TODO`).

---

## 2. Tecnologie applicate

| Ambito | Tecnologia | Note |
|---|---|---|
| Linguaggio | **TypeScript 5.7** | Tutto il codice sorgente in `src/`, tipizzazione forte. |
| Game engine | **Excalibur.js 0.30.2** | Motore 2D per il web: Engine, Scene, Actor, Collider, Animation, SpriteSheet, camera, input, clock/timer. |
| Mappe | **Tiled** + **@excaliburjs/plugin-tiled 0.30.1** | Caricamento di `.tmx`/`.tsx`; istanziazione degli oggetti tramite `entityClassNameFactories`. |
| Bundling | **Webpack 5** + **ts-loader** | `webpack-dev-server` per lo sviluppo (porta 9000, HMR), `asset/resource` per immagini/audio. |
| Copia asset | **copy-webpack-plugin** | Copia `index.html`, `res/`, `img/` in `dist/`. |
| Serving statico | **http-server** | Per servire la build. |
| Rendering | **Canvas HTML5** | Un unico `<canvas id="game">` in `index.html`. |

Script principali (`package.json`): `start` (dev-server), `build` / `build:prod` / `build:dev`,
`serve`.

---

## 3. Metodologie e strutture architetturali

L'architettura separa nettamente la **presentazione/comportamento a runtime** (gli *Actor* di
Excalibur, in `src/actors/`) dalla **logica di dominio e dai dati** (i *model* in `src/models/`),
con **factory**, **repository** e **service** a fare da collante. Questo permette di far evolvere
le regole di gioco senza toccare il codice grafico.

### 3.1 Separazione Actor / Model

- Un **Actor** (es. `PlayerActor`, `SlimeActor`, `CrateActor`) gestisce sprite, animazioni,
  collisioni, input e ciclo di vita nel motore.
- Ogni Actor delega la logica a un **Model** (`Player`, `Slime`, `Crate`, …) che contiene
  statistiche e stato di dominio (salute, armatura, forza/agilità/intelligenza, stato dell'IA…).
- Il legame è bidirezionale dove serve: il `Character` conosce il proprio `actor` per potervi
  leggere la posizione o invocare `say()`.

Gerarchie dei model (ereditarietà):

```
Item (Hittable)                Character (Hittable)
 ├─ Crate                       ├─ Player (ha mainWeapon)
 └─ Weapon (astratta)           └─ Slime
     └─ Sword
```

### 3.2 Factory + caricamento dichiarativo dalla mappa

Il plugin Tiled è configurato (in `src/resources.ts`) con una mappa *tipo Tiled → factory*:

```ts
entityClassNameFactories: {
    playeractor: PlayerActorFactory.create,
    crate:       CrateActorFactory.create,
    pngSlime:    SlimeActorFactory.create,
    npcMerchant: MerchantActorFactory.create,
}
```

Così **posizionare un nemico o un oggetto nel mondo si fa nell'editor Tiled**, senza scrivere
codice: al caricamento della scena (`Resources.TiledMap.addToScene`) ogni oggetto con quel `type`
viene istanziato dalla factory corrispondente alla sua posizione. Le factory (`src/factories/`)
sono piccole e uniformi: costruiscono l'attore e ne impostano lo *z-order*.

### 3.3 Automa a stati finiti per l'IA (pattern State + Strategy)

L'IA degli NPC è la struttura più elaborata. È divisa in due responsabilità:

- **`StateManager`** (`src/models/state-manager.model.ts`) — la **logica di transizione**:
  metodi statici `updateXxxState()`, uno per ogni stato, che decidono se e verso quale stato
  transitare, in base a condizioni (giocatore vicino/attaccabile, salute, disponibilità dello
  stato, tiri probabilistici). Ogni stato può transitare solo verso un sottoinsieme di stati.
- **`NpcActor.doAction()`** — l'**esecuzione dell'azione** dello stato corrente
  (`doChasePlayer`, `doFleeFromPlayer`, `doFightPlayer`, `doWander`).

Ciclo di aggiornamento (in `NpcActor.onPreUpdate`):

```
ogni aiInterval ms:
   model.updateState(engine)     // 1. aggiorna variabili (distanza, prossimità…)
                                  // 2. se entro runAiRadius → StateManager.updateState()
   doAction(engine, elapsed)     // esegue l'azione dello stato corrente
```

Vantaggi di questa struttura:

- I **comportamenti "non banali"** richiesti (inseguire, poi fuggire se troppo ferito) emergono
  naturalmente dalle regole di transizione, senza codice ad-hoc per ogni nemico.
- La **personalità di un NPC** si definisce in modo dichiarativo tramite l'elenco degli
  `availableStates` (uno slime può combattere, un mercante no).
- Il comportamento comune vive in `NpcActor`; la specializzazione (sprite, tipo di proiettile,
  reazioni al rilevamento) avviene per **override** nelle sottoclassi (`getMissileActor`,
  `onDetector`, `say`).

### 3.4 Interfacce di contratto

Piccole interfacce definiscono capacità trasversali, disaccoppiando chi le usa da chi le implementa:

- **`Hittable`** — `takeHit(impact): number`: qualunque cosa possa subire danno (personaggi e
  oggetti). Consente alla spada/proiettile di danneggiare genericamente `other.owner.model`.
- **`Talkable`** — `say(message)`: qualunque attore possa mostrare testo effimero.

### 3.5 Repository e Service (separazione dati / operazioni)

Ispirato a un'organizzazione a livelli:

- **Repository** (`QuestsRepository`, `QuestsStatusRepository`, `DialogsRepository`): custodiscono
  e interrogano collezioni di dati (le quest disponibili nel mondo vs. le quest avviate dal
  giocatore, il cui stato dovrà essere salvabile).
- **Service** (`QuestManagerService`): orchestra le operazioni sui repository (avvio quest,
  avanzamento di fase, verifica precondizioni). La scena (`DevScene`) istanzia e collega insieme
  repository e service tramite **dependency injection** via costruttore.

### 3.6 Factory di animazioni ed easing (utility riutilizzabili)

- **`AnimationFactory.createScaled()`** centralizza la creazione di animazioni scalate da uno
  sprite sheet a una dimensione target: elimina duplicazione nei numerosi Actor animati.
- **`EasingsService`** fornisce funzioni matematiche (es. `easeInOutQuad`) usate ad esempio per
  mappare l'agilità sulla velocità di camminata in modo non lineare.

### 3.7 Configurazione centralizzata

`src/config.ts` raccoglie i **parametri di bilanciamento** (raggi di ingaggio, distanze di
prossimità/attacco, probabilità di wandering/fuga, font dei messaggi). Concentrare qui le
costanti consente il *tuning* del gioco senza cercare valori sparsi nel codice.

### 3.8 Ciclo di vita e composizione degli Actor

Il prototipo sfrutta a fondo le convenzioni di Excalibur:

- **Composizione parent/child**: la spada è figlia del giocatore; i detector di prossimità sono
  figli dell'NPC; le label sono figlie dei messaggi a schermo.
- **Hook del ciclo di vita**: `onInitialize` (setup sprite/animazioni), `onPreUpdate` (input, IA,
  controllo salute), `onCollisionStart` (danno), `onPostKill` (effetti di distruzione).
- **Eventi**: input del puntatore (`pointerenter`/`pointerleave`/`down`) per selezione e menu;
  eventi di collisione per detector e armi; eventi di fine animazione per chiudere l'attacco.
- **Clock/Timer** del motore per temporizzazioni (cooldown di attacco, auto-hide dei messaggi,
  durata dei proiettili).

---

## 4. Stato di avanzamento (sintesi)

| Area | Stato |
|---|---|
| Movimento, camera, mappa Tiled | ✅ Funzionante |
| Oggetti distruggibili (casse) | ✅ Funzionante |
| Combattimento corpo a corpo (spada) | ✅ Funzionante |
| Nemici con IA (insegui/combatti/fuggi/vaga) | ✅ Funzionante |
| Proiettili nemici | ✅ Funzionante |
| Messaggi effimeri / a schermo | ✅ Funzionante |
| Menu contestuale attore | 🟡 Grafica placeholder |
| Sistema di quest | 🟡 Strutture pronte, logica di precondizioni/completamento da implementare (`TODO`) |
| Sistema di dialoghi | 🔴 Solo progettato (`README.md`) e scheletro `DialogsRepository` |
| Interazione via click (attacca/parla/usa) | 🔴 Previsto (`TODO` in `DevScene`) |
| Salvataggio/persistenza | 🔴 Non implementato (previsto per stato quest e dialoghi) |

---

## 5. Struttura delle cartelle (riferimento)

```
src/
├─ main.ts                 Bootstrap dell'Engine e delle scene
├─ config.ts               Parametri di gioco e stili
├─ resources.ts            Asset, mappa Tiled e registrazione factory
├─ scenes/
│   └─ dev.scene.ts        Scena di sviluppo (mondo + input + quest manager)
├─ actors/                 Comportamento a runtime (Excalibur Actor)
│   ├─ player.actor.ts, sword.actor.ts, crate.actor.ts
│   ├─ npc/                npc.actor (base), slime, merchant
│   ├─ weapons/            missile, slime-splat
│   ├─ ui/                 actor-menu, screen-message
│   ├─ misc/               messaggi effimeri, label danno, effetti
│   └─ *.interface / *.enum  Talkable, ContactAttackStatus
├─ models/                 Logica e dati di dominio
│   ├─ character.model, player.model, item.model, weapon.model
│   ├─ state-manager.model, states.enum, hittable.interface
│   ├─ npcs/, items/, weapons/
│   ├─ quest*.model
│   └─ repositories/       quests, quests-status, dialogs
├─ services/               quest-manager, easings
└─ factories/              player/crate/slime/merchant + animation.factory
```