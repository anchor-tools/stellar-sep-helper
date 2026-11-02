import type { Sep1Record, Sep1ValidationResult } from './sep1';

export interface StellarTomlReport {
  /** Domain name, or file path, that the record came from. */
  label: string;
  /** Well-known URL that was fetched, when the record came from the network. */
  source?: string;
  record: Sep1Record;
  validation: Sep1ValidationResult;
}

/**
 * Render a validation result as a short, human-readable block.
 * The format is stable enough to paste into CI logs or a bug report.
 */
export function formatReport(report: StellarTomlReport): string {
  const { validation } = report;
  const version = typeof report.record.VERSION === 'string' ? report.record.VERSION : '(missing)';
  const heading = report.source ? `${report.label} (${report.source})` : report.label;

  const lines = [
    heading,
    `  VERSION: ${version}`,
    `  Result:  ${validation.valid ? 'valid' : 'invalid'} - ${pluralize(
      validation.errors.length,
      'error'
    )}, ${pluralize(validation.warnings.length, 'warning')}`
  ];

  if (validation.issues.length > 0) {
    const width = Math.max(...validation.issues.map((issue) => issue.path.length));
    lines.push('');

    for (const issue of validation.issues) {
      const label = issue.severity === 'error' ? 'ERROR  ' : 'WARNING';
      lines.push(`  ${label}  ${issue.path.padEnd(width)}  ${issue.message}`);
    }
  }

  return lines.join('\n');
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
