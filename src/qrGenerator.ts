/**
 * Self-contained QR Code Generator (No external network requests or dependencies)
 * Generates clean SVG markup for any URL or room join link.
 */

// GF(256) math tables for Reed-Solomon Error Correction
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP_TABLE[i] = x;
  LOG_TABLE[x] = i;
  x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 255];
}

function gmult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmult(poly[j], EXP_TABLE[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const feedback = data[i] ^ res[0];
    for (let j = 0; j < ecCount - 1; j++) {
      res[j] = res[j + 1] ^ gmult(gen[j], feedback);
    }
    res[ecCount - 1] = gmult(gen[ecCount - 1], feedback);
  }
  return res;
}

// Version table configs for Byte mode with Error Correction Level L/M
// Version 3: 29x29, total bytes = 70, ec = 15, data = 55
// Version 4: 33x33, total bytes = 100, ec = 20, data = 80
// Version 5: 37x37, total bytes = 134, ec = 26, data = 108
interface VersionSpec {
  version: number;
  size: number;
  dataCapacity: number;
  ecCount: number;
  alignments: number[];
}

const VERSIONS: VersionSpec[] = [
  { version: 2, size: 25, dataCapacity: 34, ecCount: 10, alignments: [6, 18] },
  { version: 3, size: 29, dataCapacity: 55, ecCount: 15, alignments: [6, 22] },
  { version: 4, size: 33, dataCapacity: 80, ecCount: 20, alignments: [6, 26] },
  { version: 5, size: 37, dataCapacity: 108, ecCount: 26, alignments: [6, 30] },
  { version: 6, size: 41, dataCapacity: 136, ecCount: 36, alignments: [6, 34] }
];

export function generateQrSvg(text: string, pixelSize: number = 200): string {
  const textBytes = new TextEncoder().encode(text);
  
  // Pick version that fits the text
  let spec = VERSIONS.find(v => v.dataCapacity >= textBytes.length + 3);
  if (!spec) {
    spec = VERSIONS[VERSIONS.length - 1];
  }

  const { size, dataCapacity, ecCount, alignments } = spec;

  // Encode byte stream: 4 bits mode (0100 for Byte) + 8 bits length + data + terminator + pad
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(4, 4); // Byte mode (0100)
  pushBits(textBytes.length, 8); // Length
  for (const b of textBytes) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zeros)
  const maxBits = dataCapacity * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes: alternating 0xEC (236) and 0x11 (17)
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to data bytes
  const dataBytes = new Uint8Array(dataCapacity);
  for (let i = 0; i < dataCapacity; i++) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bits[i * 8 + j];
    }
    dataBytes[i] = byteVal;
  }

  // Compute Reed-Solomon EC bytes
  const ecBytes = rsEncode(dataBytes, ecCount);

  // Combined codeword stream
  const allCodewords = new Uint8Array(dataBytes.length + ecBytes.length);
  allCodewords.set(dataBytes);
  allCodewords.set(ecBytes, dataBytes.length);

  // Setup QR Matrix
  const matrix: (number | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: number, isFunc: boolean = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isFunc) isFunction[r][c] = true;
    }
  };

  // 1. Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          setModule(nr, nc, 0); // white separator
        } else if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          setModule(nr, nc, 1);
        } else {
          setModule(nr, nc, 0);
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    setModule(6, i, val);
    setModule(i, 6, val);
  }

  // 3. Alignment pattern (if version >= 2)
  if (alignments.length > 0) {
    const r = alignments[alignments.length - 1];
    const c = alignments[alignments.length - 1];
    if (matrix[r][c] === null) {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCenter = dr === 0 && dc === 0;
          setModule(r + dr, c + dc, isBorder || isCenter ? 1 : 0);
        }
      }
    }
  }

  // 4. Reserve Format Information areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) setModule(8, i, 0);
    if (!isFunction[i][8]) setModule(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setModule(8, size - 1 - i, 0);
    if (!isFunction[size - 1 - i][8]) setModule(size - 1 - i, 8, 0);
  }
  // Dark module
  setModule(size - 8, 8, 1);

  // 5. Place data bits using zigzag path
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  const getBit = (idx: number) => {
    if (idx >= totalBits) return 0;
    const byte = allCodewords[Math.floor(idx / 8)];
    return (byte >> (7 - (idx % 8))) & 1;
  };

  let upwards = true;
  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing column
    const colList = [rightCol, rightCol - 1];
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of colList) {
        if (!isFunction[r][c]) {
          const dataBit = getBit(bitIdx++);
          // Mask pattern 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0 ? 1 : 0;
          matrix[r][c] = dataBit ^ mask;
        }
      }
    }
    upwards = !upwards;
  }

  // 6. Write Format Info (Mask 0, Error Correction L = 01 -> format 0x77C4 with BCH)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Write format info around top-left finder
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  // Write format info split between bottom-left and top-right
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i];
  for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i];

  // Build SVG string
  const margin = 2;
  const viewBoxSize = size + margin * 2;
  let rects = '';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#0B1220"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges">
    <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#FFFFFF" rx="2"/>
    ${rects}
  </svg>`;
}
