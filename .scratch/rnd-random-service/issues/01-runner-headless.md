# 01 — Runner di test headless separato

**Cosa costruire:** il progetto ha un solo modo di eseguire test — Playwright, che avvia un server e
un browser — mentre ARC-11.1 richiede un runner headless separato. Senza, nessun servizio è
collaudabile in isolamento, e `RND` è il primo che ne ha bisogno. Al termine di questo ticket
esistono due suite distinte: una headless per i servizi, e quella di integrazione già presente,
invariata.

**Bloccato da:** nessuno — si può cominciare subito.

**Status:** ready-for-agent

- [ ] Esiste un comando dedicato che esegue la suite headless
- [ ] La suite headless non avvia alcun browser e non solleva il server di sviluppo
- [ ] La suite di integrazione esistente resta separata, con il proprio comando, e continua a passare
- [ ] Un test di esempio dimostra che il runner intercetta davvero un fallimento
- [ ] Il runner condivide la configurazione TypeScript del progetto: un errore di tipo nei test è un
      errore
