import { jest } from '@jest/globals';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../scraper/index.js');
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('searchANOFM', () => {
    it('should return jobs from ANOFM API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rows: [
            { id: 1001, occupation: 'Java Developer', address_locality_name: 'București > București Sectorul 1' },
            { id: 1002, occupation: 'Frontend Developer', address_locality_name: 'Sibiu' }
          ]
        })
      });

      const jobs = await index.searchANOFM('794572', true);

      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toHaveProperty('url', 'https://mediere.anofm.ro/app/module/mediere/job/1001');
      expect(jobs[0]).toHaveProperty('title', 'Java Developer');
      expect(jobs[0]).toHaveProperty('location');
      expect(jobs[0].location[0]).toBe('București Sectorul 1');
      expect(jobs[0]).toHaveProperty('source', 'ANOFM');
      expect(jobs[1]).toHaveProperty('title', 'Frontend Developer');
      expect(jobs[1].location[0]).toBe('Sibiu');
    });

    it('should return empty array when no jobs found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [] })
      });

      const jobs = await index.searchANOFM('99999999', true);
      expect(jobs).toEqual([]);
    });

    it('should handle API error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const jobs = await index.searchANOFM('794572', true);
      expect(jobs).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      const jobs = await index.searchANOFM('794572', true);
      expect(jobs).toEqual([]);
    });

    it('should handle empty locality name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rows: [
            { id: 1003, occupation: 'Tester', address_locality_name: '' }
          ]
        })
      });

      const jobs = await index.searchANOFM('794572', true);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].location).toBeUndefined();
    });

    it('should paginate when more than 250 jobs', async () => {
      const row250 = Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        occupation: `Job ${i + 1}`,
        address_locality_name: 'Sibiu'
      }));

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ rows: row250 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ rows: [{ id: 251, occupation: 'Job 251', address_locality_name: 'Sibiu' }] })
        });

      const jobs = await index.searchANOFM('794572', false);
      expect(jobs).toHaveLength(251);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://mediere.anofm.ro/app/module/mediere/job/1001',
        title: 'Senior Developer',
        location: ['Sibiu'],
        tags: ['Java', 'Spring'],
        workmode: 'hybrid'
      };

      const COMPANY_NAME = 'SC TRANSILVANIA HOLIDAY TRAVELS SRL';
      const COMPANY_CIF = '794572';

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.tags).toEqual(rawJob.tags);
      expect(result.workmode).toBe(rawJob.workmode);
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://mediere.anofm.ro/app/module/mediere/job/1001',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '794572');

      expect(result.location).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.workmode).toBeUndefined();
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://mediere.anofm.ro/app/module/mediere/job/1001' };

      const result = index.mapToJobModel(rawJob, '794572');

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://mediere.anofm.ro/app/module/mediere/job/1001');
    });

    it('should handle empty location array', () => {
      const rawJob = {
        url: 'https://mediere.anofm.ro/app/module/mediere/job/1001',
        title: 'Job 1',
        location: []
      };

      const result = index.mapToJobModel(rawJob, '794572');
      expect(result.location).toBeUndefined();
    });
  });

  describe('transformJobsForSOLR', () => {
    it('should filter locations to only Romanian cities', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: ['România'] },
          { url: 'https://test.com/2', title: 'Job 2', location: ['Bucharest'] },
          { url: 'https://test.com/3', title: 'Job 3', location: ['Bulgaria'] },
          { url: 'https://test.com/4', title: 'Job 4', location: ['Cluj-Napoca'] },
          { url: 'https://test.com/5', title: 'Job 5', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['România']);
      expect(result.jobs[1].location).toEqual(['Bucharest']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[4].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'anofm.ro',
        company: 'sc transilvania holiday travels srl',
        cif: '794572',
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', company: 'sobis turism', cif: '794572' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('SC TRANSILVANIA HOLIDAY TRAVELS SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', workmode: 'Remote' },
          { url: 'https://test.com/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://test.com/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://test.com/4', title: 'Job 4', workmode: 'hybrid' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('hybrid');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });

    it('should default to România when location is empty', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);
      expect(result.jobs[0].location).toEqual(['România']);
    });

    it('should keep Sibiu as valid Romanian location', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: ['Sibiu'] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);
      expect(result.jobs[0].location).toEqual(['Sibiu']);
    });
  });
});
