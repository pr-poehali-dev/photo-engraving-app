import { useState, useRef, useCallback, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { processImage, downloadPNG, downloadBMP } from "@/lib/imageProcessor";
import type { NeuroFilter } from "@/lib/imageProcessor";
import CropTool from "@/components/CropTool";
import PreviewCanvas from "@/components/PreviewCanvas";

type Tab = "upload" | "editor" | "preview" | "export" | "settings";

type DitheringMode = "none" | "floyd" | "ordered" | "threshold" | "error";
type LaserType = "CO2" | "Fiber" | "Diode" | "UV";
type Material = "wood" | "leather" | "steel" | "plywood" | "glass" | "ceramic";

interface LaserParams {
  contrast: number;
  brightness: number;
  sharpness: number;
  grayscale: number;
  threshold: number;
  gamma: number;
  speed: number;
  power: number;
  dpi: number;
  passes: number;
}

const DEFAULT_PARAMS: LaserParams = {
  contrast: 50,
  brightness: 50,
  sharpness: 30,
  grayscale: 100,
  threshold: 128,
  gamma: 1.0,
  speed: 3000,
  power: 80,
  dpi: 254,
  passes: 1,
};

const MATERIAL_PRESETS: Record<Material, { label: string; emoji: string; speed: number; power: number; passes: number; dpi: number; desc: string }> = {
  wood:     { label: "Дерево",     emoji: "🪵", speed: 3000, power: 70, passes: 1, dpi: 254, desc: "Сосна, дуб, берёза" },
  leather:  { label: "Кожа",       emoji: "🟤", speed: 2500, power: 55, passes: 1, dpi: 254, desc: "Натуральная и искусственная" },
  steel:    { label: "Нержавейка", emoji: "⚙️", speed: 500,  power: 100, passes: 3, dpi: 508, desc: "AISI 304, 316" },
  plywood:  { label: "Фанера",     emoji: "📋", speed: 3500, power: 65, passes: 1, dpi: 254, desc: "Берёза, тополь" },
  glass:    { label: "Стекло",     emoji: "🔷", speed: 1500, power: 45, passes: 2, dpi: 380, desc: "Силикатное, закалённое" },
  ceramic:  { label: "Керамика",   emoji: "🏺", speed: 1000, power: 80, passes: 2, dpi: 380, desc: "Плитка, посуда" },
};

const LASER_TYPES: Record<LaserType, { label: string; wavelengths: string[]; desc: string }> = {
  CO2:   { label: "CO₂",   wavelengths: ["10600 нм", "9300 нм"],       desc: "Органика, дерево, акрил" },
  Fiber: { label: "Fiber", wavelengths: ["1064 нм", "1550 нм"],        desc: "Металлы, маркировка" },
  Diode: { label: "Diode", wavelengths: ["450 нм", "808 нм", "980 нм"], desc: "Дерево, кожа, пластик" },
  UV:    { label: "UV",    wavelengths: ["355 нм", "266 нм"],           desc: "Стекло, керамика, точность" },
};

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [params, setParams] = useState<LaserParams>(DEFAULT_PARAMS);
  const [isDragging, setIsDragging] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [dithering, setDithering] = useState<DitheringMode>("floyd");
  const [bitDepth, setBitDepth] = useState<1 | 8>(1);
  const [customDpi, setCustomDpi] = useState<number>(params.dpi);
  const [laserType, setLaserType] = useState<LaserType>("CO2");
  const [wavelength, setWavelength] = useState<string>("10600 нм");
  const [material, setMaterial] = useState<Material | null>(null);
  const [processedCanvas, setProcessedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  // Tools
  const [skinSmooth, setSkinSmooth] = useState(0);
  const [autoRetouch, setAutoRetouch] = useState(false);
  const [removeBg, setRemoveBg] = useState(false);
  const [neuroFilter, setNeuroFilter] = useState<NeuroFilter>("none");
  const [showCrop, setShowCrop] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);

  const runProcessing = useCallback((img: HTMLImageElement) => {
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const canvas = processImage(img, {
          contrast: params.contrast,
          brightness: params.brightness,
          sharpness: params.sharpness,
          grayscale: params.grayscale,
          threshold: params.threshold,
          gamma: params.gamma,
          bitDepth,
          dithering,
          skinSmooth,
          autoRetouch,
          removeBg,
          neuroFilter,
        });
        setProcessedCanvas(canvas);
        setProcessedDataUrl(canvas.toDataURL("image/png"));
      } finally {
        setIsProcessing(false);
      }
    }, 10);
  }, [params, bitDepth, dithering, skinSmooth, autoRetouch, removeBg, neuroFilter]);

  // Re-process whenever params/dithering/bitDepth change
  useEffect(() => {
    if (sourceImgRef.current) {
      runProcessing(sourceImgRef.current);
    }
  }, [runProcessing]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageName(file.name);
    setActiveTab("editor");
    // Pre-load image into ref for processing
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      sourceImgRef.current = img;
      // runProcessing will be called via useEffect when sourceImgRef is set
      // but we need to trigger it explicitly on first load
      setIsProcessing(true);
      setTimeout(() => {
        try {
          const canvas = processImage(img, {
            contrast: DEFAULT_PARAMS.contrast,
            brightness: DEFAULT_PARAMS.brightness,
            sharpness: DEFAULT_PARAMS.sharpness,
            grayscale: DEFAULT_PARAMS.grayscale,
            threshold: DEFAULT_PARAMS.threshold,
            gamma: DEFAULT_PARAMS.gamma,
            bitDepth: 1,
            dithering: "floyd",
          });
          setProcessedCanvas(canvas);
          setProcessedDataUrl(canvas.toDataURL("image/png"));
        } finally {
          setIsProcessing(false);
        }
      }, 10);
    };
    img.src = url;
  }, []);

  const handleCropApply = useCallback((croppedUrl: string, croppedImg: HTMLImageElement) => {
    setImageUrl(croppedUrl);
    sourceImgRef.current = croppedImg;
    setShowCrop(false);
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const canvas = processImage(croppedImg, {
          contrast: params.contrast, brightness: params.brightness,
          sharpness: params.sharpness, grayscale: params.grayscale,
          threshold: params.threshold, gamma: params.gamma,
          bitDepth, dithering, skinSmooth, autoRetouch, removeBg, neuroFilter,
        });
        setProcessedCanvas(canvas);
        setProcessedDataUrl(canvas.toDataURL("image/png"));
      } finally {
        setIsProcessing(false);
      }
    }, 10);
  }, [params, bitDepth, dithering, skinSmooth, autoRetouch, removeBg, neuroFilter]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const setParam = (key: keyof LaserParams, value: number) => {
    setParams((p) => ({ ...p, [key]: value }));
  };

  const applyMaterial = (mat: Material) => {
    const p = MATERIAL_PRESETS[mat];
    setMaterial(mat);
    setParams(prev => ({ ...prev, speed: p.speed, power: p.power, passes: p.passes, dpi: p.dpi }));
    setCustomDpi(p.dpi);
  };

  const handleLaserType = (lt: LaserType) => {
    setLaserType(lt);
    setWavelength(LASER_TYPES[lt].wavelengths[0]);
  };

  const getImageFilter = () => {
    const c = params.contrast / 50;
    const b = (params.brightness - 50) / 50 * 0.5;
    const g = params.grayscale / 100;
    return `grayscale(${g}) contrast(${c}) brightness(${1 + b})`;
  };

  const handleDownloadPNG = () => {
    if (!processedCanvas) return;
    downloadPNG(processedCanvas, imageName);
  };

  const handleDownloadBMP = () => {
    if (!processedCanvas) return;
    downloadBMP(processedCanvas, imageName, bitDepth);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "upload", label: "Загрузка", icon: "Upload" },
    { id: "editor", label: "Редактор", icon: "Sliders" },
    { id: "preview", label: "Предпросмотр", icon: "Eye" },
    { id: "export", label: "Экспорт", icon: "Download" },
    { id: "settings", label: "Настройки", icon: "Settings" },
  ];

  const SliderControl = ({
    label,
    paramKey,
    min,
    max,
    step = 1,
    unit = "",
    decimals = 0,
  }: {
    label: string;
    paramKey: keyof LaserParams;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    decimals?: number;
  }) => {
    const value = params[paramKey] as number;
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <div className="mb-5">
        {label && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-ibm text-cyan-300/70 uppercase tracking-widest">{label}</span>
            <span className="font-mono text-sm text-cyan-400">
              {value.toFixed(decimals)}{unit}
            </span>
          </div>
        )}
        {!label && (
          <div className="flex justify-end mb-1">
            <span className="font-mono text-sm text-cyan-400">{value.toFixed(decimals)}{unit}</span>
          </div>
        )}
        <input
          type="range"
          className="laser-slider"
          style={{ "--val": `${pct}%` } as React.CSSProperties}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setParam(paramKey, parseFloat(e.target.value))}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#060a12] text-foreground grid-bg relative overflow-hidden">
      {/* Crop Tool overlay */}
      {showCrop && imageUrl && (
        <CropTool
          imageUrl={imageUrl}
          onCrop={handleCropApply}
          onCancel={() => setShowCrop(false)}
        />
      )}

      <div className="scan-line" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-cyan-900/30 bg-[#060a12]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 border border-cyan-500/50 rotate-45" />
              <Icon name="Zap" size={14} className="text-cyan-400 z-10" />
            </div>
            <div>
              <h1 className="font-orbitron text-sm font-bold tracking-widest text-cyan-300">
                LASER<span className="text-emerald-400">FORGE</span>
              </h1>
              <div className="text-[9px] font-mono text-cyan-600 tracking-widest">ENGRAVING STUDIO v1.0</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {imageUrl && (
              <div className="flex items-center gap-2 px-3 py-1 rounded border border-cyan-900/50 bg-cyan-950/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[11px] text-cyan-400 truncate max-w-32">{imageName}</span>
              </div>
            )}
            <div className="text-[10px] font-mono text-cyan-800">LASERFORGE OS</div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 flex gap-0 border-t border-cyan-900/20">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={tab.id !== "upload" && tab.id !== "settings" && !imageUrl}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-orbitron tracking-widest transition-all duration-200 border-b-2 ${
                activeTab === tab.id
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : "border-transparent text-cyan-700 hover:text-cyan-400 hover:bg-cyan-950/10"
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              <Icon name={tab.icon} fallback="Circle" size={12} />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* UPLOAD */}
        {activeTab === "upload" && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h2 className="font-orbitron text-lg font-bold neon-cyan mb-1">ЗАГРУЗКА ИЗОБРАЖЕНИЯ</h2>
              <p className="text-cyan-700 text-sm font-ibm">Поддерживаются форматы JPG, PNG, BMP, TIFF</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div
                  className={`upload-zone neon-border rounded-lg p-16 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-80 ${isDragging ? "border-cyan-400 bg-cyan-950/20" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={`relative mb-6 transition-transform duration-300 ${isDragging ? "scale-110" : ""}`}>
                    <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl" />
                    <div className="relative w-16 h-16 border border-cyan-500/40 rounded-lg flex items-center justify-center bg-cyan-950/30">
                      <Icon name="ImagePlus" size={28} className="text-cyan-400" />
                    </div>
                  </div>
                  <p className="font-orbitron text-sm text-cyan-300 mb-2 tracking-wider">
                    {isDragging ? "ОТПУСТИТЕ ФАЙЛ" : "ПЕРЕТАЩИТЕ ФАЙЛ"}
                  </p>
                  <p className="text-cyan-700 text-xs font-ibm">или нажмите для выбора</p>
                  <div className="mt-8 flex gap-3 text-[10px] font-mono text-cyan-800">
                    {["JPG", "PNG", "BMP", "TIFF", "SVG"].map(f => (
                      <span key={f} className="px-2 py-0.5 border border-cyan-900/50 rounded">{f}</span>
                    ))}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
              </div>

              <div className="flex flex-col gap-3">
                <div className="panel rounded-lg p-4">
                  <div className="text-[10px] font-mono text-cyan-700 tracking-widest mb-3">ОБЛАЧНЫЕ ИСТОЧНИКИ</div>
                  {[
                    { name: "Google Drive", icon: "Cloud" },
                    { name: "Dropbox", icon: "Box" },
                    { name: "OneDrive", icon: "CloudSnow" },
                    { name: "URL изображения", icon: "Link" },
                  ].map((src) => (
                    <button key={src.name} className="w-full flex items-center gap-3 px-3 py-2.5 rounded border border-cyan-900/30 bg-cyan-950/10 hover:border-cyan-600/40 hover:bg-cyan-950/20 transition-all duration-200 mb-2 group">
                      <Icon name={src.icon} fallback="Cloud" size={14} className="text-cyan-600 group-hover:text-cyan-400 transition-colors" />
                      <span className="text-xs font-ibm text-cyan-500 group-hover:text-cyan-300 transition-colors">{src.name}</span>
                      <Icon name="ChevronRight" size={12} className="ml-auto text-cyan-800 group-hover:text-cyan-500" />
                    </button>
                  ))}
                </div>
                <div className="panel rounded-lg p-4">
                  <div className="text-[10px] font-mono text-cyan-700 tracking-widest mb-3">ПОСЛЕДНИЕ ФАЙЛЫ</div>
                  <div className="text-xs text-cyan-800 font-ibm text-center py-4">История пуста</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDITOR */}
        {activeTab === "editor" && imageUrl && (
          <div className="animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-orbitron text-lg font-bold neon-cyan">РЕДАКТОР ПАРАМЕТРОВ</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowCrop(true)} className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-600 hover:text-cyan-300 border border-cyan-900/40 px-3 py-1 rounded transition-colors">
                  <Icon name="Crop" size={11} />ОБРЕЗКА
                </button>
                <button onClick={() => { setParams(DEFAULT_PARAMS); setMaterial(null); setSkinSmooth(0); setAutoRetouch(false); setRemoveBg(false); setNeuroFilter("none"); }} className="text-[10px] font-mono text-cyan-700 hover:text-cyan-400 border border-cyan-900/40 px-3 py-1 rounded transition-colors">
                  СБРОС
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: preview + tools */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {/* Preview canvas with zoom */}
                <div style={{ height: 340 }}>
                  <PreviewCanvas
                    dataUrl={processedDataUrl}
                    originalUrl={imageUrl}
                    showComparison={false}
                    isProcessing={isProcessing}
                    bitDepth={bitDepth}
                  />
                </div>

                {/* TOOLS PANEL */}
                <div className="panel rounded-lg p-4 neon-border">
                  <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-3 flex items-center gap-2">
                    <Icon name="Wand2" size={10} className="text-cyan-500" />
                    ИНСТРУМЕНТЫ ОБРАБОТКИ
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Skin smooth */}
                    <div className="bg-black/30 rounded border border-cyan-900/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Icon name="Sparkles" size={10} className="text-pink-500" />
                          <span className="text-[10px] font-mono text-cyan-600">СГЛАЖИВАНИЕ КОЖИ</span>
                        </div>
                        <span className="text-[10px] font-mono text-cyan-400">{skinSmooth}%</span>
                      </div>
                      <input type="range" className="laser-slider w-full" min={0} max={100}
                        style={{ "--val": `${skinSmooth}%` } as React.CSSProperties}
                        value={skinSmooth} onChange={e => setSkinSmooth(Number(e.target.value))} />
                      <p className="text-[8px] font-mono text-cyan-900 mt-1.5">Размытие только тон кожи, сохраняет детали</p>
                    </div>

                    {/* Auto retouch */}
                    <div className={`bg-black/30 rounded border p-3 transition-all cursor-pointer ${autoRetouch ? "border-violet-500/40 bg-violet-950/10" : "border-cyan-900/20"}`}
                      onClick={() => setAutoRetouch(r => !r)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Icon name="ScanFace" size={10} className={autoRetouch ? "text-violet-400" : "text-cyan-700"} />
                          <span className={`text-[10px] font-mono ${autoRetouch ? "text-violet-300" : "text-cyan-600"}`}>АВТОРЕТУШЬ</span>
                        </div>
                        <div className={`w-8 h-4 rounded-full border relative transition-all ${autoRetouch ? "border-violet-400 bg-violet-950/50" : "border-cyan-900/50 bg-black/30"}`}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${autoRetouch ? "right-0.5 bg-violet-400" : "left-0.5 bg-cyan-800"}`} />
                        </div>
                      </div>
                      <p className="text-[8px] font-mono text-cyan-900">Деноизинг + локальный контраст + подъём теней</p>
                    </div>

                    {/* Remove background */}
                    <div className={`bg-black/30 rounded border p-3 transition-all cursor-pointer ${removeBg ? "border-amber-500/40 bg-amber-950/10" : "border-cyan-900/20"}`}
                      onClick={() => setRemoveBg(r => !r)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Icon name="Eraser" size={10} className={removeBg ? "text-amber-400" : "text-cyan-700"} />
                          <span className={`text-[10px] font-mono ${removeBg ? "text-amber-300" : "text-cyan-600"}`}>УДАЛЕНИЕ ФОНА</span>
                        </div>
                        <div className={`w-8 h-4 rounded-full border relative transition-all ${removeBg ? "border-amber-400 bg-amber-950/50" : "border-cyan-900/50 bg-black/30"}`}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${removeBg ? "right-0.5 bg-amber-400" : "left-0.5 bg-cyan-800"}`} />
                        </div>
                      </div>
                      <p className="text-[8px] font-mono text-cyan-900">Flood-fill от углов по цвету фона</p>
                    </div>

                    {/* Neuro filters */}
                    <div className="bg-black/30 rounded border border-cyan-900/20 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon name="BrainCircuit" size={10} className="text-cyan-500" />
                        <span className="text-[10px] font-mono text-cyan-600">НЕЙРОФИЛЬТРЫ</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {([
                          { id: "none",       label: "Нет",        color: "cyan" },
                          { id: "engrave",    label: "Гравюра",    color: "emerald" },
                          { id: "lineart",    label: "Линии",      color: "emerald" },
                          { id: "stipple",    label: "Пунктир",    color: "emerald" },
                          { id: "crosshatch", label: "Штриховка",  color: "emerald" },
                          { id: "blueprint",  label: "Чертёж",     color: "blue" },
                        ] as { id: NeuroFilter; label: string; color: string }[]).map(f => (
                          <button key={f.id} onClick={() => setNeuroFilter(f.id)}
                            className={`px-2 py-1 text-[9px] font-mono rounded border transition-all text-left ${
                              neuroFilter === f.id
                                ? f.color === "blue" ? "border-blue-400 text-blue-300 bg-blue-950/30" : "border-emerald-400 text-emerald-300 bg-emerald-950/30"
                                : "border-cyan-900/30 text-cyan-800 hover:border-cyan-700/50 hover:text-cyan-600"
                            }`}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* MATERIAL SELECTION */}
                <div className="panel rounded-lg p-4 neon-border">
                  <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-3 flex items-center gap-2">
                    <Icon name="Layers" size={10} className="text-cyan-500" />
                    ТИП МАТЕРИАЛА
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {(Object.entries(MATERIAL_PRESETS) as [Material, typeof MATERIAL_PRESETS[Material]][]).map(([key, mat]) => (
                      <button
                        key={key}
                        onClick={() => applyMaterial(key)}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded border transition-all duration-200 group ${
                          material === key
                            ? "border-emerald-400 bg-emerald-950/30 shadow-[0_0_12px_rgba(0,255,136,0.2)]"
                            : "border-cyan-900/30 bg-cyan-950/10 hover:border-cyan-600/50 hover:bg-cyan-950/20"
                        }`}
                      >
                        <span className="text-lg leading-none">{mat.emoji}</span>
                        <span className={`text-[9px] font-mono tracking-wide ${material === key ? "text-emerald-300" : "text-cyan-700 group-hover:text-cyan-400"}`}>
                          {mat.label}
                        </span>
                        {material === key && (
                          <span className="text-[8px] font-mono text-emerald-600">{mat.speed}мм/мин</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {material && (
                    <div className="mt-3 px-3 py-2 rounded bg-emerald-950/20 border border-emerald-900/30 flex items-center gap-2">
                      <Icon name="Info" size={10} className="text-emerald-600" />
                      <span className="text-[10px] font-mono text-emerald-600">
                        {MATERIAL_PRESETS[material].desc} · Пресет применён автоматически
                      </span>
                    </div>
                  )}
                </div>

                {/* LASER TYPE + WAVELENGTH */}
                <div className="panel rounded-lg p-4 neon-border">
                  <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-3 flex items-center gap-2">
                    <Icon name="Zap" size={10} className="text-cyan-500" />
                    ТИП ЛАЗЕРА И ДЛИНА ВОЛНЫ
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {(Object.entries(LASER_TYPES) as [LaserType, typeof LASER_TYPES[LaserType]][]).map(([key, lt]) => (
                      <button
                        key={key}
                        onClick={() => handleLaserType(key)}
                        className={`flex flex-col items-center py-2.5 px-1 rounded border transition-all duration-200 ${
                          laserType === key
                            ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_12px_rgba(0,245,212,0.2)]"
                            : "border-cyan-900/30 hover:border-cyan-700/50 hover:bg-cyan-950/10"
                        }`}
                      >
                        <span className={`font-orbitron text-xs font-bold mb-0.5 ${laserType === key ? "text-cyan-300" : "text-cyan-700"}`}>{lt.label}</span>
                        <span className="text-[8px] font-mono text-cyan-800 text-center leading-tight">{lt.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-cyan-800 tracking-widest mb-2">ДЛИНА ВОЛНЫ</div>
                    <div className="flex flex-wrap gap-2">
                      {LASER_TYPES[laserType].wavelengths.map(wl => (
                        <button
                          key={wl}
                          onClick={() => setWavelength(wl)}
                          className={`px-3 py-1.5 text-xs font-mono rounded border transition-all ${
                            wavelength === wl
                              ? "border-cyan-400 text-cyan-300 bg-cyan-950/40"
                              : "border-cyan-900/40 text-cyan-700 hover:border-cyan-700/50"
                          }`}
                        >
                          {wl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: controls */}
              <div className="flex flex-col gap-4">
                {/* Image processing */}
                <div className="panel rounded-lg p-4 neon-border">
                  <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-4 flex items-center gap-2">
                    <Icon name="Contrast" size={10} className="text-cyan-500" />
                    ОБРАБОТКА ИЗОБРАЖЕНИЯ
                  </div>
                  <SliderControl label="Контраст" paramKey="contrast" min={0} max={100} />
                  <SliderControl label="Яркость" paramKey="brightness" min={0} max={100} />
                  <SliderControl label="Резкость" paramKey="sharpness" min={0} max={100} />
                  <SliderControl label="Уровень серого" paramKey="grayscale" min={0} max={100} unit="%" />
                  <SliderControl label="Порог" paramKey="threshold" min={0} max={255} />
                  <SliderControl label="Гамма" paramKey="gamma" min={0.1} max={3.0} step={0.1} decimals={1} />
                </div>

                {/* BITMAP CONVERSION */}
                <div className="panel rounded-lg p-4 neon-border">
                  <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-3 flex items-center gap-2">
                    <Icon name="Grid2x2" size={10} className="text-cyan-500" />
                    БИТОВЫЙ ФОРМАТ
                  </div>
                  <div className="mb-3">
                    <div className="text-[9px] font-mono text-cyan-800 tracking-widest mb-2">ГЛУБИНА ЦВЕТА</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([1, 8] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => setBitDepth(d)}
                          className={`py-2 text-xs font-mono rounded border transition-all ${
                            bitDepth === d
                              ? "border-cyan-400 text-cyan-300 bg-cyan-950/40"
                              : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"
                          }`}
                        >
                          {d}-bit {d === 1 ? "(B&W)" : "(Gray)"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-cyan-800 tracking-widest mb-2">ДИЗЕРИНГ</div>
                    <div className="flex flex-col gap-1.5">
                      {([
                        { id: "none",      label: "Нет",            desc: "Только порог" },
                        { id: "floyd",     label: "Floyd-Steinberg", desc: "Лучший для фото" },
                        { id: "ordered",   label: "Ordered (Bayer)", desc: "Регулярный паттерн" },
                        { id: "threshold", label: "Threshold",       desc: "Жёсткий порог" },
                        { id: "error",     label: "Error Diffusion", desc: "Мягкий переход" },
                      ] as { id: DitheringMode; label: string; desc: string }[]).map(d => (
                        <button
                          key={d.id}
                          onClick={() => setDithering(d.id)}
                          className={`flex items-center justify-between px-3 py-1.5 rounded border text-left transition-all ${
                            dithering === d.id
                              ? "border-cyan-400 bg-cyan-950/40"
                              : "border-cyan-900/20 hover:border-cyan-800/50 bg-transparent"
                          }`}
                        >
                          <span className={`text-[10px] font-mono ${dithering === d.id ? "text-cyan-300" : "text-cyan-700"}`}>{d.label}</span>
                          <span className="text-[8px] font-mono text-cyan-900">{d.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* DPI SETTINGS */}
                <div className="panel rounded-lg p-4 neon-border">
                  <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-3 flex items-center gap-2">
                    <Icon name="ScanLine" size={10} className="text-cyan-500" />
                    НАСТРОЙКА DPI
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {[72, 127, 254, 508].map(d => (
                      <button
                        key={d}
                        onClick={() => { setParam("dpi", d); setCustomDpi(d); }}
                        className={`py-1.5 text-[10px] font-mono rounded border transition-all ${
                          params.dpi === d
                            ? "border-cyan-400 text-cyan-300 bg-cyan-950/40"
                            : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-cyan-800 mb-1.5">ПРОИЗВОЛЬНОЕ ЗНАЧЕНИЕ</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={10}
                        max={2400}
                        value={customDpi}
                        onChange={e => setCustomDpi(Number(e.target.value))}
                        className="flex-1 bg-black/40 border border-cyan-900/40 rounded px-3 py-1.5 text-sm font-mono text-cyan-300 outline-none focus:border-cyan-500/60 w-0"
                      />
                      <button
                        onClick={() => setParam("dpi", customDpi)}
                        className="neon-btn px-3 py-1.5 rounded text-[10px] font-orbitron tracking-widest"
                      >
                        OK
                      </button>
                    </div>
                    <div className="mt-2 text-[9px] font-mono text-cyan-800">
                      Шаг линии: {(25.4 / params.dpi).toFixed(3)} мм · Точек: {params.dpi} /дюйм
                    </div>
                  </div>
                </div>

                <button onClick={() => setActiveTab("preview")} className="neon-btn px-4 py-3 rounded-lg w-full font-orbitron text-xs tracking-widest">
                  <Icon name="Eye" size={14} className="inline mr-2" />
                  ПРЕДПРОСМОТР ГРАВИРОВКИ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {activeTab === "preview" && imageUrl && (
          <div className="animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-orbitron text-lg font-bold neon-cyan">ПРЕДПРОСМОТР ГРАВИРОВКИ</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[9px] font-mono text-cyan-800 border border-cyan-900/30 rounded px-3 py-1.5">
                  <span>{params.dpi} DPI</span><span>·</span>
                  <span>{bitDepth}-BIT</span><span>·</span>
                  <span>{dithering.toUpperCase()}</span>
                  {neuroFilter !== "none" && <><span>·</span><span className="text-emerald-600">{neuroFilter.toUpperCase()}</span></>}
                </div>
                <button onClick={() => setShowComparison(!showComparison)}
                  className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-all ${showComparison ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/40 text-cyan-600 hover:text-cyan-300 hover:border-cyan-600/40"}`}>
                  {showComparison ? "⇔ СРАВНЕНИЕ ВКЛ" : "⇔ СРАВНЕНИЕ"}
                </button>
                <button onClick={() => setActiveTab("export")} className="neon-btn-green neon-btn text-[10px] px-4 py-1.5 rounded font-orbitron tracking-widest">
                  ЭКСПОРТ →
                </button>
              </div>
            </div>

            <div style={{ height: 480 }}>
              <PreviewCanvas
                dataUrl={processedDataUrl}
                originalUrl={imageUrl}
                showComparison={showComparison}
                isProcessing={isProcessing}
                bitDepth={bitDepth}
              />
            </div>

            <div className="mt-5 panel rounded-lg p-4 neon-border">
              <div className="text-[10px] font-mono text-cyan-700 tracking-widest mb-3">ПАРАМЕТРЫ ЛАЗЕРА</div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Скорость", value: `${params.speed} мм/мин`, icon: "Gauge" },
                  { label: "Мощность", value: `${params.power}%`, icon: "Zap" },
                  { label: "Разрешение", value: `${params.dpi} DPI`, icon: "Grid3x3" },
                  { label: "Проходов", value: String(params.passes), icon: "RefreshCw" },
                ].map((p) => (
                  <div key={p.label} className="bg-black/30 rounded border border-cyan-900/20 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon name={p.icon} fallback="Circle" size={10} className="text-cyan-600" />
                      <span className="text-[9px] font-mono text-cyan-700 tracking-widest">{p.label}</span>
                    </div>
                    <div className="font-mono text-sm text-cyan-300">{p.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* EXPORT */}
        {activeTab === "export" && imageUrl && (
          <div className="animate-fade-in">
            <div className="mb-4">
              <h2 className="font-orbitron text-lg font-bold neon-cyan mb-1">ЭКСПОРТ ФАЙЛА</h2>
              <p className="text-cyan-700 text-sm font-ibm">Выберите формат для вашего лазерного оборудования</p>
            </div>

            {/* Quick download bar */}
            {processedDataUrl && (
              <div className="mb-5 panel rounded-lg p-4 neon-border border-emerald-900/40 bg-emerald-950/10">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono text-emerald-500 tracking-widest">ФАЙЛ ГОТОВ К СКАЧИВАНИЮ</span>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={handleDownloadPNG}
                      className="flex items-center gap-2 px-4 py-2 rounded border border-cyan-500/50 bg-cyan-950/30 text-cyan-300 font-orbitron text-[10px] tracking-widest hover:border-cyan-400 hover:bg-cyan-950/50 transition-all"
                    >
                      <Icon name="Download" size={12} />
                      PNG
                    </button>
                    <button
                      onClick={handleDownloadBMP}
                      className="flex items-center gap-2 px-4 py-2 rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 font-orbitron text-[10px] tracking-widest hover:border-emerald-400 hover:bg-emerald-950/50 transition-all"
                    >
                      <Icon name="Download" size={12} />
                      BMP {bitDepth}-BIT
                    </button>
                  </div>
                </div>
                {processedDataUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={processedDataUrl} alt="export preview" className="h-12 rounded border border-cyan-900/30 object-contain bg-black/40" />
                    <div className="text-[9px] font-mono text-cyan-800 leading-5">
                      <div>Режим: {bitDepth}-bit · Дизеринг: {dithering}</div>
                      <div>DPI: {params.dpi} · Шаг: {(25.4 / params.dpi).toFixed(3)} мм/точку</div>
                      <div>Лазер: {LASER_TYPES[laserType].label} · {wavelength}</div>
                      {material && <div>Материал: {MATERIAL_PRESETS[material].label}</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                {[
                  { format: "PNG", desc: "Растровый, с применением всех фильтров", icon: "Image", tag: "Готово", color: "emerald", action: handleDownloadPNG, active: true },
                  { format: `BMP ${bitDepth}-bit`, desc: bitDepth === 1 ? "Чёрно-белый без сжатия для станков" : "8-бит серый без сжатия", icon: "FileImage", tag: "Готово", color: "emerald", action: handleDownloadBMP, active: true },
                  { format: "G-CODE", desc: "ЧПУ команды для лазера", icon: "Terminal", tag: "Скоро", color: "cyan", action: null, active: false },
                  { format: "DXF", desc: "Векторный формат AutoCAD", icon: "Layers", tag: "Скоро", color: "cyan", action: null, active: false },
                  { format: "SVG", desc: "Масштабируемая векторная графика", icon: "PenTool", tag: "Скоро", color: "cyan", action: null, active: false },
                  { format: "LBRN", desc: "Нативный формат LightBurn", icon: "Flame", tag: "Скоро", color: "cyan", action: null, active: false },
                ].map((item) => (
                  <button
                    key={item.format}
                    onClick={item.action ?? undefined}
                    disabled={!item.active || !processedDataUrl}
                    className={`panel neon-border rounded-lg p-4 text-left transition-all duration-200 group ${item.active && processedDataUrl ? "hover:border-emerald-400/60 cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded border ${item.color === "emerald" && item.active ? "border-emerald-500/40 bg-emerald-950/20" : "border-cyan-500/20 bg-cyan-950/10"} flex items-center justify-center`}>
                        <Icon name={item.icon} fallback="File" size={16} className={item.color === "emerald" && item.active ? "text-emerald-400" : "text-cyan-700"} />
                      </div>
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${item.active ? "border-emerald-700/50 text-emerald-500" : "border-cyan-900/30 text-cyan-800"}`}>
                        {item.tag}
                      </span>
                    </div>
                    <div className={`font-orbitron text-sm font-bold mb-1 ${item.active ? "text-cyan-200" : "text-cyan-800"}`}>{item.format}</div>
                    <div className="text-xs text-cyan-700 font-ibm">{item.desc}</div>
                    {item.active && (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-700 group-hover:text-emerald-400 transition-colors">
                        <Icon name="Download" size={10} />
                        СКАЧАТЬ
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="panel rounded-lg p-5 neon-border">
                <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-5 flex items-center gap-2">
                  <Icon name="Settings2" size={10} />
                  ПАРАМЕТРЫ ЭКСПОРТА
                </div>
                <div className="mb-4">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">РАЗРЕШЕНИЕ DPI</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[127, 254, 508].map(dpi => (
                      <button key={dpi} onClick={() => setParam("dpi", dpi)} className={`py-1.5 text-xs font-mono rounded border transition-all ${params.dpi === dpi ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                        {dpi}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-2">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-1">СКОРОСТЬ</label>
                  <SliderControl label="" paramKey="speed" min={100} max={6000} step={100} unit=" мм/мин" />
                </div>
                <div className="mb-2">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-1">МОЩНОСТЬ</label>
                  <SliderControl label="" paramKey="power" min={1} max={100} unit="%" />
                </div>
                <div className="mb-5">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">ПРОХОДОВ</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map(n => (
                      <button key={n} onClick={() => setParam("passes", n)} className={`py-1.5 text-xs font-mono rounded border transition-all ${params.passes === n ? "border-emerald-400 text-emerald-300 bg-emerald-950/30" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleDownloadPNG}
                  disabled={!processedDataUrl}
                  className="neon-btn-green neon-btn w-full py-3 rounded-lg font-orbitron text-xs tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="Download" size={14} className="inline mr-2" />
                  СКАЧАТЬ PNG
                </button>
                <button
                  onClick={handleDownloadBMP}
                  disabled={!processedDataUrl}
                  className="neon-btn w-full py-3 rounded-lg font-orbitron text-xs tracking-widest mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="Download" size={14} className="inline mr-2" />
                  СКАЧАТЬ BMP {bitDepth}-BIT
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <div className="animate-fade-in">
            <div className="mb-4">
              <h2 className="font-orbitron text-lg font-bold neon-cyan mb-1">НАСТРОЙКИ</h2>
              <p className="text-cyan-700 text-sm font-ibm">Конфигурация оборудования и приложения</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="panel rounded-lg p-5 neon-border">
                <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-5 flex items-center gap-2">
                  <Icon name="Cpu" size={10} />
                  ПАРАМЕТРЫ ОБОРУДОВАНИЯ
                </div>
                <div className="mb-4">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">ТИП ЛАЗЕРА</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(LASER_TYPES) as [LaserType, typeof LASER_TYPES[LaserType]][]).map(([key, lt]) => (
                      <button key={key} onClick={() => handleLaserType(key)} className={`py-2 px-2 text-xs font-mono rounded border transition-all text-left ${laserType === key ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                        <div>{lt.label}</div>
                        <div className="text-[8px] text-cyan-800 mt-0.5">{lt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">ДЛИНА ВОЛНЫ</label>
                  <div className="flex flex-wrap gap-2">
                    {LASER_TYPES[laserType].wavelengths.map(wl => (
                      <button key={wl} onClick={() => setWavelength(wl)} className={`px-3 py-1.5 text-[10px] font-mono rounded border transition-all ${wavelength === wl ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                        {wl}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">РАБОЧАЯ ОБЛАСТЬ (мм)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] font-mono text-cyan-800 mb-1">ШИРИНА</div>
                      <input type="number" defaultValue={400} className="w-full bg-black/40 border border-cyan-900/40 rounded px-3 py-2 text-sm font-mono text-cyan-300 outline-none focus:border-cyan-500/60" />
                    </div>
                    <div>
                      <div className="text-[9px] font-mono text-cyan-800 mb-1">ВЫСОТА</div>
                      <input type="number" defaultValue={400} className="w-full bg-black/40 border border-cyan-900/40 rounded px-3 py-2 text-sm font-mono text-cyan-300 outline-none focus:border-cyan-500/60" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel rounded-lg p-5 neon-border">
                <div className="text-[10px] font-mono text-cyan-600 tracking-widest mb-5 flex items-center gap-2">
                  <Icon name="Monitor" size={10} />
                  ПАРАМЕТРЫ ПРИЛОЖЕНИЯ
                </div>
                {[
                  { label: "Авто-предпросмотр при изменении", on: true },
                  { label: "Сохранять последние настройки", on: true },
                  { label: "Сетка предпросмотра", on: false },
                  { label: "Инвертировать для тёмных материалов", on: false },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-3 border-b border-cyan-900/20 last:border-0">
                    <span className="text-xs font-ibm text-cyan-500">{s.label}</span>
                    <div className={`w-10 h-5 rounded-full border relative cursor-pointer ${s.on ? "border-cyan-400 bg-cyan-950/50" : "border-cyan-900/50 bg-black/30"}`}>
                      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${s.on ? "right-0.5 bg-cyan-400" : "left-0.5 bg-cyan-800"}`} />
                    </div>
                  </div>
                ))}
                <div className="mt-4">
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">ЕДИНИЦЫ ИЗМЕРЕНИЯ</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["мм", "дюймы"].map((unit, i) => (
                      <button key={unit} className={`py-2 text-xs font-mono rounded border transition-all ${i === 0 ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/30 text-cyan-700"}`}>
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="mt-5 neon-btn w-full py-3 rounded-lg font-orbitron text-xs tracking-widest">
                  СОХРАНИТЬ НАСТРОЙКИ
                </button>
              </div>

              <div className="lg:col-span-2 panel rounded-lg p-4 neon-border">
                <div className="text-[10px] font-mono text-cyan-700 tracking-widest mb-3">СИСТЕМНАЯ ИНФОРМАЦИЯ</div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  {[
                    { label: "Версия", value: "1.0.0" },
                    { label: "Движок", value: "LaserCore" },
                    { label: "Режим", value: "Professional" },
                    { label: "Лицензия", value: "Активна" },
                  ].map(info => (
                    <div key={info.label} className="bg-black/30 rounded p-3">
                      <div className="text-[9px] font-mono text-cyan-800 mb-1">{info.label}</div>
                      <div className="text-sm font-mono text-cyan-400">{info.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {(activeTab === "editor" || activeTab === "preview" || activeTab === "export") && !imageUrl && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 border border-cyan-900/40 rounded-lg flex items-center justify-center mb-4 bg-cyan-950/10">
              <Icon name="ImageOff" size={24} className="text-cyan-800" />
            </div>
            <p className="font-orbitron text-sm text-cyan-700 tracking-widest mb-3">ФАЙЛ НЕ ЗАГРУЖЕН</p>
            <button onClick={() => setActiveTab("upload")} className="neon-btn px-6 py-2.5 rounded-lg font-orbitron text-xs tracking-widest">
              ЗАГРУЗИТЬ ИЗОБРАЖЕНИЕ
            </button>
          </div>
        )}
      </main>

      {/* Status bar */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-cyan-900/20 bg-[#060a12]/95 backdrop-blur-xl px-6 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[9px] font-mono text-cyan-800">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            СИСТЕМА ГОТОВА
          </span>
          {imageUrl && <span>|  {imageName}</span>}
        </div>
        <div className="flex items-center gap-4 text-[9px] font-mono text-cyan-800">
          <span>{laserType} · {wavelength}</span>
          {material && <span>| {MATERIAL_PRESETS[material].label}</span>}
          <span>| {params.dpi} DPI · {bitDepth}bit · {dithering}</span>
          <span>| {params.power}% PWR · {params.speed} MM/MIN</span>
        </div>
      </footer>
      <div className="h-8" />
    </div>
  );
}