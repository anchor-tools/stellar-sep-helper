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
  /** Token code, at most 12 characters. Required unless `code_template` is set. */
  code?: string;
  /** Wildcard code pattern (`?` per character), at most 12 characters. */
  code_template?: string;
  /** Issuing account, `G...`. Required for Stellar assets. */
  issuer?: string;
  /** Token contract ID, `C...`. Required for tokens that are not Stellar assets. */
  contract?: string;
  status?: string;
  display_decimals?: number;
  name?: string;
  desc?: string;
  conditions?: string;
  image?: string;
  fixed_number?: number;
  max_number?: number;
  is_unlimited?: boolean;
  is_asset_anchored?: boolean;
  anchor_asset_type?: string;
  anchor_asset?: string;
  attestation_of_reserve?: string;
  redemption_instructions?: string;
  collateral_addresses?: string[];
  collateral_address_messages?: string[];
  collateral_address_signatures?: string[];
  regulated?: boolean;
  approval_server?: string;
  approval_criteria?: string;
  /** Alternate form: URL of a separate TOML file describing this currency. */
  toml?: string;
}

export interface Sep1Options {
  /** A domain name, with or without an https:// prefix. */
  domain: string;
  /** Optional fetch implementation for testing or custom runtimes. */
  fetcher?: typeof fetch;
  /** Abort the request when it takes longer than this many milliseconds. */
  timeoutMs?: number;
}

/**
 * Stable identifier for a SEP-1 validation finding.
 *
 * Codes are intended for programmatic use: consumers can group findings,
 * select localized messages, or map a finding to an input field. Existing
 * codes keep their meaning; new codes may be added as validation grows.
 */
export type Sep1IssueCode =
  | 'record.type'
  | 'version.missing'
  | 'version.format'
  | 'key.case'
  | 'endpoint.https'
  | 'network_passphrase.invalid'
  | 'signing_key.invalid'
  | 'account_list.type'
  | 'account_list.entry'
  | 'documentation.type'
  | 'documentation.field'
  | 'documentation.url'
  | 'documentation.email'
  | 'currencies.type'
  | 'currency.type'
  | 'currency.code.missing'
  | 'currency.code.type'
  | 'currency.code.empty'
  | 'currency.code.length'
  | 'currency.code.format'
  | 'currency.code_template.type'
  | 'currency.code_template.length'
  | 'currency.code_template.format'
  | 'currency.identity.mixed'
  | 'currency.identity.missing'
  | 'currency.issuer'
  | 'currency.contract'
  | 'currency.status.type'
  | 'currency.status'
  | 'currency.anchor_asset_type.type'
  | 'currency.anchor_asset_type'
  | 'currency.name.type'
  | 'currency.name.length'
  | 'currency.display_decimals'
  | 'currency.field'
  | 'currency.url'
  | 'currency.boolean'
  | 'currency.integer'
  | 'currency.list'
  | 'currency.list_entry'
  | 'currency.issuance'
  | 'currency.collateral'
  | 'currency.toml'
  | 'currency.toml.only_field'
  | 'validators.type'
  | 'validator.type'
  | 'validator.public_key'
  | 'validator.alias';

export interface Sep1Issue {
  severity: 'error' | 'warning';
  /** Stable machine-readable identifier, safe to switch on. */
  code: Sep1IssueCode;
  /**
   * Deterministic field path inside the document, for example
   * `CURRENCIES[0].issuer`, or `''` for the document root.
   */
  path: string;
  /** Human-readable description, mirrored in `errors` or `warnings`. */
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

const CURRENCY_STATUSES = ['live', 'dead', 'test', 'private'] as const;
const ANCHOR_ASSET_TYPES = [
  'fiat',
  'crypto',
  'nft',
  'stock',
  'bond',
  'commodity',
  'realestate',
  'other'
] as const;

const CURRENCY_MAX_CODE_LENGTH = 12;
const CURRENCY_MAX_NAME_LENGTH = 20;
const CURRENCY_MAX_DISPLAY_DECIMALS = 7;

const CURRENCY_STRING_FIELDS = [
  'desc',
  'conditions',
  'anchor_asset',
  'redemption_instructions',
  'approval_criteria'
] as const;
const CURRENCY_URL_FIELDS = ['image', 'attestation_of_reserve', 'approval_server'] as const;
const CURRENCY_BOOLEAN_FIELDS = ['is_unlimited', 'is_asset_anchored', 'regulated'] as const;
const CURRENCY_INTEGER_FIELDS = ['fixed_number', 'max_number'] as const;
const CURRENCY_STRING_LIST_FIELDS = [
  'collateral_addresses',
  'collateral_address_messages',
  'collateral_address_signatures'
] as const;
/** SEP-1 allows exactly one of these issuance policies per currency. */
const CURRENCY_ISSUANCE_FIELDS = ['fixed_number', 'max_number', 'is_unlimited'] as const;
const CURRENCY_COLLATERAL_LIST_FIELDS = [
  'collateral_address_messages',
  'collateral_address_signatures'
] as const;

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^[A-Za-z0-9]+$/;
const CODE_TEMPLATE_PATTERN = /^[A-Za-z0-9?]+$/;
const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

type Reporter = (
  severity: Sep1Issue['severity'],
  code: Sep1IssueCode,
  path: string,
  message: string
) => void;

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
 *
 * Currency checks are deliberately structural. The following are not verified
 * and are left to consumers that can reach the network or the ledger: the
 * StrKey checksum of a `contract` ID, that a currency `issuer` actually issued
 * the listed `code`, the contents of a linked `toml` file, and the content of
 * `collateral_address_signatures` or `attestation_of_reserve`.
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
      // Never include the value itself: it may embed credentials.
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
    report('error', 'currency.type', path, `${path} must be a TOML table`);
    return;
  }

  // A currency that only links to its own TOML file keeps its identity there.
  const linked = entry.toml !== undefined;
  if (linked) validateCurrencyTomlLink(entry, path, report);

  validateCurrencyCode(entry, path, report, linked);
  validateCurrencyIdentity(entry, path, report, linked);
  validateCurrencyEnumerations(entry, path, report);
  validateCurrencyDisplayFields(entry, path, report);
  validateCurrencyFieldTypes(entry, path, report);
  validateCurrencyIssuancePolicy(entry, path, report);
  validateCurrencyCollateral(entry, path, report);
}

function validateCurrencyCode(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter,
  linked: boolean
): void {
  const code = entry.code;
  const codeTemplate = entry.code_template;

  // SEP-1 lists `code` as required, but issuers publish wildcard entries that
  // only set `code_template`, and a linked `toml` entry keeps `code` in the
  // referenced file, so either field satisfies the identity check.
  if (code === undefined && codeTemplate === undefined && !linked) {
    report(
      'error',
      'currency.code.missing',
      `${path}.code`,
      `${path}.code is required and must be 1-12 characters`
    );
  }

  if (code !== undefined) {
    if (typeof code !== 'string') {
      report('error', 'currency.code.type', `${path}.code`, `${path}.code must be a string`);
    } else if (code.trim() === '') {
      report('error', 'currency.code.empty', `${path}.code`, `${path}.code must not be empty`);
    } else if (code.length > CURRENCY_MAX_CODE_LENGTH) {
      report(
        'error',
        'currency.code.length',
        `${path}.code`,
        `${path}.code must be at most ${CURRENCY_MAX_CODE_LENGTH} characters`
      );
    } else if (!CODE_PATTERN.test(code)) {
      // Stellar asset codes are alphanumeric; a token contract publishes `code`
      // for display only, so a non-conforming value is only suspicious there.
      report(
        entry.issuer === undefined ? 'warning' : 'error',
        'currency.code.format',
        `${path}.code`,
        `${path}.code should contain only letters and digits`
      );
    }
  }

  if (codeTemplate !== undefined) {
    if (typeof codeTemplate !== 'string') {
      report(
        'error',
        'currency.code_template.type',
        `${path}.code_template`,
        `${path}.code_template must be a string`
      );
    } else if (codeTemplate.length > CURRENCY_MAX_CODE_LENGTH) {
      report(
        'error',
        'currency.code_template.length',
        `${path}.code_template`,
        `${path}.code_template must be at most ${CURRENCY_MAX_CODE_LENGTH} characters`
      );
    } else if (!CODE_TEMPLATE_PATTERN.test(codeTemplate)) {
      report(
        'warning',
        'currency.code_template.format',
        `${path}.code_template`,
        `${path}.code_template should use letters, digits, and ? wildcards`
      );
    }
  }
}

function validateCurrencyIdentity(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter,
  linked: boolean
): void {
  const issuer = entry.issuer;
  const contract = entry.contract;
  const isStellarAsset = issuer !== undefined;

  if (isStellarAsset && contract !== undefined) {
    report(
      'error',
      'currency.identity.mixed',
      path,
      `${path} must set either issuer or contract, not both`
    );
  } else if (!isStellarAsset && contract === undefined && !linked) {
    report(
      'error',
      'currency.identity.missing',
      path,
      `${path} must set issuer for a Stellar asset or contract for a token contract`
    );
  }

  if (isStellarAsset && !isEd25519PublicKey(issuer)) {
    report(
      'error',
      'currency.issuer',
      `${path}.issuer`,
      `${path}.issuer must be a Stellar public key (G...)`
    );
  }

  if (contract !== undefined && !isContractId(contract)) {
    report(
      'error',
      'currency.contract',
      `${path}.contract`,
      `${path}.contract must be a Stellar contract ID (C...)`
    );
  }
}

function validateCurrencyEnumerations(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter
): void {
  const status = entry.status;
  if (status !== undefined) {
    if (typeof status !== 'string') {
      report('error', 'currency.status.type', `${path}.status`, `${path}.status must be a string`);
    } else if (!includesString(CURRENCY_STATUSES, status)) {
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
    if (typeof assetType !== 'string') {
      report(
        'error',
        'currency.anchor_asset_type.type',
        `${path}.anchor_asset_type`,
        `${path}.anchor_asset_type must be a string`
      );
    } else if (!includesString(ANCHOR_ASSET_TYPES, assetType)) {
      report(
        'warning',
        'currency.anchor_asset_type',
        `${path}.anchor_asset_type`,
        `${path}.anchor_asset_type should be one of ${ANCHOR_ASSET_TYPES.join(', ')}`
      );
    }
  }
}

function validateCurrencyDisplayFields(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter
): void {
  const name = entry.name;
  if (name !== undefined) {
    if (typeof name !== 'string') {
      report('error', 'currency.name.type', `${path}.name`, `${path}.name must be a string`);
    } else if (name.length > CURRENCY_MAX_NAME_LENGTH) {
      report(
        'error',
        'currency.name.length',
        `${path}.name`,
        `${path}.name must be at most ${CURRENCY_MAX_NAME_LENGTH} characters`
      );
    }
  }

  const decimals = entry.display_decimals;
  if (
    decimals !== undefined &&
    !isIntegerInRange(decimals, 0, CURRENCY_MAX_DISPLAY_DECIMALS)
  ) {
    report(
      'error',
      'currency.display_decimals',
      `${path}.display_decimals`,
      `${path}.display_decimals must be an integer from 0 to ${CURRENCY_MAX_DISPLAY_DECIMALS}`
    );
  }
}

function validateCurrencyFieldTypes(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter
): void {
  for (const field of CURRENCY_STRING_FIELDS) {
    const value = entry[field];
    if (value !== undefined && typeof value !== 'string') {
      report('error', 'currency.field', `${path}.${field}`, `${path}.${field} must be a string`);
    }
  }

  for (const field of CURRENCY_URL_FIELDS) {
    const value = entry[field];
    if (value !== undefined && (typeof value !== 'string' || !isHttpUrl(value))) {
      report(
        'error',
        'currency.url',
        `${path}.${field}`,
        `${path}.${field} must be a valid http(s) URL`
      );
    }
  }

  for (const field of CURRENCY_BOOLEAN_FIELDS) {
    const value = entry[field];
    if (value !== undefined && typeof value !== 'boolean') {
      report('error', 'currency.boolean', `${path}.${field}`, `${path}.${field} must be a boolean`);
    }
  }

  for (const field of CURRENCY_INTEGER_FIELDS) {
    const value = entry[field];
    if (value !== undefined && !isNonNegativeInteger(value)) {
      report(
        'error',
        'currency.integer',
        `${path}.${field}`,
        `${path}.${field} must be a non-negative integer`
      );
    }
  }

  for (const field of CURRENCY_STRING_LIST_FIELDS) {
    const value = entry[field];
    if (value === undefined) continue;

    if (!Array.isArray(value)) {
      report(
        'error',
        'currency.list',
        `${path}.${field}`,
        `${path}.${field} must be an array of strings`
      );
      continue;
    }

    value.forEach((item, index) => {
      if (typeof item !== 'string') {
        report(
          'error',
          'currency.list_entry',
          `${path}.${field}[${index}]`,
          `${path}.${field}[${index}] must be a string`
        );
      }
    });
  }
}

function validateCurrencyIssuancePolicy(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter
): void {
  const set = CURRENCY_ISSUANCE_FIELDS.filter((field) => entry[field] !== undefined);
  if (set.length > 1) {
    report(
      'warning',
      'currency.issuance',
      path,
      `${path} should set at most one of ${CURRENCY_ISSUANCE_FIELDS.join(', ')}`
    );
  }
}

function validateCurrencyCollateral(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter
): void {
  const addresses = entry.collateral_addresses;
  if (!Array.isArray(addresses)) return;

  for (const field of CURRENCY_COLLATERAL_LIST_FIELDS) {
    const value = entry[field];
    if (Array.isArray(value) && value.length !== addresses.length) {
      report(
        'warning',
        'currency.collateral',
        `${path}.${field}`,
        `${path}.${field} should contain one entry per collateral address`
      );
    }
  }
}

function validateCurrencyTomlLink(
  entry: Record<string, unknown>,
  path: string,
  report: Reporter
): void {
  const link = entry.toml;
  if (typeof link !== 'string' || !isHttpUrl(link)) {
    report('error', 'currency.toml', `${path}.toml`, `${path}.toml must be a valid http(s) URL`);
  }

  const extraFields = Object.keys(entry).filter((key) => key !== 'toml');
  if (extraFields.length > 0) {
    report(
      'warning',
      'currency.toml.only_field',
      `${path}.toml`,
      `${path}.toml should be the only field of a currency that links to a separate TOML file`
    );
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

/**
 * Structural check for a `C...` Stellar contract ID.
 *
 * The StrKey checksum is not verified: SEP-1 only requires the field to hold a
 * contract ID string, and reaching the contract is out of scope here.
 */
function isContractId(value: unknown): boolean {
  return typeof value === 'string' && CONTRACT_ID_PATTERN.test(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Check a value is an absolute URL with the expected protocol.
 */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Check an endpoint is an absolute HTTPS URL with a hostname and no embedded
 * credentials. Paths, query strings, fragments, and ports are allowed.
 */
function isHttpsUrl(value: string): boolean {
  const url = parseUrl(value);
  return (
    url !== null &&
    url.protocol === 'https:' &&
    url.hostname !== '' &&
    url.username === '' &&
    url.password === ''
  );
}

function isHttpUrl(value: string): boolean {
  return isUrlWithProtocol(value, 'https:') || isUrlWithProtocol(value, 'http:');
}

function isUrlWithProtocol(value: string, protocol: string): boolean {
  const url = parseUrl(value);
  return url !== null && url.protocol === protocol;
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
