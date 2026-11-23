// Tiny animated-GIF encoder (no dependencies).
// Frames are RGBA buffers of the same size; one shared 255-colour palette (median cut) + 1 transparent index.

function medianCut(samples, maxColors) {
  // samples: array of [r,g,b]
  let boxes = [samples];
  while (boxes.length < maxColors) {
    let bi = -1;
    let best = -1;
    let bestCh = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255;
        let hi = 0;
        for (const p of b) {
          if (p[ch] < lo) lo = p[ch];
          if (p[ch] > hi) hi = p[ch];
        }
        const range = (hi - lo) * Math.sqrt(b.length);
        if (range > best) {
          best = range;
          bi = i;
          bestCh = ch;
        }
      }
    }
    if (bi === -1 || best <= 0) break;
    const b = boxes[bi].sort((x, y) => x[bestCh] - y[bestCh]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    for (const p of b) {
      r += p[0];
      g += p[1];
      bl += p[2];
    }
    return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)];
  });
}

function buildPalette(frames) {
  const samples = [];
  const per = Math.max(1, Math.floor(frames.length / 6));
  for (let f = 0; f < frames.length; f += per) {
    const d = frames[f];
    for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3] >= 128) samples.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (!samples.length) samples.push([0, 0, 0]);
  const colors = medianCut(samples, 255);
  while (colors.length < 255) colors.push([0, 0, 0]);
  return colors; // index 255 = transparent
}

function mapper(colors) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = cache[key];
    if (v !== -1) return v;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      const dr = c[0] - r;
      const dg = c[1] - g;
      const db = c[2] - b;
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    cache[key] = best;
    return best;
  };
}

function lzw(indices, minCode = 8) {
  const out = [];
  let cur = 0;
  let bits = 0;
  let size = minCode + 1;
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const emit = (code) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(cur & 255);
      cur >>= 8;
      bits -= 8;
    }
  };
  let dict = new Map();
  let next = eoi + 1;
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      size = minCode + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}

/**
 * @param {number} w
 * @param {number} h
 * @param {{data: Uint8Array|Buffer, delay: number}[]} frames  delay in ms
 * @param {{loop?: boolean}} opts  loop=false → plays once
 */
function encode(w, h, frames, { loop = false } = {}) {
  const colors = buildPalette(frames.map((f) => f.data));
  const map = mapper(colors);
  const parts = [];
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  parts.push(Buffer.from('GIF89a'), Buffer.from([...u16(w), ...u16(h), 0xf7, 0, 0]));
  const pal = Buffer.alloc(768);
  colors.forEach((c, i) => pal.set(c, i * 3));
  parts.push(pal);
  if (loop) parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0]));
  const idx = new Uint8Array(w * h);
  for (const f of frames) {
    const d = f.data;
    for (let p = 0, i = 0; p < idx.length; p++, i += 4) idx[p] = d[i + 3] < 128 ? 255 : map(d[i], d[i + 1], d[i + 2]);
    const delay = Math.max(2, Math.round((f.delay || 50) / 10));
    // disposal 2 (restore to background) so transparent edges don't smear
    parts.push(Buffer.from([0x21, 0xf9, 4, (2 << 2) | 1, ...u16(delay), 255, 0]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, ...u16(w), ...u16(h), 0]));
    const data = lzw(idx);
    const chunks = [8];
    for (let i = 0; i < data.length; i += 255) {
      const c = data.slice(i, i + 255);
      chunks.push(c.length, ...c);
    }
    chunks.push(0);
    parts.push(Buffer.from(chunks));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

module.exports = { encode };
