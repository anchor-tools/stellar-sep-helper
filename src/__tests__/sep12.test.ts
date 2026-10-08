import { fetchToml, validateToml, type Sep12Record } from '../sep12';

describe('SEP-12 Helpers', () => {
  describe('validateToml', () => {
    it('should validate a correct SEP-12 record', () => {
      const record: Sep12Record = {
        VERSION: '2.0.0',
        DOCUMENTATION: {
          ORG_NAME: 'Test Org',
          ORG_URL: 'https://example.com'
        }
      };

      const result = validateToml(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing VERSION', () => {
      const record: Sep12Record = {
        DOCUMENTATION: {
          ORG_NAME: 'Test Org',
          ORG_URL: 'https://example.com'
        }
      };

      const result = validateToml(record);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required VERSION field');
    });

    it('should detect missing DOCUMENTATION', () => {
      const record: Sep12Record = {
        VERSION: '2.0.0'
      };

      const result = validateToml(record);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required DOCUMENTATION section');
    });

    it('should detect missing ORG_NAME in DOCUMENTATION', () => {
      const record: Sep12Record = {
        VERSION: '2.0.0',
        DOCUMENTATION: {
          ORG_URL: 'https://example.com'
        }
      };

      const result = validateToml(record);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DOCUMENTATION.ORG_NAME is required');
    });
  });
});