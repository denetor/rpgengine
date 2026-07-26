# 04 — Sorgente gaussiana

**Cosa costruire:** i sistemi che variano una grandezza attorno a un valore centrale — variazione del
danno, dispersione dei colpi, jitter delle attese, imprecisione dei PNG — hanno bisogno che i
risultati si **addensino** attorno al valore nominale, non che siano piatti. Chi usa il servizio
chiede una gaussiana su media e deviazione standard, e può troncarla a un intervallo perché una
variazione non produca mai un valore assurdo.

L'implementazione è una **somma di uniformi** (dodici estrazioni meno sei: media 0 e σ 1 esatte),
non Box–Muller, che userebbe `Math.log` e `Math.cos` — funzioni che ECMAScript non specifica
esattamente e che romperebbero la riproducibilità tra motori. Chi legge il codice penserà a un
errore da principiante: il rimando all'ADR 0001 deve essere nel codice, non solo nella scheda.

**Bloccato da:** 02 — Nucleo: stream uniformi deterministici.

**Status:** ready-for-agent

- [ ] La gaussiana accetta media, deviazione standard e un troncamento facoltativo
- [ ] L'implementazione non usa alcuna funzione trascendente
- [ ] Su 10⁵ campioni, media e deviazione standard campionarie rientrano nella tolleranza dichiarata
- [ ] Il troncamento non sposta la media oltre il limite dichiarato
- [ ] Nessun campione cade oltre ±6σ, ed è documentato come conseguenza accettata del metodo
- [ ] Ogni chiamata consuma un numero fisso e documentato di estrazioni dallo stream
- [ ] Il codice rimanda all'ADR 0001 nel punto in cui la scelta sembrerebbe un errore
