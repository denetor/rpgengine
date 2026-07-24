# I18N — Localizzazione

**Area:** Core · **Natura:** generico · **Priorità:** 3 · **Stato:** proposto
**Prefisso requisiti:** `I18N-*`

## Scopo

Risolvere ogni testo mostrato al giocatore a partire da una **chiave**, nella lingua attiva, con
interpolazione di parametri e gestione del plurale. Nessuna stringa di gioco esiste nel codice.

Vale anche per i contenuti: una battuta di dialogo in `dialogs/*.json` non è testo, è una **chiave**
verso il testo.

## Contratto

| Voce | Valore |
|---|---|
| Dipende da | — |
| NON dipende da | `excalibur`, altri servizi |
| Consumato da | `HUD`, `DLG` (per risoluzione a valle), orchestrazione |
| Stato dinamico | lingua attiva |
| Stato statico | cataloghi di traduzione per lingua |
| Dati esterni | `content/locales/<lang>/*.json` |
| Eventi emessi | `locale-changed` |

## API pubblica (indicativa)

```ts
type TextKey = string & { readonly __brand: 'TextKey' };

interface LocalizationService {
  t(key: TextKey, params?: Record<string, string | number>): string;
  plural(key: TextKey, count: number, params?: Record<string, string | number>): string;
  has(key: TextKey): boolean;
  setLocale(locale: string): Result<void, LocaleError>;
  availableLocales(): readonly LocaleInfo[];
  formatNumber(value: number): string;
  formatDate(value: GameTimeMs): string;
}
```

## Requisiti

**I18N-1** — Nessuna stringa mostrata al giocatore **DEVE** essere hardcoded, né nel codice né nei
file di contenuto: ovunque compaiono **chiavi** (ARC-12.2, GP-65).

**I18N-2** — Una chiave mancante **NON DEVE** produrre una schermata vuota: **DEVE** ricadere sulla
lingua di riserva e, se anche questa manca, mostrare la chiave stessa in forma visibile, segnalando
l'errore.

**I18N-3** — Un **controllo automatico** **DEVE** verificare che ogni chiave usata nel codice e nei
contenuti esista in tutte le lingue dichiarate complete, e segnalare le chiavi orfane.

**I18N-4** — L'interpolazione dei parametri **DEVE** essere tipizzata o almeno validata: un
parametro mancante **DEVE** essere un errore diagnostico, non un `undefined` nel testo.

**I18N-5** — Il servizio **DEVE** supportare le **regole di plurale** della lingua attiva, non la
sola distinzione singolare/plurale dell'inglese.

**I18N-6** — Il cambio di lingua **DEVE** avvenire a runtime, senza riavvio, ed emettere
`locale-changed` perché l'interfaccia si ridisegni.

**I18N-7** — I testi **DEVONO** essere organizzati per **dominio** (`ui.*`, `dialog.*`, `item.*`,
`quest.*`), con la possibilità di caricare i cataloghi separatamente.

**I18N-8** — Il servizio **NON DEVE** essere chiamato dal dominio: il dominio produce chiavi e
parametri, la presentazione risolve il testo. Un messaggio di log interno non è testo localizzato.

**I18N-9** — Il formato dei cataloghi **DEVE** essere modificabile da un traduttore senza toccare il
codice, e **DOVREBBE** consentire l'esportazione in un formato di scambio comune.

**I18N-10** — Numeri, quantità e date **DEVONO** essere formattati secondo la lingua attiva.

**I18N-11** — Le lingue **DOVREBBERO** poter essere marcate come incomplete, con un fallback
esplicito per le chiavi mancanti, così da poter distribuire traduzioni parziali.

## Criteri di test

- Una chiave mancante nella lingua attiva ma presente nel fallback restituisce il testo di fallback.
- Il controllo di completezza rileva chiavi mancanti e chiavi orfane su cataloghi sintetici.
- Il plurale è corretto in almeno due lingue con regole diverse.
- Il cambio lingua emette un solo evento e i testi successivi cambiano di conseguenza.

## Collegamenti

- [`REQUIREMENTS.md`](../REQUIREMENTS.md) — ARC-12
- [`GAMEPLAY.md`](../GAMEPLAY.md) — GP-65
- [`dialog.md`](./dialog.md) · [`hud.md`](./hud.md)
