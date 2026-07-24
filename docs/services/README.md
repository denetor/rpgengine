# Schede dei servizi

Una scheda per servizio. Ogni scheda è autosufficiente: definisce il **contratto** del servizio, la
sua **API pubblica**, i **requisiti numerati** con prefisso proprio e i **criteri di test**.

I principi che valgono per tutti (`ARC-*`), il catalogo completo e le priorità stanno nell'hub:
[`../REQUIREMENTS.md`](../REQUIREMENTS.md). Le feature viste dal giocatore stanno in
[`../GAMEPLAY.md`](../GAMEPLAY.md).

## Regole che valgono per ogni scheda

- **Natura** — *generico* (riusabile in un altro gioco) o *di dominio* (assume il modello di questo
  progetto). Vedi ARC-3.
- **Nessun servizio importa un altro servizio.** Le dipendenze elencate sono porte astratte o
  infrastruttura. Il collegamento tra servizi vive in `game/orchestration/` (ARC-4).
- **Nessun servizio importa `excalibur`**, tranne i quattro di presentazione (ARC-1.2).
- **I comandi restituiscono gli eventi prodotti**, non li pubblicano (ARC-4.2).
- Gli **ID dei requisiti sono stabili** e non vengono riusati.

## Indice

### Core — infrastruttura

| ID | Scheda | Cosa fa |
|---|---|---|
| `BUS` | [event-bus.md](./event-bus.md) | Trasporto degli eventi di dominio, consegna deterministica |
| `CTX` | [game-context.md](./game-context.md) | Composizione del grafo dei servizi, iniezione, ciclo di vita |
| `CFG` | [config.md](./config.md) | Parametri di bilanciamento e impostazioni utente |
| `TIME` | [time.md](./time.md) | Tempo di gioco, scheduler, orario del mondo |
| `RND` | [random.md](./random.md) | RNG seedabile, gaussiano, Perlin, casualità filtrata |
| `SAVE` | [persistence.md](./persistence.md) | Salvataggio, slot, versionamento, migrazioni |
| `INP` | [input.md](./input.md) | Azioni astratte, contesti, rebinding, buffering |
| `I18N` | [localization.md](./localization.md) | Testi per chiave, lingue, plurali |
| `AST` | [assets.md](./assets.md) | Manifesto degli asset, bundle, caricamento |

### Mondo

| ID | Scheda | Cosa fa |
|---|---|---|
| `MAP` | [map.md](./map.md) | Griglia dati, calpestabilità, aree — vedi anche [MAP-REQUIREMENTS](../MAP-REQUIREMENTS.md) |
| `GEN` | [map-generation.md](./map-generation.md) | Generazione procedurale da seed e ricette |
| `SPX` | [spatial-index.md](./spatial-index.md) | Query di prossimità e visibilità |
| `ENT` | [entity-registry.md](./entity-registry.md) | Identità, componenti, capacità |

### Agenti

| ID | Scheda | Cosa fa |
|---|---|---|
| `BB` | [blackboard.md](./blackboard.md) | Conoscenza per agente, gruppo e globale; memoizzazione |
| `AI` | [utility-ai.md](./utility-ai.md) | Decisione a utilità, personalità, ragionatori multipli |
| `AFF` | [affordance.md](./affordance.md) | Gli oggetti pubblicizzano il proprio uso; percezione |
| `PATH` | [pathfinding.md](./pathfinding.md) | Percorsi, raggiungibilità, fuga |

### Regole di gioco

| ID | Scheda | Cosa fa |
|---|---|---|
| `STAT` | [stats.md](./stats.md) | Caratteristiche, abilità, perk, derivati, modificatori |
| `CBT` | [combat.md](./combat.md) | Formula unica del danno, status effect, morte |
| `INV` | [inventory.md](./inventory.md) | Contenitori, peso, impilamento, equipaggiamento |
| `LOOT` | [loot.md](./loot.md) | Loot table pesate, filtro anti-ripetizione, pietà |
| `QST` | [quest.md](./quest.md) | Interprete di quest a fasi e rami |
| `DLG` | [dialog.md](./dialog.md) | Interprete di grafi di dialogo condizionati |
| `FAC` | [faction.md](./faction.md) | Fazioni, ranghi, reputazione, relazioni |
| `ECO` | [economy.md](./economy.md) | Prezzi, liquidità dei mercanti, rifornimento |
| `CRM` | [crime.md](./crime.md) | Crimini osservati, testimoni, taglie |

### Presentazione

| ID | Scheda | Cosa fa |
|---|---|---|
| `REN` | [rendering.md](./rendering.md) | Confine con Excalibur, `EntityId → Actor`, disegno |
| `HUD` | [hud.md](./hud.md) | HUD, diario, inventario, menu, interazione contestuale |
| `AUD` | [audio.md](./audio.md) | Musica per situazione, effetti da eventi, mixaggio |
| `CAM` | [camera.md](./camera.md) | Inseguimento, confini, zoom, scuotimento |

## Template per una nuova scheda

```markdown
# XXX — Nome

**Area:** … · **Natura:** generico | di dominio · **Priorità:** 1-4 · **Stato:** proposto
**Prefisso requisiti:** `XXX-*`

## Scopo
Cosa fa e, soprattutto, quale problema esiste per prevenire.

## Contratto
| Voce | Valore |
|---|---|
| Dipende da | … (porte astratte, mai altri servizi) |
| NON dipende da | `excalibur`, … |
| Consumato da | … |
| Stato dinamico | … (cosa finisce nel salvataggio) |
| Stato statico | … (cosa viene dai file di contenuto) |
| Dati esterni | … |
| Eventi emessi | … |
| Ordine di grandezza | … |

## API pubblica (indicativa)
Firme TypeScript: fissano forma e responsabilità, non l'implementazione.

## Requisiti
**XXX-1** — … DEVE/DOVREBBE/PUÒ …

## Criteri di test
Cosa deve dimostrare la suite del servizio, incluso il test di riusabilità (ARC-3.4).

## Collegamenti
Requisiti di gioco serviti, principi rilevanti, servizi correlati.
```
