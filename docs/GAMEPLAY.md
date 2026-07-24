# Requisiti di gioco

**Documento fratello di** [`REQUIREMENTS.md`](./REQUIREMENTS.md)
**Stato:** proposto

Questo documento descrive **cosa deve fare il gioco dal punto di vista del giocatore**. Non descrive
come è costruito: ogni requisito rimanda ai servizi che lo realizzano, le cui schede stanno in
[`services/`](./services/).

Linguaggio dei requisiti: **DEVE** = obbligatorio, **DOVREBBE** = raccomandato, **PUÒ** = opzionale.
Gli ID `GP-n` sono stabili e non vengono riusati; un requisito nuovo prende il numero libero
successivo, indipendentemente dalla sezione.

**Marcatura:** *(fondamentale)* = necessario perché il gioco sia giocabile end-to-end ·
*(profondità)* = aggiunge spessore da action-RPG · *(qualità)* = rifinitura.

---

## 1. Personaggio giocante

**GP-1** *(fondamentale)* — Il personaggio **NON DEVE** avere una struttura a livelli: la
progressione **DEVE** avvenire su **caratteristiche singole** indipendenti. → `STAT`

**GP-2** *(fondamentale)* — Le caratteristiche **DEVONO** migliorare tramite **formazione presso
maestri**, non tramite punti esperienza distribuiti a piacere. → `STAT` `DLG`

**GP-3** *(profondità)* — Il gioco **DEVE** prevedere **perk**, sbloccati dal tempo trascorso o dal
raggiungimento di soglie su una o più caratteristiche. → `STAT`

**GP-4** *(profondità)* — Devono esistere **abilità** distinte dalle caratteristiche di base (es.
scasso, alchimia, persuasione, mercanteggiare), che migliorano **con l'uso** e/o con la formazione.
→ `STAT`

**GP-5** *(profondità)* — Oggetti equipaggiabili e opzioni di dialogo **POSSONO** avere requisiti
minimi su caratteristiche o abilità. → `STAT` `INV` `DLG`

**GP-6** *(fondamentale)* — Punti vita, energia ed eventuale mana **DEVONO** essere **derivati**
dalle caratteristiche secondo formule dichiarate, non valori indipendenti. → `STAT`

---

## 2. Mappa e mondo

**GP-7** *(fondamentale)* — Il gioco **DEVE** contenere aree con **mappa disegnata a mano** con
Tiled. → `MAP`

**GP-8** *(profondità)* — Il gioco **DEVE** contenere aree con **mappa generata casualmente**.
→ `GEN`

**GP-9** *(profondità)* — Il gioco **DEVE** contenere aree generate casualmente per **composizione
di stanze/settori** presi da un pool e connessi tra loro. → `GEN`

**GP-10** *(profondità)* — Oggetti e nemici **DEVONO** respawnare dopo un tempo dipendente dal tipo
di area: **breve** nelle aree casuali, **infinito** (nessun respawn) nelle aree fisse. → `TIME`
`ENT` orchestrazione

**GP-11** *(profondità)* — Il mondo **DEVE** contenere oggetti interattivi: porte, leve, forzieri
chiusi (apribili con scasso o chiave), trappole. → `ENT` `INV` `STAT`

**GP-12** *(profondità)* — Il gioco **DEVE** avere un **ciclo giorno/notte**, con un orario di gioco
che influenza PNG, illuminazione e spawn. → `TIME`

**GP-13** *(profondità)* — I PNG **DOVREBBERO** avere **routine giornaliere** (casa, lavoro,
taverna) legate all'orario. → `TIME` `AI` `PATH`

> La struttura interna della mappa (livelli, Dual Grid System, ordinamento per Y, overhead,
> collisione) è specificata in [`MAP-REQUIREMENTS.md`](./MAP-REQUIREMENTS.md).

---

## 3. Combattimento

**GP-14** *(fondamentale)* — Il combattimento **DEVE** avere **tipi di danno** (taglio,
perforazione, contundente, fuoco, veleno…) con resistenze e vulnerabilità per entità. → `CBT`

**GP-15** *(profondità)* — **DEVONO** esistere status effect a tempo: avvelenamento, sanguinamento,
stordimento, rallentamento, buff e debuff. → `CBT` `TIME`

**GP-16** *(profondità)* — I colpi **DEVONO** produrre knockback e reazione al colpo (hitstun),
parametrizzati dall'arma. → `CBT`

**GP-17** *(profondità)* — Il giocatore **DOVREBBE** disporre di blocco/parata e/o schivata con
finestra di invulnerabilità temporale. → `CBT` `INP`

**GP-18** *(profondità)* — Il giocatore **DEVE** poter usare attacchi a distanza e magia, non solo i
nemici. → `CBT`

**GP-19** *(fondamentale)* — La formula del danno **DEVE** essere unica, formalizzata e
deterministica dato un seed. → `CBT` `RND`

---

## 4. Inventario, oggetti, bottino

**GP-20** *(fondamentale)* — Gli oggetti **POSSONO** avere lo stato di **quest item**: peso 0 e non
droppabili né vendibili finché la quest di riferimento non è chiusa. → `INV` `QST`

**GP-21** *(profondità)* — **DEVE** esistere un peso trasportabile massimo, con effetti di
sovraccarico. → `INV` `STAT`

**GP-22** *(fondamentale)* — **DEVONO** esistere slot di equipaggiamento (arma, armatura, accessori)
i cui contenuti modificano le caratteristiche. → `INV` `STAT`

**GP-23** *(profondità)* — **DEVONO** esistere consumabili (pozioni, cibo) con effetti immediati o a
tempo. → `INV` `CBT`

**GP-24** *(qualità)* — Gli oggetti identici **DEVONO** impilarsi; **POSSONO** esistere oggetti
unici o leggendari non impilabili. → `INV`

**GP-25** *(profondità)* — Nemici, casse e forzieri **DEVONO** rilasciare bottino secondo **loot
table pesate**. → `LOOT` `RND`

**GP-26** *(profondità)* — Il gioco **PUÒ** prevedere crafting e riparazione. → `INV`

---

## 5. PNG e intelligenza artificiale

**GP-27** *(fondamentale)* — Alcuni PNG **POSSONO** avere lo stato di **quest NPC**, che ne impedisce
l'uccisione. → `ENT` `QST` `CBT`

**GP-28** *(profondità)* — I mercanti **DEVONO** avere denaro e assortimento **finiti**, che si
rigenerano dopo un timeout. → `ECO` `INV` `TIME`

**GP-29** *(fondamentale)* — I PNG **DEVONO** reagire alle condizioni del mondo e al comportamento
del giocatore: se ferito, un PNG può fuggire o contrattaccare a seconda di indole, salute e
alleati presenti. → `AI` `BB`

**GP-30** *(profondità)* — I PNG **DOVREBBERO** avere **personalità diverse** a parità di logica
decisionale (un codardo, un fanatico, un mercenario), ottenute variando curve e soglie, non
scrivendo IA diverse. → `AI`

**GP-31** *(profondità)* — Le decisioni dei PNG **DOVREBBERO** tenere conto della **conoscenza
condivisa di gruppo**: se i compagni di squadra sono morti, il coraggio cala e la fuga diventa
probabile. → `BB` `AI`

**GP-32** *(profondità)* — Gli elementi dello scenario **DOVREBBERO** poter **pubblicizzare il
proprio uso** perché i PNG li considerino nelle scelte: una fonte d'acqua dolce riduce la sete, un
coniglio è cibo per un carnivoro abbastanza forte, una sedia consente di sedersi. → `AFF` `AI`

---

## 6. Quest

**GP-33** *(fondamentale)* — Il gioco **DEVE** offrire quest predeterminate, con obiettivi,
condizioni di avanzamento e ricompense definite come dati. → `QST`

**GP-34** *(fondamentale)* — Lo stato di ogni quest **DEVE** essere osservabile da dialoghi, PNG e
mondo (una quest attiva può cambiare ciò che si può dire o fare). → `QST` `DLG`

**GP-35** *(profondità)* — Il **fallimento** di una quest **DEVE** essere un esito previsto, con
rami alternativi o chiusura definitiva. → `QST`

---

## 7. Dialoghi

**GP-36** *(fondamentale)* — Le opzioni di dialogo **DEVONO** variare in base ai **dialoghi
precedenti** già intercorsi con quel PNG. → `DLG`

**GP-37** *(fondamentale)* — Le opzioni di dialogo **DEVONO** variare in base allo **stato delle
quest**. → `DLG` `QST`

**GP-38** *(fondamentale)* — Le opzioni di dialogo **DEVONO** variare in base alla **reputazione**
tra giocatore e interlocutore (personale e di fazione). → `DLG` `FAC`

**GP-39** *(profondità)* — Le opzioni di dialogo **POSSONO** essere condizionate da caratteristiche,
abilità e oggetti posseduti. → `DLG` `STAT` `INV`

---

## 8. Fazioni e reputazione

**GP-40** *(profondità)* — **DEVONO** esistere fazioni di natura diversa: cittadini di una località,
corporazioni, gruppi criminali, ordini religiosi. → `FAC`

**GP-41** *(profondità)* — Ogni fazione **DEVE** avere **N livelli** di appartenenza, che
sbloccano vantaggi e opzioni di dialogo. → `FAC` `DLG`

**GP-42** *(profondità)* — **DEVE** esistere una reputazione del giocatore verso ciascuna fazione.
→ `FAC`

**GP-43** *(profondità)* — **DEVE** esistere un modificatore di reputazione **individuale** tra
giocatore e singolo PNG, che si somma a quello di fazione. → `FAC`

**GP-44** *(profondità)* — Le relazioni **tra fazioni** (alleanza, ostilità) **DOVREBBERO**
propagare parzialmente le variazioni di reputazione. → `FAC`

---

## 9. Economia

**GP-45** *(profondità)* — I prezzi di acquisto e vendita **DEVONO** essere modulati da reputazione,
fazione e abilità di mercanteggiare. → `ECO` `FAC` `STAT`

**GP-46** *(profondità)* — Il denaro **DEVE** essere una risorsa finita anche per i mercanti: non
possono acquistare oltre la propria liquidità. → `ECO`

---

## 10. Crimine e notorietà

**GP-47** *(profondità)* — Le azioni illegali (furto, aggressione, omicidio) **DEVONO** avere
effetto solo se **osservate** da un PNG in grado di percepirle. → `CRM` `AFF` `SPX`

**GP-48** *(profondità)* — **DEVE** esistere una taglia/notorietà per fazione, con conseguenze:
guardie ostili, prezzi peggiori, dialoghi preclusi. → `CRM` `FAC` `ECO`

---

## 11. Interfaccia e feedback

**GP-49** *(fondamentale)* — **DEVE** esistere un HUD con barre di vita ed energia, stati attivi,
arma o abilità selezionata. → `HUD`

**GP-50** *(fondamentale)* — **DEVE** esistere un **diario delle quest** con obiettivi e stato.
→ `HUD` `QST`

**GP-51** *(fondamentale)* — **DEVE** esistere una schermata di inventario ed equipaggiamento.
→ `HUD` `INV`

**GP-52** *(qualità)* — **DOVREBBE** esistere una minimappa e/o una mappa del mondo. → `HUD` `MAP`

**GP-53** *(fondamentale)* — **DEVE** esistere un menu di pausa con opzioni, salvataggio e
caricamento. → `HUD` `SAVE`

**GP-54** *(fondamentale)* — L'interazione **DEVE** essere contestuale rispetto al bersaglio
selezionato: attacca, parla, usa, deruba. → `INP` `HUD` `AFF`

---

## 12. Audio

**GP-55** *(fondamentale per l'esperienza)* — **DEVE** esistere musica di sottofondo per area e
situazione (esplorazione, combattimento), con transizioni non brusche. → `AUD`

**GP-56** *(fondamentale per l'esperienza)* — **DEVONO** esistere effetti sonori per azioni, colpi,
interfaccia e ambiente. → `AUD`

**GP-57** *(qualità)* — Il volume **DEVE** essere regolabile separatamente per master, musica ed
effetti. → `AUD` `CFG`

---

## 13. Morte, salvataggio, continuità

**GP-58** *(fondamentale)* — La morte del giocatore **DEVE** avere una gestione esplicita: game
over, respawn o caricamento dell'ultimo salvataggio, secondo regola dichiarata. → `SAVE` `STAT`

**GP-59** *(fondamentale)* — Il gioco **DEVE** poter essere salvato e ricaricato ripristinando
stato del giocatore, quest, dialoghi, inventario e mondo. → `SAVE`

**GP-60** *(fondamentale)* — **DEVONO** esistere slot di salvataggio multipli e un autosave.
→ `SAVE`

**GP-61** *(qualità)* — Un salvataggio creato da una versione precedente del gioco **DEVE** essere
caricabile o rifiutato con un messaggio chiaro, mai caricato in modo corrotto. → `SAVE`

---

## 14. Controlli e accessibilità

**GP-62** *(fondamentale)* — I comandi **DEVONO** passare da un livello di **azioni astratte**: nessun
tasto fisico cablato nella logica di gioco. → `INP`

**GP-63** *(qualità)* — I comandi **DEVONO** essere rimappabili, con supporto gamepad. → `INP`

**GP-64** *(fondamentale)* — **DEVE** esistere input buffering: un attacco impartito durante
un'animazione viene accodato ed eseguito appena possibile. → `INP`

**GP-65** *(qualità)* — Tutti i testi **DEVONO** essere esternalizzati e localizzabili. → `I18N`

**GP-66** *(qualità)* — **DOVREBBERO** esistere opzioni di accessibilità: dimensione del testo,
riduzione di scuotimento schermo ed effetti. → `HUD` `CFG`
