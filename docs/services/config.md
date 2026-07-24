# CFG — Configurazione e bilanciamento

**Area:** Core · **Natura:** generico · **Priorità:** 1 · **Stato:** proposto
**Prefisso requisiti:** `CFG-*`

## Scopo

Raccogliere in un solo posto, tipizzato e validato, tutti i **parametri numerici** del gioco:
bilanciamento, soglie, tempi, dimensioni, costanti di rendering. Serve a rendere il gioco tarabile
senza cercare i numeri sparsi nel codice, e a rendere esplicito ciò che è una **scelta di design**
rispetto a ciò che è una regola.

Distinzione importante rispetto al **contenuto** (`game/content/`): il contenuto descrive *cose che
esistono* (questa quest, questa spada); la configurazione descrive *come si comporta il sistema*
(quanto pesa un punto di Forza, ogni quanti ms rivaluta l'IA).

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, altri servizi |
| Consumato da | tutti i servizi, per costruzione (CTX-2) |
| Stato dinamico | solo le **impostazioni utente** (volume, lingua, rebinding, accessibilità) |
| Stato statico | tutti i parametri di bilanciamento |
| Dati esterni | file di configurazione + file di bilanciamento in `game/balance/` |
| Eventi emessi | `settings-changed` |

## API pubblica (indicativa)

```ts
interface GameConfig {
  readonly world: { tileSize: number; zBands: Record<ZBand, number> };
  readonly ai: { evaluationIntervalMs: number; activationRadius: number };
  readonly combat: { baseHitVariance: number };
  // …una sezione per area, tutta readonly
}

interface UserSettings {
  volume: { master: number; music: number; sfx: number };
  locale: string;
  bindings: BindingMap;
  accessibility: { textScale: number; reduceShake: boolean };
}

function loadConfig(sources: ConfigSource[]): Result<GameConfig, ConfigError[]>;
```

## Requisiti

**CFG-1** — Nessun **magic number** **DEVE** comparire nel codice: dimensione tile, z-band, indici
`INDEX_TO_TILE`, raggi di attivazione, timer di respawn, soglie di IA, moltiplicatori di prezzo
vivono in configurazione.

**CFG-2** — La configurazione **DEVE** essere **completamente tipizzata** e **`readonly`**: nessun
servizio **DEVE** poterla modificare a runtime.

**CFG-3** — La configurazione **DEVE** essere validata al caricamento con schema, con errori che
indicano sezione, chiave e valore ricevuto (ARC-7.2).

**CFG-4** — Ogni parametro **DEVE** avere un valore di default dichiarato; una configurazione
parziale **DEVE** essere sovrapponibile ai default (`default ← file ← utente`), con precedenza
documentata.

**CFG-5** — Le **impostazioni utente** (volume, lingua, comandi, accessibilità) **DEVONO** essere
separate dal bilanciamento: sono le sole persistite fuori dal salvataggio di partita, perché valgono
per tutte le partite.

**CFG-6** — La modifica di un'impostazione utente **DEVE** produrre l'evento `settings-changed`; i
consumatori (audio, HUD, input) reagiscono, senza rileggere periodicamente lo stato.

**CFG-7** — I parametri **DEVONO** essere raggruppati per **area di responsabilità** corrispondente
ai servizi, non in un unico oggetto piatto.

**CFG-8** — Ogni servizio **DEVE** ricevere **solo la propria sezione** di configurazione, non
l'oggetto intero: riduce l'accoppiamento e rende esplicito cosa lo influenza.

**CFG-9** — Il gioco **DOVREBBE** poter ricaricare il bilanciamento a caldo in sviluppo, per
iterare senza riavviare.

**CFG-10** — La configurazione **NON DEVE** contenere testo mostrato al giocatore: quello appartiene
a `I18N` (ARC-12.2).

**CFG-11** — Un parametro di bilanciamento inutilizzato **DOVREBBE** essere segnalato da un
controllo automatico, per evitare accumulo di configurazione morta.

## Criteri di test

- Il caricamento con file parziale produce i default attesi, con la precedenza dichiarata.
- Una chiave sconosciuta o un tipo errato producono un errore diagnostico, non un valore silenzioso.
- Il tentativo di mutare la configurazione non compila.
- `settings-changed` viene emesso una sola volta per modifica, con i valori nuovi.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12 (configurazione centralizzata)
- [`localization.md`](./localization.md) · [`input.md`](./input.md) · [`audio.md`](./audio.md)
