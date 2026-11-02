# Stellar SEP Helper

TypeScript utilities and a CLI for **SEP-1 Stellar TOML** discovery, parsing, and validation.

[Documentation](https://stellar-sep-helper-docs-sigma.vercel.app/) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Report a bug](https://github.com/anchor-tools/stellar-sep-helper/issues/new)

## Scope

This package covers SEP-1 today: fetching, parsing, and offline validation of `stellar.toml`. It does not implement SEP-10 authentication, SEP-12 customer information, SEP-24 transfers, or SEP-31 payments; those are tracked in the [roadmap](ROADMAP.md) and are not advertised as done.

Validation is a baseline conformance check, not an audit. It cannot prove that a domain controls its `stellar.toml`, that an endpoint is reachable, or that a listed service is safe to use.

## What it does

- Fetches `https://<domain>/.well-known/stellar.toml` over HTTPS, with an optional request timeout.
- Enforces SEP-1's 100 KiB maximum file size while streaming the response, before parsing.
- Parses TOML into a typed record and rejects non-table roots.
- Validates `VERSION`, HTTPS endpoint fields, `SIGNING_KEY`, `ACCOUNTS`/`PRINCIPALS`, `[DOCUMENTATION]`, `[[CURRENCIES]]`, and `[[VALIDATORS]]`.
- Verifies Stellar account IDs with a built-in StrKey checksum check (`G...` and `M...`), with no extra dependencies.
- Returns **structured issues** (severity, stable code, field path, message), so tooling can filter and report them.
- Ships a CLI for one-off checks and CI, including `--json` output and local-file validation.

## Requirements

- Node.js 22 or newer
- TypeScript 5 or newer to build from source

## Install

The package is not published to the npm registry yet; install it from GitHub:

```sh
npm install github:anchor-tools/stellar-sep-helper
```

## CLI

```sh
npx stellar-sep-helper example.com
npx stellar-sep-helper example.com anchor.example --json
npx stellar-sep-helper --file ./stellar.toml --strict
```

```
example.com (https://example.com/.well-known/stellar.toml)
  VERSION: 2.7.0
  Result:  invalid - 1 error, 1 warning

  ERROR    KYC_SERVER        KYC_SERVER must be a valid HTTPS URL
  WARNING  CURRENCIES[0].status  CURRENCIES[0].status should be one of live, dead, test, private
```

Options:

| Flag | Description |
| --- | --- |
| `-f, --file <path>` | Validate a local TOML file instead of fetching a domain |
| `--json` | Print one JSON document per target to stdout |
| `--timeout <ms>` | Request timeout in milliseconds (default `10000`) |
| `--strict` | Exit non-zero when a document has warnings |
| `-h, --help` | Show usage |

Exit codes: `0` all valid, `1` invalid or failed fetch/parse, `2` bad command line.

`--json` emits one object per target:

```json
{
  "label": "example.com",
  "source": "https://example.com/.well-known/stellar.toml",
  "valid": false,
  "errors": ["KYC_SERVER must be a valid HTTPS URL"],
  "warnings": [],
  "issues": [
    { "severity": "error", "code": "endpoint.https", "path": "KYC_SERVER", "message": "KYC_SERVER must be a valid HTTPS URL" }
  ]
}
```

## Quick start

```ts
import { fetchStellarToml, validateStellarToml } from 'stellar-sep-helper';

const stellarToml = await fetchStellarToml({ domain: 'example.com', timeoutMs: 5000 });
const result = validateStellarToml(stellarToml);

if (!result.valid) {
  for (const issue of result.issues) {
    console.error(`${issue.path}: ${issue.message}`);
  }
}
```

`fetchStellarToml` uses Node's built-in `fetch` by default. Supply a `fetcher` option to provide a custom implementation (for example, in tests). Fetch and TOML parse failures reject with an error; HTTP responses outside the success range are not treated as valid data.

Use `parseStellarToml(source)` to parse TOML text without a network request, `getStellarTomlUrl(domain)` to build the well-known URL, and the `isEd25519PublicKey` / `isMuxedAccountId` / `isStellarAccountId` helpers for StrKey checks.

## API

| Export | Description |
| --- | --- |
| `fetchStellarToml(options)` | Fetch `/.well-known/stellar.toml` and return a parsed `Sep1Record`. Rejects on invalid input, HTTP errors, oversize content, timeouts, or malformed TOML. |
| `parseStellarToml(source)` | Parse TOML text without network access. Throws on malformed input or when the 100 KiB limit is exceeded. |
| `validateStellarToml(record)` | Return `{ valid, errors, warnings, issues }`. `errors` block validity; `warnings` flag suspicious but parseable content. |
| `getStellarTomlUrl(domain)` | Build `https://<domain>/.well-known/stellar.toml`, rejecting paths, credentials, query strings, and non-HTTPS schemes. |
| `formatReport(report)` | Render a validation result as the CLI's human-readable report. |
| `isEd25519PublicKey`, `isMuxedAccountId`, `isStellarAccountId` | StrKey checks used by the validator and available for your own input validation. |

Types: `Sep1Record`, `Sep1Toml`, `Sep1Documentation`, `Sep1Currency`, `Sep1Issue`, `Sep1ValidationResult`, `Sep1Options`, `StellarTomlReport`.

## Validation coverage

| Area | Checked | Severity |
| --- | --- | --- |
| `VERSION` | Present, non-empty, semver-shaped | error / warning |
| Endpoint fields | `FEDERATION_SERVER`, `AUTH_SERVER`, `TRANSFER_SERVER`, `TRANSFER_SERVER_SEP0024`, `KYC_SERVER`, `WEB_AUTH_ENDPOINT`, `WEB_AUTH_FOR_CONTRACTS_ENDPOINT`, `DIRECT_PAYMENT_SERVER`, `ANCHOR_QUOTE_SERVER` are HTTPS URLs | error |
| Keys and accounts | `SIGNING_KEY` is an ed25519 `G...` key; `ACCOUNTS` and `PRINCIPALS` entries are `G...`/`M...` IDs with valid checksums | error |
| `[DOCUMENTATION]` | Field types, `ORG_URL`/`ORG_LOGO`/`ORG_SUPPORT_URL` URLs, `ORG_OFFICIAL_EMAIL`/`ORG_SUPPORT_EMAIL` emails | error |
| `[[CURRENCIES]]` | Entries are tables; `code` or `code_template` present and at most 12 characters; exactly one of `issuer` (`G...`) or `contract` (`C...`) for Stellar assets versus token contracts; `display_decimals` is an integer from 0 to 7; `name` at most 20 characters; boolean, integer, string, string-list, and URL field types | error |
| `[[CURRENCIES]]` | `status` in `live`/`dead`/`test`/`private`, `anchor_asset_type` in `fiat`/`crypto`/`nft`/`stock`/`bond`/`commodity`/`realestate`/`other`, at most one issuance policy in `fixed_number`/`max_number`/`is_unlimited`, one collateral message and signature per address, `toml` as a linked entry's only field | warning |
| `[[VALIDATORS]]` | Entries are tables, `PUBLIC_KEY` is a Stellar account ID, `ALIAS` is a string | error |
| Top-level keys | Uppercase SEP-1 field names | warning |

Not covered: signature or domain-ownership proofs, reachability of endpoints, the StrKey checksum of a currency `contract` ID, whether a currency `issuer` actually issued the listed `code`, the content of a linked `toml` file or of `collateral_address_signatures`/`attestation_of_reserve`, TOML fields outside the tables above, and anything in SEP-10 or later. Unknown currency fields are allowed and ignored.

## Security

- CodeQL code scanning, dependency review, Dependabot, and a contributor code scan run in CI. See [SECURITY.md](SECURITY.md) for what each layer covers.
- The contributor scan is a heuristic review aid for added lines (install hooks, piped downloads, encoded payloads, leaked keys, CI changes), not an antivirus. Review-only findings need a maintainer's `security-approved` label.
- Run it locally with `npm run security:scan`.
- Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/anchor-tools/stellar-sep-helper/security/advisories/new), not a public issue.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run check   # test, typecheck, and build in one command
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. The documentation site source is in [`docs/`](docs/): a single static page deployed to Vercel at the URL above. Deploy the directory with any static host if the Vercel project is replaced.

## License

MIT. See [LICENSE](LICENSE).
