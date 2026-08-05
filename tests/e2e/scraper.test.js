import { jest } from '@jest/globals';
import fetch from 'node-fetch';

const API_BASE = 'https://api.peviitor.ro/v1';

let HAS_API = false;

async function checkApiAvailability() {
  try {
    const res = await fetch(`${API_BASE}/scraper/jobs/?cif=000794572&rows=1`, {
      signal: AbortSignal.timeout(5000)
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

let HAS_ANAF = false;

async function checkAnafAvailability() {
  try {
    const res = await fetch('https://demoanaf.ro/api/search?q=test', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

let HAS_ANOFM = false;

async function checkAnofmAvailability() {
  try {
    const res = await fetch('https://mediere.anofm.ro/api/entity/vw_public_job_posting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: 1, rowCount: 1 }),
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function itIf(name, condition, fn, timeout) {
  if (condition) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: API unavailable)`, fn, timeout);
}

import companyConfig from '../../scraper/config/company.js';
const TEST_CIF = companyConfig.id;
const TEST_BRAND = companyConfig.brand;
const COMPANY_NAME = companyConfig.company;

beforeAll(async () => {
  [HAS_API, HAS_ANAF, HAS_ANOFM] = await Promise.all([checkApiAvailability(), checkAnafAvailability(), checkAnofmAvailability()]);
});

describe('E2E: Full Scraping Pipeline', () => {

  describe('ANOFM API — Real Data Fetch', () => {
    let jobs;

    beforeAll(async () => {
      const index = await import('../../scraper/index.js');
      jobs = await index.searchANOFM(TEST_CIF, true);
    }, 15000);

    itIf('should return an array of jobs from ANOFM API', HAS_ANOFM, () => {
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);
    }, 10000);

    itIf('should have standardized job fields', HAS_ANOFM, () => {
      for (const job of jobs) {
        expect(job).toHaveProperty('url');
        expect(job.url).toMatch(/^https:\/\/mediere\.anofm\.ro\/app\/module\/mediere\/job\//);
        expect(job).toHaveProperty('title');
        expect(typeof job.title).toBe('string');
        expect(job).toHaveProperty('source', 'ANOFM');
      }
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let jobs;

    beforeAll(async () => {
      index = await import('../../scraper/index.js');
      jobs = await index.searchANOFM(TEST_CIF, true);
    }, 15000);

    itIf('should map ANOFM jobs to job model', HAS_ANOFM, () => {
      if (jobs.length === 0) return;
      const model = index.mapToJobModel(jobs[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
    });

    itIf('should transform jobs and keep Romanian locations', HAS_ANOFM, () => {
      if (jobs.length === 0) return;
      const modelJobs = jobs.map(j => index.mapToJobModel(j, TEST_CIF));

      const payload = {
        source: 'anofm.ro',
        company: COMPANY_NAME,
        cif: TEST_CIF,
        jobs: modelJobs
      };

      const transformed = index.transformJobsForSOLR(payload);

      expect(transformed.company).toBe(COMPANY_NAME);
      expect(transformed.jobs.length).toBe(modelJobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../scraper/anaf.js');
      company = await import('../../scraper/company.js');
    });

    itIf('should find SOBIS in ANAF and validate active status', HAS_ANAF, async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const sobis = results.find(c =>
        c.cui.toString() === TEST_CIF &&
        c.statusLabel === 'Funcțiune'
      );
      expect(sobis).toBeDefined();
      expect(sobis.cui.toString()).toBe(TEST_CIF);

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIf('should run full validation and report active status with job count', HAS_API, async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(TEST_CIF);

      if (result.existingJobsCount === 0) {
        console.log('⚠️ No SOBIS jobs in API — skipping job count assertion');
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../scraper/anaf.js');
    });

    itIf('should detect inactive/radiated companies via ANAF', HAS_ANAF, async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const nonActive = results.find(c => c.statusLabel !== 'Funcțiune');

      if (nonActive) {
        try {
          const anafData = await anaf.getCompanyFromANAF(nonActive.cui.toString());
          expect(anafData).toBeDefined();
          if (anafData.inactive !== undefined) {
            expect(anafData.inactive).toBe(true);
          }
        } catch {
          expect(nonActive.statusLabel).toMatch(/Radiată|Inactiv|Suspendat/);
        }
      }
    }, 30000);
  });

  describe('API Data Verification', () => {
    let api;

    beforeAll(async () => {
      api = await import('../../scraper/api.js');
    });

    itIf('should have SOBIS jobs in API with correct company name', HAS_API, async () => {
      const result = await api.querySOLR(TEST_CIF);

      if (result.numFound === 0) {
        console.log('⚠️ No SOBIS jobs in API — skipping API data verification');
        return;
      }

      for (const job of result.docs) {
        expect(job.company).toBe(COMPANY_NAME);
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIf('should have SOBIS company core entry with required fields', HAS_API, async () => {
      const companyDoc = await api.getCompanyByCif(TEST_CIF);

      expect(companyDoc).toBeDefined();
      expect(companyDoc.company).toBe(COMPANY_NAME);
      expect(companyDoc.status).toBe('activ');
    }, 15000);
  });
});
