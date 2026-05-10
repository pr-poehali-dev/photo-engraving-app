export type DitheringMode = "none" | "floyd" | "ordered" | "threshold" | "error";

export interface ProcessOptions {
  contrast: number;    // 0–100, 50 = neutral
  brightness: number;  // 0–100, 50 = neutral
  sharpness: number;   // 0–100
  grayscale: number;   // 0–100 (%)
  threshold: number;   // 0–255
  gamma: number;       // 0.1–3.0
  bitDepth: 1 | 8;
  dithering: DitheringMode;
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
