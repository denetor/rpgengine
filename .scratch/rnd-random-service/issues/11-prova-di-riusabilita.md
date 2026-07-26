# 11 — Prova di riusabilità

**Cosa costruire:** il servizio è dichiarato **generico**: deve funzionare in un altro gioco, senza
sapere nulla di questo. È una promessa che si degrada in silenzio — basta una costante di
bilanciamento, un nome di canale dato per scontato, un default che ha senso solo qui, e il servizio
diventa di dominio senza che nessuno se ne accorga.

La prova è un test: il servizio esercitato con canali, distribuzioni e nomi **inventati**, estranei a
questo gioco, e senza alcun file di configurazione. Se quel test richiede di toccare il servizio,
il servizio non era generico.

**Bloccato da:** 04 — Sorgente gaussiana · 05 — Rumore coerente e fBm · 06 — Casualità filtrata per
canale.

**Status:** ready-for-agent

- [ ] Esiste un test che esercita il servizio con un dominio inventato, senza alcun riferimento a
      questo gioco
- [ ] Il test copre estrazione uniforme e pesata, gaussiana, rumore e casualità filtrata
- [ ] Il test gira **senza alcun file di configurazione**, con il filtro inattivo
- [ ] Esiste una variante con profili inventati, per dimostrare che la configurazione non è legata a
      questo gioco
- [ ] Il servizio non contiene costanti, nomi o identificativi di questo gioco
- [ ] Il servizio non contiene valori di bilanciamento: quelli arrivano come dati
