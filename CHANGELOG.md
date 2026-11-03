# Changelog

Notable project changes are recorded here. This project follows [Semantic Versioning](https://semver.org/).

## 0.2.0 - Unreleased

### Added

- Structured validation `issues` with severity, a type-safe `Sep1IssueCode`, and a deterministic field path with array indices for nested entries, alongside the existing `errors` list. `issues` is additive: `valid`, `errors`, and `warnings` keep their behavior and messages.
- `warnings` for suspicious but parseable content: non-semver `VERSION`, unknown currency `status` or `anchor_asset_type`, and lowercase top-level field names.
- StrKey checksum validation for `SIGNING_KEY`, `ACCOUNTS`, `PRINCIPALS`, currency `issuer`, and validator `PUBLIC_KEY`, including muxed `M...` accounts.
- Full SEP-1 field-table validation for `[[CURRENCIES]]`: entry tables, `code`/`code_template` bounds, the Stellar-asset (`issuer`) versus token-contract (`contract`) identity rules, `display_decimals` range, `name` length, boolean/integer/string/string-list/URL field types, and linked `toml` entries. Unknown currency fields are allowed and ignored.
- Currency warnings for more than one issuance policy, and for collateral message or signature lists that do not match `collateral_addresses`.
- `status` choices now include `private`; `anchor_asset_type` choices now include `nft`, `realestate`, and `other`.
- Validation for `[[VALIDATORS]]`.
- `[DOCUMENTATION]` URL and email checks.
- `getStellarTomlUrl` export for building the well-known URL.
- `formatReport` export for the human-readable report format.
- CLI (`stellar-sep-helper`) with `--json`, `--strict`, `--timeout`, `--file`, and documented exit codes.
- `fetchStellarToml` `timeoutMs` option that aborts slow requests.
- `npm run check` script that runs tests, typecheck, and build.
- Roadmap, issue templates, and pull request template.
- Security CI: CodeQL code scanning, dependency review, Dependabot updates, and a contributor code scan for malicious patterns in added lines.
- `scripts/security-scan.mjs` with a `security-approved` label path for review-only findings such as CI changes.
- Expanded security policy covering automated protections, limits, and recommended repository settings.
- Tests for URL building, StrKey checks, currency and account validation, report formatting, and CLI argument parsing.

### Changed

- `validateStellarToml` now also returns `warnings` and `issues`; `valid` still means "no errors".
- `npm run prepublishOnly` runs the full check suite instead of only building.
- Package metadata now declares `repository`, `homepage`, `bugs`, `bin`, and `exports`.
- README and documentation site describe the expanded API and the CLI.

## 0.1.0 - Unreleased

### Added

- Working SEP-1 Stellar TOML discovery, parsing, and baseline validation.
- Unit tests for fetch behavior, TOML parsing, and validation.
- Project documentation site and continuous integration workflows.

### Changed

- Corrected package entry points to target the compiled `dist` output.
- Documented the current support boundary instead of advertising unimplemented SEP helpers.

### Removed

- Placeholder SEP-10 and purported SEP-12 implementations.
- Exports for SEP-24 and SEP-31 modules that did not exist.
