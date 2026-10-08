import TOML from '@iarna/toml';

export interface Sep1Record {
  [key: string]: unknown;
}

export interface Sep1Options {
  /** A domain name, with or without an https:// prefix. */
  domain: string;
  /** Optional fetch implementation for testing or custom runtimes. */
  fetcher?: typeof fetch;
}

const MAX_STELLAR_TOML_BYTES = 100 * 1024;
const HTTPS_ENDPOINT_FIELDS = [
  'FEDERATION_SERVER',
  'AUTH_SERVER',
  'TRANSFER_SERVER',
  'TRANSFER_SERVER_SEP0024',
  'KYC_SERVER',
  'WEB_AUTH_ENDPOINT',
  'WEB_AUTH_FOR_CONTRACTS_ENDPOINT',
  'DIRECT_PAYMENT_SERVER',
  'ANCHOR_QUOTE_SERVER'
] as const;

/**
 * Retrieve and parse a domain's SEP-1 stellar.toml file.
 *
 * The request is made to https://<domain>/.well-known/stellar.toml.
 */
export async function fetchStellarToml(options: Sep1Options): Promise<Sep1Record> {
  const url = getStellarTomlUrl(options.domain);
  const response = await (options.fetcher ?? fetch)(url);

  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with HTTP ${response.status}`);
  }

  const source = await readLimitedText(response);
  return parseStellarToml(source);
}

/**
 * Parse TOML text into a Stellar TOML record.
 * This parses TOML syntax; it does not by itself establish SEP-1 conformance.
 */
export function parseStellarToml(source: string): Sep1Record {
  if (Buffer.byteLength(source, 'utf8') > MAX_STELLAR_TOML_BYTES) {
    throw new Error(`Stellar TOML exceeds the ${MAX_STELLAR_TOML_BYTES}-byte SEP-1 limit`);
  }

  const value: unknown = TOML.parse(source);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stellar TOML must contain a TOML table at the root');
  }
  return value as Sep1Record;
}

/**
 * Check common SEP-1 field types and HTTPS endpoints.
 * This is a baseline sanity check, not a complete SEP-1 conformance validator.
 */
export function validateStellarToml(record: Sep1Record): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof record.VERSION !== 'string' || record.VERSION.trim() === '') {
    errors.push('VERSION must be a non-empty string');
  }

  for (const field of HTTPS_ENDPOINT_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;

    if (typeof value !== 'string' || !isHttpsUrl(value)) {
      errors.push(`${field} must be a valid HTTPS URL`);
    }
  }

  if (record.DOCUMENTATION !== undefined) {
    if (
      typeof record.DOCUMENTATION !== 'object' ||
      record.DOCUMENTATION === null ||
      Array.isArray(record.DOCUMENTATION)
    ) {
      errors.push('DOCUMENTATION must be a TOML table');
    } else {
      const documentation = record.DOCUMENTATION as Record<string, unknown>;
      for (const field of ['ORG_NAME', 'ORG_URL'] as const) {
        const value = documentation[field];
        if (value !== undefined && typeof value !== 'string') {
          errors.push(`DOCUMENTATION.${field} must be a string`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function getStellarTomlUrl(domain: string): string {
  let url: URL;
  try {
    url = new URL(domain.includes('://') ? domain : `https://${domain}`);
  } catch {
    throw new TypeError('domain must be a valid hostname or HTTPS URL');
  }

  if (url.protocol !== 'https:') {
    throw new TypeError('domain must be a valid hostname or HTTPS URL');
  }

  if (
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new TypeError('domain must be a hostname or HTTPS origin without a path');
  }

  url.pathname = '/.well-known/stellar.toml';
  return url.toString();
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > MAX_STELLAR_TOML_BYTES) {
      await reader.cancel();
      throw new Error(`Stellar TOML exceeds the ${MAX_STELLAR_TOML_BYTES}-byte SEP-1 limit`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}
