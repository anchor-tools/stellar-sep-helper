# Stellar SEP Helper

Small TypeScript utilities for **SEP-1 Stellar TOML** discovery, parsing, and baseline validation. This project is intentionally focused: it does not currently implement SEP-10 authentication, SEP-12 customer information, SEP-24 transfers, or SEP-31 payments.

[Read the documentation](https://anchor-tools.github.io/stellar-sep-helper/) · [Contributing](CONTRIBUTING.md) · [Report a bug](https://github.com/anchor-tools/stellar-sep-helper/issues/new)

## What it does

- Fetches `https://<domain>/.well-known/stellar.toml` over HTTPS.
- Parses TOML into a JavaScript record.
- Checks the SEP-1 version field, common HTTPS endpoint fields, and optional documentation field types.
- Enforces SEP-1's 100 KiB maximum file size before parsing.

The validator is a useful sanity check, **not** a complete SEP-1 conformance validator. Consult the [SEP-1 specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md) when publishing or consuming Stellar TOML.

## Requirements

- Node.js 22 or newer
- TypeScript 5 or newer to build from source

## Install

```sh
npm install github:anchor-tools/stellar-sep-helper
```

The project is not currently published to the npm registry, so install it from GitHub as shown above.

## Quick start

```ts
import {
  fetchStellarToml,
  validateStellarToml
} from 'stellar-sep-helper';

const stellarToml = await fetchStellarToml({ domain: 'example.com' });
const result = validateStellarToml(stellarToml);

if (!result.valid) {
  console.error(result.errors);
}
```

`fetchStellarToml` uses Node's built-in `fetch` by default. Supply a `fetcher` option to provide a custom implementation (for example, in tests). Fetch and TOML parse failures reject with an error; HTTP responses outside the success range are not treated as valid data.

Use `parseStellarToml(source)` to parse TOML text without making a network request.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. The documentation site source is in [`docs/`](docs/).
The docs workflow publishes it to GitHub Pages on pushes to `main`; enable **Settings → Pages → Build and deployment → GitHub Actions** in the repository if Pages is not already configured.

## License

MIT. See [LICENSE](LICENSE).
