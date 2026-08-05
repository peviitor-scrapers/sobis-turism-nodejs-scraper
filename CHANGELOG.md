# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.2] - 2026-08-05

### Added
- Full alignment with the EPAM nodejs template layout: `scraper/`, `tests/{unit,integration,e2e,consistency}`, 5 GitHub Actions workflows, `ai/` guides, `docs/`.
- `scraper/config/company.json` + `scraper/config/scraper.json` as single source of truth for company identity.
- `tests/validate-sobis-turism-jobs.js` — multi-mode validator (`--head`, `--content`, `--browser`, `--timeout`) for ANOFM job URLs.

### Fixed
- `api.js` `upsertJobs([])` now skips the peviitor API call when the job list is empty (previously POSTed `[]` → HTTP 400 when ANOFM returned 0 jobs).
- Integration tests no longer fail when ANAF is unreachable — `company.js` falls back to cached/config data.

## [1.0.0] - 2026-07-21

### Added
- Initial release
- Job scraping from the public ANOFM API (pagination by CIF, `https://mediere.anofm.ro/api/entity/vw_public_job_posting`)
- Company validation via ANAF
- Solr storage via peviitor API
- GitHub Actions workflows for daily scraping and testing
- Comprehensive test suite (unit, integration, E2E)
- ANAF API fallback with cached data support
- Node 24 compatibility

### Features
- Automated daily job scraping
- Company core validation and management
- Job URL validation
- Data integrity checks
- Romanian location filtering
- Work mode normalization

## License

Copyright (c) 2024-2026 BOGA SEBASTIAN-NICOLAE
Licensed under MIT License
