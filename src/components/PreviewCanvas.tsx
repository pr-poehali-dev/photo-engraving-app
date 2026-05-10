import { useRef, useState, useCallback, useEffect } from "react";
import Icon from "@/components/ui/icon";

interface PreviewCanvasProps {
  dataUrl: string | null;
  originalUrl: string | null;
  showComparison: boolean;
  isProcessing: boolean;
  bitDepth: 1 | 8;
}

export default function PreviewCanvas({
  dataUrl,
  originalUrl,
  showComparison,
  isProcessing,
  bitDepth,
}: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPan, setLastPan] = useState({ x: 0, y: 0 });
  const [splitPos, setSplitPos] = useState(50); // percent for comparison slider
  const [draggingSplit, setDraggingSplit] = useState(false);

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * delta)));
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      setLastPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - lastPan.x, y: e.clientY - lastPan.y });
    }
    if (draggingSplit && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPos(pct);
    }
  };

  const onMouseUp = () => { setIsPanning(false); setDraggingSplit(false); };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, z * 1.3));
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, z / 1.3));

  // Zoom to fit
  const zoomFit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const zoomPresets = [0.25, 0.5, 1, 2, 4];

  const imgStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    transition: isPanning ? "none" : "transform 0.1s ease",
    imageRendering: (bitDepth === 1 && zoom >= 2) ? "pixelated" as const : "auto" as const,
  };

  return (
    <div className="panel neon-border rounded-lg overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-cyan-900/30 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? "bg-amber-400 animate-pulse" : "bg-cyan-400"}`} />
          <span className="text-[10px] font-mono text-cyan-600 tracking-widest ml-1">
            {isProcessing ? "РЕНДЕРИНГ..." : "ПРЕДПРОСМОТР"}
          </span>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button onClick={zoomOut} className="w-6 h-6 flex items-center justify-center border border-cyan-900/40 rounded hover:border-cyan-600/50 transition-colors">
            <Icon name="ZoomOut" size={10} className="text-cyan-600" />
          </button>
          <div className="flex gap-1">
            {zoomPresets.map(z => (
              <button key={z} onClick={() => { setZoom(z); setPan({ x: 0, y: 0 }); }}
                className={`px-1.5 py-0.5 text-[9px] font-mono rounded border transition-all ${Math.abs(zoom - z) < 0.05 ? "border-cyan-400 text-cyan-300 bg-cyan-950/40" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                {z < 1 ? `${Math.round(z * 100)}%` : `${z}×`}
              </button>
            ))}
          </div>
          <button onClick={zoomIn} className="w-6 h-6 flex items-center justify-center border border-cyan-900/40 rounded hover:border-cyan-600/50 transition-colors">
            <Icon name="ZoomIn" size={10} className="text-cyan-600" />
          </button>
        </div>

        <div className="flex items-center gap-1 border border-cyan-900/30 rounded px-1.5 py-0.5">
          <span className="text-[10px] font-mono text-cyan-400 min-w-10 text-center">{Math.round(zoom * 100)}%</span>
        </div>

        <button onClick={resetView} className="text-[9px] font-mono text-cyan-800 hover:text-cyan-500 border border-cyan-900/30 px-2 py-0.5 rounded transition-colors">
          FIT
        </button>

        <div className="ml-auto text-[9px] font-mono text-cyan-800">
          Alt+ЛКМ — панорама · Колесо — зум
        </div>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-black/50 select-none"
        style={{
          backgroundImage: "repeating-conic-gradient(#0a0e18 0% 25%, #080b14 0% 50%)",
          backgroundSize: "16px 16px",
          cursor: isPanning ? "grabbing" : "default",
          minHeight: 300,
        }}
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-mono text-cyan-600 tracking-widest">ОБРАБОТКА ПИКСЕЛЕЙ...</span>
            </div>
          </div>
        )}

        {showComparison && originalUrl && dataUrl ? (
          /* Split comparison */
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ maxWidth: "90%", maxHeight: "90%", overflow: "hidden" }}>
              {/* Processed (right side) */}
              <img src={dataUrl} alt="processed" className="block max-w-full max-h-full" style={{ ...imgStyle }} />
              {/* Original clipped to left */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
              >
                <img src={originalUrl} alt="original" className="block max-w-full max-h-full" style={{ ...imgStyle, filter: "none" }} />
              </div>
              {/* Divider line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-cyan-400 cursor-col-resize z-10 shadow-[0_0_8px_rgba(0,245,212,0.8)]"
                style={{ left: `${splitPos}%` }}
                onMouseDown={(e) => { e.preventDefault(); setDraggingSplit(true); }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#060a12] border border-cyan-400 flex items-center justify-center shadow-[0_0_10px_rgba(0,245,212,0.5)]">
                  <Icon name="ArrowLeftRight" size={10} className="text-cyan-400" />
                </div>
              </div>
              {/* Labels */}
              <div className="absolute top-2 left-2 text-[9px] font-mono text-cyan-600 bg-black/60 px-2 py-0.5 rounded">ОРИГИНАЛ</div>
              <div className="absolute top-2 right-2 text-[9px] font-mono text-emerald-500 bg-black/60 px-2 py-0.5 rounded">ОБРАБОТАНО</div>
            </div>
          </div>
        ) : (
          /* Single image */
          <div className="absolute inset-0 flex items-center justify-center">
            {dataUrl ? (
              <img
                src={dataUrl}
                alt="processed"
                className="max-w-none block"
                style={imgStyle}
                draggable={false}
              />
            ) : originalUrl ? (
              <img
                src={originalUrl}
                alt="original"
                className="max-w-none block"
                style={imgStyle}
                draggable={false}
              />
            ) : null}
          </div>
        )}

        {/* Zoom indicator corner */}
        <div className="absolute bottom-2 right-2 text-[9px] font-mono text-cyan-800 bg-black/60 px-2 py-1 rounded border border-cyan-900/20">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
}
