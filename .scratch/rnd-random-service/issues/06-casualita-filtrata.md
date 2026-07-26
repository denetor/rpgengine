# 06 — Casualità filtrata per canale

**Cosa costruire:** la casualità matematicamente corretta viene letta come un bug. Sette teste di
fila sono un risultato legittimo di una moneta equa, ma il giocatore che vede cadere lo stesso
oggetto sette volte dallo stesso nemico conclude che il gioco è rotto. Chi usa il servizio dichiara
un **canale** al momento dell'estrazione, e il servizio ne tiene la **memoria di canale** — il peso
corrente di ogni esito — riducendo il peso di ciò che è appena uscito e facendolo recuperare nel
corso delle estrazioni successive.

Il meccanismo è il **riaggiustamento dei pesi**, mai la riestrazione: rifiutare ciò che si ripete
sposta la distribuzione in modo non controllabile e, soprattutto, crea una regola nuova che il
giocatore impara e sfrutta — dopo un critico *saprebbe* che il prossimo non lo è. Vedi ADR 0002.

La granularità del canale è scelta di chi chiama, mai dedotta dal servizio: un canale più specifico
dà una memoria dedicata a quell'entità, uno più generico la fa condividere.

I nomi dei canali nascono a runtime e non si possono elencare in un file, quindi i parametri vivono
in **profili** assegnati per prefisso. Forma dei dati decisa in sede di progettazione:

```json
{
  "tettoCanali": 512,
  "default": "neutro",
  "profili": {
    "neutro":        { "riduzione": 0.60, "recupero": 2 },
    "scassinamento": { "riduzione": 0.25, "recupero": 5 }
  },
  "regole": [ { "canale": "lockpick:*", "profilo": "scassinamento" } ]
}
```

I valori sono segnaposto plausibili, non tarati: la taratura si fa osservando le sequenze prodotte.

**Bloccato da:** 02 — Nucleo: stream uniformi deterministici · 03 — Serializzazione e ripristino.

**Status:** ready-for-agent

- [ ] L'estrazione filtrata accetta un canale e un elenco di esiti pesati, e restituisce un esito
- [ ] Il peso di un esito appena uscito si riduce e recupera secondo i parametri del suo profilo
- [ ] Non esiste alcun ciclo di riestrazione
- [ ] Il profilo di un canale si risolve **per prefisso**, una volta sola alla nascita del canale, e
      resta memorizzato con il suo stato: nessun costo di risoluzione per estrazione
- [ ] Un profilo di default è obbligatorio quando la configurazione è presente
- [ ] **Senza configurazione il filtro è inattivo**: l'estrazione filtrata si comporta esattamente
      come quella pesata
- [ ] È possibile elencare i canali vivi con il profilo risolto per ciascuno
- [ ] La memoria dei canali entra nella serializzazione (estende 03): ricaricare non azzera
      l'anti-ripetizione
- [ ] Su 10⁴ estrazioni, le ripetizioni consecutive crollano rispetto all'estrazione pesata non
      filtrata
- [ ] Vale la monotonia: se un esito ha peso maggiore di un altro, la sua frequenza non è inferiore
- [ ] La distribuzione misurata per una configurazione fissata è confrontata con un vettore d'oro
      versionato
- [ ] **Non** si asserisce che la distribuzione resti entro tolleranza dai pesi nominali: il filtro
      la sposta per costruzione
- [ ] Ogni estrazione filtrata consuma un numero documentato di estrazioni dallo stream
