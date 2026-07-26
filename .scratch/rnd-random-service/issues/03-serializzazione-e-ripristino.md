# 03 — Serializzazione e ripristino

**Cosa costruire:** ricaricare una partita deve riprendere le sequenze casuali dal punto esatto in
cui si erano interrotte — altrimenti salvare e ricaricare diventa un modo per rigiocare lo stesso
momento finché non esce l'esito desiderato. Il servizio produce la propria porzione di stato e sa
ricostruirsi da essa.

Il ripristino avviene **per costruzione**, mai con un metodo chiamato su un servizio già vivo: non
deve esistere un istante in cui il servizio esiste ma contiene la casualità della partita sbagliata.

Si salva soltanto ciò che non è ricostruibile dal seed, così che il salvataggio cresca con l'uso
effettivo e non con il tempo di gioco.

**Bloccato da:** 02 — Nucleo: stream uniformi deterministici.

**Status:** ready-for-agent

- [ ] Il servizio espone una serializzazione della propria sola porzione di stato, con un numero di
      versione proprio
- [ ] Il ripristino è una fabbrica che restituisce un servizio già completo; non esiste un metodo
      d'istanza che ne sostituisca lo stato
- [ ] Nello stato finiscono: versione, seed radice, stato dei soli stream **toccati**, e il seed
      esplicito di uno stream se ne aveva uno
- [ ] Uno stream mai richiesto non compare nello stato e viene ricostruito dal proprio nome
- [ ] Salvare, estrarre 100 valori, ripristinare, riestrarre → gli stessi 100 valori
- [ ] Uno stream nato da seed esplicito riprende correttamente **senza** che il chiamante ripassi
      quel numero
- [ ] Lo stato serializzato non contiene funzioni, riferimenti runtime, né valori ricalcolabili che
      potrebbero divergere
- [ ] Lo stato è serializzabile in JSON e sopravvive al giro completo
