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
// Structural only: the validator checks the `C...` shape, not the StrKey checksum.
const VALID_CONTRACT = `C${'A'.repeat(55)}`;

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

    it('accepts a fully specified Stellar-asset currency', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        SIGNING_KEY: VALID_ACCOUNT,
        ACCOUNTS: [VALID_ACCOUNT],
        CURRENCIES: [
          {
            code: 'USDC',
            issuer: VALID_ACCOUNT,
            status: 'live',
            display_decimals: 2,
            name: 'USD Coin',
            desc: 'USD Coin on Stellar',
            conditions: 'Redeemable one for one for USD',
            image: 'https://anchor.example/usdc.png',
            is_asset_anchored: true,
            anchor_asset_type: 'fiat',
            anchor_asset: 'USD',
            attestation_of_reserve: 'https://anchor.example/reserve.pdf',
            redemption_instructions: 'Deposit with SEP-6',
            collateral_addresses: ['0xabc'],
            collateral_address_messages: ['reserved to back USDC'],
            collateral_address_signatures: ['c2lnbmF0dXJl'],
            regulated: false,
            approval_server: 'https://anchor.example/approve',
            approval_criteria: 'KYC required',
            fixed_number: 10000
          }
        ]
      });

      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts a contract-token currency', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'AQUA', contract: VALID_CONTRACT, display_decimals: 7, status: 'private' }
        ]
      });

      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('accepts a currency that only links to its own TOML file', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [{ toml: 'https://anchor.example/.well-known/AQUA.toml' }]
      });

      expect(result.issues).toEqual([]);
    });

    it('flags a linked currency that sets other fields', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [{ toml: 'https://anchor.example/AQUA.toml', code: 'AQUA' }]
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'CURRENCIES[0].toml should be the only field of a currency that links to a separate TOML file'
      );
    });

    it('requires CURRENCIES to be an array of TOML tables', () => {
      const notAnArray = validateStellarToml({ VERSION: '2.7.0', CURRENCIES: 'USD' });
      expect(notAnArray.errors).toContain('CURRENCIES must be an array of tables');

      const notATable = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [{ code: 'USD', issuer: VALID_ACCOUNT }, 'USD']
      });
      expect(notATable.errors).toContain('CURRENCIES[1] must be a TOML table');
    });

    it('requires a currency identity field', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [{ code: 'USD' }]
      });

      expect(result.errors).toContain(
        'CURRENCIES[0] must set issuer for a Stellar asset or contract for a token contract'
      );
    });

    it('rejects a currency that sets both issuer and contract', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [{ code: 'USD', issuer: VALID_ACCOUNT, contract: VALID_CONTRACT }]
      });

      expect(result.errors).toContain('CURRENCIES[0] must set either issuer or contract, not both');
    });

    it('rejects malformed issuer and contract identifiers', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'USD', issuer: 'GNOTAREALACCOUNT' },
          { code: 'AQUA', contract: 'not-a-contract' },
          { code: 'AQUA', contract: VALID_ACCOUNT }
        ]
      });

      expect(result.errors).toContain('CURRENCIES[0].issuer must be a Stellar public key (G...)');
      expect(result.errors).toContain('CURRENCIES[1].contract must be a Stellar contract ID (C...)');
      expect(result.errors).toContain('CURRENCIES[2].contract must be a Stellar contract ID (C...)');
    });

    it('checks code and code_template bounds', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'TOOLONGCODE12', issuer: VALID_ACCOUNT },
          { issuer: VALID_ACCOUNT },
          { code_template: 'CORN?????????', issuer: VALID_ACCOUNT },
          { code_template: 'CORN????????', issuer: VALID_ACCOUNT }
        ]
      });

      expect(result.errors).toContain('CURRENCIES[0].code must be at most 12 characters');
      expect(result.errors).toContain('CURRENCIES[1].code is required and must be 1-12 characters');
      expect(result.errors).toContain('CURRENCIES[2].code_template must be at most 12 characters');
      expect(result.errors.some((error) => error.startsWith('CURRENCIES[3]'))).toBe(false);
    });

    it('rejects non-alphanumeric asset codes but only warns for contract tokens', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'US-D', issuer: VALID_ACCOUNT },
          { code: 'US-D', contract: VALID_CONTRACT }
        ]
      });

      expect(result.errors).toContain('CURRENCIES[0].code should contain only letters and digits');
      expect(result.warnings).toContain('CURRENCIES[1].code should contain only letters and digits');
    });

    it('checks display_decimals range and name length', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'USD', issuer: VALID_ACCOUNT, display_decimals: 8 },
          { code: 'USD', issuer: VALID_ACCOUNT, display_decimals: -1 },
          { code: 'USD', issuer: VALID_ACCOUNT, display_decimals: 2.5 },
          { code: 'USD', issuer: VALID_ACCOUNT, display_decimals: 7 },
          { code: 'USD', issuer: VALID_ACCOUNT, name: 'x'.repeat(21) }
        ]
      });

      expect(result.errors).toContain('CURRENCIES[0].display_decimals must be an integer from 0 to 7');
      expect(result.errors).toContain('CURRENCIES[1].display_decimals must be an integer from 0 to 7');
      expect(result.errors).toContain('CURRENCIES[2].display_decimals must be an integer from 0 to 7');
      expect(result.errors).toContain('CURRENCIES[4].name must be at most 20 characters');
      expect(result.errors.some((error) => error.startsWith('CURRENCIES[3]'))).toBe(false);
    });

    it('checks boolean, integer, and URL currency fields', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          {
            code: 'USD',
            issuer: VALID_ACCOUNT,
            is_asset_anchored: 'true',
            regulated: 1,
            is_unlimited: 'yes',
            fixed_number: 'many',
            max_number: -5,
            image: 'not-a-url',
            approval_server: 'ftp://anchor.example/approve',
            attestation_of_reserve: 42,
            toml: 'not-a-url'
          }
        ]
      });

      expect(result.errors).toEqual(
        expect.arrayContaining([
          'CURRENCIES[0].is_asset_anchored must be a boolean',
          'CURRENCIES[0].regulated must be a boolean',
          'CURRENCIES[0].is_unlimited must be a boolean',
          'CURRENCIES[0].fixed_number must be a non-negative integer',
          'CURRENCIES[0].max_number must be a non-negative integer',
          'CURRENCIES[0].image must be a valid http(s) URL',
          'CURRENCIES[0].approval_server must be a valid http(s) URL',
          'CURRENCIES[0].attestation_of_reserve must be a valid http(s) URL',
          'CURRENCIES[0].toml must be a valid http(s) URL'
        ])
      );
    });

    it('checks collateral address lists', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          {
            code: 'BTC',
            issuer: VALID_ACCOUNT,
            collateral_addresses: ['addr'],
            collateral_address_signatures: []
          },
          { code: 'BTC', issuer: VALID_ACCOUNT, collateral_addresses: 'addr' },
          { code: 'BTC', issuer: VALID_ACCOUNT, collateral_addresses: ['addr', 42] }
        ]
      });

      expect(result.errors).toContain('CURRENCIES[1].collateral_addresses must be an array of strings');
      expect(result.errors).toContain('CURRENCIES[2].collateral_addresses[1] must be a string');
      expect(result.warnings).toContain(
        'CURRENCIES[0].collateral_address_signatures should contain one entry per collateral address'
      );
    });

    it('warns when a currency sets more than one issuance policy', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'GOAT', issuer: VALID_ACCOUNT, fixed_number: 10000, is_unlimited: true }
        ]
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'CURRENCIES[0] should set at most one of fixed_number, max_number, is_unlimited'
      );
    });

    it('accepts every documented status and anchor_asset_type value', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          {
            code: 'HOUSE',
            issuer: VALID_ACCOUNT,
            status: 'private',
            anchor_asset_type: 'realestate'
          },
          { code: 'ART', issuer: VALID_ACCOUNT, anchor_asset_type: 'nft' },
          { code: 'MISC', issuer: VALID_ACCOUNT, anchor_asset_type: 'other' }
        ]
      });

      expect(result.issues).toEqual([]);
    });

    it('warns about unknown enum values without rejecting the entry', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'USD', issuer: VALID_ACCOUNT, status: 'paused', anchor_asset_type: 'fiat2' }
        ]
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('CURRENCIES[0].status should be one of live, dead, test, private');
      expect(result.warnings).toContain(
        'CURRENCIES[0].anchor_asset_type should be one of fiat, crypto, nft, stock, bond, commodity, realestate, other'
      );
    });

    it('ignores unknown currency fields', () => {
      const result = validateStellarToml({
        VERSION: '2.7.0',
        CURRENCIES: [
          { code: 'USD', issuer: VALID_ACCOUNT, colour: 'blue', metadata: { sector: 'tech' } }
        ]
      });

      expect(result.issues).toEqual([]);
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
