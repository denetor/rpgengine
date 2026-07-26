# 08 — Vettori d'oro su più motori JavaScript

**Cosa costruire:** il servizio promette che un aggiornamento del browser non cambi le partite e che
una mappa generata da un seed sia la stessa mappa domani. Oggi quella promessa non è collaudata da
niente: «due istanze con lo stesso seed producono la stessa sequenza» gira su un solo motore e passa
sempre, qualunque cosa faccia l'implementazione. La riproducibilità **tra motori** non è osservabile
da un motore solo.

Al termine di questo ticket una lista di valori attesi, versionata nel repository, viene eseguita
dentro tre motori reali. Se qualcuno sostituisce il generatore, rimette Box–Muller al posto della
somma di uniformi, o reintroduce una funzione trascendente, il test fallisce — che è esattamente il
suo mestiere.

Nella configurazione di integrazione attuale firefox e webkit sono **commentati** e gira il solo
chromium: finché restano così, un test cross-engine passerebbe senza dimostrare nulla, il che è
peggio che non averlo, perché sembra una verifica.

**Bloccato da:** 02 — Nucleo · 04 — Sorgente gaussiana · 05 — Rumore coerente e fBm.

**Status:** ready-for-agent

- [ ] Firefox e webkit sono attivi nella configurazione dei test di integrazione
- [ ] Esiste una pagina di prova che esegue i vettori dentro il browser e ne espone l'esito
- [ ] I valori attesi sono versionati nel repository e coprono estrazione uniforme, intero,
      gaussiana, rumore 2D e fBm
- [ ] I vettori vengono verificati su chromium, firefox e webkit
- [ ] Modificare il generatore, il metodo della gaussiana o la funzione di hash fa fallire il test
- [ ] È documentato come si rigenerano i vettori, e che rigenerarli è una decisione che invalida i
      salvataggi
- [ ] Lo snapshot visivo esistente continua a passare; se serve uno snapshot per motore, la cosa è
      esplicita e non un effetto collaterale
