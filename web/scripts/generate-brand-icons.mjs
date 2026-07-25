/**
 * Renders the brand icon set from the mark's geometry.
 *
 * Run with `node scripts/generate-brand-icons.mjs` after changing the numbers
 * below — they are the same ones `src/components/brand/brand-mark.tsx` draws
 * with, traced from the 800px logo.jpg source.
 *
 * The mark is rasterised analytically rather than resampled from the JPEG:
 * the source is progressive and rings badly along the hard black/white edges,
 * which a 16px downsample turns into grey mush. Supersampling the geometry
 * instead gives clean edges at every size, and costs us nothing but this file.
 *
 * No dependencies — PNG and ICO are both written by hand over node:zlib, so
 * this runs anywhere the app builds.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- geometry (100-unit box; see brand-mark.tsx) ------------------------------
const R = 25.31;
const HALF_W = 2.0625;
const REACH = 15.125;

const COS45 = Math.SQRT1_2;

/** Is this point inside the knocked-out asterisk? Coordinates are centre-relative. */
function inAsterisk(dx, dy) {
  if (Math.abs(dx) <= HALF_W && Math.abs(dy) <= REACH) return true;
  // The east arm overshoots to the disc edge; the west arm stops at REACH.
  if (Math.abs(dy) <= HALF_W && dx >= -REACH && dx <= R) return true;
  for (const s of [1, -1]) {
    const rx = COS45 * dx + s * COS45 * dy;
    const ry = -s * COS45 * dx + COS45 * dy;
    if (Math.abs(rx) <= HALF_W && Math.abs(ry) <= REACH) return true;
  }
  return false;
}

const INK = [0x0a, 0x0a, 0x0a]; // the mark's ground — true black, as drawn
const PAPER = [0xff, 0xff, 0xff]; // the disc

/**
 * @param size    edge length in px
 * @param opaque  true for a filled black tile (favicons, app icons); false to
 *                leave the ground transparent so the disc floats.
 */
function render(size, { opaque = true, samples = 4 } = {}) {
  const out = Buffer.alloc(size * size * 4);
  const step = 1 / samples;
  const scale = 100 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let disc = 0;
      let total = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) * step) * scale - 50;
          const py = (y + (sy + 0.5) * step) * scale - 50;
          total++;
          if (px * px + py * py <= R * R && !inAsterisk(px, py)) disc++;
        }
      }
      const t = disc / total;
      const o = (y * size + x) * 4;
      if (opaque) {
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(INK[c] + (PAPER[c] - INK[c]) * t);
        out[o + 3] = 255;
      } else {
        for (let c = 0; c < 3; c++) out[o + c] = PAPER[c];
        out[o + 3] = Math.round(255 * t);
      }
    }
  }
  return out;
}

// --- PNG ---------------------------------------------------------------------
let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function toPng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const o = y * (stride + 1);
    raw[o] = 1; // Sub filter — the mark is flat-field, so this is plenty
    for (let i = 0; i < stride; i++) {
      raw[o + 1 + i] = (rgba[y * stride + i] - (i >= 4 ? rgba[y * stride + i - 4] : 0)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO ---------------------------------------------------------------------
/**
 * Classic BMP-DIB entries, one per size. Deliberately not PNG-in-ICO: that
 * variant is legal since Vista but Turbopack's icon decoder rejects the ones
 * macOS `sips` emits, and BMP entries are universally readable.
 */
function toIco(images) {
  const dir = Buffer.alloc(6 + images.length * 16);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // 1 = icon
  dir.writeUInt16LE(images.length, 4);

  const bodies = [];
  let offset = dir.length;

  images.forEach(({ size, rgba }, i) => {
    const maskStride = ((size + 31) >> 5) * 4; // 1bpp, rows padded to 4 bytes
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // XOR + AND, hence doubled
    header.writeUInt16LE(1, 12); // planes
    header.writeUInt16LE(32, 14); // bpp
    header.writeUInt32LE(0, 16); // BI_RGB
    header.writeUInt32LE(size * size * 4 + maskStride * size, 20);

    const xor = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4; // DIB rows run bottom-up
      for (let x = 0; x < size; x++) {
        const s = src + x * 4;
        const d = (y * size + x) * 4;
        xor[d] = rgba[s + 2]; // B
        xor[d + 1] = rgba[s + 1]; // G
        xor[d + 2] = rgba[s]; // R
        xor[d + 3] = rgba[s + 3]; // A
      }
    }
    // Fully opaque icons, so the legacy AND mask is all-zero (all visible).
    const body = Buffer.concat([header, xor, Buffer.alloc(maskStride * size)]);

    const e = 6 + i * 16;
    dir[e] = size >= 256 ? 0 : size;
    dir[e + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(body.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);

    offset += body.length;
    bodies.push(body);
  });

  return Buffer.concat([dir, ...bodies]);
}

// --- emit --------------------------------------------------------------------
const write = (rel, buf) => {
  const path = join(WEB, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log(`${rel}  ${buf.length.toLocaleString()} bytes`);
};

// Multi-resolution favicon. 64px is the largest worth carrying as BMP — past
// that the file balloons and the PNG icons below take over anyway.
write(
  "src/app/favicon.ico",
  toIco([16, 32, 48, 64].map((size) => ({ size, rgba: render(size, { samples: 8 }) }))),
);

write("src/app/apple-icon.png", toPng(180, render(180)));
write("public/icon-192.png", toPng(192, render(192)));
write("public/icon-512.png", toPng(512, render(512)));
