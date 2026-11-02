# Contributing

Thank you for considering a contribution to Stellar SEP Helper. The project is small on purpose: it should stay readable, tested, and honest about what it supports.

## Before you start

Open an [issue](https://github.com/anchor-tools/stellar-sep-helper/issues) to discuss substantial changes or new SEP support. Protocol work should identify the relevant SEP and section so the behavior can be reviewed against its source. The [roadmap](ROADMAP.md) lists the planned items and how each will be verified; if your idea is not there, say so in an issue first.

Good first contributions:

- Add a validation rule for a SEP-1 field the validator does not cover yet, with fixtures for valid and invalid input.
- Improve an error message or issue code so a failure is easier to act on.
- Add a fixture `stellar.toml` that exercises a real-world anchor layout.
- Fix a documentation gap in the README or the `docs/` site.

## Development

Requirements: Node.js 22 or newer.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

`npm run check` runs all three in one command.

Manual checks against a real domain:

```sh
node dist/cli.js example.com
node dist/cli.js --file ./stellar.toml --strict
```

## Pull requests

1. Fork the repository and create a focused branch.
2. Make the change and add or update tests for behavior changes.
3. Run `npm run check`.
4. Open a pull request describing the motivation, implementation, and relevant SEP sections.

Keep changes focused. Avoid claiming SEP compliance beyond what is implemented and tested, and surface errors rather than substituting placeholder results. New validation rules should land as warnings unless SEP-1 unambiguously requires the field, and every rule needs a test that fails without it.

## Code conventions

- TypeScript, strict mode, CommonJS output targeting Node.js 22+.
- No new runtime dependencies without discussion. StrKey handling and size limits are implemented in-repo on purpose.
- Validation findings are structured issues (`severity`, `code`, `path`, `message`); keep codes stable once released.
- Validation must not perform network requests. Anything that needs the network belongs behind an explicit fetch helper.

## Reporting issues

For bugs and feature requests, [open an issue](https://github.com/anchor-tools/stellar-sep-helper/issues). Include a minimal reproduction for bugs — a short `stellar.toml` snippet or fixture is ideal — and identify the applicable SEP section for protocol questions.

For security-sensitive reports, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
