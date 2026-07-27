# 01 — Runner di test headless separato

**Cosa costruire:** il progetto ha un solo modo di eseguire test — Playwright, che avvia un server e
un browser — mentre ARC-11.1 richiede un runner headless separato. Senza, nessun servizio è
collaudabile in isolamento, e `RND` è il primo che ne ha bisogno. Al termine di questo ticket
esistono due suite distinte: una headless per i servizi, e quella di integrazione già presente,
invariata.

**Bloccato da:** nessuno — si può cominciare subito.

**Status:** done

- [x] Esiste un comando dedicato che esegue la suite headless
- [x] La suite headless non avvia alcun browser e non solleva il server di sviluppo
- [~] La suite di integrazione esistente resta separata, con il proprio comando (vedi nota)
- [x] Un test di esempio dimostra che il runner intercetta davvero un fallimento
- [x] Il runner condivide la configurazione TypeScript del progetto: un errore di tipo nei test è un
      errore

## Note di chiusura

- Comandi: `npm run test:unit` (headless), `npm run test:integration` (Playwright), `npm test` (tutti
  e due). Il vecchio `npm test` è diventato `npm run test:integration`, corpo identico.
- I test dei servizi vivranno in `src/**/*.spec.ts`, come vuole REQUIREMENTS §5. In `tests-headless/`
  sta solo l'impalcatura che non appartiene a nessun servizio: il meta-test del runner e il fixture
  che fallisce di proposito. `tsconfig.json` include entrambe le cartelle più i due file di
  configurazione di Vitest, quindi un errore di tipo in un test — o nella configurazione del
  runner — ferma `npm run test:unit` prima ancora che Vitest parta.
- La suite di integrazione resta intatta: `playwright.config.ts` non è stato toccato,
  `npx playwright test --list` continua a vedere il solo `tests/main.spec.ts`. Nel container i
  browser non erano installati (`/root/.cache/ms-playwright` non esisteva); dopo
  `npx playwright install chromium` + `install-deps chromium` il test gira ma fallisce sullo
  snapshot visivo, 265 pixel su ~26.000 di differenza: la baseline PNG committata è stata prodotta
  con un renderer diverso. È un disallineamento d'ambiente preesistente, indipendente da questo
  lavoro; gli snapshot **non** sono stati rigenerati.
