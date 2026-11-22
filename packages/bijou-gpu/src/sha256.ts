const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = '0123456789abcdef';

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Length of a message after SHA-256 padding: the message, one `0x80` byte, and
 * the 8-byte bit length, rounded up to a whole 64-byte block.
 *
 * Computed with plain arithmetic. Bitwise shifts would truncate to signed 32
 * bits and go negative for messages of 2 GiB and more.
 */
export function sha256PaddedLength(length: number): number {
  return (Math.floor((length + 8) / 64) + 1) * 64;
}

/**
 * Synchronous, dependency-free SHA-256 returning a lowercase 64-hex digest.
 *
 * The conformance kit hashes frames and prepared buffers in Node, browsers,
 * and workers alike, so it cannot depend on `node:crypto` or on asynchronous
 * `crypto.subtle`.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const length = bytes.length;
  const paddedLength = sha256PaddedLength(length);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor((length * 8) / 0x100000000), false);
  view.setUint32(paddedLength - 4, (length * 8) >>> 0, false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  let hex = '';
  for (const word of state) {
    for (let shift = 28; shift >= 0; shift -= 4) {
      hex += HEX.charAt((word >>> shift) & 0xf);
    }
  }
  return hex;
}

/** Encode a string as UTF-8 without relying on a host `TextEncoder`. */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0xfffd;
    // A lone surrogate has no UTF-8 encoding; encode U+FFFD as TextEncoder does.
    const scalar = codePoint >= 0xd800 && codePoint <= 0xdfff ? 0xfffd : codePoint;
    if (scalar < 0x80) {
      out.push(scalar);
    } else if (scalar < 0x800) {
      out.push(0xc0 | (scalar >>> 6), 0x80 | (scalar & 0x3f));
    } else if (scalar < 0x10000) {
      out.push(0xe0 | (scalar >>> 12), 0x80 | ((scalar >>> 6) & 0x3f), 0x80 | (scalar & 0x3f));
    } else {
      out.push(
        0xf0 | (scalar >>> 18),
        0x80 | ((scalar >>> 12) & 0x3f),
        0x80 | ((scalar >>> 6) & 0x3f),
        0x80 | (scalar & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}
