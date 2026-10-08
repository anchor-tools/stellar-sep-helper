# Contributing

Thank you for considering a contribution to Stellar SEP Helper.

## Before you start

Open an [issue](https://github.com/anchor-tools/stellar-sep-helper/issues) to discuss substantial changes or new SEP support. Protocol work should identify the relevant SEP and section so the behavior can be reviewed against its source.

## Development

Requirements: Node.js 22 or newer.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

## Pull requests

1. Fork the repository and create a focused branch.
2. Make the change and add or update tests for behavior changes.
3. Run all four commands above.
4. Open a pull request describing the motivation, implementation, and relevant SEP sections.

Keep changes focused, avoid claiming SEP compliance beyond what is implemented and tested, and surface errors rather than substituting placeholder results.

## Reporting issues

For bugs and feature requests, [open an issue](https://github.com/anchor-tools/stellar-sep-helper/issues). Include a minimal reproduction for bugs and identify the applicable SEP section for protocol questions.

For security-sensitive reports, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
