# 09 — Divieti imposti da lint

**Cosa costruire:** due regole tengono in piedi il determinismo dell'intero progetto, e nessuna delle
due è osservabile finché non viene violata. Chiamare `Math.random()` in un punto qualsiasi rompe la
riproducibilità delle partite; usare una funzione trascendente di `Math` sul percorso deterministico
rompe la riproducibilità **tra motori**, e lo fa in modo invisibile — il codice funziona
perfettamente sulla macchina di chi lo scrive, e diverge sul browser di qualcun altro.

I confini vanno imposti da uno strumento, non dalla disciplina. Al termine di questo ticket una
violazione fallisce in fase di controllo, non in produzione. Il progetto oggi non ha alcun linter:
questo ticket lo introduce.

`Math.sqrt` e `Math.imul` sono **ammessi** e vanno esclusi esplicitamente: ECMAScript ne specifica il
risultato esattamente. Il divieto riguarda solo le funzioni trascendenti.

**Bloccato da:** 02 — Nucleo: stream uniformi deterministici.

**Status:** ready-for-agent

- [ ] Un linter è configurato ed eseguibile con un comando dedicato
- [ ] `Math.random()` è vietato ovunque tranne che nel servizio di casualità
- [ ] `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` e `Math.pow` sono vietate nel servizio di
      casualità e in ogni cammino che produce valori deterministici
- [ ] `Math.sqrt` e `Math.imul` restano ammessi
- [ ] I messaggi di errore spiegano **perché** e rimandano all'ADR 0001: una regola che sembra
      arbitraria viene disattivata
- [ ] Un file di prova che viola ciascun divieto fa fallire il controllo
- [ ] Il codice esistente passa senza modifiche o con modifiche dichiarate
- [ ] Il controllo è previsto nella pipeline, non solo eseguibile a mano
