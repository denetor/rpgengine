# Report di valutazione architetturale — TRPG

> Valutazione critica del prototipo alla luce delle pratiche comuni nello sviluppo di
> action-RPG 2D e, soprattutto, della **scalabilità futura**: completare le funzionalità
> abbozzate (quest, dialoghi, interazione) e aggiungerne di nuove.
>
> Il tono è volutamente critico: i pregi sono riconosciuti ma il valore di questo report
> sta nei rischi. Ogni giudizio è ancorato a codice reale.

---

## 0. Giudizio sintetico

Il prototipo è **ben impostato per essere un prototipo**: le scelte di alto livello (separazione
Actor/Model, caricamento data-driven da Tiled, config centralizzata, layering repository/service)
sono corrette e mostrano un autore che conosce i problemi del dominio. **Non è però impostato per
diventare un gioco reale così com'è**: le tecniche che oggi funzionano su 4 tipi di entità
degenerano rapidamente con l'aumentare della varietà. I tre rischi che, se non affrontati presto,
renderanno lo sviluppo sempre più costoso sono:

1. **Ereditarietà al posto della composizione/ECS** → esplosione combinatoria delle sottoclassi.
2. **Stato globale + accoppiamento per riferimento diretto e stringhe magiche** → codice rigido,
   non testabile, con dipendenze circolari.
3. **Dati di gioco codificati in TypeScript** (quest, e domani dialoghi/oggetti/nemici) invece che
   in file di dati → i contenuti non scalano e richiedono un programmatore per ogni modifica.

Verdetto: **mantenere l'impianto concettuale, rifondare i meccanismi implementativi** prima di
aggiungere massa critica di contenuti. La finestra giusta per farlo è **ora**, finché il codice è
piccolo.

---

## 1. Pregi (con caveat)

| # | Pregio | Perché è buono | Caveat |
|---|---|---|---|
| P1 | **Separazione Actor / Model** | La logica di dominio (salute, stat, stato IA) è isolata dal rendering: è la premessa per testabilità e per far evolvere le regole senza toccare la grafica. | È realizzata con **ereditarietà**, non composizione: il pregio si ritorce contro (vedi D1). |
| P2 | **Caricamento data-driven da Tiled** (`entityClassNameFactories`) | Standard di settore: piazzare entità è compito del level designer nell'editor, non del programmatore. Ottima base per scalare i contenuti *spaziali*. | I dati *non spaziali* (quest, stat, dialoghi) non seguono lo stesso principio: sono hardcoded. |
| P3 | **FSM IA divisa transizione/esecuzione** (`StateManager` vs `doAction`) | Separare "quando cambiare stato" da "cosa fare nello stato" è la scelta giusta. | La FSM piatta con transizioni scritte a mano non scala (vedi D4). |
| P4 | **Interfacce di capacità** (`Hittable`, `Talkable`) | Disaccoppiano chi infligge danno da chi lo subisce. È già un passo verso i componenti. | Usate poco e aggirate con `as any`; vanno promosse a veri componenti. |
| P5 | **Config centralizzata** (`config.ts`) | Tuning del bilanciamento in un solo posto: pratica sana. | Copre solo una parte; molti magic number (z-order, griglie sprite) restano sparsi. |
| P6 | **Consapevolezza delle prestazioni dell'IA** (`runAiRadius`, `aiInterval`) | Non far girare l'IA a ogni frame per ogni NPC è una scelta matura, rara nei prototipi. | L'ottimizzazione è vanificata dalla scansione O(n) della scena a ogni tick (vedi D3). |
| P7 | **Layering Repository/Service + DI** per le quest | Struttura pulita e familiare; la scena inietta le dipendenze. | La logica del service è per il 60% `TODO`/placeholder e con bug (vedi §3.3). |

Nota trasversale: la **documentazione inline** (JSDoc) e il `README` con il design di dialoghi/quest
sono sopra la media per un prototipo. Buona igiene.

---

## 2. Difetti e rischi architetturali (ordinati per impatto sulla scalabilità)

### D1 — Ereditarietà profonda dove serve la composizione (rischio #1)

Le gerarchie `NpcActor → SlimeActor/MerchantActor` e `Item → Weapon → Sword` sono l'anti-pattern
classico degli action-RPG. Excalibur stesso è **entity-component** sotto il cofano: il progetto
rema controcorrente.

Sintomi già presenti:

- `NpcActor` è una **God class**: assume che *ogni* NPC abbia armi da lancio
  (`hasMissileWeapon()` ritorna sempre `true`), armi da contatto, detector, e sa fare
  chase/flee/wander/fight. È il "fragile base class problem" in embrione.
- Domanda di scalabilità immediata: *"un mercante che sa anche combattere"* o *"uno slime
  amichevole"* (già presente in mappa come `slimeFriendly`!). Con l'ereditarietà singola devi
  scegliere un ramo e **duplicare** il resto. Con i componenti aggiungi/togli comportamenti.

**Direzione corretta:** modellare le entità come **composizione di componenti/behavior**
(`HealthComponent`, `CombatComponent`, `AIComponent`, `DialogComponent`, `LootComponent`, …),
sfruttando l'ECS di Excalibur invece di combatterlo. Le interfacce `Hittable`/`Talkable` sono già
il germe giusto: vanno rese componenti, non metodi ereditati.

### D2 — Stato globale e dipendenze circolari

`main.ts` esporta i singleton mutabili `game` e `status`, importati direttamente in profondità:
`npc.actor.ts` fa `import { status } from '../../main'`. Questo crea il ciclo
`main → DevScene → *Actor → main` e accoppia ogni attore al bootstrap dell'applicazione.

Conseguenze: impossibile testare un attore in isolamento, impossibile avere più scene/salvataggi
indipendenti, refactoring rischiosi. `status.selectedActor` è per giunta **non tipizzato**
(`actor: null` + `as any` ovunque).

**Direzione corretta:** un `GameContext`/service iniettato (o un `EventBus`) al posto degli import
globali. Lo stato di selezione UI appartiene alla scena o a un input-controller, non a un singleton
di modulo.

### D3 — Comunicazione per riferimento diretto e stringhe magiche (niente event bus)

Non esiste un sistema di messaggistica. Le entità si trovano scandendo la scena per **nome-stringa**:

```ts
engine.currentScene.actors.find(a => a.name === 'player')  // ad ogni tick IA, per ogni NPC
```

e la logica ovunque dipende da stringhe (`name === 'missile'`, `'sword'`, `'crate'`; stato del
player `'idle'/'walk'/'swordAttack'`; direzioni `'N'/'E'/'S'/'W'`; chiavi animazione).

Problemi: costo O(n) per NPC per tick; refuso su una stringa = bug silenzioso; nessun
autocompletamento/controllo del compilatore; accoppiamento forte.

**Direzione corretta:**
- un **EventBus** per gli eventi di gioco (danno inflitto, entità morta, quest avanzata,
  dialogo aperto): disaccoppia mittente e destinatario;
- **collision group** di Excalibur al posto dei check per nome nei collider (già ci si difende con
  `other.owner.id !== this.parent.id`, un workaround);
- **enum/costanti** per stati, direzioni e tag; riferimento al player tenuto dalla scena, non
  ricercato ogni volta.

### D4 — La FSM dell'IA non scala; logica di transizione duplicata

`StateManager` ha un metodo `updateXxxState` per stato, ma le **stesse condizioni** (flee se ferito,
chase se lontano, fight se a portata) sono **copiate e incollate** in `updateIdleState`,
`updateChasePlayerState`, `updateWanderState`, `updateFightPlayerState`. Aggiungere uno stato o una
condizione significa modificare N metodi: crescita combinatoria e fonte di incoerenze.

Il `README` chiede già di più (priorità di transizione, modificatori come "aggressività"): una FSM
piatta scritta a mano non ci arriva. In più c'è un `console.log('updateState()')` in un **hot path**.

**Direzione corretta:** passare a una **FSM data-driven** (tabella stati→transizioni con condizioni
e priorità) o, meglio per comportamenti ricchi, a un **Behavior Tree** o **Utility AI**. Le
condizioni vanno estratte come predicati riusabili e valutate in un solo posto.

### D5 — Dati di gioco codificati in TypeScript

`QuestsRepository` contiene le quest come **letterali TS nel corpo della classe**. Domani i
dialoghi (albero), gli oggetti, le definizioni dei nemici seguiranno la stessa strada. È il freno
principale alla crescita dei *contenuti*: ogni quest/dialogo richiede un programmatore, un rebuild,
e non è modificabile da un game/narrative designer.

Inoltre precondizioni e azioni sono tipizzate `any[]` (`{type: 'player-in-area', value: …}`): nessuna
sicurezza di tipo, nessun meccanismo che le **interpreti** (manca l'"effect interpreter").

**Direzione corretta:** esternalizzare i contenuti in **file dati (JSON/YAML)** caricati come
risorse; definire uno schema con **union discriminate** per precondizioni/effetti e un
**interprete** che le esegue (pattern Command/Effect). Il repository legge dati, non li contiene.

### D6 — Nessuna strategia di persistenza, benché richiesta dal design

Il `README` dice esplicitamente che stato quest e stato dialoghi "will need to be saved". Oggi i
repository sono array in memoria e non esiste serializzazione. La persistenza non è un dettaglio da
aggiungere alla fine: **condiziona come si modella lo stato** (cosa è salvabile, ID stabili,
separazione dati statici vs stato dinamico). Aggiungerla tardi impone un refactoring globale.

**Direzione corretta:** introdurre presto un `SaveService` (serializzazione a `localStorage`/file)
e progettare i model dinamici come **serializzabili** (niente riferimenti a `Actor` dentro lo stato
salvabile — oggi `Character.actor` mescola le due cose).

### D7 — Sistema di combattimento sottile e accoppiato

- Il danno passa da `(other.owner as any).model.takeHit(...)`: chi non ha `model` è ignorato in
  silenzio; nessun concetto di tipi di danno, resistenze, status effect, contraccolpo.
- `takeHit` è **triplicato** in `Character`, `Item`, `Player` con logiche leggermente diverse.
- Il danno spada `Math.random()*6 + Math.random()*6` produce una distribuzione triangolare
  in [0,12) con media ~6: quasi certamente **non** l'intento (un "2d6" sarebbe
  `2 + floor(rand*6) + floor(rand*6)`). Sintomo di regole di combattimento non formalizzate.

**Direzione corretta:** un `CombatComponent`/servizio unico che gestisce una `DamageInfo`
(quantità, tipo, sorgente, knockback) e un solo punto di calcolo del danno.

### D8 — Input non centralizzato

`PlayerActor.onPreUpdate` mescola input, fisica, animazione, macchina d'attacco e messaggi di
debug in un metodo di 100+ righe (il codice stesso ammette: *"temporary: to be centralized"*).
Nessun layer di mappatura input → niente rebinding, gamepad, o **input buffering** (essenziale in un
action-RPG per accodare un attacco durante un'animazione).

**Direzione corretta:** un `InputController`/mapping azione-astratta, e uno stato del player gestito
come componente FSM riusabile (come per gli NPC).

### D9 — Sicurezza di tipo erosa e qualità di progetto

- `as any` e `undefined as any` pervasivi: annullano il vantaggio di TypeScript, che è proprio
  ciò che serve a un codice in crescita.
- **Nessun test** (nessuno script di test, nessun framework): eppure il layer Model è
  perfettamente testabile e ospita la logica più delicata (matematica del combattimento,
  transizioni FSM, avanzamento quest).
- **`dist/` committato** in git (decine di file `*.hot-update.*`): artefatti di build nel
  repository; va in `.gitignore`.
- Incoerenze minori: naming factory (`crateActorFactory.ts` vs `animation.factory.ts`); `ActiveQuest`
  è a volte classe a volte literal; enum `States` per gli NPC ma stringhe per il player.

---

## 3. Note su bug/logica già presenti (non solo stile)

Utili perché rivelano fragilità strutturali, non solo sviste:

- **`QuestManagerService.testPreconditions`** ritorna `false` per qualunque quest con precondizioni
  (il ciclo non fa nulla e cade nel `return false`): di fatto **blocca** l'avanzamento di ogni quest
  non banale. Sintomo di §D5 (manca l'interprete).
- **`nextStage`** ritorna il primo stage con `id >= currentStage`: può restituire lo **stage
  corrente** invece del successivo, e assume gli stage ordinati. La progressione va modellata meglio.
- **`Character.actor` dentro il model**: mescola dato dinamico salvabile e riferimento runtime;
  ostacola la persistenza (§D6).
- **Detector come child Actor con collisione fisica** anziché sensore: rischio di collisioni
  fisiche indesiderate; meglio collider sensore + collision group.

---

## 4. Cosa mantenere e cosa cambiare

### ✅ Mantenere (buone fondamenta)

- La **separazione Actor/Model** come principio (evolvendola in Actor + componenti).
- Il **caricamento data-driven da Tiled** con factory: estenderlo, non sostituirlo.
- La **config centralizzata**: ampliarla assorbendo i magic number residui.
- Le **interfacce di capacità** `Hittable`/`Talkable`: promuoverle a componenti.
- Il **layering repository/service** per quest e dialoghi: corretto, va solo completato e reso
  data-driven.
- L'idea di **throttling dell'IA**.

### 🔄 Cambiare (prima che i contenuti crescano)

| Da | A | Priorità |
|---|---|---|
| Ereditarietà `NpcActor`/`Item` | **Composizione a componenti** (ECS di Excalibur) | Alta |
| Import globali `game`/`status`, dipendenze circolari | **DI / GameContext + EventBus** | Alta |
| Ricerca per nome-stringa + magic string | **Riferimenti stabili, enum, collision group, eventi** | Alta |
| FSM piatta con transizioni duplicate | **FSM data-driven** o **Behavior Tree/Utility AI** con predicati riusabili | Alta |
| Quest (e futuri dialoghi/oggetti) in codice TS | **Dati esterni JSON/YAML + interprete di effetti** con union discriminate | Alta |
| Nessuna persistenza | **SaveService + model serializzabili** (separare stato da riferimenti runtime) | Media/Alta |
| `takeHit` triplicato, danno ad-hoc | **CombatComponent unico**, `DamageInfo`, regole formalizzate | Media |
| Input inline nel player | **InputController + input buffering** | Media |
| `as any`, zero test, `dist/` in git | **Rigore di tipo, unit test sul layer Model, `.gitignore`** | Media (trasversale) |

---

## 5. Roadmap consigliata (ordine di intervento)

Prima di aggiungere contenuti, consolidare le fondamenta nell'ordine che massimizza il ritorno e
minimizza i refactoring futuri:

1. **Igiene e rete di sicurezza** (basso costo, abilita tutto il resto):
   togliere `dist/` da git; introdurre un runner di test; scrivere i primi unit test sul layer Model
   (danno, transizioni FSM, progressione quest) per congelare il comportamento prima di rifattorizzare.
2. **Disaccoppiamento**: EventBus + rimozione dei singleton globali e delle dipendenze circolari;
   enum/costanti al posto delle stringhe magiche; collision group.
3. **Composizione**: migrare NPC e oggetti da ereditarietà a componenti (Health, Combat, AI,
   Dialog, Loot). È l'intervento che sblocca la varietà di entità richiesta dalla crescita.
4. **Dati esterni + interprete**: spostare quest (e progettare dialoghi/oggetti) in file dati con
   schema tipizzato e un interprete di precondizioni/effetti. Completare qui la logica quest oggi
   `TODO`.
5. **Persistenza**: SaveService e separazione stato dinamico/serializzabile dai riferimenti runtime.
6. **IA evoluta**: Behavior Tree/Utility AI con priorità e modificatori (come da `README`).
7. **Input e combattimento**: InputController con buffering; CombatComponent con `DamageInfo`,
   tipi di danno e status effect.

In sintesi: **le idee sono giuste, i meccanismi vanno rifondati sulla composizione, sul
disaccoppiamento a eventi e sui dati esterni**. Farlo adesso, con ~40 file, costa poco; farlo dopo,
con centinaia di entità e contenuti, costerà molto.