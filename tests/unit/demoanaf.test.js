import { jest } from '@jest/globals';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

function anafSearchResponse(results) {
  return {
    ok: true,
    json: async () => ({ data: results, success: true })
  };
}

function anafCompanyResponse(data) {
  return {
    ok: true,
    json: async () => ({ data, success: true })
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    text: async () => 'Error'
  };
}

function cuiscanCompanyResponse(data) {
  return {
    ok: true,
    json: async () => data
  };
}

const SOBIS_ANAF_RECORD = {
  cui: 794572,
  name: 'SC TRANSILVANIA HOLIDAY TRAVELS SRL',
  address: 'Sibiu',
  caenCode: '7911',
  inactive: false,
  registrationNumber: 'J32/793/1995',
  vatRegistered: true,
  onrcStatusLabel: 'Funcțiune',
  legalForm: 'SRL'
};

const CUISCAN_RECORD = {
  cui: 794572,
  denumire: 'SC TRANSILVANIA HOLIDAY TRAVELS SRL',
  adresa: 'Sibiu',
  codCaen: '7911',
  activ: true,
  nrRegCom: 'J32/793/1995',
  platitorTVA: true,
  stareInregistrare: 'INREGISTRAT din data 10.02.1995',
  adresaSediu: { strada: 'Strada Dorobanților', numar: '48', localitate: 'Sibiu', judet: 'MUNICIPIUL SIBIU', codPostal: '550301' }
};

const CACHED_DATA = {
  cui: 794572,
  name: 'SC TRANSILVANIA HOLIDAY TRAVELS SRL',
  address: 'MUNICIPIUL SIBIU, SECTOR 1, BLD IANCU DE HUNEDOARA, NR.48, ET.9',
  registrationNumber: 'J32/793/1995',
  caenCode: '7911',
  inactive: false,
  onrcStatusLabel: 'Funcțiune'
};

describe('scraper/anaf.js', () => {
  let anaf;

  beforeAll(async () => {
    anaf = await import('../../scraper/anaf.js');
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('searchCompany', () => {
    it('should return array of companies for valid brand', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([
        { cui: 794572, name: 'SC TRANSILVANIA HOLIDAY TRAVELS SRL', statusLabel: 'Funcțiune' }
      ]));

      const results = await anaf.searchCompany('SOBIS');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('cui');
      expect(results[0]).toHaveProperty('name');
    });

    it('should return empty array for non-existent brand', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([]));

      const results = await anaf.searchCompany('NonExistentBrandXYZ123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should include statusLabel in results', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([
        { cui: 794572, name: 'SC TRANSILVANIA HOLIDAY TRAVELS SRL', statusLabel: 'Funcțiune' }
      ]));

      const results = await anaf.searchCompany('SOBIS');

      expect(results[0]).toHaveProperty('statusLabel', 'Funcțiune');
    });

    it('should fallback to CUIFirma when ANAF search fails', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ cui: 794572, name: 'SC TRANSILVANIA HOLIDAY TRAVELS SRL', is_active: true }] }) });

      const results = await anaf.searchCompany('SOBIS');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].cui).toBe('794572');
    });

    it('should encode brand name in URL', async () => {
      let capturedUrl;
      mockFetch.mockImplementation((url) => {
        capturedUrl = url;
        return Promise.resolve(anafSearchResponse([]));
      });

      await anaf.searchCompany('SOBIS SRL');
      expect(capturedUrl).toContain(encodeURIComponent('SOBIS SRL'));
    });
  });

  describe('getCompanyFromANAF', () => {
    it('should return company data for valid CIF', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(SOBIS_ANAF_RECORD));

      const data = await anaf.getCompanyFromANAF('794572');

      expect(data).toBeDefined();
      expect(data.cui).toBe(794572);
      expect(data.name).toBe('SC TRANSILVANIA HOLIDAY TRAVELS SRL');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('registrationNumber');
    });

    it('should fallback to CUIScan when ANAF fails', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(cuiscanCompanyResponse(CUISCAN_RECORD));

      const data = await anaf.getCompanyFromANAF('794572');

      expect(data).toBeDefined();
      expect(data.cui).toBe(794572);
      expect(data.name).toBe('SC TRANSILVANIA HOLIDAY TRAVELS SRL');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when both ANAF and CUIScan fail', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAF('794572')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API-level error response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false, error: { message: 'Company not found' } })
        })
        .mockResolvedValueOnce(errorResponse(500));

      await expect(anaf.getCompanyFromANAF('00000000')).rejects.toThrow();
    });

    it('should return null when data is null', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(null));

      const data = await anaf.getCompanyFromANAF('794572');
      expect(data).toBeNull();
    });
  });

  describe('getCompanyFromANAFWithFallback', () => {
    it('should return fresh data when API works', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(SOBIS_ANAF_RECORD));

      const data = await anaf.getCompanyFromANAFWithFallback('794572');

      expect(data.name).toBe('SC TRANSILVANIA HOLIDAY TRAVELS SRL');
    });

    it('should use cached data when API fails', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      const data = await anaf.getCompanyFromANAFWithFallback('794572', CACHED_DATA);

      expect(data).toEqual(CACHED_DATA);
    });

    it('should throw when API fails and no cache available', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAFWithFallback('794572')).rejects.toThrow();
    });
  });
});
