import {
  fetchStellarToml,
  parseStellarToml,
  validateStellarToml
} from '../sep1';

describe('SEP-1 Stellar TOML helpers', () => {
  describe('parseStellarToml', () => {
    it('parses TOML values and tables', () => {
      expect(parseStellarToml('VERSION = "2.7.0"\n[DOCUMENTATION]\nORG_NAME = "Example"')).toEqual({
        VERSION: '2.7.0',
        DOCUMENTATION: { ORG_NAME: 'Example' }
      });
    });

    it('reports malformed TOML', () => {
      expect(() => parseStellarToml('VERSION = [')).toThrow();
    });

    it('rejects input larger than the SEP-1 file limit', () => {
      expect(() => parseStellarToml(`VERSION = "${'x'.repeat(100 * 1024)}"`)).toThrow(
        'SEP-1 limit'
      );
    });
  });

  describe('fetchStellarToml', () => {
    it('fetches the SEP-1 well-known path and parses the response', async () => {
      const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(
        new Response('VERSION = "2.7.0"', { status: 200 })
      );

      await expect(fetchStellarToml({ domain: 'example.com', fetcher })).resolves.toEqual({
        VERSION: '2.7.0'
      });
      expect(fetcher).toHaveBeenCalledWith('https://example.com/.well-known/stellar.toml');
    });

    it('rejects HTTP errors', async () => {
      const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(
        new Response('', { status: 404 })
      );

      await expect(fetchStellarToml({ domain: 'example.com', fetcher })).rejects.toThrow(
        'HTTP 404'
      );
    });

    it('rejects non-HTTPS domains and URLs with paths', async () => {
      await expect(fetchStellarToml({ domain: 'http://example.com' })).rejects.toThrow(
        'hostname or HTTPS URL'
      );
      await expect(fetchStellarToml({ domain: 'https://example.com/path' })).rejects.toThrow(
        'without a path'
      );
    });

    it('rejects files larger than the SEP-1 limit', async () => {
      const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(
        new Response(`VERSION = "${'x'.repeat(100 * 1024)}"`, { status: 200 })
      );

      await expect(fetchStellarToml({ domain: 'example.com', fetcher })).rejects.toThrow(
        'SEP-1 limit'
      );
    });
  });

  describe('validateStellarToml', () => {
    it('accepts a record with a version and valid endpoint', () => {
      expect(
        validateStellarToml({
          VERSION: '2.7.0',
          KYC_SERVER: 'https://anchor.example/kyc',
          DOCUMENTATION: { ORG_NAME: 'Example', ORG_URL: 'https://example.com' }
        })
      ).toEqual({ valid: true, errors: [] });
    });

    it('reports missing versions and invalid endpoint URLs', () => {
      const result = validateStellarToml({
        WEB_AUTH_ENDPOINT: 'http://anchor.example/auth'
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('VERSION must be a non-empty string');
      expect(result.errors).toContain('WEB_AUTH_ENDPOINT must be a valid HTTPS URL');
    });

    it('checks optional documentation table field types', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        DOCUMENTATION: { ORG_NAME: 42 }
      });

      expect(result.errors).toContain('DOCUMENTATION.ORG_NAME must be a string');
    });
  });
});
