# RPG engine

Motore per RPG, con il suo banco di prova e i suoi strumenti.

## Requisiti

I requisiti stanno in `docs/REQUIREMENTS.md`; una scheda per servizio in `docs/services/`.

## Linguaggio

### Architettura

**Servizio**:
Unità di funzionalità con una superficie pubblica unica (`index.ts`), uno stato proprio e nessuna
dipendenza dagli altri servizi. È l'unità di isolamento, di test e di riuso: un servizio senza
scheda non esiste.
_Evitare_: modulo, manager, sistema, componente

**Motore**:
L'insieme dei servizi generici, riusabili in un altro gioco 2D (`engine/`). Il motore non conosce il
gioco: non sa che esiste la spada di Aramis, sa gestire oggetti definiti altrove come dati.
_Evitare_: framework, core, libreria

**Gioco**:
Contenuti, bilanciamento e orchestrazione specifici di questo progetto (`game/`).

**Presentazione**:
Lo strato che possiede Excalibur — scene, `Actor`, disegno, audio, camera, input fisico. Osserva il
dominio e reagisce ai suoi eventi; il dominio non sa che esiste.
_Evitare_: vista, UI, front-end

**Orchestrazione**:
Lo strato che collega i servizi tra loro reagendo agli eventi di dominio e invocando le loro API.
Codifica le regole di *questo* gioco, che nessun servizio conosce.
_Evitare_: coordinatore, mediatore, collante, controller

**Natura**:
La dichiarazione, in ogni scheda, se un servizio è *generico* (nessuna conoscenza di questo gioco)
o *di dominio* (accetta il modello di dominio di questo progetto).

**Evento di dominio**:
Notifica immutabile e serializzabile di un fatto **già avvenuto** (`entity-died`, `item-picked`),
sempre al passato. Non è un comando, non ha valore di ritorno e non attende risposta.
_Evitare_: messaggio, segnale, notifica

**Comando**:
Chiamata diretta a un servizio che restituisce l'esito **e** gli eventi di dominio prodotti, senza
pubblicarli: pubblicare è responsabilità del chiamante.
_Evitare_: azione, richiesta, operazione

**Porta**:
Interfaccia minima dichiarata da un consumatore per esprimere ciò di cui ha bisogno (navigabilità,
percezione, storage, caricamento). È il solo modo in cui un servizio raggiunge ciò che non possiede.
_Evitare_: adattatore, driver, interfaccia

**Scheda**:
Il documento di un servizio in `docs/services/`: contratto, API pubblica, requisiti numerati con
prefisso proprio, criteri di test. Dice *cosa*; l'ADR dice *perché non nell'altro modo*.
_Evitare_: documentazione, specifica

**Contenuto**:
I dati che descrivono **cose che esistono** — questa quest, questa spada, questo archetipo — in file
validati allo schema, modificabili da un designer senza ricompilare.
_Evitare_: asset (quelli sono i file binari), risorse

**Configurazione**:
I parametri che descrivono **come si comporta il sistema** — quanto pesa un punto di Forza, ogni
quanti ms rivaluta l'IA. Distinta dal contenuto e dalle impostazioni utente, che sono l'unica sua
parte dinamica e persistono fuori dal salvataggio.
_Evitare_: settings, costanti, parametri magici

**Stato statico**:
Definizioni caricate dai file di contenuto, immutabili a runtime e mai serializzate: nel salvataggio
sono referenziate per ID stabile.

**Stato dinamico**:
Lo stato che cambia durante la partita; è l'unico che viene serializzato, da ciascun servizio per la
sua sola porzione e con un numero di versione proprio.

**Headless**:
Eseguibile e testabile senza motore grafico, canvas, asset o altri servizi. La stessa partita deve
poter girare senza alcun renderer: è la condizione che rende possibili i test di sistema.

**Prova di riusabilità**:
Il test che esercita un servizio generico con un dominio **inventato**, estraneo a questo gioco. È
la verifica eseguibile della sua natura: senza, "generico" è solo un'affermazione.

### Mondo e mappa

**Griglia dati** (*data grid*):
La griglia logica a interi in cui ogni cella contiene un solo identificativo di terreno. È la
sorgente unica per gameplay, collisione e rendering: nessuno ne tiene una copia propria.
_Evitare_: tilemap, mappa, livello di collisione

**Griglia di disegno** (*display grid*):
La griglia di rendering sfasata di mezzo tile rispetto alla griglia dati; ogni suo riquadro ha per
angoli 4 celle dati. Esiste solo nella presentazione.

**Dual Grid System (DGS)**:
L'autotiling in cui ogni tile di disegno è scelto in base ai suoi 4 angoli, per un totale di 16 casi
(2⁴) — il metodo per angoli, noto anche come *marching squares*. Le transizioni fra terreni si
ottengono per sovrapposizione di passate, mai con set di tile dedicati a ogni coppia di terreni.
_Evitare_: autotile a 47 tile

**Terreno**:
L'identificativo contenuto in una cella dati. Il suo valore è anche la sua **priorità**: il terreno
di priorità maggiore è disegnato sopra quello minore.

**Cella**:
La posizione in coordinate intere sulla griglia dati. Le coordinate di **mondo** (pixel) sono un
tipo distinto: confonderle è l'errore più comune di questo dominio.
_Evitare_: tile (è il quadro disegnato), punto, posizione

**Area**:
Porzione nominata di mappa con confini, proprietà e tipo — disegnata a mano o generata. È l'unità a
cui si agganciano respawn, musica, spawn e giurisdizione del crimine. Il campo `Area:` in testa a
una scheda è un'altra cosa: è l'area di responsabilità del servizio.
_Evitare_: zona, regione, livello, mappa

**z-band**:
Intervallo di valori `z` riservato a una categoria di elementi, che non si sovrappone alle altre
bande e non interseca mai l'intervallo usato dall'ordinamento per Y.

**Base**:
Il punto di uno sprite usato come riferimento per l'ordinamento — i "piedi" dell'oggetto. Gli
elementi ordinabili hanno `z` pari alla Y della propria base.
_Evitare_: ancora, pivot, origine

**Overhead**:
Il livello disegnato sopra tutte le entità indipendentemente dalla posizione (chiome, archi, tetti).
Un oggetto alto si spezza: il tronco è ordinabile per Y, la chioma è overhead.

**Impronta**:
L'area bloccante di un oggetto, in generale più piccola del suo sprite e indipendente dall'ordine di
disegno. Si passa visivamente sotto la chioma, si resta bloccati dall'impronta del tronco.
_Evitare_: hitbox, collider, bounding box

**Ricetta**:
L'insieme di parametri dichiarati nei dati da cui il generatore produce una mappa, dato un seed. Due
famiglie: generazione libera da rumore, o composizione di settori presi da un pool.
_Evitare_: preset, template di generazione

**Punto d'interesse**:
Posizione tipizzata prodotta dal generatore (ingresso, uscita, stanza del tesoro, sorgente d'acqua).
Il generatore la colloca; a popolarla di nemici, oggetti e quest è l'orchestrazione.

### Entità

**Entità**:
Ciò che esiste nel mondo di gioco, identificato da un `EntityId` opaco, stabile e mai riusato. Non è
un `Actor` e non ha una classe: è un'identità più i componenti che possiede.
_Evitare_: attore, oggetto di gioco, istanza

**Componente**:
Un dato di dominio che un'entità possiede (`Health`, `Combat`, `Inventory`, `Faction`). Le entità si
compongono di componenti; non esistono gerarchie di classi.

**Capacità**:
La partecipazione di un'entità a una certa interazione, dichiarata dal **possesso** di un componente
marcatore (`Targetable`, `Lockable`, `Sittable`). Un barile esplosivo è bersagliabile perché ha il
componente, non perché appartiene a una classe. Si interroga per maschera di bit.
_Evitare_: tipo, classe, ruolo, flag

**Archetipo**:
Definizione di entità come insieme di componenti con valori iniziali, componibile e sovrascrivibile
(`guardia` = `umanoide` + `combattente` + `fazione: guardie`). È un dato, non una sottoclasse.
_Evitare_: prefab, template, blueprint

**Actor**:
La rappresentazione Excalibur di un'entità. Vive solo in presentazione, creata e distrutta reagendo
agli eventi di spawn, e legata al dominio dalla sola mappa `EntityId → Actor`.

### Agenti

**Agente**:
Un'entità di cui il gioco decide il comportamento — tipicamente un PNG. Non è una capacità del
registro: è il ruolo che assume quando un ragionatore decide per lei.

**Blackboard**:
La memoria su cui gli agenti ragionano, con tre **ambiti**: entità (privato), gruppo (squadra,
fazione, branco) e globale. È memoria, non verità: contiene ciò che l'agente *crede*, che può essere
vecchio o sbagliato — ed è questo a rendere i PNG credibili.
_Evitare_: lavagna, memoria condivisa, contesto

**Credenza**:
Una voce di blackboard: un valore con marca temporale e **confidenza**, che decade secondo una
politica dichiarata. Distingue «il giocatore è qui» da «il giocatore era qui trenta secondi fa».
_Evitare_: fatto, conoscenza, percezione

**Consideration**:
La curva di risposta che trasforma un input normalizzato `0..1` in un contributo di utilità `0..1`.
È la superficie di tuning dell'IA, e vive nei dati. Una consideration a 0 pone il **veto**
sull'azione.
_Evitare_: criterio, fattore, peso

**Ragionatore**:
Il decisore puro: dato un contesto in sola lettura e una personalità, restituisce un'intenzione.
Non muove nessuno e non conosce il mondo. Ce ne possono essere più d'uno per agente.
_Evitare_: IA, cervello, controller, behaviour

**Intenzione**:
L'azione scelta da un ragionatore, con bersaglio, punteggio e scadenza. Eseguirla spetta
all'orchestrazione, che conosce i servizi coinvolti.
_Evitare_: comando, ordine, task

**Personalità**:
L'insieme di curve, soglie e pesi che, a parità di azioni disponibili, produce comportamenti diversi
— un codardo, un fanatico, un mercenario. È un **dato** applicato al ragionatore, mai un ragionatore
diverso.
_Evitare_: indole, tipo di PNG, archetipo comportamentale

**Affordance**:
La dichiarazione con cui un elemento del mondo pubblicizza cosa offre, quali **bisogni** soddisfa e
in che misura, a quali requisiti e a quale costo. Il fornitore non conosce il richiedente: il
collegamento avviene per tipo, mai per identità.
_Evitare_: interazione, uso, opportunità

**Bisogno**:
Grandezza normalizzata `0..1` di un agente (sete, fame, stanchezza) che le affordance riducono in
una scala comparabile con gli input dell'IA.

**Percezione**:
La condizione perché un'offerta o un crimine esistano per qualcuno: distanza, angolo di vista,
ostruzione, illuminazione, rumore, o memoria di averlo visto. Nessun PNG conosce magicamente ogni
fonte d'acqua della mappa.

**Profilo di agente**:
Il dato con cui un agente legge la griglia nel pathfinding: uno acquatico, uno volante e uno
terrestre vedono costi diversi sulle stesse celle.

### Regole di gioco

**Caratteristica**:
Il valore di base di un personaggio, che cresce per **formazione presso maestri**. Non esistono
livelli di personaggio né punti esperienza da spendere: è la scelta di progettazione da cui discende
tutto il modello di progressione.
_Evitare_: statistica, attributo, livello

**Abilità**:
Competenza distinta dalle caratteristiche (scasso, alchimia, persuasione, mercanteggiare), che
migliora **con l'uso** a rendimenti decrescenti e/o con la formazione.
_Evitare_: skill, talento, professione

**Perk**:
Vantaggio che si sblocca al superamento di soglie su una o più caratteristiche, o al trascorrere del
tempo. Mai per spesa di punti.

**Derivato**:
Valore calcolato da una formula dichiarata nei dati (vita massima, energia, portata, difese), mai
memorizzato come valore indipendente. Il **valore corrente** — la vita attuale — è invece stato.

**Modificatore**:
Contributo a una caratteristica tracciato **per origine** e rimovibile individualmente:
equipaggiamento, buff, debuff, sovraccarico, ferite. Togliere l'armatura toglie esattamente il suo
contributo.

**Status effect**:
Effetto a tempo su un'entità — veleno, sanguinamento, stordimento, rallentamento — con durata,
periodicità, intensità e regole di **cumulo** dichiarate. Scade tramite il servizio Time, mai con
contatori privati.
_Evitare_: stato, alterazione, condizione

**Contenitore**:
Il modello unico di zaino, forziere, cadavere, banco del mercante e mucchio a terra: differiscono
per capacità e regole, non per tipo. Uno scambio e un saccheggio sono lo stesso trasferimento con
regole diverse.
_Evitare_: inventario (è il servizio), borsa, cassa

**Definizione / Istanza**:
La definizione è l'oggetto a catalogo, statica e condivisa (`ItemId`); l'istanza è l'esemplare
posseduto (`InstanceId` stabile, quantità, usura, cariche). Gli oggetti unici sono garantiti tali
dall'impossibilità di duplicare un `InstanceId`.

**Quest item**:
Oggetto marcato da un flag: peso 0, non droppabile, non vendibile, non distruggibile finché il flag
è attivo. Il servizio inventario applica il flag, non decide quando attivarlo.

**Quest NPC**:
PNG marcato come non uccidibile: il danno si applica fino a una soglia minima e l'esito lo dichiara
esplicitamente. La regola vive nel combattimento, non in ogni punto che infligge danno.

**Loot table**:
Tabella di voci pesate, annidabile, con voci **garantite** e un numero variabile di estrazioni, da
cui si decide cosa cade. È un dato validato, mai codice.
_Evitare_: drop table, tabella dei drop, tabella del bottino

**Fase**:
Il passo di una quest, con obiettivi multipli e regola di completamento (tutti, uno qualsiasi, N su
M). La fase successiva può dipendere da una condizione: è un **ramo**, non solo la seguente in
elenco.
_Evitare_: step, stadio, tappa

**Fatto del mondo**:
Ciò che l'orchestrazione consegna al servizio quest, tradotto dagli eventi di dominio. I servizi di
regole non sottoscrivono il bus: ricevono fatti, e restano interrogabili con fatti sintetici.
_Evitare_: evento, trigger

**Argomento**:
Porzione di dialogo riusabile, condivisa tra più interlocutori (chiedere indicazioni, chiedere di
una voce di corridoio), senza duplicare i grafi.
_Evitare_: topic, tema

**Interlocutore**:
Il PNG con cui si sta parlando. I nodi visitati e le scelte compiute si memorizzano **per
interlocutore**: è ciò che fa variare le opzioni in base ai dialoghi precedenti.
_Evitare_: speaker, NPC del dialogo

**Fazione**:
Qualunque gruppo con un'identità collettiva: i cittadini di una città, una corporazione, una gilda
di ladri, un ordine religioso, un branco di lupi. Il servizio non li distingue per tipo, e la stessa
fazione può servire da gruppo per la blackboard.

**Rango**:
Il livello di appartenenza a una fazione, con soglia e benefici dichiarati, che sblocca vantaggi e
opzioni di dialogo.
_Evitare_: grado, livello di fazione

**Reputazione**:
Il valore continuo del giocatore verso una fazione, cui si somma un **modificatore individuale**
verso il singolo PNG: si può essere amici di qualcuno pur essendo nemici della sua fazione.

**Atteggiamento**:
La traduzione discreta della reputazione (ostile, diffidente, neutrale, amichevole, devoto),
ottenuta per soglie con **isteresi** — senza, un PNG oscillerebbe attorno alla soglia.
_Evitare_: standing, disposizione, relazione

**Testimone**:
Chi percepisce un crimine. Un crimine esiste solo se qualcuno lo vede, e produce una taglia solo se
il testimone riesce a **segnalarlo**: la segnalazione richiede tempo, un tragitto, e può essere
impedita.

**Taglia**:
La conseguenza di un crimine noto, **per fazione e per giurisdizione**: essere ricercati in una
città non implica esserlo ovunque. Decade per prescrizione, e si estingue con pagamento, pena,
intercessione o corruzione.
_Evitare_: notorietà, wanted level

**Crimine noto / sospetto**:
Noto è il crimine per cui esiste una taglia; sospetto è quello che un testimone ha visto ma non ha
ancora segnalato. Sono due stati con conseguenze diverse.

**Liquidità**:
Il denaro finito di un mercante: non può acquistare oltre ciò che possiede, e l'esito deve dirlo
esplicitamente.

**Assortimento**:
La merce finita di un mercante, che si rigenera dopo un timeout. Il **rifornimento** è calcolato in
modo pigro, alla prima interazione, in funzione del tempo trascorso.

### Tempo

**Tempo di gioco**:
L'unica sorgente di tempo del dominio: scalabile, pausabile a `scale = 0`, distinto dal tempo reale
e dal **tempo di interfaccia**, che continua a scorrere a gioco in pausa. Il dominio riceve il
tempo, non lo legge.
_Evitare_: delta, tempo reale, tick

**Orario del mondo**:
La conversione del tempo di gioco in giorno, ora, minuto e **fase**, secondo una durata del giorno
configurabile. È ciò che governa illuminazione, spawn e routine dei PNG.

**Timer**:
Una scadenza registrata nello scheduler con un `payload` **opaco e serializzabile**: il servizio non
sa cosa significhi, e i timer pendenti riprendono dal residuo esatto dopo un caricamento.
_Evitare_: cooldown, setTimeout, callback differita

### Interfaccia e input

**Azione astratta**:
L'unità di input che il dominio conosce (`attack`, `interact`, `move`). Nessun tasto fisico compare
nella logica di gioco: il dominio non sa che esiste una barra spaziatrice.
_Evitare_: tasto, comando, binding, input

**Contesto di input**:
Lo stack che sospende e ripristina insiemi di azioni (esplorazione, dialogo, menu, inventario):
aprire un dialogo sospende il movimento senza che il dialogo debba disattivare nulla.

**Interazione contestuale**:
Le azioni offerte sul bersaglio selezionato — attacca, parla, usa, deruba, scassina — costruite
dalle affordance e dalle capacità dell'entità, mai da un elenco cablato.

**Chiave di testo**:
Il riferimento con cui il dominio nomina un testo senza contenerlo. Il dominio produce chiavi e
parametri; a risolverli nella lingua attiva è la presentazione.
_Evitare_: stringa, etichetta, label

### Casualità

**Seed radice**:
L'unico numero da cui deriva ogni valore casuale di una partita. Due partite con lo stesso seed
radice e la stessa sequenza di input sono indistinguibili.

**Stream**:
Una sequenza di numeri casuali indipendente, dedicata a un dominio d'uso (combattimento, loot,
generazione, IA). Consumare da uno stream non altera gli altri.
_Evitare_: generatore, RNG, sorgente

**Canale**:
La chiave testuale con cui il chiamante identifica una sequenza filtrata (`'hits:enemyA'`,
`'lockpick'`). Il namespace è **globale al servizio Random**: lo stesso canale usato da due stream
diversi condivide una sola memoria. La granularità è scelta di chi chiama, mai dedotta dal servizio.
Il canale audio (musica, effetti) è un'altra cosa, e va sempre qualificato.
_Evitare_: categoria, tag, bucket

**Memoria di canale**:
Il peso corrente di ogni esito di un canale: ciò che è appena uscito ha il peso ridotto, e lo
recupera nel corso delle estrazioni successive. Appartiene al servizio Random, che è l'unico a
possederla e a serializzarla.
_Evitare_: coda anti-ripetizione, storico, buffer, cache

**Profilo di filtro**:
L'insieme dei parametri che governano una memoria di canale — quanto si riduce il peso di un esito
appena uscito, e in quante estrazioni lo recupera. Vive nei dati; un canale ci arriva per prefisso
del proprio nome.

**Casualità filtrata**:
Estrazione che consulta la memoria del proprio canale per rendere improbabili le sequenze che il
giocatore leggerebbe come non casuali. Si oppone alla casualità uniforme, che è matematicamente
corretta ma percepita come difettosa. Sposta la distribuzione rispetto ai pesi nominali: è il suo
scopo, non un difetto.
_Evitare_: casualità pesata, casualità corretta

**Pietà**:
Regola di gioco che garantisce un esito dopo un numero di tentativi andati a vuoto. È una regola
di dominio del loot, non una tecnica di casualità: non vive nel servizio Random.
_Evitare_: pity timer, compensazione, bad luck protection

**Riproducibilità bit-per-bit**:
La promessa che la stessa partita e la stessa mappa da seed restino identiche **anche dopo un
aggiornamento del browser**. Vale solo se restano congelati il PRNG, la funzione di hash che deriva
i seed degli stream, e il divieto di funzioni trascendenti sul percorso deterministico.

**Vettore d'oro**:
Una lista di valori attesi salvata nel repo e verificata su più motori JavaScript. Non dimostra che
un risultato sia giusto: cattura ogni cambiamento involontario di ciò che è stato congelato.
_Evitare_: snapshot, baseline, fixture
