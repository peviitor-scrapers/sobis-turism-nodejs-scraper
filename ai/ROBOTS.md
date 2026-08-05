# Robots.txt Analysis — www.sobisturism.ro

Sursa: https://sobisturism.ro/robots.txt

## Reguli

```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: https://sobisturism.ro/sitemap_index.xml
```

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `/` (restul site-ului) | ✅ Allowed | Paginile publice ale site-ului |
| `/wp-admin/` | ❌ Disallowed | Panoul de administrare WordPress — nu ne interesează |

## Recomandare

robots.txt NU este legal binding, dar reprezintă intenția proprietarului site-ului.

- SOBIS TURISM **nu are o pagină publică de cariere** — verificat pe `https://www.sobisturism.ro` (site-ul răspunde cu 200, dar nu conține link-uri către o secțiune de job-uri/cariere).
- Sursa unică de job-uri este **API-ul public ANOFM** (`https://mediere.anofm.ro/api/entity/vw_public_job_posting`), interogat cu POST după CIF-ul companiei — API guvernamental public, fără restricții robots.txt.
- Scraperul nu face scraping pe site-ul sobisturism.ro — nu încalcă nicio regulă robots.txt.
- API-ul ANOFM este interogat cu paginare secvențială și delay de 500 ms între pagini — comportament rezonabil, nu agresiv.

**Concluzie**: Risc minim. Singura sursă (ANOFM) este un API public fără restricții, iar scraperul e politicos (User-Agent standard `job_seeker_ro_spider`, cereri secvențiale cu delay).
