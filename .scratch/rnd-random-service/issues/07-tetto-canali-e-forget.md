# 07 — Tetto dei canali e rimozione esplicita

**Cosa costruire:** la granularità del canale è libera, quindi il codice del gioco può usare un
canale per istanza — una porta, un nemico. Nulla però rimuove mai quelle memorie: la porta
scassinata una volta e il nemico morto alla seconda ora resterebbero nel salvataggio fino alla fine
della partita. Dopo cinquanta ore di gioco si accumulano migliaia di memorie di entità che non
esistono più. Non è un disastro — sono decine di byte l'una — ma è una crescita **senza limite
superiore**, il tipo di problema che si scopre dal giocatore che gioca più di tutti.

Al termine di questo ticket la memoria dei canali è limitata: il servizio ne tiene al massimo un
numero configurabile, sfrattando il canale usato meno di recente, e chi usa il servizio può
dichiarare esplicitamente che un canale non serve più.

Lo sfratto azzera la memoria di quel canale — ciò contro cui il requisito sulla serializzazione mette
in guardia — ma è deterministico e non dipende dal salvare e ricaricare, quindi non è una leva nelle
mani del giocatore. La differenza va documentata dove si legge il codice, altrimenti sembra una
contraddizione.

**Bloccato da:** 06 — Casualità filtrata per canale.

**Status:** ready-for-agent

- [ ] Il numero massimo di canali è un parametro dei dati, non una costante
- [ ] Superato il tetto viene sfrattato il canale usato **meno di recente**
- [ ] La recenza si misura con il contatore delle estrazioni del servizio, **mai** con l'orologio di
      sistema
- [ ] I pari merito si rompono con il nome del canale, così che l'ordine sia totale
- [ ] Lo sfratto è indipendente dall'ordine di iterazione sulle strutture interne: due servizi che
      hanno visto la stessa sequenza sfrattano lo stesso canale
- [ ] Esiste un modo esplicito per dimenticare un canale
- [ ] Un canale sfrattato e poi riusato riparte da una memoria vuota, senza errori
- [ ] Il numero di canali vivi resta entro il tetto anche dopo un ripristino da salvataggio
