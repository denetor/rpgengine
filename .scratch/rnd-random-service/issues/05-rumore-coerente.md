# 05 — Rumore coerente e fBm

**Cosa costruire:** la generazione procedurale ha bisogno di valori che variino con **gradualità** da
una cella all'altra — altimetria, biomi, densità di risorse — e non di casualità indipendente per
cella, che produrrebbe rumore granuloso invece che terreno. Chi usa il servizio campiona il rumore
in 2D e può sommarne più ottave per ottenere dettaglio a più scale.

La proprietà che conta più di tutte: il rumore dipende **solo** da seed e coordinate, mai
dall'ordine di campionamento. Le celle si possono campionare in qualunque ordine, e una porzione si
può rigenerare, ottenendo sempre lo stesso risultato.

**Bloccato da:** 02 — Nucleo: stream uniformi deterministici.

**Status:** ready-for-agent

- [ ] Il campionamento 2D restituisce valori continui nell'intervallo dichiarato
- [ ] È possibile sommare più ottave con lacunarità e persistenza configurabili
- [ ] La lacunarità si applica per moltiplicazione ripetuta, mai con `Math.pow`
- [ ] La tabella di permutazione si costruisce **una volta sola**, dallo stream, alla nascita dello
      stream
- [ ] Campionare il rumore **non** avanza lo stato dello stream: estrarre numeri prima e dopo un
      milione di campionamenti dà la stessa sequenza
- [ ] Lo stesso seed e le stesse coordinate danno sempre lo stesso valore, in qualunque ordine
      vengano campionate
- [ ] Campioni vicini differiscono entro un limite dichiarato (continuità)
- [ ] Nessuna funzione trascendente compare nell'implementazione
