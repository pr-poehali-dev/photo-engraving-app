import { useState, useRef, useCallback, useEffect } from "react";
import Icon from "@/components/ui/icon";

interface Rect { x: number; y: number; w: number; h: number; }

interface CropToolProps {
  imageUrl: string;
  onCrop: (croppedUrl: string, croppedImg: HTMLImageElement) => void;
  onCancel: () => void;
}

export default function CropTool({ imageUrl, onCrop, onCancel }: CropToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [startPt, setStartPt] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [aspectLock, setAspectLock] = useState<"free" | "1:1" | "4:3" | "16:9">("free");

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const container = containerRef.current;
      if (!container) return;
      const maxW = container.clientWidth - 32;
      const maxH = container.clientHeight - 32;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setScale(s);
      setOffset({
        x: (maxW - img.naturalWidth * s) / 2 + 16,
        y: (maxH - img.naturalHeight * s) / 2 + 16,
      });
      draw(img, null, s, { x: (maxW - img.naturalWidth * s) / 2 + 16, y: (maxH - img.naturalHeight * s) / 2 + 16 });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const draw = useCallback((img: HTMLImageElement, r: Rect | null, s: number, off: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, off.x, off.y, img.naturalWidth * s, img.naturalHeight * s);
    if (r) {
      // Darken outside selection
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, r.y);
      ctx.fillRect(0, r.y + r.h, canvas.width, canvas.height - r.y - r.h);
      ctx.fillRect(0, r.y, r.x, r.h);
      ctx.fillRect(r.x + r.w, r.y, canvas.width - r.x - r.w, r.h);
      // Crop rect border
      ctx.strokeStyle = "#00f5d4";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      // Rule-of-thirds
      ctx.strokeStyle = "rgba(0,245,212,0.25)";
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(r.x + r.w * i / 3, r.y); ctx.lineTo(r.x + r.w * i / 3, r.y + r.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h * i / 3); ctx.lineTo(r.x + r.w, r.y + r.h * i / 3); ctx.stroke();
      }
      // Corner handles
      ctx.fillStyle = "#00f5d4";
      const hSize = 6;
      const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
      corners.forEach(([cx, cy]) => ctx.fillRect(cx - hSize/2, cy - hSize/2, hSize, hSize));
      // Size label
      const wPx = Math.round(r.w / s);
      const hPx = Math.round(r.h / s);
      ctx.fillStyle = "rgba(0,10,20,0.8)";
      ctx.fillRect(r.x, r.y - 22, 90, 18);
      ctx.fillStyle = "#00f5d4";
      ctx.font = "10px 'IBM Plex Mono'";
      ctx.fillText(`${wPx} × ${hPx} px`, r.x + 4, r.y - 8);
    }
  }, []);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getAspectConstrainedRect = (sx: number, sy: number, ex: number, ey: number): Rect => {
    let w = ex - sx, h = ey - sy;
    if (aspectLock === "1:1") { const s2 = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w) * s2; h = Math.sign(h) * s2; }
    else if (aspectLock === "4:3") { h = Math.sign(h) * Math.abs(w) * 3/4; }
    else if (aspectLock === "16:9") { h = Math.sign(h) * Math.abs(w) * 9/16; }
    return { x: Math.min(sx, sx + w), y: Math.min(sy, sy + h), w: Math.abs(w), h: Math.abs(h) };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getPos(e);
    setDragging(true);
    setStartPt(p);
    setRect(null);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !imgRef.current) return;
    const p = getPos(e);
    const r = getAspectConstrainedRect(startPt.x, startPt.y, p.x, p.y);
    setRect(r);
    draw(imgRef.current, r, scale, offset);
  };

  const onMouseUp = () => setDragging(false);

  const applyCrop = () => {
    if (!rect || !imgRef.current) return;
    const img = imgRef.current;
    // Convert screen coords to image coords
    const srcX = Math.round((rect.x - offset.x) / scale);
    const srcY = Math.round((rect.y - offset.y) / scale);
    const srcW = Math.round(rect.w / scale);
    const srcH = Math.round(rect.h / scale);
    if (srcW <= 0 || srcH <= 0) return;

    const out = document.createElement("canvas");
    out.width = Math.min(srcW, img.naturalWidth - Math.max(0, srcX));
    out.height = Math.min(srcH, img.naturalHeight - Math.max(0, srcY));
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, Math.max(0, srcX), Math.max(0, srcY), out.width, out.height, 0, 0, out.width, out.height);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const newImg = new Image();
      newImg.onload = () => onCrop(url, newImg);
      newImg.src = url;
    }, "image/png");
  };

  const resetCrop = () => {
    setRect(null);
    if (imgRef.current) draw(imgRef.current, null, scale, offset);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cyan-900/30 bg-[#060a12]/95">
        <div className="flex items-center gap-3">
          <div className="relative w-6 h-6 flex items-center justify-center border border-cyan-500/50 rotate-45">
            <Icon name="Crop" size={11} className="text-cyan-400 -rotate-45" />
          </div>
          <span className="font-orbitron text-sm text-cyan-300 tracking-widest">ОБРЕЗКА ИЗОБРАЖЕНИЯ</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Aspect ratio */}
          <div className="flex gap-1.5">
            {(["free", "1:1", "4:3", "16:9"] as const).map(a => (
              <button key={a} onClick={() => setAspectLock(a)}
                className={`px-2.5 py-1 text-[10px] font-mono rounded border transition-all ${aspectLock === a ? "border-cyan-400 text-cyan-300 bg-cyan-950/40" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                {a}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-cyan-900/50" />
          <button onClick={resetCrop} className="text-[10px] font-mono text-cyan-700 hover:text-cyan-400 border border-cyan-900/40 px-3 py-1.5 rounded transition-colors">
            СБРОС
          </button>
          <button onClick={onCancel} className="text-[10px] font-mono text-cyan-700 hover:text-red-400 border border-cyan-900/40 px-3 py-1.5 rounded transition-colors">
            ОТМЕНА
          </button>
          <button onClick={applyCrop} disabled={!rect}
            className="neon-btn px-5 py-1.5 rounded font-orbitron text-[10px] tracking-widest disabled:opacity-40 disabled:cursor-not-allowed">
            <Icon name="Check" size={12} className="inline mr-1.5" />
            ПРИМЕНИТЬ
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ display: "block" }}
        />
        {!rect && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-[10px] font-mono text-cyan-800 tracking-widest">НАРИСУЙТЕ ОБЛАСТЬ ОБРЕЗКИ</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
