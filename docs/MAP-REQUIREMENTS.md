# Requisito Tecnico — Struttura della mappa e rendering del terreno

**Progetto:** GdR 2D top-down a tile quadrati
**Componente:** Sistema di mappa e rendering
**Versione:** 0.1 (bozza)
**Stato:** proposto

Linguaggio dei requisiti: **DEVE** = obbligatorio, **DOVREBBE** = raccomandato, **PUÒ** = opzionale.

> Questo documento possiede i requisiti `MAP-1…MAP-9` e specifica il **come si disegna** il mondo.
> Il **contratto di servizio** della mappa — API, dipendenze, stato serializzabile, requisiti da
> `MAP-10` in avanti — sta in [`services/map.md`](./services/map.md); i principi architetturali
> trasversali stanno in [`REQUIREMENTS.md`](./REQUIREMENTS.md); le feature di gioco che questo
> documento serve (GP-7, GP-8, GP-9, GP-52) stanno in [`GAMEPLAY.md`](./GAMEPLAY.md).
>
> I termini usati qui — griglia dati, griglia di disegno, Dual Grid System, priorità di terreno,
> base, z-band, overhead, impronta — sono definiti in [`../CONTEXT.md`](../CONTEXT.md), il glossario
> unico del progetto.

---

## 1. Scopo

Definire (a) l'organizzazione della mappa di gioco in livelli e (b) il modo in cui i tile del terreno vengono composti tramite **Dual Grid System (DGS)** applicato a **3 livelli di terreno** sovrapposti per priorità. Il documento fissa le convenzioni necessarie perché autoring (editor), formato dati e renderer siano coerenti.

---

## 2. Parametri di progetto

| Parametro | Simbolo | Valore di default | Note |
|---|---|---|---|
| Dimensione tile | `TS` | 32 px | quadrato; configurabile |
| Larghezza mappa (celle) | `W` | — | dato di progetto |
| Altezza mappa (celle) | `H` | — | dato di progetto |
| Livelli di terreno | — | 3 | vedi MAP-2 |
| Tile per livello DGS | — | 16 | vedi MAP-3 |

---

## 3. Requisiti

### MAP-1 — Struttura a livelli della mappa

La mappa **DEVE** essere organizzata nei seguenti livelli, disegnati dal basso verso l'alto (più in alto = disegnato dopo = in primo piano):

| # | Livello | Contenuto | Ordinamento | z (default) |
|---|---|---|---|---|
| 6 | UI / HUD | interfaccia | spazio schermo (fuori dal mondo) | — |
| 5 | Meteo / luce | nebbia, pioggia, tinta giorno/notte | fisso | 20000 |
| 4 | Overhead | chiome, archi, tetti | fisso | 10000 |
| 3 | Entità / oggetti | personaggio, NPC, tronchi, rocce, colonne, cespugli | **per Y della base** | `0 … H·TS` |
| 2 | Dettagli suolo | fiori, sentieri, decal, ombre | fisso | −900 |
| 1 | Terreno | 3 sotto-livelli DGS (MAP-2) | fisso | da −1000 |

Le bande `z` costanti (livelli fissi) **DEVONO** essere scelte in modo da non intersecare mai l'intervallo `0 … H·TS` usato dall'ordinamento per Y (MAP-5).

### MAP-2 — Terreno con Dual Grid System a 3 livelli

Ogni cella della griglia dati **DEVE** contenere un singolo identificativo di terreno `terrain ∈ {0, 1, 2}`, dove il valore rappresenta anche la **priorità** (0 = più bassa, 2 = più alta). Ordine di esempio (configurabile): `0 = acqua`, `1 = terreno incolto`, `2 = prato`.

Il terreno **DEVE** essere reso in 3 passate sovrapposte, dal livello di priorità più bassa a quella più alta:

- **T0 (base):** riempimento del terreno 0 su tutta l'area della mappa.
- **T1:** passata DGS sulla maschera `mask1(x,y) = terrain(x,y) ≥ 1`, disegnata sopra T0.
- **T2:** passata DGS sulla maschera `mask2(x,y) = terrain(x,y) ≥ 2`, disegnata sopra T1.

Ogni passata DGS **DEVE** trattare gli angoli "assenti" (maschera falsa) come trasparenti, così che il livello sottostante resti visibile e produca la transizione. Questo modello a maschere impilate **DEVE** gestire correttamente anche gli incroci in cui tre terreni si toccano nello stesso vertice.

### MAP-3 — Parametri del Dual Grid System

Per ciascuna passata DGS valgono le seguenti regole:

1. La griglia di disegno **DEVE** avere dimensioni `(W+1) × (H+1)` ed essere posizionata con offset `(−TS/2, −TS/2)` rispetto alla griglia dati.
2. Ogni tile di disegno in posizione `(dx, dy)` **DEVE** campionare le 4 celle dati ai suoi angoli: `TL=(dx−1, dy−1)`, `TR=(dx, dy−1)`, `BL=(dx−1, dy)`, `BR=(dx, dy)`.
3. Le celle fuori dai limiti della mappa **DEVONO** essere considerate "assenti" (angolo non attivo). Ciò implica un bordo di padding che chiude le transizioni sui margini.
4. L'indice del tile (0–15) **DEVE** essere calcolato con la convenzione di bit: `TL=1, TR=2, BR=4, BL=8`, sommando i bit degli angoli attivi.
5. La mappatura `indice → cella del foglio` **DEVE** essere definita da una tabella `INDEX_TO_TILE` di 16 elementi, fissata una sola volta secondo la disposizione del `.png` del livello.
6. I due casi diagonali (indici 5 e 10, angoli opposti attivi) **DEVONO** seguire una convenzione documentata e coerente in tutto il gioco. Default: angoli **connessi** ("a ponte").

### MAP-4 — Transizioni fra terreni

Le transizioni fra terreni **DEVONO** essere ottenute esclusivamente per sovrapposizione (priorità + trasparenza del DGS), senza set di tile dedicati per ogni coppia di terreni. Ne consegue che il bordo di un dato terreno ha lo stesso aspetto verso qualsiasi terreno inferiore. Se serve un aspetto specifico per un confine (es. sabbia fra prato e acqua), esso **DEVE** essere realizzato inserendo un **terreno intermedio** come livello di priorità aggiuntivo, non come transizione a coppia.

### MAP-5 — Ordinamento per Y delle entità

Personaggio, NPC e oggetti occludibili (tronchi, rocce, colonne, cespugli) **DEVONO** risiedere nella stessa banda ordinabile (livello 3) ed essere ordinati per la **Y della loro base**. Il valore `z` di ogni elemento ordinabile **DEVE** essere pari alla Y della base; per gli elementi in movimento **DEVE** essere aggiornato a ogni frame, per quelli statici **PUÒ** essere impostato una sola volta.

Gli sprite ordinabili **DOVREBBERO** avere ancora sul bordo inferiore (`anchor = (0.5, 1)`), così che `pos.y` coincida con la linea dei piedi.

### MAP-6 — Livello overhead

Gli elementi che devono trovarsi sempre sopra il personaggio (chiome, archi, tetti) **DEVONO** stare nel livello overhead (livello 4), con `z` costante superiore a qualsiasi valore possibile della banda ordinabile. Un oggetto "alto" (es. albero) **DEVE** essere spezzato: la parte a terra (tronco) nel livello ordinabile per Y, la parte alta (chioma) nel livello overhead.

### MAP-7 — Collisione

La collisione **DEVE** essere un dato separato dal rendering, definito dall'impronta dell'oggetto (in generale la sua base) e indipendente dall'ordine di disegno. Il personaggio **DEVE** poter attraversare visivamente le aree "alte" (es. sotto la chioma) pur essendo bloccato dall'impronta (es. il tronco). Il collision del terreno **DEVE** essere definito sulla griglia dati a interi, non sulla griglia di disegno sfasata.

### MAP-8 — Formato dati e autoring

1. La griglia dati del terreno (`terrain` per cella) **DEVE** essere la sorgente unica per gameplay, collisioni e rendering DGS.
2. L'autoring **DOVREBBE** avvenire in un editor di mappe con livelli nominati in modo coerente con MAP-1 (es. `terrain`, `ground_detail`, `entities`, `overhead`, `weather`, e un livello dati/collision non renderizzato).
3. Le eventuali varianti estetiche di un tile (es. tile pieno del prato) **DEVONO** essere scelte in modo **deterministico** in funzione di `(x, y)` (hash), per evitare sfarfallio tra frame.

### MAP-9 — Requisiti non funzionali

1. Le griglie di disegno DGS **DOVREBBERO** essere ricalcolate solo quando i dati del terreno cambiano, non a ogni frame.
2. Il sistema **DEVE** mantenere separati i tre concetti: forma (DGS/priorità), varianti (estetica), animazione (tempo), così che possano coesistere senza conflitti.

---

## 4. Criteri di accettazione

- [ ] La mappa è renderizzata secondo l'ordine di livelli di MAP-1.
- [ ] Il terreno usa 3 passate DGS impilate per priorità; le transizioni fra prato, incolto e acqua sono corrette, inclusi gli angoli interni e gli incroci a tre.
- [ ] Non esistono set di tile dedicati alle coppie di terreni: ogni terreno ha un solo set DGS a 16 tile.
- [ ] Sui margini della mappa le transizioni si chiudono correttamente grazie al padding "assente".
- [ ] Il personaggio appare **dietro** un tronco quando la sua base è più in alto e **davanti** quando è più in basso.
- [ ] La chioma di un albero resta sempre sopra il personaggio, in entrambe le situazioni.
- [ ] Il personaggio è bloccato dall'impronta (tronco/colonna) ma può passare visivamente sotto le parti overhead.
- [ ] Le varianti del terreno sono stabili tra un frame e l'altro (nessuno sfarfallio).