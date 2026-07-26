# 10 — Forma e validazione dei parametri

**Cosa costruire:** i profili di filtro sono dati che un game designer modifica senza ricompilare.
Un profilo che cita un nome inesistente, una riduzione fuori intervallo o un tetto negativo devono
far fallire il **caricamento**, con un errore che dice file, percorso e valore — non produrre un
comportamento strano a metà partita, quando nessuno collegherà più l'effetto alla causa.

Il servizio non legge file e non conosce il percorso dei contenuti di questo gioco: riceve parametri
**già validati** nel costruttore. Quello che espone è la **forma attesa**, perché il caricatore del
gioco possa applicarla prima che il contesto di gioco venga costruito.

**Bloccato da:** 06 — Casualità filtrata per canale.

**Status:** ready-for-agent

- [ ] Il servizio espone la forma attesa dei propri parametri, utilizzabile da chi li carica
- [ ] Parametri non validi vengono respinti con un errore che indica file, percorso e valore
- [ ] La validazione avviene **prima** della costruzione del servizio: non esiste un servizio
      costruito con parametri non validi
- [ ] Il servizio continua a non leggere file
- [ ] L'assenza di configurazione è un caso **valido**, non un errore
- [ ] Un profilo citato da una regola ma non definito è un errore di validazione
- [ ] Il profilo di default dichiarato ma inesistente è un errore di validazione
- [ ] I casi di errore hanno un test ciascuno, con il messaggio verificato
