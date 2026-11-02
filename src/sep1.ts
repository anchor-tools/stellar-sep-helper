import TOML from '@iarna/toml';
import { isEd25519PublicKey, isStellarAccountId } from './strkey';

export interface Sep1Record {
  [key: string]: unknown;
}

export interface Sep1Toml extends Sep1Record {
  VERSION?: string;
  NETWORK_PASSPHRASE?: string;
  SIGNING_KEY?: string;
  ACCOUNTS?: string[];
  PRINCIPALS?: string[];
  DOCUMENTATION?: Sep1Documentation;
  CURRENCIES?: Sep1Currency[];
}

/** The subset of `[DOCUMENTATION]` fields defined by SEP-1 that is type-checked here. */
export interface Sep1Documentation {
  ORG_NAME?: string;
  ORG_URL?: string;
  ORG_LOGO?: string;
  ORG_DESCRIPTION?: string;
  ORG_PHYSICAL_ADDRESS?: string;
  ORG_OFFICIAL_EMAIL?: string;
  ORG_SUPPORT_EMAIL?: string;
  ORG_SUPPORT_URL?: string;
  ORG_LICENSE?: string;
  ORG_LICENSE_NUMBER?: string;
}

/** The subset of `[[CURRENCIES]]` fields defined by SEP-1 that is checked here. */
export interface Sep1Currency {
  code?: string;
  issuer?: string;
  contract?: string;
  status?: string;
  is_asset_anchored?: boolean;
  anchor_asset_type?: string;
  anchor_asset?: string;
  desc?: string;
  image?: string;
  redemption_instructions?: string;
  display_decimals?: number;
}

export interface Sep1Options {
  /** A domain name, with or without an https:// prefix. */
  domain: string;
  /** Optional fetch implementation for testing or custom runtimes. */
  fetcher?: typeof fetch;
  /** Abort the request when it takes longer than this many milliseconds. */
  timeoutMs?: number;
}

export interface Sep1Issue {
  severity: 'error' | 'warning';
  /** Stable machine-readable identifier, for example `currencies.issuer`. */
  code: string;
  /** Field path inside the document, for example `CURRENCIES[0].issuer`. */
  path: string;
  message: string;
}

export interface Sep1ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: Sep1Issue[];
}

const MAX_STELLAR_TOML_BYTES = 100 * 1024;
const DEFAULT_TIMEOUT_MS = 0;

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

const DOCUMENTATION_STRING_FIELDS = [
  'ORG_NAME',
  'ORG_URL',
  'ORG_LOGO',
  'ORG_DESCRIPTION',
  'ORG_PHYSICAL_ADDRESS',
  'ORG_OFFICIAL_EMAIL',
  'ORG_SUPPORT_EMAIL',
  'ORG_SUPPORT_URL',
  'ORG_LICENSE',
  'ORG_LICENSE_NUMBER'
] as const;

const DOCUMENTATION_URL_FIELDS = ['ORG_URL', 'ORG_LOGO', 'ORG_SUPPORT_URL'] as const;
const DOCUMENTATION_EMAIL_FIELDS = ['ORG_OFFICIAL_EMAIL', 'ORG_SUPPORT_EMAIL'] as const;

const CURRENCY_STATUSES = ['live', 'dead', 'test'] as const;
const ANCHOR_ASSET_TYPES = ['fiat', 'crypto', 'stock', 'bond', 'commodity'] as const;
const CURRENCY_STRING_FIELDS = [
  'desc',
  'image',
  'anchor_asset',
  'redemption_instructions'
] as const;

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Reporter = (severity: Sep1Issue['severity'], code: string, path: string, message: string) => void;

/**
 * Retrieve and parse a domain's SEP-1 stellar.toml file.
 *
 * The request is made to https://<domain>/.well-known/stellar.toml.
 */
export async function fetchStellarToml(options: Sep1Options): Promise<Sep1Record> {
  const url = getStellarTomlUrl(options.domain);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError('timeoutMs must be a non-negative number');
  }

  const fetcher = options.fetcher ?? fetch;
  const response =
    timeoutMs > 0
      ? await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) })
      : await fetcher(url);

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
  if (!isTable(value)) {
    throw new Error('Stellar TOML must contain a TOML table at the root');
  }
  return value;
}

/**
 * Check a record against the SEP-1 rules this library can verify offline.
 *
 * Every finding is returned as a structured issue. Errors make the result
 * invalid; warnings flag suspicious but parseable content (for example an
 * unrecognized currency status). This is still a baseline check, not a full
 * SEP-1 conformance validator: it cannot verify ownership of a domain, that a
 * URL is reachable, or that a listed service is safe to use.
 */
export function validateStellarToml(record: Sep1Record): Sep1ValidationResult {
  const issues: Sep1Issue[] = [];
  const report: Reporter = (severity, code, path, message) => {
    issues.push({ severity, code, path, message });
  };

  if (!isTable(record)) {
    report('error', 'record.type', '', 'Stellar TOML must contain a TOML table at the root');
    return finalize(issues);
  }

  validateVersion(record.VERSION, report);
  validateTopLevelKeys(record, report);
  validateEndpoints(record, report);
  validateSigningMetadata(record, report);
  validateDocumentation(record.DOCUMENTATION, report);
  validateCurrencies(record.CURRENCIES, report);
  validateValidators(record.VALIDATORS, report);

  return finalize(issues);
}

/**
 * Build the SEP-1 well-known URL for a domain.
 *
 * Accepts a bare hostname or an HTTPS origin; paths, credentials, query
 * strings, and non-HTTPS schemes are rejected.
 */
export function getStellarTomlUrl(domain: string): string {
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

function validateVersion(version: unknown, report: Reporter): void {
  if (typeof version !== 'string' || version.trim() === '') {
    report('error', 'version.missing', 'VERSION', 'VERSION must be a non-empty string');
    return;
  }

  if (!VERSION_PATTERN.test(version.trim())) {
    report(
      'warning',
      'version.format',
      'VERSION',
      'VERSION should be a semantic version string such as 2.7.0'
    );
  }
}

function validateTopLevelKeys(record: Sep1Record, report: Reporter): void {
  for (const key of Object.keys(record)) {
    if (key !== key.toUpperCase()) {
      report(
        'warning',
        'key.case',
        key,
        `${key} should be an uppercase SEP-1 field name`
      );
    }
  }
}

function validateEndpoints(record: Sep1Record, report: Reporter): void {
  for (const field of HTTPS_ENDPOINT_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;

    if (typeof value !== 'string' || !isHttpsUrl(value)) {
      report('error', 'endpoint.https', field, `${field} must be a valid HTTPS URL`);
    }
  }
}

function validateSigningMetadata(record: Sep1Record, report: Reporter): void {
  const passphrase = record.NETWORK_PASSPHRASE;
  if (passphrase !== undefined && (typeof passphrase !== 'string' || passphrase.trim() === '')) {
    report(
      'error',
      'network_passphrase.invalid',
      'NETWORK_PASSPHRASE',
      'NETWORK_PASSPHRASE must be a non-empty string'
    );
  }

  const signingKey = record.SIGNING_KEY;
  if (signingKey !== undefined && !isEd25519PublicKey(signingKey)) {
    report(
      'error',
      'signing_key.invalid',
      'SIGNING_KEY',
      'SIGNING_KEY must be a Stellar ed25519 public key'
    );
  }

  for (const field of ['ACCOUNTS', 'PRINCIPALS'] as const) {
    const value = record[field];
    if (value === undefined) continue;

    if (!Array.isArray(value)) {
      report('error', 'account_list.type', field, `${field} must be an array of Stellar account IDs`);
      continue;
    }

    value.forEach((entry, index) => {
      if (!isStellarAccountId(entry)) {
        report(
          'error',
          'account_list.entry',
          `${field}[${index}]`,
          `${field}[${index}] must be a Stellar account ID`
        );
      }
    });
  }
}

function validateDocumentation(documentation: unknown, report: Reporter): void {
  if (documentation === undefined) return;

  if (!isTable(documentation)) {
    report('error', 'documentation.type', 'DOCUMENTATION', 'DOCUMENTATION must be a TOML table');
    return;
  }

  for (const field of DOCUMENTATION_STRING_FIELDS) {
    const value = documentation[field];
    if (value !== undefined && typeof value !== 'string') {
      report(
        'error',
        'documentation.field',
        `DOCUMENTATION.${field}`,
        `DOCUMENTATION.${field} must be a string`
      );
    }
  }

  for (const field of DOCUMENTATION_URL_FIELDS) {
    const value = documentation[field];
    if (typeof value === 'string' && !isHttpUrl(value)) {
      report(
        'error',
        'documentation.url',
        `DOCUMENTATION.${field}`,
        `DOCUMENTATION.${field} must be a valid http(s) URL`
      );
    }
  }

  for (const field of DOCUMENTATION_EMAIL_FIELDS) {
    const value = documentation[field];
    if (typeof value === 'string' && !EMAIL_PATTERN.test(value)) {
      report(
        'error',
        'documentation.email',
        `DOCUMENTATION.${field}`,
        `DOCUMENTATION.${field} must be a valid email address`
      );
    }
  }
}

function validateCurrencies(currencies: unknown, report: Reporter): void {
  if (currencies === undefined) return;

  if (!Array.isArray(currencies)) {
    report('error', 'currencies.type', 'CURRENCIES', 'CURRENCIES must be an array of tables');
    return;
  }

  currencies.forEach((entry, index) => validateCurrency(entry, `CURRENCIES[${index}]`, report));
}

function validateCurrency(entry: unknown, path: string, report: Reporter): void {
  if (!isTable(entry)) {
    report('error', 'currency.type', path, `${path} must be a table`);
    return;
  }

  const code = entry.code;
  if (typeof code !== 'string' || code.trim() === '') {
    report('error', 'currency.code', `${path}.code`, `${path}.code is required and must be a string`);
  } else if (!/^[A-Za-z0-9]{1,12}$/.test(code)) {
    report(
      'error',
      'currency.code.format',
      `${path}.code`,
      `${path}.code must be 1-12 alphanumeric characters`
    );
  }

  const issuer = entry.issuer;
  const contract = entry.contract;
  if (issuer === undefined && contract === undefined) {
    report(
      'error',
      'currency.issuer.missing',
      path,
      `${path} must set issuer or contract`
    );
  } else if (issuer !== undefined && !isStellarAccountId(issuer)) {
    report(
      'error',
      'currency.issuer',
      `${path}.issuer`,
      `${path}.issuer must be a Stellar account ID`
    );
  }

  if (contract !== undefined && typeof contract !== 'string') {
    report('error', 'currency.contract', `${path}.contract`, `${path}.contract must be a string`);
  }

  if (entry.is_asset_anchored !== undefined && typeof entry.is_asset_anchored !== 'boolean') {
    report(
      'error',
      'currency.is_asset_anchored',
      `${path}.is_asset_anchored`,
      `${path}.is_asset_anchored must be a boolean`
    );
  }

  if (entry.display_decimals !== undefined && typeof entry.display_decimals !== 'number') {
    report(
      'error',
      'currency.display_decimals',
      `${path}.display_decimals`,
      `${path}.display_decimals must be a number`
    );
  }

  const status = entry.status;
  if (status !== undefined) {
    if (typeof status !== 'string' || !includesString(CURRENCY_STATUSES, status)) {
      report(
        'warning',
        'currency.status',
        `${path}.status`,
        `${path}.status should be one of ${CURRENCY_STATUSES.join(', ')}`
      );
    }
  }

  const assetType = entry.anchor_asset_type;
  if (assetType !== undefined) {
    if (typeof assetType !== 'string' || !includesString(ANCHOR_ASSET_TYPES, assetType)) {
      report(
        'warning',
        'currency.anchor_asset_type',
        `${path}.anchor_asset_type`,
        `${path}.anchor_asset_type should be one of ${ANCHOR_ASSET_TYPES.join(', ')}`
      );
    }
  }

  for (const field of CURRENCY_STRING_FIELDS) {
    const value = entry[field];
    if (value !== undefined && typeof value !== 'string') {
      report('error', 'currency.field', `${path}.${field}`, `${path}.${field} must be a string`);
    }
  }
}

function validateValidators(validators: unknown, report: Reporter): void {
  if (validators === undefined) return;

  if (!Array.isArray(validators)) {
    report('error', 'validators.type', 'VALIDATORS', 'VALIDATORS must be an array of tables');
    return;
  }

  validators.forEach((entry, index) => {
    const path = `VALIDATORS[${index}]`;
    if (!isTable(entry)) {
      report('error', 'validator.type', path, `${path} must be a table`);
      return;
    }

    if (entry.PUBLIC_KEY !== undefined && !isStellarAccountId(entry.PUBLIC_KEY)) {
      report(
        'error',
        'validator.public_key',
        `${path}.PUBLIC_KEY`,
        `${path}.PUBLIC_KEY must be a Stellar account ID`
      );
    }

    if (entry.ALIAS !== undefined && typeof entry.ALIAS !== 'string') {
      report('error', 'validator.alias', `${path}.ALIAS`, `${path}.ALIAS must be a string`);
    }
  });
}

function finalize(issues: Sep1Issue[]): Sep1ValidationResult {
  const errors = issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
  const warnings = issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => issue.message);

  return { valid: errors.length === 0, errors, warnings, issues };
}

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function isTable(value: unknown): value is Record<string, unknown> & Sep1Record {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: string): boolean {
  return isUrlWithProtocol(value, 'https:');
}

function isHttpUrl(value: string): boolean {
  return isUrlWithProtocol(value, 'https:') || isUrlWithProtocol(value, 'http:');
}

function isUrlWithProtocol(value: string, protocol: string): boolean {
  try {
    return new URL(value).protocol === protocol;
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
