/**
 * Pure Node.js PNG icon generator with zero external dependencies
 * Generates valid icon-192.png and icon-512.png
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function createPNG(width, height) {
  // RGBA buffer: height rows, each row has 1 filter byte (0) + width * 4 bytes
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded rect boundary check
      const cornerR = width * 0.22;
      const qx = Math.abs(x - cx) - (cx - cornerR);
      const qy = Math.abs(y - cy) - (cy - cornerR);
      const isInsideCard = (qx <= 0 || qy <= 0 || (qx * qx + qy * qy <= cornerR * cornerR));

      if (!isInsideCard) {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Background dark cinema gradient: #09090b to #18181b
      let rVal = 14 + (y / height) * 12;
      let gVal = 14 + (y / height) * 12;
      let bVal = 20 + (y / height) * 16;
      let alpha = 255;

      // Play triangle: points roughly (0.42*w, 0.32*h), (0.68*w, 0.5*h), (0.42*w, 0.68*h)
      const p1x = 0.42 * width, p1y = 0.34 * height;
      const p2x = 0.68 * width, p2y = 0.50 * height;
      const p3x = 0.42 * width, p3y = 0.66 * height;

      // Check if inside play triangle
      const d1 = (x - p2x) * (p1y - p2y) - (p1x - p2x) * (y - p2y);
      const d2 = (x - p3x) * (p2y - p3y) - (p2x - p3x) * (y - p3y);
      const d3 = (x - p1x) * (p3y - p1y) - (p3x - p1x) * (y - p1y);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      const inTriangle = !(hasNeg && hasPos);

      // Ring border
      const inRing = Math.abs(dist - r) < (width * 0.025);

      if (inTriangle) {
        // Vibrant Violet to Cyan gradient: #8b5cf6 -> #06b6d4
        const t = (x / width);
        rVal = Math.round(139 * (1 - t) + 6 * t);
        gVal = Math.round(92 * (1 - t) + 182 * t);
        bVal = Math.round(246 * (1 - t) + 212 * t);
      } else if (inRing) {
        rVal = 139;
        gVal = 92;
        bVal = 246;
      }

      rawData[pxOffset] = rVal;
      rawData[pxOffset + 1] = gVal;
      rawData[pxOffset + 2] = bVal;
      rawData[pxOffset + 3] = alpha;
    }
  }

  // Compress IDAT chunk
  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeInt32BE(crc, 8 + length);
  return chunk;
}

// CRC32 table & implementation
let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }
  return crcTable;
}

function crc32(buf) {
  const table = getCrcTable();
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}

const iconsDir = path.join(__dirname, 'public', 'icons');
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPNG(192, 192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPNG(512, 512));

console.log('Successfully generated valid icon-192.png and icon-512.png!');
