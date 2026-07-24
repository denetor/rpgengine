# HUD — Interfaccia e schermate

**Area:** Presentazione · **Natura:** di dominio · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `HUD-*`

## Scopo

Mostrare al giocatore lo stato del gioco e permettergli di agire su di esso: barre di vita ed
energia, diario delle quest, inventario, mappa, menu di pausa, schermate di dialogo e commercio,
interazione contestuale.

L'HUD **legge** il dominio e **invia azioni**; non contiene regole. Se una schermata deve decidere se
un oggetto è equipaggiabile, la risposta viene da `STAT`, non da una condizione scritta nel pannello.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | `excalibur` (o un livello DOM), `I18N`, `INP`; osserva il bus |
| NON dipende da | i servizi di dominio in **scrittura**: invia intenzioni |
| Consumato da | il giocatore |
| Stato dinamico | schermata attiva, selezione, scorrimento, notifiche in coda |
| Stato statico | layout, temi, definizioni delle schermate |
| Dati esterni | `content/ui/*.json` + cataloghi `I18N` |
| Eventi emessi | intenzioni dell'interfaccia (`ui-equip-requested`, `ui-trade-requested`, …) |

## Requisiti

**HUD-1** — L'HUD **DEVE** mostrare barre di vita ed energia, stati attivi e arma o abilità
selezionata (GP-49).

**HUD-2** — **DEVE** esistere un **diario delle quest** costruito dai dati di `QST` (QST-11), con
obiettivi, stato e distinzione tra attive, completate e fallite (GP-50).

**HUD-3** — **DEVE** esistere una schermata di **inventario ed equipaggiamento** che mostra peso,
sovraccarico, slot e requisiti non soddisfatti con il motivo (GP-51, INV-9).

**HUD-4** — **DOVREBBE** esistere una **minimappa** e/o una mappa del mondo, costruite dalla griglia
dati di `MAP` e dallo stato di esplorazione (GP-52).

**HUD-5** — **DEVE** esistere un **menu di pausa** con opzioni, salvataggio e caricamento; l'apertura
**DEVE** mettere in pausa il tempo di gioco (TIME-2) e cambiare contesto di input (INP-3) (GP-53).

**HUD-6** — L'**interazione contestuale DEVE** presentare le azioni disponibili sul bersaglio
selezionato — attacca, parla, usa, deruba, scassina — costruite dalle affordance e dalle capacità
dell'entità, non da un elenco cablato (GP-54, AFF-15, ARC-6.2).

**HUD-7** — L'interazione contestuale **DEVE** mostrare il comando corretto per la periferica in uso,
interrogando `INP` (INP-12).

**HUD-8** — Ogni testo **DEVE** provenire da `I18N`: nessuna stringa nel codice dell'interfaccia
(I18N-1). Il layout **DEVE** reggere testi di lunghezza molto diversa tra le lingue.

**HUD-9** — L'HUD **NON DEVE** contenere regole di gioco: chiede al dominio, mostra il risultato.
Nessun calcolo di prezzo, danno o requisito nel codice dell'interfaccia.

**HUD-10** — L'HUD **DEVE** aggiornarsi reagendo agli **eventi di dominio**, non interrogando lo
stato ogni frame.

**HUD-11** — Le schermate **DEVONO** impilarsi in modo coerente con lo stack di contesti di input
(inventario sopra pausa sopra gioco), e la chiusura **DEVE** ripristinare esattamente lo stato
precedente (INP-3).

**HUD-12** — Le notifiche (quest avanzata, oggetto ricevuto, reputazione cambiata) **DEVONO** essere
accodate e mostrate senza sovrapporsi né perdersi in caso di raffica.

**HUD-13** — L'HUD **DEVE** supportare le opzioni di **accessibilità**: dimensione del testo,
riduzione degli effetti, contrasto (GP-66).

**HUD-14** — L'HUD **DEVE** essere navigabile sia con puntatore sia con tastiera e gamepad, secondo
le associazioni correnti.

**HUD-15** — L'interfaccia **DEVE** poter essere assente: una partita headless gira senza HUD
(ARC-1.4).

## Criteri di test

- Il diario riflette lo stato delle quest dopo una sequenza di avanzamenti, senza interrogazioni
  periodiche.
- Un requisito non soddisfatto è mostrato con il motivo corretto proveniente da `STAT`.
- L'apertura e la chiusura di schermate impilate ripristinano il contesto di input esatto.
- Dieci notifiche in un frame vengono mostrate tutte, in ordine.
- Con testi lunghi il triplo, nessun elemento esce dai propri limiti.

## Collegamenti

- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-49…GP-54, GP-66
- [`input.md`](./input.md) · [`localization.md`](./localization.md) · [`quest.md`](./quest.md) ·
  [`inventory.md`](./inventory.md) · [`affordance.md`](./affordance.md)
