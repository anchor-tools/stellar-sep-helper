#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  fetchStellarToml,
  getStellarTomlUrl,
  parseStellarToml,
  validateStellarToml,
  type Sep1Record,
  type Sep1ValidationResult
} from './sep1';
import { formatReport } from './report';

export const USAGE = `Usage: stellar-sep-helper <domain...> [options]

Fetch and validate SEP-1 stellar.toml files.

Options:
  -f, --file <path>   Validate a local TOML file instead of fetching a domain
      --json          Print one JSON document per target to stdout
      --timeout <ms>  Request timeout in milliseconds (default 10000)
      --strict        Exit non-zero when a document has warnings
  -h, --help          Show this help

Exit codes:
  0  every document is valid
  1  a document is invalid, or fetching/parsing it failed
  2  invalid command line usage`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export interface CliOptions {
  targets: string[];
  file?: string;
  json: boolean;
  strict: boolean;
  timeoutMs: number;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    targets: [],
    json: false,
    strict: false,
    timeoutMs: 10_000,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '-f' || arg === '--file') {
      const value = argv[index + 1];
      if (value === undefined) throw new UsageError(`${arg} requires a path`);
      options.file = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
      continue;
    }

    if (arg === '--timeout') {
      const value = argv[index + 1];
      if (value === undefined) throw new UsageError('--timeout requires a value in milliseconds');
      options.timeoutMs = parseTimeout(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--timeout=')) {
      options.timeoutMs = parseTimeout(arg.slice('--timeout='.length));
      continue;
    }

    if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${arg}`);
    }

    options.targets.push(arg);
  }

  if (options.file !== undefined && options.targets.length > 0) {
    throw new UsageError('Pass either domains or --file, not both');
  }

  if (!options.help && options.file === undefined && options.targets.length === 0) {
    throw new UsageError('Pass at least one domain, or --file <path>');
  }

  return options;
}

function parseTimeout(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError('--timeout must be a positive integer number of milliseconds');
  }
  return parsed;
}

async function main(argv: string[]): Promise<number> {
  let options: CliOptions;

  try {
    options = parseCliArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    throw error;
  }

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  if (options.file !== undefined) {
    return inspectFile(options.file, options);
  }

  let exitCode = 0;
  for (const domain of options.targets) {
    const result = await inspectDomain(domain, options);
    if (result !== 0) exitCode = 1;
  }

  return exitCode;
}

async function inspectDomain(domain: string, options: CliOptions): Promise<number> {
  try {
    const record = await fetchStellarToml({ domain, timeoutMs: options.timeoutMs });
    const validation = validateStellarToml(record);
    emit(domain, getStellarTomlUrl(domain), record, validation, options);
    return isFailure(validation, options) ? 1 : 0;
  } catch (error) {
    return emitFailure(domain, error, options);
  }
}

async function inspectFile(path: string, options: CliOptions): Promise<number> {
  try {
    const source = await readFile(path, 'utf8');
    const record = parseStellarToml(source);
    const validation = validateStellarToml(record);
    emit(path, undefined, record, validation, options);
    return isFailure(validation, options) ? 1 : 0;
  } catch (error) {
    return emitFailure(path, error, options);
  }
}

function emit(
  label: string,
  source: string | undefined,
  record: Sep1Record,
  validation: Sep1ValidationResult,
  options: CliOptions
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          label,
          source: source ?? null,
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          issues: validation.issues
        },
        null,
        2
      )
    );
    return;
  }

  console.log(formatReport({ label, source, record, validation }));
}

function emitFailure(label: string, error: unknown, options: CliOptions): number {
  const message = error instanceof Error ? error.message : String(error);

  if (options.json) {
    console.log(
      JSON.stringify(
        { label, source: null, valid: false, errors: [message], warnings: [], issues: [] },
        null,
        2
      )
    );
  } else {
    console.error(`${label}: ${message}`);
  }

  return 1;
}

function isFailure(validation: Sep1ValidationResult, options: CliOptions): boolean {
  if (!validation.valid) return true;
  return options.strict && validation.warnings.length > 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
