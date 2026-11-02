/**
 * Minimal StrKey (Stellar base32 + CRC16-XModem) validation.
 *
 * Only the encodings relevant to SEP-1 metadata are supported: ed25519 public
 * keys (`G...`) and muxed account IDs (`M...`). Secret seeds are deliberately
 * rejected so a `stellar.toml` can never validate with a private key in it.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const CHECKSUM_BYTES = 2;

/** Version byte for ed25519 public keys, `6 << 3`. */
const ED25519_PUBLIC_KEY_VERSION = 6 << 3;

/** Version byte for muxed account IDs, `12 << 3`. */
const MUXED_ACCOUNT_VERSION = 12 << 3;

const ED25519_PUBLIC_KEY_LENGTH = 1 + 32 + CHECKSUM_BYTES;
const MUXED_ACCOUNT_LENGTH = 1 + 8 + 32 + CHECKSUM_BYTES;

/** True when `value` is a well-formed `G...` ed25519 public key. */
export function isEd25519PublicKey(value: unknown): boolean {
  return typeof value === 'string' && isValidStrKey(value, ED25519_PUBLIC_KEY_VERSION, ED25519_PUBLIC_KEY_LENGTH);
}

/** True when `value` is a well-formed `M...` muxed account ID. */
export function isMuxedAccountId(value: unknown): boolean {
  return typeof value === 'string' && isValidStrKey(value, MUXED_ACCOUNT_VERSION, MUXED_ACCOUNT_LENGTH);
}

/** True when `value` is a well-formed Stellar account ID (`G...` or `M...`). */
export function isStellarAccountId(value: unknown): boolean {
  return isEd25519PublicKey(value) || isMuxedAccountId(value);
}

function isValidStrKey(value: string, versionByte: number, expectedLength: number): boolean {
  const decoded = decodeBase32(value);
  if (decoded === null || decoded.length !== expectedLength) return false;

  const payload = decoded.subarray(0, decoded.length - CHECKSUM_BYTES);
  if (payload[0] !== versionByte) return false;

  const checksum = decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8);
  return checksum === crc16Xmodem(payload);
}

function decodeBase32(value: string): Uint8Array | null {
  if (value.length === 0) return null;

  const output = new Uint8Array(Math.floor((value.length * 5) / 8));
  let index = 0;
  let buffer = 0;
  let bits = 0;

  for (const char of value) {
    const digit = BASE32_ALPHABET.indexOf(char);
    if (digit === -1) return null;

    buffer = (buffer << 5) | digit;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      output[index++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }

  // A canonical StrKey never carries non-zero trailing bits.
  if (buffer !== 0) return null;
  return output.subarray(0, index);
}

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;

  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc & 0xffff;
}
