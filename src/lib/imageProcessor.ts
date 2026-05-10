export type DitheringMode = "none" | "floyd" | "ordered" | "threshold" | "error";
export type NeuroFilter = "none" | "engrave" | "lineart" | "stipple" | "crosshatch" | "blueprint";

export interface ProcessOptions {
  contrast: number;
  brightness: number;
  sharpness: number;
  grayscale: number;
  threshold: number;
  gamma: number;
  bitDepth: 1 | 8;
  dithering: DitheringMode;
  skinSmooth?: number;   // 0–100
  autoRetouch?: boolean;
  removeBg?: boolean;
  neuroFilter?: NeuroFilter;
}

// Ordered Bayer 4×4 matrix
const BAYER4: number[][] = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function applyGamma(v: number, gamma: number): number {
  return Math.pow(v / 255, 1 / gamma) * 255;
}

// ── Gaussian blur (for skin smooth & bg removal) ──────────────────────────────
function applyGaussianBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  if (radius <= 0) return data;
  const r = Math.round(radius);
  const kernel: number[] = [];
  const sigma = radius / 3;
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  const k = kernel.map(v => v / sum);
  const tmp = new Uint8ClampedArray(data.length);
  // horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rv = 0, gv = 0, bv = 0;
      for (let i = -r; i <= r; i++) {
        const nx = Math.min(w - 1, Math.max(0, x + i));
        const ni = (y * w + nx) * 4;
        rv += data[ni] * k[i + r];
        gv += data[ni + 1] * k[i + r];
        bv += data[ni + 2] * k[i + r];
      }
      const oi = (y * w + x) * 4;
      tmp[oi] = clamp(rv); tmp[oi+1] = clamp(gv); tmp[oi+2] = clamp(bv); tmp[oi+3] = data[oi+3];
    }
  }
  const out = new Uint8ClampedArray(data.length);
  // vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rv = 0, gv = 0, bv = 0;
      for (let i = -r; i <= r; i++) {
        const ny = Math.min(h - 1, Math.max(0, y + i));
        const ni = (ny * w + x) * 4;
        rv += tmp[ni] * k[i + r];
        gv += tmp[ni + 1] * k[i + r];
        bv += tmp[ni + 2] * k[i + r];
      }
      const oi = (y * w + x) * 4;
      out[oi] = clamp(rv); out[oi+1] = clamp(gv); out[oi+2] = clamp(bv); out[oi+3] = data[oi+3];
    }
  }
  return out;
}

// ── Skin smooth: blur only skin-toned pixels ─────────────────────────────────
function isSkinPixel(r: number, g: number, b: number): boolean {
  // RGB skin range heuristic
  return r > 95 && g > 40 && b > 20
    && Math.max(r, g, b) - Math.min(r, g, b) > 15
    && r > g && r > b
    && Math.abs(r - g) > 15;
}

export function applySkinSmooth(data: Uint8ClampedArray, w: number, h: number, amount: number): Uint8ClampedArray {
  if (amount <= 0) return data;
  const radius = Math.round(amount / 100 * 8);
  const blurred = applyGaussianBlur(data, w, h, radius);
  const out = new Uint8ClampedArray(data.length);
  const strength = amount / 100;
  for (let i = 0; i < w * h; i++) {
    const ri = i * 4;
    const r = data[ri], g = data[ri+1], b = data[ri+2];
    if (isSkinPixel(r, g, b)) {
      out[ri]   = Math.round(r * (1 - strength) + blurred[ri]   * strength);
      out[ri+1] = Math.round(g * (1 - strength) + blurred[ri+1] * strength);
      out[ri+2] = Math.round(b * (1 - strength) + blurred[ri+2] * strength);
    } else {
      out[ri] = r; out[ri+1] = g; out[ri+2] = b;
    }
    out[ri+3] = data[ri+3];
  }
  return out;
}

// ── Auto retouch: local contrast enhancement + mild denoise ──────────────────
export function applyAutoRetouch(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  // Step 1: mild Gaussian denoise
  const denoised = applyGaussianBlur(data, w, h, 0.8);
  // Step 2: unsharp mask (original - blurred*0.3 + boost)
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < w * h; i++) {
    const ri = i * 4;
    for (let c = 0; c < 3; c++) {
      const orig = data[ri + c];
      const blurred = denoised[ri + c];
      // unsharp mask: v = orig + 0.4*(orig - blurred)
      out[ri + c] = clamp(orig + 0.4 * (orig - blurred));
    }
    out[ri + 3] = data[ri + 3];
    // Mild shadows lift
    const lum = 0.299 * out[ri] + 0.587 * out[ri+1] + 0.114 * out[ri+2];
    if (lum < 80) {
      const lift = (80 - lum) / 80 * 30;
      for (let c = 0; c < 3; c++) out[ri + c] = clamp(out[ri + c] + lift);
    }
  }
  return out;
}

// ── Background removal: simple chroma-key / corner-flood approach ─────────────
export function applyRemoveBg(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  // Sample background color from 4 corners
  const corners = [0, (w - 1), (h - 1) * w, (h - 1) * w + (w - 1)];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const c of corners) {
    bgR += data[c * 4]; bgG += data[c * 4 + 1]; bgB += data[c * 4 + 2];
  }
  bgR = Math.round(bgR / 4); bgG = Math.round(bgG / 4); bgB = Math.round(bgB / 4);

  const tolerance = 40;
  const visited = new Uint8Array(w * h);
  const out = new Uint8ClampedArray(data);
  const queue: number[] = [...corners];

  // BFS flood fill from corners
  while (queue.length > 0) {
    const idx = queue.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const ri = idx * 4;
    const r = data[ri], g = data[ri+1], b = data[ri+2];
    const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    if (dist > tolerance) continue;
    // Mark as transparent
    out[ri] = 255; out[ri+1] = 255; out[ri+2] = 255; out[ri+3] = 255;
    const x = idx % w, y = Math.floor(idx / w);
    if (x > 0) queue.push(idx - 1);
    if (x < w - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - w);
    if (y < h - 1) queue.push(idx + w);
  }
  return out;
}

// ── Neuro filters ─────────────────────────────────────────────────────────────
export function applyNeuroFilter(
  data: Uint8ClampedArray, w: number, h: number, filter: NeuroFilter
): Uint8ClampedArray {
  if (filter === "none") return data;

  const out = new Uint8ClampedArray(data.length);

  if (filter === "engrave") {
    // High-contrast emboss + edge enhancement
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const ri = i * 4;
        const lum = (data[ri] * 0.299 + data[ri+1] * 0.587 + data[ri+2] * 0.114);
        // Emboss kernel
        const tl = y > 0 && x > 0 ? (data[((y-1)*w+(x-1))*4] * 0.299 + data[((y-1)*w+(x-1))*4+1] * 0.587 + data[((y-1)*w+(x-1))*4+2] * 0.114) : lum;
        const emboss = clamp(lum - tl + 128);
        out[ri] = out[ri+1] = out[ri+2] = emboss;
        out[ri+3] = 255;
      }
    }
  } else if (filter === "lineart") {
    // Sobel edge detection
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const lum = (px: number, py: number) => {
          const ii = (py * w + px) * 4;
          return data[ii] * 0.299 + data[ii+1] * 0.587 + data[ii+2] * 0.114;
        };
        const gx = -lum(x-1,y-1) + lum(x+1,y-1) - 2*lum(x-1,y) + 2*lum(x+1,y) - lum(x-1,y+1) + lum(x+1,y+1);
        const gy = -lum(x-1,y-1) - 2*lum(x,y-1) - lum(x+1,y-1) + lum(x-1,y+1) + 2*lum(x,y+1) + lum(x+1,y+1);
        const mag = clamp(Math.sqrt(gx*gx + gy*gy));
        const edge = 255 - mag; // invert: lines are dark on white
        const ri = (y * w + x) * 4;
        out[ri] = out[ri+1] = out[ri+2] = edge;
        out[ri+3] = 255;
      }
    }
    // Fill border
    for (let x = 0; x < w; x++) { const ri = x*4; out[ri]=out[ri+1]=out[ri+2]=255; out[ri+3]=255; const ri2=((h-1)*w+x)*4; out[ri2]=out[ri2+1]=out[ri2+2]=255; out[ri2+3]=255; }
    for (let y = 0; y < h; y++) { const ri = (y*w)*4; out[ri]=out[ri+1]=out[ri+2]=255; out[ri+3]=255; const ri2=(y*w+w-1)*4; out[ri2]=out[ri2+1]=out[ri2+2]=255; out[ri2+3]=255; }
  } else if (filter === "stipple") {
    // Halftone dots
    const dotSize = 6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ri = (y * w + x) * 4;
        const cellX = x % dotSize, cellY = y % dotSize;
        const cx = Math.floor(x / dotSize) * dotSize + dotSize / 2;
        const cy = Math.floor(y / dotSize) * dotSize + dotSize / 2;
        const srcI = (Math.min(h-1,cy) * w + Math.min(w-1,cx)) * 4;
        const lum = data[srcI] * 0.299 + data[srcI+1] * 0.587 + data[srcI+2] * 0.114;
        const radius = ((255 - lum) / 255) * (dotSize / 2);
        const dist = Math.sqrt((cellX - dotSize/2)**2 + (cellY - dotSize/2)**2);
        const v = dist < radius ? 0 : 255;
        out[ri] = out[ri+1] = out[ri+2] = v; out[ri+3] = 255;
      }
    }
  } else if (filter === "crosshatch") {
    // Crosshatch based on luminance bands
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ri = (y * w + x) * 4;
        const lum = data[ri] * 0.299 + data[ri+1] * 0.587 + data[ri+2] * 0.114;
        let v = 255;
        const spacing = 6;
        if (lum < 200 && (x + y) % spacing === 0) v = 0;
        if (lum < 150 && (x - y + 1000) % spacing === 0) v = 0;
        if (lum < 100 && x % spacing === 0) v = 0;
        if (lum < 50  && y % spacing === 0) v = 0;
        out[ri] = out[ri+1] = out[ri+2] = v; out[ri+3] = 255;
      }
    }
  } else if (filter === "blueprint") {
    // Blue-tinted technical drawing look
    for (let i = 0; i < w * h; i++) {
      const ri = i * 4;
      const lum = data[ri] * 0.299 + data[ri+1] * 0.587 + data[ri+2] * 0.114;
      const invLum = 255 - lum;
      out[ri]   = clamp(20 + invLum * 0.1);
      out[ri+1] = clamp(40 + invLum * 0.3);
      out[ri+2] = clamp(180 + invLum * 0.3);
      out[ri+3] = 255;
    }
    // Add white lines (edge detection)
    const edges = applyNeuroFilter(data, w, h, "lineart");
    for (let i = 0; i < w * h; i++) {
      const ri = i * 4;
      if (edges[ri] < 100) { out[ri] = 220; out[ri+1] = 235; out[ri+2] = 255; }
    }
  }

  return out;
}

function applySharpen(data: Uint8ClampedArray, w: number, h: number, amount: number): Uint8ClampedArray {
  if (amount === 0) return data;
  const k = amount / 100 * 1.5;
  const kernel = [-k, -k, -k, -k, 1 + 8 * k, -k, -k, -k, -k];
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      let r = 0, g = 0, b = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          const ni = (ny * w + nx) * 4;
          r += data[ni]     * kernel[ki];
          g += data[ni + 1] * kernel[ki];
          b += data[ni + 2] * kernel[ki];
          ki++;
        }
      }
      out[idx]     = clamp(r);
      out[idx + 1] = clamp(g);
      out[idx + 2] = clamp(b);
      out[idx + 3] = data[idx + 3];
    }
  }
  return out;
}

export function processImage(
  src: HTMLImageElement,
  opts: ProcessOptions,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0);

  const { width: w, height: h } = canvas;
  let { data } = ctx.getImageData(0, 0, w, h);

  // Background removal (before other processing)
  if (opts.removeBg) {
    data = applyRemoveBg(data, w, h);
  }

  // Skin smooth
  if (opts.skinSmooth && opts.skinSmooth > 0) {
    data = applySkinSmooth(data, w, h, opts.skinSmooth);
  }

  // Auto retouch
  if (opts.autoRetouch) {
    data = applyAutoRetouch(data, w, h);
  }

  // Neuro filter (applied before grayscale/contrast)
  if (opts.neuroFilter && opts.neuroFilter !== "none") {
    data = applyNeuroFilter(data, w, h, opts.neuroFilter);
  }

  // Sharpen
  if (opts.sharpness > 0) {
    data = applySharpen(data, w, h, opts.sharpness);
  }

  // Build lookup table for contrast + brightness + gamma
  const contrastFactor = (259 * (opts.contrast * 2.55 + 255 - 127.5)) / (255 * (259 - (opts.contrast * 2.55)));
  const brightnessOffset = (opts.brightness - 50) / 50 * 80;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    v = clamp(contrastFactor * (v - 128) + 128 + brightnessOffset);
    v = clamp(applyGamma(v, opts.gamma));
    lut[i] = v;
  }

  // Apply grayscale + lut per pixel
  const grayRatio = opts.grayscale / 100;
  const pixels = new Uint8Array(w * h); // grayscale values

  for (let i = 0; i < w * h; i++) {
    const ri = i * 4;
    let r = lut[data[ri]];
    let g = lut[data[ri + 1]];
    let b = lut[data[ri + 2]];
    // Mix toward gray
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = Math.round(r * (1 - grayRatio) + lum * grayRatio);
    g = Math.round(g * (1 - grayRatio) + lum * grayRatio);
    b = Math.round(b * (1 - grayRatio) + lum * grayRatio);
    pixels[i] = clamp(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Dithering / bit depth
  const out = new Uint8ClampedArray(w * h * 4);

  if (opts.bitDepth === 1) {
    const errors = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const val = pixels[i] + errors[i];
        let result: number;

        if (opts.dithering === "floyd" || opts.dithering === "error") {
          result = val < opts.threshold ? 0 : 255;
          const err = val - result;
          if (x + 1 < w)           errors[i + 1]     += err * 7 / 16;
          if (y + 1 < h) {
            if (x > 0)             errors[i + w - 1] += err * 3 / 16;
                                   errors[i + w]     += err * 5 / 16;
            if (x + 1 < w)         errors[i + w + 1] += err * 1 / 16;
          }
        } else if (opts.dithering === "ordered") {
          const threshold = (BAYER4[y % 4][x % 4] / 16) * 255;
          result = pixels[i] > threshold ? 255 : 0;
        } else {
          // none / threshold
          result = pixels[i] < opts.threshold ? 0 : 255;
        }

        const oi = i * 4;
        out[oi] = out[oi + 1] = out[oi + 2] = result;
        out[oi + 3] = 255;
      }
    }
  } else {
    // 8-bit grayscale
    for (let i = 0; i < w * h; i++) {
      const v = pixels[i];
      const oi = i * 4;
      out[oi] = out[oi + 1] = out[oi + 2] = v;
      out[oi + 3] = 255;
    }
  }

  const imgData = new ImageData(out, w, h);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// Download as PNG
export function downloadPNG(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/\.[^.]+$/, "") + "_laser.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
}

// Download as BMP (1-bit or 8-bit uncompressed)
export function downloadBMP(canvas: HTMLCanvasElement, filename: string, bitDepth: 1 | 8) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);

  if (bitDepth === 8) {
    // 8-bit grayscale BMP with palette
    const rowSize = Math.ceil(w / 4) * 4; // rows padded to 4 bytes
    const pixelDataSize = rowSize * h;
    const paletteSize = 256 * 4;
    const headerSize = 54 + paletteSize;
    const fileSize = headerSize + pixelDataSize;
    const buf = new ArrayBuffer(fileSize);
    const view = new DataView(buf);

    // BMP file header
    view.setUint8(0, 0x42); view.setUint8(1, 0x4D); // 'BM'
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);
    view.setUint32(10, headerSize, true);

    // DIB header (BITMAPINFOHEADER)
    view.setUint32(14, 40, true);
    view.setInt32(18, w, true);
    view.setInt32(22, -h, true); // negative = top-down
    view.setUint16(26, 1, true);
    view.setUint16(28, 8, true); // 8 bpp
    view.setUint32(30, 0, true); // BI_RGB
    view.setUint32(34, pixelDataSize, true);
    view.setInt32(38, 2835, true); // ~72 DPI
    view.setInt32(42, 2835, true);
    view.setUint32(46, 256, true);
    view.setUint32(50, 256, true);

    // Grayscale palette
    for (let i = 0; i < 256; i++) {
      const off = 54 + i * 4;
      view.setUint8(off, i);
      view.setUint8(off + 1, i);
      view.setUint8(off + 2, i);
      view.setUint8(off + 3, 0);
    }

    // Pixel data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const gray = data[srcIdx]; // R = G = B already
        view.setUint8(headerSize + y * rowSize + x, gray);
      }
    }

    triggerDownload(buf, filename.replace(/\.[^.]+$/, "") + "_laser.bmp");
  } else {
    // 1-bit BMP
    const rowSize = Math.ceil(w / 32) * 4; // rows padded to 32-bit boundary
    const pixelDataSize = rowSize * h;
    const paletteSize = 2 * 4; // 2 colors
    const headerSize = 54 + paletteSize;
    const fileSize = headerSize + pixelDataSize;
    const buf = new ArrayBuffer(fileSize);
    const view = new DataView(buf);

    view.setUint8(0, 0x42); view.setUint8(1, 0x4D);
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);
    view.setUint32(10, headerSize, true);

    view.setUint32(14, 40, true);
    view.setInt32(18, w, true);
    view.setInt32(22, -h, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 1, true); // 1 bpp
    view.setUint32(30, 0, true);
    view.setUint32(34, pixelDataSize, true);
    view.setInt32(38, 2835, true);
    view.setInt32(42, 2835, true);
    view.setUint32(46, 2, true);
    view.setUint32(50, 2, true);

    // Palette: 0=black, 1=white
    view.setUint32(54, 0x00000000, false);
    view.setUint32(58, 0x00FFFFFF, false);

    // Pixel data
    const pixStart = headerSize;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const white = data[srcIdx] > 128 ? 1 : 0;
        const byteIdx = pixStart + y * rowSize + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        const cur = view.getUint8(byteIdx);
        view.setUint8(byteIdx, white ? cur | (1 << bitIdx) : cur & ~(1 << bitIdx));
      }
    }

    triggerDownload(buf, filename.replace(/\.[^.]+$/, "") + "_laser_1bit.bmp");
  }
}

function triggerDownload(buf: ArrayBuffer, name: string) {
  const blob = new Blob([buf], { type: "image/bmp" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function triggerTextDownload(text: string, name: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Export as DXF (polyline raster → vector outlines via contour tracing)
export function downloadDXF(canvas: HTMLCanvasElement, filename: string) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  const base = filename.replace(/\.[^.]+$/, "");

  // Scan horizontal runs of dark pixels (value < 128) → line segments
  const lines: string[] = [];
  let entityCount = 0;

  for (let y = 0; y < h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      const isDark = x < w && data[(y * w + x) * 4] < 128;
      if (isDark && runStart < 0) {
        runStart = x;
      } else if (!isDark && runStart >= 0) {
        // Emit a LINE entity (mm coords: 1 px = 25.4/dpi mm, assume 254dpi → 0.1mm/px)
        const x1 = runStart * 0.1;
        const x2 = x * 0.1;
        const yCoord = -y * 0.1; // DXF Y is inverted
        lines.push(`LINE\n 8\nLASER\n10\n${x1.toFixed(4)}\n20\n${yCoord.toFixed(4)}\n30\n0.0\n11\n${x2.toFixed(4)}\n21\n${yCoord.toFixed(4)}\n31\n0.0\n0\n`);
        entityCount++;
        runStart = -1;
      }
    }
  }

  const dxf = [
    "0\nSECTION\n2\nHEADER\n0\nENDSEC\n",
    "0\nSECTION\n2\nTABLES\n",
    "0\nTABLE\n2\nLAYER\n70\n1\n",
    "0\nLAYER\n2\nLASER\n70\n0\n62\n7\n6\nCONTINUOUS\n",
    "0\nENDTAB\n0\nENDSEC\n",
    "0\nSECTION\n2\nENTITIES\n0\n",
    ...lines,
    "ENDSEC\n0\nEOF\n",
  ].join("");

  triggerTextDownload(dxf, `${base}_laser.dxf`, "application/dxf");
}

// Export as LBRN2 (LightBurn native format)
export function downloadLBRN2(
  canvas: HTMLCanvasElement,
  filename: string,
  opts: { speed: number; power: number; dpi: number; passes: number; laserType: string }
) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  const base = filename.replace(/\.[^.]+$/, "");

  // Convert canvas to base64 PNG for embedding
  const pngDataUrl = canvas.toDataURL("image/png");
  const b64 = pngDataUrl.replace("data:image/png;base64,", "");

  const widthMM = (w / opts.dpi * 25.4).toFixed(4);
  const heightMM = (h / opts.dpi * 25.4).toFixed(4);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.7.00" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">
  <Thumbnail Source="${b64}" />
  <VariableText>
    <Start>0</Start>
    <End>0</End>
    <Current>0</Current>
  </VariableText>
  <UIPrefs />
  <CutSetting type="Image">
    <index Value="0" />
    <name Value="Laser Engrave" />
    <priority Value="0" />
    <kerf Value="0" />
    <minPower Value="${Math.round(opts.power * 0.8)}" />
    <maxPower Value="${opts.power}" />
    <minPower2 Value="${Math.round(opts.power * 0.8)}" />
    <maxPower2 Value="${opts.power}" />
    <speed Value="${opts.speed}" />
    <numPasses Value="${opts.passes}" />
    <zOffset Value="0" />
    <perforate Value="False" />
    <overscan Value="0" />
    <doOutput Value="True" />
    <show Value="True" />
    <LinkSpeedToOutput Value="False" />
    <laserType Value="${opts.laserType}" />
    <ImageMode Value="Threshold" />
    <DPI Value="${opts.dpi}" />
    <negative Value="False" />
    <bidir Value="True" />
  </CutSetting>
  <Shape type="Bitmap" CutIndex="0" W="${widthMM}" H="${heightMM}" Source="${b64}">
    <XForm>1 0 0 1 0 0</XForm>
  </Shape>
</LightBurnProject>`;

  triggerTextDownload(xml, `${base}_laser.lbrn2`, "application/xml");
}