---
status: accepted
---

# Casualità filtrata per riaggiustamento dei pesi, non per riestrazione

La casualità filtrata (RND-9) serve a evitare le sequenze che il giocatore legge come un bug pur
essendo legittime. La soluzione che tutti si aspettano è la **riestrazione**: si tiene una coda dei
risultati recenti e si rifiuta ciò che si ripete. Abbiamo scelto il **riaggiustamento dei pesi**:
l'esito appena uscito vede il proprio peso ridotto, e lo recupera nel corso delle estrazioni
successive.

## Perché non la riestrazione

- **Crea un pattern nuovo.** «Mai due volte di fila» è una regola che il giocatore impara e sfrutta:
  dopo un critico *sa* che il prossimo non lo sarà. Si sostituisce una sequenza che sembra ingiusta
  con una che è prevedibile — che è un modo diverso di fallire lo stesso obiettivo. Con i pesi, sette
  teste di fila restano possibili, ma la loro probabilità crolla di ordini di grandezza.
- **Sposta la distribuzione in modo non controllabile.** Il rifiuto penalizza sistematicamente gli
  esiti frequenti, perché sono quelli che si ripetono. Con i pesi lo spostamento è calcolabile e
  tarabile dai parametri del profilo.
- **Costa un ciclo.** La riestrazione richiede un tetto ai tentativi e una garanzia di terminazione,
  compreso il caso limite in cui esiste un solo esito possibile. Il riaggiustamento è O(1).

## Conseguenze

- **RND-11 non esiste.** Era il requisito che imponeva la terminazione del filtro. Senza cicli di
  riestrazione non c'è terminazione da garantire: il requisito più delicato della sezione si dissolve
  invece di essere soddisfatto. L'identificatore resta ritirato e non viene riusato.
- **RND-12 non esiste.** Offriva il riaggiustamento come alternativa facoltativa; è diventato il
  meccanismo, ed è confluito in RND-9.
- **Il criterio di test è cambiato.** Non si può asserire che «la distribuzione a lungo termine resta
  entro la tolleranza dai pesi nominali»: il filtro la sposta per costruzione, e una tolleranza
  abbastanza larga da farlo passare renderebbe il test privo di significato. Al suo posto:
  **monotonia** (se `w(a) > w(b)` allora `freq(a) ≥ freq(b)`) e un **vettore d'oro** della
  distribuzione misurata, che non dimostra che sia giusta ma cattura ogni cambiamento involontario.

## Alternativa scartata

**Offrire entrambi**, scelti per canale nei dati, come prevedeva la stesura originale. Scartata
perché sono due sistemi statistici da implementare, tarare, collaudare e serializzare in un servizio
di priorità 1 — e nessuno avrebbe mai saputo su quale base scegliere l'uno o l'altro.
