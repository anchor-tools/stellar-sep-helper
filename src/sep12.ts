/**
 * SEP-12: Stellar TOML
 * https://github.com/stellar/stellar-proposals/blob/master/ecosystem/sep-0012.md
 */

interface Sep12Record {
  [key: string]: string | number | boolean | Sep12Record | Sep12Record[];
}

interface Sep12Options {
  domain: string;
  httpClient?: (url: string) => Promise<any>;
}

/**
 * Fetch and parse a Stellar TOML file from a domain
 * @param options - SEP-12 options
 * @returns Parsed TOML record
 */
export async function fetchToml(options: Sep12Options): Promise<Sep12Record> {
  const url = `https://${options.domain}/stellar.toml`;

  // In a real implementation, we would fetch the TOML file and parse it
  // For now, returning a placeholder structure
  return {
    VERSION: "2.0.0",
    DOCUMENTATION: {
      ORG_URL: `https://${options.domain}`,
      ORG_NAME: `Example Organization on ${options.domain}`
    },
    CURRENCIES: [
      {
        code: "USD",
        issuer: "GA......PLACEHOLDER......",
        display_decimals: 2,
        name: "US Dollar",
        condition: {
          auth_required: true
        }
      }
    ]
  };
}

/**
 * Validate a SEP-12 record against the specification
 * @param record - The TOML record to validate
 * @returns Validation result with any errors
 */
export function validateToml(record: Sep12Record): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required VERSION field
  if (!record.VERSION) {
    errors.push("Missing required VERSION field");
  }

  // Check required DOCUMENTATION section
  if (!record.DOCUMENTATION || typeof record.DOCUMENTATION !== 'object' || Array.isArray(record.DOCUMENTATION)) {
    errors.push("Missing required DOCUMENTATION section");
  } else {
    // We know DOCUMENTATION is an object here, so we can safely access its properties
    const doc = record.DOCUMENTATION as Record<string, unknown>;
    if (!doc.ORG_NAME || typeof doc.ORG_NAME !== 'string') {
      errors.push("DOCUMENTATION.ORG_NAME is required");
    }
    if (!doc.ORG_URL || typeof doc.ORG_URL !== 'string') {
      errors.push("DOCUMENTATION.ORG_URL is required");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export type { Sep12Record, Sep12Options };