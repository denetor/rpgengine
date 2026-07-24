# AUD — Audio

**Area:** Presentazione · **Natura:** generico · **Priorità:** 4 · **Stato:** proposto
**Prefisso requisiti:** `AUD-*`

## Scopo

Riprodurre musica ed effetti sonori reagendo agli eventi di dominio, con transizioni musicali
coerenti alla situazione e mixaggio per canali.

Il dominio non riproduce suoni: emette eventi. Che un colpo faccia rumore è una decisione di
presentazione.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | `AST`, `CFG`; osserva il bus |
| NON dipende da | i servizi di dominio |
| Consumato da | il ciclo di gioco |
| Stato dinamico | tracce in riproduzione, stato di transizione, volumi, suoni attivi |
| Stato statico | mappatura evento → suono, playlist per area e situazione |
| Dati esterni | `content/audio/soundmap.json`, `music.json` |
| Eventi emessi | nessuno |

## Requisiti

**AUD-1** — La musica **DEVE** cambiare per **area e situazione** (esplorazione, combattimento,
dialogo, pericolo), con transizioni in dissolvenza, mai tagli netti (GP-55).

**AUD-2** — Il passaggio a musica di combattimento **DEVE** avere isteresi: brevi scontri ravvicinati
**NON DEVONO** far oscillare la traccia. L'uscita dal combattimento **DEVE** avere un ritardo
configurabile.

**AUD-3** — Gli effetti sonori **DEVONO** essere attivati da **eventi di dominio** tramite una
mappatura dichiarata nei dati, non da chiamate sparse nella logica di gioco (ARC-1.1).

**AUD-4** — La mappatura evento → suono **DEVE** poter dipendere dal contesto: il passo suona diverso
sull'erba, sulla pietra e nell'acqua, in base alle proprietà del terreno (MAP-11).

**AUD-5** — I volumi **DEVONO** essere regolabili separatamente per master, musica ed effetti, e
persistiti nelle impostazioni utente (GP-57, CFG-5).

**AUD-6** — I suoni **DOVREBBERO** essere **posizionali**: volume e panoramica in funzione della
distanza dall'ascoltatore.

**AUD-7** — **DEVE** esistere un limite al numero di istanze simultanee dello stesso suono, con
politica di sostituzione: dieci nemici colpiti nello stesso frame **NON DEVONO** produrre dieci
riproduzioni sovrapposte.

**AUD-8** — Le variazioni casuali (intonazione, campione tra più alternative) **DEVONO** usare uno
stream `RND` dedicato, distinto da quello del gameplay, così che il suono **NON** alteri la
riproducibilità della simulazione (RND-2).

**AUD-9** — Un suono mancante **NON DEVE** far crollare il gioco: silenzio e segnalazione (AST-8).

**AUD-10** — L'audio **DEVE** poter essere assente: una partita headless gira senza audio (ARC-1.4).

**AUD-11** — La riproduzione **DEVE** rispettare la pausa: i suoni di gioco si fermano o si
attenuano, quelli di interfaccia no (TIME-11).

**AUD-12** — Il servizio **DEVE** funzionare con una mappatura di eventi inventata (ARC-3.4).

## Criteri di test

- Una raffica di eventi identici produce al più il numero di istanze consentito.
- L'isteresi impedisce il cambio di traccia su scontri brevi e ravvicinati.
- Il consumo di casualità audio non altera la sequenza dello stream di combattimento.
- Un suono mancante produce una segnalazione e silenzio, non un errore.
- La simulazione headless gira identica senza servizio audio.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-55, GP-56, GP-57
- [`assets.md`](./assets.md) · [`config.md`](./config.md) · [`random.md`](./random.md)
