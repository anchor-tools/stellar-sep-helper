import {
  fetchStellarToml,
  getStellarTomlUrl,
  parseStellarToml,
  validateStellarToml
} from '../sep1';
import { formatReport } from '../report';
import { isEd25519PublicKey, isMuxedAccountId, isStellarAccountId } from '../strkey';
import { UsageError, parseCliArgs } from '../cli';

const VALID_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function mockFetcher(response: Response) {
  return jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response);
}

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
      const fetcher = mockFetcher(new Response('VERSION = "2.7.0"', { status: 200 }));

      await expect(fetchStellarToml({ domain: 'example.com', fetcher })).resolves.toEqual({
        VERSION: '2.7.0'
      });
      expect(fetcher).toHaveBeenCalledWith('https://example.com/.well-known/stellar.toml');
    });

    it('passes an abort signal when a timeout is configured', async () => {
      const fetcher = mockFetcher(new Response('VERSION = "2.7.0"', { status: 200 }));

      await fetchStellarToml({ domain: 'example.com', fetcher, timeoutMs: 500 });

      expect(fetcher).toHaveBeenCalledWith(
        'https://example.com/.well-known/stellar.toml',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    it('rejects an invalid timeout', async () => {
      await expect(
        fetchStellarToml({ domain: 'example.com', timeoutMs: -1 })
      ).rejects.toThrow('timeoutMs must be a non-negative number');
    });

    it('rejects HTTP errors', async () => {
      const fetcher = mockFetcher(new Response('', { status: 404 }));

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
      const fetcher = mockFetcher(
        new Response(`VERSION = "${'x'.repeat(100 * 1024)}"`, { status: 200 })
      );

      await expect(fetchStellarToml({ domain: 'example.com', fetcher })).rejects.toThrow(
        'SEP-1 limit'
      );
    });
  });

  describe('getStellarTomlUrl', () => {
    it('normalizes bare domains and trailing slashes', () => {
      expect(getStellarTomlUrl('example.com')).toBe(
        'https://example.com/.well-known/stellar.toml'
      );
      expect(getStellarTomlUrl('HTTPS://Example.COM/')).toBe(
        'https://example.com/.well-known/stellar.toml'
      );
    });

    it('rejects insecure schemes, paths, credentials, and query strings', () => {
      expect(() => getStellarTomlUrl('ftp://example.com')).toThrow(TypeError);
      expect(() => getStellarTomlUrl('https://example.com/docs')).toThrow('without a path');
      expect(() => getStellarTomlUrl('https://user:secret@example.com')).toThrow(TypeError);
      expect(() => getStellarTomlUrl('https://example.com/?a=1')).toThrow(TypeError);
    });
  });

  describe('validateStellarToml', () => {
    it('accepts a record with a version and valid endpoint', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        KYC_SERVER: 'https://anchor.example/kyc',
        DOCUMENTATION: { ORG_NAME: 'Example', ORG_URL: 'https://example.com' }
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
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

    it('flags warnings separately from errors', () => {
      const result = validateStellarToml({ VERSION: '2.7', timestamp: 'now' });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          'VERSION should be a semantic version string such as 2.7.0',
          'timestamp should be an uppercase SEP-1 field name'
        ])
      );
    });

    it('validates signing keys and account lists', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        SIGNING_KEY: 'GNOTAREALACCOUNT',
        ACCOUNTS: [VALID_ACCOUNT, 'GNOTAREALACCOUNT']
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SIGNING_KEY must be a Stellar ed25519 public key');
      expect(result.errors).toContain('ACCOUNTS[1] must be a Stellar account ID');
      expect(result.errors).not.toContain('ACCOUNTS[0] must be a Stellar account ID');
    });

    it('checks currency entries', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'USD', issuer: VALID_ACCOUNT, status: 'live', anchor_asset_type: 'fiat' },
          { code: 'TOO-LONG-CODE', issuer: 'nope', status: 'paused' },
          { issuer: VALID_ACCOUNT }
        ]
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CURRENCIES[1].code must be 1-12 alphanumeric characters');
      expect(result.errors).toContain('CURRENCIES[1].issuer must be a Stellar account ID');
      expect(result.errors).toContain('CURRENCIES[2].code is required and must be a string');
      expect(result.warnings).toContain(
        'CURRENCIES[1].status should be one of live, dead, test'
      );
    });

    it('requires a currency issuer or contract', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [{ code: 'USD' }]
      });

      expect(result.errors).toContain('CURRENCIES[0] must set issuer or contract');
    });

    it('accepts a fully specified currency', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        SIGNING_KEY: VALID_ACCOUNT,
        ACCOUNTS: [VALID_ACCOUNT],
        CURRENCIES: [
          {
            code: 'USDC',
            issuer: VALID_ACCOUNT,
            status: 'live',
            is_asset_anchored: true,
            anchor_asset_type: 'fiat',
            desc: 'USD Coin'
          }
        ]
      });

      expect(result).toMatchObject({ valid: true, errors: [] });
    });
  });
});

describe('StrKey helpers', () => {
  it('accepts a well-formed ed25519 public key', () => {
    expect(isEd25519PublicKey(VALID_ACCOUNT)).toBe(true);
    expect(isStellarAccountId(VALID_ACCOUNT)).toBe(true);
  });

  it('rejects checksum, version, and alphabet errors', () => {
    expect(isEd25519PublicKey(`${VALID_ACCOUNT.slice(0, -1)}G`)).toBe(false);
    expect(isEd25519PublicKey('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF1')).toBe(
      false
    );
    expect(isEd25519PublicKey(42)).toBe(false);
    expect(isMuxedAccountId(VALID_ACCOUNT)).toBe(false);
  });
});

describe('formatReport', () => {
  it('summarizes the result and lists issues', () => {
    const record = { VERSION: '2.7.0', KYC_SERVER: 'http://anchor.example/kyc' };
    const output = formatReport({
      label: 'anchor.example',
      source: 'https://anchor.example/.well-known/stellar.toml',
      record,
      validation: validateStellarToml(record)
    });

    expect(output).toContain('anchor.example (https://anchor.example/.well-known/stellar.toml)');
    expect(output).toContain('invalid - 1 error, 0 warnings');
    expect(output).toContain('KYC_SERVER must be a valid HTTPS URL');
  });
});

describe('parseCliArgs', () => {
  it('collects domains and flags', () => {
    expect(parseCliArgs(['a.example', 'b.example', '--json', '--strict'])).toMatchObject({
      targets: ['a.example', 'b.example'],
      json: true,
      strict: true,
      timeoutMs: 10_000
    });
  });

  it('supports local files and custom timeouts', () => {
    expect(parseCliArgs(['--file', 'fixture.toml', '--timeout=250'])).toMatchObject({
      file: 'fixture.toml',
      timeoutMs: 250
    });
  });

  it('rejects conflicting or incomplete input', () => {
    expect(() => parseCliArgs(['example.com', '--file', 'x.toml'])).toThrow(UsageError);
    expect(() => parseCliArgs([])).toThrow(UsageError);
    expect(() => parseCliArgs(['--timeout', 'abc', 'example.com'])).toThrow(
      '--timeout must be a positive integer'
    );
    expect(() => parseCliArgs(['--nope'])).toThrow('Unknown option: --nope');
  });
});
