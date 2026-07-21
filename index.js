/**
 * SOBIS TURISM Job Scraper - Main Entry Point
 * 
 * PURPOSE: Scrapes job listings from ANOFM (Agentia Nationala pentru Ocuparea
 * Fortei de Munca) for SC TRANSILVANIA HOLIDAY TRAVELS SRL and stores them in Solr.
 * SOBIS TURISM has no public careers page — ANOFM API is the primary source.
 */

import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs, upsertCompany } from "./solr.js";
import { generateJobsMarkdown } from "./src/markdown-generator.js";
import companyConfig from "./config/company.js";

// ============================================================================
// CONFIGURATION CONSTANTS — derived from config/company.json
// ============================================================================

const COMPANY_CIF = companyConfig.cif;

// Request timeout in milliseconds (10 seconds, per INSTRUCTIONS.md)
const TIMEOUT = 10000;

// Global variable to store company name after validation
let COMPANY_NAME = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Promise-based sleep function to introduce delays between requests
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// API FUNCTIONS - Fetching data from ANOFM
// ============================================================================

/**
 * Searches ANOFM for job listings belonging to the given company CIF.
 * Uses the public ANOFM API with pagination support.
 * @param {string} cif - Company CIF
 * @param {boolean} testOnlyOnePage - If true, limits to first page only (for testing)
 * @returns {Promise<Array>} - Array of job objects { url, title, location, source }
 */
async function searchANOFM(cif, testOnlyOnePage = false) {
  const jobs = [];
  let current = 1;
  const rowCount = 250;
  let hasMore = true;

  try {
    while (hasMore) {
      console.log(`Fetching ANOFM page ${current} for CIF: ${cif}`);
      const payload = {
        current,
        rowCount,
        sort: { created_at: "desc" },
        employer_tax_code: cif
      };
      const res = await fetch("https://mediere.anofm.ro/api/entity/vw_public_job_posting", {
        method: "POST",
        timeout: TIMEOUT,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "job_seeker_ro_spider"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.log(`  ANOFM returned ${res.status}`);
        break;
      }
      const data = await res.json();
      const rows = data.rows || [];
      for (const row of rows) {
        const locationParts = (row.address_locality_name || '').split('>').map(s => s.trim());
        const location = locationParts.length > 1 ? locationParts[locationParts.length - 1] : locationParts[0];
        jobs.push({
          url: `https://mediere.anofm.ro/app/module/mediere/job/${row.id}`,
          title: row.occupation,
          location: location ? [location] : undefined,
          source: "ANOFM"
        });
      }
      console.log(`  Fetched ${rows.length} jobs (total so far: ${jobs.length})`);

      if (rows.length < rowCount || testOnlyOnePage) {
        hasMore = false;
      } else {
        current++;
        await sleep(500);
      }
    }
    console.log(`Found ${jobs.length} jobs on ANOFM`);
  } catch (err) {
    console.log(`  ANOFM error: ${err.message}`);
  }
  return jobs;
}

// ============================================================================
// DATA TRANSFORMATION - Preparing jobs for Solr storage
// ============================================================================

/**
 * Maps raw job data to Solr-compatible job model with timestamps and status
 * @param {Object} rawJob - Job object from scraper
 * @param {string} cif - Company identifier
 * @param {string} companyName - Company name
 * @returns {Object} - Job object ready for Solr storage
 */
function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME || companyConfig.legalName) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: rawJob.title,
    company: companyName,
    cif: cif,
    location: rawJob.location?.length ? rawJob.location : undefined,
    tags: rawJob.tags?.length ? rawJob.tags : undefined,
    workmode: rawJob.workmode || undefined,
    date: now,
    status: "scraped"
  };

  // Remove undefined fields to keep payload clean
  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

/**
 * Transforms jobs to match Solr schema and filters for Romanian locations
 * @param {Object} payload - Job payload with jobs array
 * @returns {Object} - Transformed payload ready for Solr
 */
function transformJobsForSOLR(payload) {
  // List of Romanian cities for location validation
  const romanianCities = [
    'Bucharest', 'București', 'Cluj-Napoca', 'Cluj Napoca',
    'Timișoara', 'Timisoara', 'Iași', 'Iasi', 'Brașov', 'Brasov',
    'Constanța', 'Constanta', 'Craiova', 'Bacău', 'Sibiu',
    'Târgu Mureș', 'Targu Mures', 'Oradea', 'Baia Mare', 'Satu Mare',
    'Ploiești', 'Ploiesti', 'Pitești', 'Pitesti', 'Arad', 'Galați', 'Galati',
    'Brăila', 'Braila', 'Drobeta-Turnu Severin', 'Râmnicu Vâlcea', 'Ramnicu Valcea',
    'Buzău', 'Buzau', 'Botoșani', 'Botosani', 'Zalău', 'Zalau', 'Hunedoara', 'Deva',
    'Suceava', 'Bistrița', 'Bistrita', 'Tulcea', 'Călărași', 'Calarasi',
    'Giurgiu', 'Alba Iulia', 'Slatina', 'Piatra Neamț', 'Piatra Neamt', 'Roman',
    'Dumbrăvița', 'Dumbravita', 'Voluntari', 'Popești-Leordeni', 'Popesti-Leordeni',
    'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni'
  ];

  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(),
    jobs: payload.jobs.map(job => {
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'],
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

// ============================================================================
// MAIN ORCHESTRATION - Coordinates the entire scraping workflow
// ============================================================================

/**
 * Main function that orchestrates the complete scraping workflow:
 * 1. Check existing jobs in Solr
 * 2. Validate company via ANAF
 * 3. Scrape jobs from ANOFM API
 * 4. Transform data for Solr
 * 5. Upsert jobs to Solr
 * 6. Report summary
 */
async function main() {
  const testOnlyOnePage = process.argv.includes("--test");

  try {
    fs.mkdirSync("tmp", { recursive: true });

    // Step 1: Get count of existing jobs in Solr
    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    // Step 2: Validate company data via ANAF
    console.log("=== Step 2: Validate company via ANAF ===");
    const { status, company, cif, address } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;

    // If company is inactive, jobs were already deleted by company.js — STOP
    if (status === "inactive") {
      console.log("\n⛔ Company is INACTIVE in ANAF — scraper stopping (no jobs to scrape)");
      return;
    }

    // Upsert company to SOLR company core
    try {
      await upsertCompany({
        id: cif,
        company,
        group: companyConfig.group,
        brand: companyConfig.brand,
        status: "activ",
        location: address ? [address] : [companyConfig.defaultLocation],
        website: [companyConfig.website],
        lastScraped: new Date().toISOString().split('T')[0],
        scraperFile: companyConfig.scraperFile
      });
    } catch (err) {
      console.log(`Note: Could not upsert company to SOLR core: ${err.message}`);
    }

    // Step 3: Scrape all jobs from ANOFM
    console.log("=== Step 3: Scrape jobs from ANOFM ===");
    const rawJobs = await searchANOFM(localCif, testOnlyOnePage);
    const scrapedCount = rawJobs.length;
    console.log(`📊 Jobs scraped from ANOFM: ${scrapedCount}`);

    if (scrapedCount === 0) {
      console.log("⚠️ No jobs found on ANOFM for this company");
    }

    // Step 4: Map raw jobs to Solr model
    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    const payload = {
      source: "anofm.ro",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    // Step 5: Transform jobs (filter locations, normalize values)
    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`📊 Jobs with valid Romanian locations: ${validCount}`);

    // Save transformed jobs to file
    fs.writeFileSync("tmp/jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved tmp/jobs.json");

    // Generate and save docs/jobs.md
    const companyData = {
      id: localCif,
      company: transformedPayload.company,
      group: companyConfig.group,
      brand: companyConfig.brand,
      status: "activ",
      location: address ? [address] : [companyConfig.defaultLocation],
      website: [companyConfig.website],
      lastScraped: new Date().toISOString().split('T')[0]
    };
    const markdown = generateJobsMarkdown(companyData, transformedPayload.jobs);
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/jobs.md", markdown, "utf-8");
    console.log("Saved docs/jobs.md");

    // Publish company config for GitHub Pages
    fs.writeFileSync("docs/company.json", JSON.stringify(companyConfig, null, 2), "utf-8");
    console.log("Saved docs/company.json");

    // Step 6: Upsert all jobs to Solr
    console.log("\n=== Step 6: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    // Step 7: Verify final count in Solr
    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n📊 === SUMMARY ===`);
    console.log(`📊 Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`📊 Jobs scraped from ANOFM: ${scrapedCount}`);
    console.log(`📊 Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

// Export functions for testing
export { searchANOFM, mapToJobModel, transformJobsForSOLR };

// Run main function when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
