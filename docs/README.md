# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile SOBIS TURISM (SC TRANSILVANIA HOLIDAY TRAVELS SRL) din România.

Extrage anunțurile din API-ul public ANOFM și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul Peviitor.

> **📐 Derived scraper.** Acest repo este derivat din [template-ul EPAM](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper) pentru scraper-ele Node.js din ecosistemul peviitor.ro. Când template-ul se schimbă, actualizările relevante se aplică aici (`automation-template-sync-check.yml` urmărește drift-ul de versiune).

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Ce face

1. **Validează compania** — interoghează API-ul public ANAF ([demoanaf.ro](https://demoanaf.ro)) după CIF-ul SOBIS (794572) și verifică:
   - Denumirea oficială: SC TRANSILVANIA HOLIDAY TRAVELS SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — interoghează API-ul public ANOFM după CIF (`https://mediere.anofm.ro/api/entity/vw_public_job_posting`, paginare + filtrare `employer_tax_code`). SOBIS TURISM nu are o pagină publică de cariere — ANOFM este sursa unică.
4. **Transformă datele** — normalizează locațiile (doar orașe românești), tag-urile (lowercase), workmode-ul (remote/on-site/hybrid)
5. **Stochează în Peviitor** — upsert prin API-ul Peviitor (job-uri și date companie)
6. **Generează jobs.md** — fișier markdown cu informații companie + toate job-urile curente

## API-uri folosite

| API | URL | Autentificare |
|---|---|---|
| ANOFM | `https://mediere.anofm.ro/api/entity/vw_public_job_posting` | Public |
| ANAF (demoanaf) | `https://demoanaf.ro/api/...` | Public |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |

## Robots.txt

SOBIS TURISM nu are o pagină publică de cariere — site-ul `sobisturism.ro` răspunde, dar nu conține o secțiune de job-uri. Scraper-ul folosește doar API-ul public ANOFM (API guvernamental, fără restricții robots.txt), interogat cu paginare secvențială și delay de 500 ms între pagini.

Pentru analiza completă, vezi [ai/ROBOTS.md](../ai/ROBOTS.md).

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar integrare (necesită ANAF live, Peviitor API conditional)
npm run test:integration

# Doar E2E (API real ANOFM + ANAF + Peviitor)
npm run test:e2e
```

Testele Peviitor API folosesc `itIfApi` — se auto-skip dacă API-ul Peviitor nu e disponibil.
