---
status: accepted
---

# Riproducibilità bit-per-bit tra motori JavaScript

RND-4 e GEN-2 promettono che la stessa partita e la stessa mappa da seed restino identiche **dopo un
aggiornamento del browser**. ECMAScript specifica esattamente `+ - * /`, `Math.floor`, `Math.sqrt` e
`Math.imul`, ma lascia `Math.log`, `Math.cos`, `Math.sin`, `Math.exp` e `Math.pow`
*implementation-approximated*: V8, SpiderMonkey e JavaScriptCore differiscono negli ultimi bit.
Abbiamo quindi vietato le funzioni trascendenti su tutto il percorso deterministico, e scelto le
implementazioni di conseguenza.

## Cosa è congelato

1. **PRNG: `xoshiro128**`**, con stato in `Uint32Array` e `Math.imul`.
2. **Funzione di hash sulle stringhe** che deriva i seed degli stream da (seed radice, id).
3. **Nessuna funzione trascendente** in nessun cammino che produce valori.

Cambiare uno qualsiasi dei tre invalida ogni salvataggio e ogni mappa generata da seed.

## Conseguenze non ovvie

- **Niente PCG32**, benché RND-4 lo citasse come alternativa equivalente: richiede moltiplicazioni a
  64 bit, che in JavaScript significano `BigInt`, che alloca a ogni operazione — contro ARC-13.3.
  `xoshiro128**` lavora a 32 bit e non alloca.
- **Niente Box–Muller per la gaussiana**, benché sia il metodo standard: usa `Math.log` e
  `Math.cos`. Al suo posto una **somma di uniformi** (Irwin–Hall: dodici estrazioni meno sei, media
  0 e σ 1 esatte), che usa solo addizioni. Si pagano dodici estrazioni per campione e code troncate
  a ±6σ; nessuno degli usi previsti da RND-6 — variazione del danno, dispersione, jitter — ha
  significato oltre 6σ.
- **Niente `Math.pow` nelle ottave di fBm**: la lacunarità si applica per moltiplicazione ripetuta.
  Perlin e simplex sono per il resto già esatti, perché usano solo `*`, `+` e `floor`.

Questo è il punto per cui l'ADR esiste: un lettore che trovi una gaussiana per somma di uniformi
penserà a un errore da principiante e la "correggerà" rimettendo Box–Muller, rompendo in silenzio la
compatibilità di tutti i salvataggi esistenti.

## Verifica

La promessa non è collaudabile su un motore solo: due istanze con lo stesso seed coincidono sempre
in-process. Serve un test a **vettori d'oro** — valori attesi salvati nel repo per `next`, `int`,
`gaussian`, `noise2` e `fbm2` — eseguito su **chromium, firefox e webkit** con Playwright, che il
progetto già usa.

## Alternative scartate

- **Restringere la garanzia** alla sola sequenza uniforme, lasciando la gaussiana non portabile tra
  motori. Scartata perché una promessa condizionale viene prima o poi usata dove non vale.
- **Implementare `log` e `cos` in casa** con polinomi fissi, per poter tenere Box–Muller. Scartata
  perché è scrivere e collaudare una libreria matematica per un guadagno che qui non serve.
