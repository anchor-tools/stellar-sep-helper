# Roadmap

This roadmap lists what is shipped and what is planned. Planned items are scoped so they can be turned into individual, reviewable issues: each one names its deliverable and how it will be verified. Nothing here is claimed as available until it ships with tests and documentation.

## Shipped (0.2.0)

- SEP-1 `stellar.toml` discovery over HTTPS with a configurable timeout.
- 100 KiB size limit enforced while streaming, before parsing.
- TOML parsing with a typed record and non-table root rejection.
- Structured validation issues (severity, stable code, field path, message).
- Endpoint, `VERSION`, `[DOCUMENTATION]`, `[[CURRENCIES]]`, `[[VALIDATORS]]`, `SIGNING_KEY`, and account-list checks.
- Built-in StrKey checksum validation for `G...` and `M...` account IDs.
- CLI with `--json`, `--strict`, `--timeout`, and `--file` for local TOML.
- Documentation site, CI workflow, issue templates, and test coverage for the above.

## Next

1. **Publish to npm with provenance.** Publish `0.2.0` as a public package, add `publishConfig.access`, and document `npm install stellar-sep-helper`. Verified by installing the published tarball in a scratch project and running the CLI.
2. **Dual ESM/CJS build.** Emit ESM alongside CommonJS with conditional `exports`, keeping the `require` path working. Verified by importing the package from both a `.mjs` and a `.cjs` test project.
3. **SEP-10 client support.** Resolve `WEB_AUTH_ENDPOINT` from a parsed `stellar.toml`, build and sign a challenge transaction, and submit it. Verified against the SEP-10 test vectors in `stellar-protocol` plus a mocked anchor.
4. **SEP-12 customer client.** Typed `GET`/`PUT` customer calls against `KYC_SERVER` with SEP-10 JWT injection. Verified with mocked anchor responses and error-shape tests.
5. **SEP-24 hosted flow helper.** Build the interactive deposit/withdraw URL from a parsed `stellar.toml` and track transaction status polling. Verified with a mocked anchor flow.
6. **SARIF output for the CLI.** Emit SARIF from `--format sarif` so findings appear in GitHub code scanning. Verified by uploading a report for a fixture repo.

## Non-goals

- A hosted validation service or uptime monitor.
- Certifying anchors, assets, or endpoints as safe.
- Enforcing SEP rules that require network access, such as verifying that a `SIGNING_KEY` appears in a domain's `stellar.toml` served from that same domain.
