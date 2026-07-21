# Company Model Schema

Source: [peviitor_core](https://github.com/peviitor-ro/peviitor_core)

## Required Fields

| Field   | Type   | Description |
|---------|--------|-------------|
| id      | string | CIF/CUI of the company (e.g. "794572"). Exact CIF/CUI 8 digits, no RO prefix |
| company | string | Exact name for job matching. Legal name from Trade Register. DIACRITICS REQUIRED. Use uppercase |

## Optional Fields

| Field       | Type     | Description |
|-------------|----------|-------------|
| brand       | string   | Commercial brand name (e.g. "SOBIS"). Used for display purposes |
| group       | string   | Parent company group (e.g. "Total Specific Solutions") |
| status      | string   | "activ", "suspendat", "inactiv", or "radiat". If company status is not active, remove jobs; also remove company |
| location    | string[] | Romanian cities/addresses. DIACRITICS ACCEPTED (e.g. "București", "Cluj-Napoca"). Multi-valued, stored as array |
| website     | string[] | Official company website. Must be valid HTTP/HTTPS URL, preferably canonical, without trailing slash (e.g. "https://www.example.ro"). Multi-valued, stored as array |
| career      | string[] | Official company career page. Must be valid HTTP/HTTPS URL, preferably canonical, without trailing slash, pointing to the jobs/careers section (e.g. "https://www.example.ro/careers"). Multi-valued, stored as array |
| lastScraped | string   | Date of last scrape in ISO8601 format (e.g. "2026-02-20"). Used for tracking |
| scraperFile | string   | Name of the scraper file used (e.g. "job-seeker-ro-spider.yml"). Used for reference |

## Notes

- Fields marked `string[]` are multi-valued arrays stored as arrays in SOLR/OpenSearch
- Company status "activ" means jobs should be kept, otherwise remove jobs
- website and career should be canonical URLs **without trailing slash**
