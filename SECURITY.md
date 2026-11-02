# Security policy

## Supported versions

Only the latest release on `main` receives security fixes. This project is pre-1.0: versions before `0.1.0` were placeholders and are not supported.

## Reporting a vulnerability

Please do not disclose an unpatched vulnerability in a public issue. Use [GitHub's private vulnerability reporting](https://github.com/anchor-tools/stellar-sep-helper/security/advisories/new). Include the affected version, impact, and reproduction steps where possible.

This project is early-stage and has not undergone a security audit. Do not treat its validation as a security or SEP-conformance guarantee.

## Automated protections

| Layer | Where | What it does |
| --- | --- | --- |
| CodeQL code scanning | `.github/workflows/codeql.yml` | Runs `security-extended` queries for JavaScript/TypeScript on every pull request and `main` push, plus a weekly schedule. Results appear in the repository's Security tab. |
| Contributor code scan | `.github/workflows/security.yml`, `scripts/security-scan.mjs` | Inspects added lines in a pull request for supply-chain and malware patterns, and flags changes to CI automation. |
| Dependency review | `.github/workflows/dependency-review.yml` | Fails a pull request that adds a dependency with a high or critical advisory, and comments the summary on failure. |
| Dependency audit | `.github/workflows/security.yml` | Runs `npm audit --package-lock-only --audit-level=high`, without installing untrusted packages. |
| Dependabot | `.github/dependabot.yml` | Opens grouped weekly updates for npm dependencies and GitHub Actions. |
| Secret scanning | Repository setting | GitHub secret scanning with push protection should be enabled by an admin; see below. |
| Private reporting | Repository setting | Advisory intake via GitHub private vulnerability reporting. |

## What the contributor scan checks

The scanner reads **added lines only**, so an existing pattern in the codebase does not create noise on unrelated pull requests.

| Rule | Severity | Flags |
| --- | --- | --- |
| `install-script` | error | A new or changed npm lifecycle install hook in `package.json`. |
| `remote-shell` | error | A download piped into a shell or interpreter. |
| `dynamic-code` | error | `eval` or `new Function` applied to a decoded string. |
| `shell-network` | error | A shell process launched with a network client. |
| `reverse-shell` | error | Reverse shell patterns. |
| `env-exfiltration` | error | Environment variables sent to a remote endpoint. |
| `private-key` | error | Private key material; the log excerpt is redacted. |
| `access-token` | error | GitHub or AWS token shapes; the log excerpt is redacted. |
| `encoded-blob` | warning | A long encoded blob reviewers cannot read. |
| `executable-script` | warning | A new shell script that needs reading. |
| `binary-file` | error | An executable or binary artifact added to the repo. |
| `ci-automation-change` | review | Changes to workflows, Actions, Dependabot, or `CODEOWNERS`. |
| `scanner-change` | review | Changes to the scanner itself. |

`review` findings block the job until a maintainer reads the diff and applies the **`security-approved`** label to the pull request. Every other error requires a code change, not a label.

Run it locally:

```sh
node scripts/security-scan.mjs --all
node scripts/security-scan.mjs --base origin/main
node scripts/security-scan.mjs --self-test
```

## Limits

These are heuristics. They can produce false positives and will miss novel attacks, obfuscation, and anything that only runs after merge. They are not a sandbox, antivirus, or a substitute for reviewing security-sensitive diffs.

CI runs contributor code (tests and builds) with a read-only token and no repository secrets. Do not add secrets to workflows that run on `pull_request`; use `pull_request_target` never, and if a secret is truly required, gate it behind an environment with required reviewers.

## Recommended repository settings

These settings live in GitHub, not in the repository, and must be applied by an admin:

1. **Settings → Code security:** enable Dependabot alerts, secret scanning, push protection, and private vulnerability reporting. Keep CodeQL on the workflow in this repository rather than default setup, so the query suite is pinned in code.
2. **Settings → Branches → `main`:** require a pull request before merging, require the checks `Build and test (22)`, `Build and test (24)`, `Contributor code scan`, `Analyze JavaScript and TypeScript`, and `Review dependency changes`, and block force pushes. Leave "Do not allow bypassing the above settings" off unless you want the rules applied to admins too.

```sh
gh api -X PUT repos/anchor-tools/stellar-sep-helper/branches/main/protection \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=Build and test (22)' \
  -f 'required_status_checks[contexts][]=Build and test (24)' \
  -f 'required_status_checks[contexts][]=Contributor code scan' \
  -f 'required_status_checks[contexts][]=Analyze JavaScript and TypeScript' \
  -f 'required_status_checks[contexts][]=Review dependency changes' \
  -f 'enforce_admins=false' \
  -f 'required_pull_request_reviews[required_approving_review_count]=1' \
  -f 'restrictions=null'
```

3. **Settings → General:** disable force pushes and limit who can push to `main`. Require two-factor authentication for organization members.

## If the scan flags a pull request

1. Read the flagged lines yourself. Do not apply `security-approved` without reading the diff.
2. Ask the contributor to explain the change and to remove anything that is not required for the issue.
3. If the change is legitimate and necessary, apply the `security-approved` label and document why in the pull request.
4. If it looks malicious, close the pull request, remove the contributor's access, and report the account to GitHub. Rotate any credential that may have been exposed, then publish an advisory if users are affected.
