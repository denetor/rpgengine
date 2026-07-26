# 02 — Nucleo: stream uniformi deterministici

**Cosa costruire:** la sorgente di casualità del gioco, seedabile e riproducibile. Chi la usa
costruisce il servizio con un **seed radice**, chiede uno **stream** per dominio d'uso
(combattimento, bottino, generazione, IA) e ne estrae numeri. Due partite avviate con lo stesso seed
producono la stessa sequenza; consumare numeri in uno stream non tocca gli altri; e aggiungere uno
stream nuovo domani non cambia ciò che gli altri producono oggi, perché il seed di uno stream
dipende dal suo **nome** e non dall'ordine in cui gli stream nascono.

Il generatore e la funzione di hash scelti qui sono **congelati**: cambiarli in seguito invalida
ogni salvataggio e ogni mappa generata da seed. Vedi ADR 0001.

**Bloccato da:** 01 — Runner di test headless separato.

**Status:** ready-for-agent

- [ ] Il servizio si costruisce con un seed radice e, facoltativamente, dei parametri
- [ ] Il generatore è `xoshiro128**`, con stato a 32 bit e nessun uso di `BigInt`
- [ ] Il seed di uno stream è `hash(seed radice, id)`; la funzione di hash è scelta, nominata e
      documentata come parte del contratto di stabilità
- [ ] Chi chiama può passare un seed esplicito per uno stream, che ha la precedenza sulla derivazione
- [ ] Chiedere lo stesso stream due volte restituisce la **stessa istanza**
- [ ] Sono disponibili `next`, `int`, `bool`, `pick`, `weighted`, `shuffle`
- [ ] Due servizi costruiti con lo stesso seed producono sequenze identiche su 10⁶ estrazioni
- [ ] Consumare 1000 valori da uno stream non altera la sequenza di un altro
- [ ] Creare uno stream nuovo non altera la sequenza di nessuno stream esistente
- [ ] `next()` e `int()` superano un test del χ² su bucket
- [ ] Nessuna funzione trascendente di `Math` compare nel codice del servizio
- [ ] Il servizio non importa altri servizi, non importa `excalibur`, non legge file
- [ ] Due servizi costruiti nello stesso processo sono indipendenti
