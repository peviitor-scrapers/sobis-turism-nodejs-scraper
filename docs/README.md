# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile SOBIS TURISM din România.

Extrage anunțurile de pe [ANOFM](https://anofm.ro) (API public filtrat pe CIF 794572) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Ce face

1. **Validează compania** — interoghează API-ul public ANAF ([demoanaf.ro](https://demoanaf.ro)) după CIF-ul SOBIS TURISM (794572) și verifică:
   - Denumirea oficială: SC TRANSILVANIA HOLIDAY TRAVELS SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — interoghează API-ul public ANOFM filtrat pe CIF
4. **Transformă datele** — normalizează locațiile (doar orașe românești), tag-urile (lowercase), workmode-ul (remote/on-site/hybrid)
5. **Stochează în SOLR** — upsert în `job` core (job-urile) și `company` core (datele companiei cu adresa completă)
6. **Generează docs/jobs.md** — fișier markdown cu informații companie + toate job-urile curente, publicat pe [GitHub Pages](https://sebiboga.github.io/sobis-turism-nodejs-scraper/jobs.md)

## Structură proiect

```
├── config/company.json         # Sursa unică de adevăr (CIF, brand, URL-uri, API)
├── config/company.js           # Loader ESM pentru config/company.json
├── index.js                    # Orchestrator principal
├── company.js                  # Validare companie (ANAF + Peviitor + SOLR) cu cache 7 zile
├── demoanaf.js                 # CLI wrapper pentru src/anaf.js
├── src/anaf.js                 # Modul ANAF API (search + company details)
├── src/markdown-generator.js   # Generează docs/jobs.md după scrape
├── src/job-validator.js        # Primitivă comună: validateByHead, validateByContent
├── solr.js                     # Operații SOLR (query, upsert, delete, company)
├── company.json                # Cache ANAF (committed, TTL 7 zile, fallback la stale)
├── ROBOTS.md                   # Politică ANOFM API
├── tests/
│   ├── unit/          # Teste unitare (API-uri mock-uite)
│   ├── integration/   # Teste de integrare (ANAF + SOLR live)
│   └── e2e/           # Teste end-to-end (pipelin complet)
└── .github/workflows/
    ├── job-seeker-ro-spider.yml     # Rulează zilnic la 6 AM UTC
    └── automation-testing.yml       # Teste automate la fiecare push/PR
```

## API-uri folosite

| API | URL | Autentificare |
|---|---|---|
| ANOFM | `https://anofm.ro/api/entity/vw_public_job_posting` | Public |
| ANAF (demoanaf) | `https://demoanaf.ro/api/...` | Public |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |
| SOLR (job core) | `https://solr.peviitor.ro/solr/job` | `SOLR_AUTH` |
| SOLR (company core) | `https://solr.peviitor.ro/solr/company` | `SOLR_AUTH` |

## Robots.txt

SOBIS TURISM nu are o pagină publică de cariere. Scraperul folosește API-ul public ANOFM — un serviciu guvernamental, fără restricții.

Pentru analiza completă, vezi [ROBOTS.md](../ROBOTS.md).

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar integrare (necesită ANAF live, SOLR conditional)
npm run test:integration

# Doar E2E (ANOFM API real + ANAF + SOLR)
npm run test:e2e
```

Testele SOLR folosesc `itIfSolr` — se auto-skip dacă variabila `SOLR_AUTH` nu e setată.
