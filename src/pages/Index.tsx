import { useState, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";

type Tab = "upload" | "editor" | "preview" | "export" | "settings";

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

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [params, setParams] = useState<LaserParams>(DEFAULT_PARAMS);
  const [isDragging, setIsDragging] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageName(file.name);
    setActiveTab("editor");
  }, []);

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

  const getImageFilter = () => {
    const c = params.contrast / 50;
    const b = (params.brightness - 50) / 50 * 0.5;
    const g = params.grayscale / 100;
    return `grayscale(${g}) contrast(${c}) brightness(${1 + b})`;
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
              <button onClick={() => setParams(DEFAULT_PARAMS)} className="text-[10px] font-mono text-cyan-700 hover:text-cyan-400 border border-cyan-900/40 px-3 py-1 rounded transition-colors">
                СБРОС
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <div className="panel rounded-lg overflow-hidden neon-border">
                  <div className="px-4 py-2 border-b border-cyan-900/30 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[10px] font-mono text-cyan-600 tracking-widest">LIVE PREVIEW</span>
                    <span className="ml-auto text-[9px] font-mono text-cyan-800">CONTRAST:{params.contrast} · GRAY:{params.grayscale}%</span>
                  </div>
                  <div className="p-4 flex items-center justify-center min-h-72 bg-black/40">
                    <img
                      src={imageUrl}
                      alt="preview"
                      className="max-w-full max-h-64 object-contain rounded"
                      style={{ filter: getImageFilter() }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="panel rounded-lg p-5 neon-border">
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
                <button onClick={() => setShowComparison(!showComparison)} className="text-[10px] font-mono px-3 py-1.5 rounded border border-cyan-900/40 text-cyan-600 hover:text-cyan-300 hover:border-cyan-600/40 transition-all">
                  {showComparison ? "СКРЫТЬ" : "СРАВНЕНИЕ"}
                </button>
                <button onClick={() => setActiveTab("export")} className="neon-btn-green neon-btn text-[10px] px-4 py-1.5 rounded font-orbitron tracking-widest">
                  ЭКСПОРТ →
                </button>
              </div>
            </div>

            <div className={`grid ${showComparison ? "grid-cols-2" : "grid-cols-1"} gap-5`}>
              {showComparison && (
                <div className="panel rounded-lg overflow-hidden neon-border">
                  <div className="px-4 py-2 border-b border-cyan-900/30">
                    <span className="text-[10px] font-mono text-cyan-600">ОРИГИНАЛ</span>
                  </div>
                  <div className="p-4 flex items-center justify-center min-h-80 bg-black/40">
                    <img src={imageUrl} alt="original" className="max-w-full max-h-72 object-contain rounded" />
                  </div>
                </div>
              )}
              <div className="panel rounded-lg overflow-hidden neon-border">
                <div className="px-4 py-2 border-b border-cyan-900/30 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-emerald-500">РЕЗУЛЬТАТ ГРАВИРОВКИ</span>
                  <span className="text-[10px] font-mono text-cyan-700">{params.dpi} DPI</span>
                </div>
                <div
                  className="p-4 flex items-center justify-center min-h-80 bg-black/40"
                  style={{ backgroundImage: "radial-gradient(circle, #1a1a1a 1px, transparent 1px)", backgroundSize: "4px 4px" }}
                >
                  <img
                    src={imageUrl}
                    alt="engraved"
                    className="max-w-full max-h-72 object-contain rounded"
                    style={{ filter: `grayscale(1) contrast(${params.contrast / 50}) brightness(${1 + (params.brightness - 50) / 100}) invert(1)`, mixBlendMode: "multiply" }}
                  />
                </div>
              </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                {[
                  { format: "PNG", desc: "Растровый формат с прозрачностью", icon: "Image", tag: "Универсальный", color: "cyan" },
                  { format: "BMP", desc: "Без сжатия, максимальное качество", icon: "FileImage", tag: "Рекомендуется", color: "emerald" },
                  { format: "G-CODE", desc: "ЧПУ команды для лазера", icon: "Terminal", tag: "ЧПУ / Станки", color: "cyan" },
                  { format: "DXF", desc: "Векторный формат AutoCAD", icon: "Layers", tag: "Векторный", color: "cyan" },
                  { format: "SVG", desc: "Масштабируемая векторная графика", icon: "PenTool", tag: "Векторный", color: "cyan" },
                  { format: "LBRN", desc: "Нативный формат LightBurn", icon: "Flame", tag: "LightBurn", color: "emerald" },
                ].map((item) => (
                  <button key={item.format} className="panel neon-border rounded-lg p-4 text-left hover:border-cyan-400/50 transition-all duration-200 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded border ${item.color === "emerald" ? "border-emerald-500/30 bg-emerald-950/20" : "border-cyan-500/30 bg-cyan-950/20"} flex items-center justify-center`}>
                        <Icon name={item.icon} fallback="File" size={16} className={item.color === "emerald" ? "text-emerald-400" : "text-cyan-400"} />
                      </div>
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${item.color === "emerald" ? "border-emerald-800/50 text-emerald-600" : "border-cyan-800/50 text-cyan-700"}`}>
                        {item.tag}
                      </span>
                    </div>
                    <div className="font-orbitron text-base font-bold text-cyan-300 mb-1">{item.format}</div>
                    <div className="text-xs text-cyan-700 font-ibm">{item.desc}</div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-cyan-700 group-hover:text-cyan-400 transition-colors">
                      <Icon name="Download" size={10} />
                      СКАЧАТЬ
                    </div>
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
                <button className="neon-btn-green neon-btn w-full py-3 rounded-lg font-orbitron text-xs tracking-widest">
                  <Icon name="Download" size={14} className="inline mr-2" />
                  ЭКСПОРТ ВСЕХ
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
                    {["CO₂", "Fiber", "Diode", "UV"].map((type, i) => (
                      <button key={type} className={`py-2 text-xs font-mono rounded border transition-all ${i === 0 ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                        {type}
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
                <div>
                  <label className="text-[10px] font-mono text-cyan-700 tracking-widest block mb-2">ДЛИНА ВОЛНЫ</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {["10600 нм", "1064 нм", "450 нм"].map((wl, i) => (
                      <button key={wl} className={`py-1.5 text-[10px] font-mono rounded border transition-all ${i === 0 ? "border-cyan-400 text-cyan-300 bg-cyan-950/30" : "border-cyan-900/30 text-cyan-700 hover:border-cyan-700/50"}`}>
                        {wl}
                      </button>
                    ))}
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
          <span>CONTRAST: {params.contrast}</span>
          <span>SHARPNESS: {params.sharpness}</span>
          <span>GRAY: {params.grayscale}%</span>
          <span>|</span>
          <span>{params.power}% PWR · {params.speed} MM/MIN</span>
        </div>
      </footer>
      <div className="h-8" />
    </div>
  );
}