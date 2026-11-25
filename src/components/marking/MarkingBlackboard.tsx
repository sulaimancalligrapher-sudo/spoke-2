import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  PenTool,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Grid,
  Check,
  Image as ImageIcon,
  Sticker,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { MarkingSticker } from '../../types';
import { DEFAULT_MARKING_STICKERS, toProxiedCanvasImageUrl } from '../../utils/markingSheets';

export interface MarkingBlackboardHandle {
  exportCompositeDataUrl: () => string;
  getCompositeCanvas: () => HTMLCanvasElement | null;
  hasAnnotations: () => boolean;
  clearAnnotations: () => void;
  setWebcamVideo: (videoEl: HTMLVideoElement | null) => void;
}

interface MarkingBlackboardProps {
  studentImageUrl?: string;
  referenceImageUrl?: string;
  lessonTitle?: string;
  stickers?: MarkingSticker[];
  compact?: boolean;
  onAnnotationChange?: (hasMarks: boolean) => void;
}

interface StrokePoint {
  x: number;
  y: number;
}

type BoardAction =
  | {
      kind: 'stroke';
      tool: 'pen' | 'highlighter' | 'eraser';
      color: string;
      size: number;
      points: StrokePoint[];
    }
  | {
      kind: 'sticker';
      x: number;
      y: number;
      symbol: string;
      label: string;
      color: string;
      stickerKind?: MarkingSticker['kind'];
      scale: number;
    };

const BOARD_WIDTH = 1280;
const BOARD_HEIGHT = 720;

const PEN_COLORS = [
  { color: '#dc2626', label: 'أحمر تصحيح' },
  { color: '#059669', label: 'أخضر اعتماد' },
  { color: '#2563eb', label: 'أزرق توضيح' },
  { color: '#d97706', label: 'ذهبي تمييز' },
  { color: '#0f172a', label: 'أسود' },
  { color: '#ffffff', label: 'أبيض' },
];

export const MarkingBlackboard = forwardRef<MarkingBlackboardHandle, MarkingBlackboardProps>(
  (
    {
      studentImageUrl,
      referenceImageUrl,
      lessonTitle,
      stickers,
      compact = false,
      onAnnotationChange,
    },
    ref
  ) => {
    const availableStickers =
      stickers && stickers.length > 0 ? stickers : DEFAULT_MARKING_STICKERS;

    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [refImage, setRefImage] = useState<HTMLImageElement | null>(null);
    const [bgLoadError, setBgLoadError] = useState(false);

    const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'sticker'>('pen');
    const [penColor, setPenColor] = useState<string>('#dc2626');
    const [penSize, setPenSize] = useState<number>(6);
    const [selectedSticker, setSelectedSticker] = useState<MarkingSticker>(
      availableStickers[0]
    );
    const [stickerScale, setStickerScale] = useState<number>(1);
    const [boardTheme, setBoardTheme] = useState<'paper' | 'chalkboard'>('paper');
    const [showRuledLines, setShowRuledLines] = useState<boolean>(true);
    const [showReferenceOverlay, setShowReferenceOverlay] = useState<boolean>(false);
    const [zoom, setZoom] = useState<number>(1);
    const [expanded, setExpanded] = useState<boolean>(false);

    const [actions, setActions] = useState<BoardAction[]>([]);
    const [redoStack, setRedoStack] = useState<BoardAction[]>([]);
    const activeStrokeRef = useRef<Extract<BoardAction, { kind: 'stroke' }> | null>(null);
    const isDrawingRef = useRef(false);

    useEffect(() => {
      if (availableStickers.length > 0) {
        const stillExists = availableStickers.some((s) => s.id === selectedSticker?.id);
        if (!stillExists) setSelectedSticker(availableStickers[0]);
      }
    }, [availableStickers, selectedSticker?.id]);

    // Ensure offscreen annotation canvas exists
    useEffect(() => {
      if (!annotationCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = BOARD_WIDTH;
        c.height = BOARD_HEIGHT;
        annotationCanvasRef.current = c;
      }
    }, []);

    // Load student submission image safely via proxy to keep canvas untainted
    useEffect(() => {
      setBgImage(null);
      setBgLoadError(false);
      if (!studentImageUrl) return;

      const proxied = toProxiedCanvasImageUrl(studentImageUrl);
      if (!proxied) return;

      let cancelled = false;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!cancelled) {
          setBgImage(img);
          setBgLoadError(false);
        }
      };
      img.onerror = () => {
        if (!cancelled) {
          setBgImage(null);
          setBgLoadError(true);
        }
      };
      img.src = proxied;

      return () => {
        cancelled = true;
      };
    }, [studentImageUrl]);

    // Load optional reference image for side/ghost comparison
    useEffect(() => {
      setRefImage(null);
      if (!referenceImageUrl) return;
      const proxied = toProxiedCanvasImageUrl(referenceImageUrl);
      if (!proxied) return;
      let cancelled = false;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!cancelled) setRefImage(img);
      };
      img.src = proxied;
      return () => {
        cancelled = true;
      };
    }, [referenceImageUrl]);

    // Reset annotations when switching to a different submission image/lesson
    useEffect(() => {
      setActions([]);
      setRedoStack([]);
      setZoom(1);
    }, [studentImageUrl, lessonTitle]);

    useEffect(() => {
      onAnnotationChange?.(actions.length > 0);
    }, [actions.length, onAnnotationChange]);

    const redrawAnnotationLayer = useCallback(
      (allActions: BoardAction[], liveStroke: Extract<BoardAction, { kind: 'stroke' }> | null) => {
        const annCanvas = annotationCanvasRef.current;
        if (!annCanvas) return;
        const actx = annCanvas.getContext('2d');
        if (!actx) return;

        actx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        const list: BoardAction[] = liveStroke ? [...allActions, liveStroke] : allActions;

        for (const item of list) {
          if (item.kind === 'sticker') {
            actx.save();
            const baseScale = item.scale || 1;
            const symbolSize = Math.round(44 * baseScale);
            const showBadgeLabel = item.label && item.label !== item.symbol;

            actx.font = `bold ${Math.round(18 * baseScale)}px Cairo, sans-serif`;
            const textMetrics = showBadgeLabel ? actx.measureText(item.label) : { width: 0 };
            const pillW = showBadgeLabel
              ? Math.max(symbolSize + 24, textMetrics.width + symbolSize + 36)
              : symbolSize + 24;
            const pillH = Math.round(54 * baseScale);
            const bx = item.x - pillW / 2;
            const by = item.y - pillH / 2;

            // Shadow + crisp sticker stamp pill
            actx.shadowColor = 'rgba(15, 23, 42, 0.18)';
            actx.shadowBlur = 10;
            actx.shadowOffsetY = 3;
            actx.fillStyle = 'rgba(255, 255, 255, 0.96)';
            actx.beginPath();
            actx.roundRect(bx, by, pillW, pillH, 16 * baseScale);
            actx.fill();

            actx.shadowColor = 'transparent';
            actx.lineWidth = Math.max(2, 2.5 * baseScale);
            actx.strokeStyle = item.color || '#059669';
            actx.stroke();

            // Symbol
            actx.font = `${Math.round(28 * baseScale)}px sans-serif`;
            actx.textBaseline = 'middle';
            actx.textAlign = 'center';
            if (showBadgeLabel) {
              actx.fillText(item.symbol, item.x + pillW / 2 - 24 * baseScale, item.y + 1);
              actx.fillStyle = item.stickerKind === 'correction' ? '#991b1b' : '#0f172a';
              actx.font = `800 ${Math.round(17 * baseScale)}px Cairo, sans-serif`;
              actx.textAlign = 'right';
              actx.fillText(item.label, item.x + pillW / 2 - 48 * baseScale, item.y + 1);
            } else {
              actx.fillText(item.symbol, item.x, item.y + 2);
            }
            actx.restore();
            continue;
          }

          if (item.points.length === 0) continue;
          actx.save();
          actx.lineCap = 'round';
          actx.lineJoin = 'round';
          if (item.tool === 'eraser') {
            actx.globalCompositeOperation = 'destination-out';
            actx.strokeStyle = 'rgba(0,0,0,1)';
            actx.lineWidth = item.size * 3.0;
          } else if (item.tool === 'highlighter') {
            actx.globalCompositeOperation = 'source-over';
            actx.globalAlpha = 0.34;
            actx.strokeStyle = item.color;
            actx.lineWidth = item.size * 3.6;
          } else {
            actx.globalCompositeOperation = 'source-over';
            actx.globalAlpha = 1;
            actx.strokeStyle = item.color;
            actx.lineWidth = item.size;
          }

          actx.beginPath();
          actx.moveTo(item.points[0].x, item.points[0].y);
          if (item.points.length === 1) {
            actx.lineTo(item.points[0].x + 0.1, item.points[0].y + 0.1);
          } else {
            for (let i = 1; i < item.points.length; i++) {
              const prev = item.points[i - 1];
              const curr = item.points[i];
              const midX = (prev.x + curr.x) / 2;
              const midY = (prev.y + curr.y) / 2;
              actx.quadraticCurveTo(prev.x, prev.y, midX, midY);
            }
            const last = item.points[item.points.length - 1];
            actx.lineTo(last.x, last.y);
          }
          actx.stroke();
          actx.restore();
        }
      },
      []
    );

    const drawCompositeFrame = useCallback(() => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.fillStyle = boardTheme === 'chalkboard' ? '#0f2922' : '#ffffff';
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      if (showRuledLines) {
        ctx.strokeStyle =
          boardTheme === 'chalkboard' ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.22)';
        ctx.lineWidth = 1;
        const step = 52;
        for (let y = step; y < BOARD_HEIGHT; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(BOARD_WIDTH, y);
          ctx.stroke();
        }
      }

      if (bgImage) {
        const padding = 16;
        const availW = BOARD_WIDTH - padding * 2;
        const availH = BOARD_HEIGHT - padding * 2;
        const ratio = Math.min(availW / bgImage.width, availH / bgImage.height);
        const drawW = bgImage.width * ratio;
        const drawH = bgImage.height * ratio;
        const drawX = (BOARD_WIDTH - drawW) / 2;
        const drawY = (BOARD_HEIGHT - drawH) / 2;
        ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
      }

      if (showReferenceOverlay && refImage) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        const padding = 24;
        const availW = BOARD_WIDTH - padding * 2;
        const availH = BOARD_HEIGHT - padding * 2;
        const ratio = Math.min(availW / refImage.width, availH / refImage.height);
        const drawW = refImage.width * ratio;
        const drawH = refImage.height * ratio;
        const drawX = (BOARD_WIDTH - drawW) / 2;
        const drawY = (BOARD_HEIGHT - drawH) / 2;
        ctx.drawImage(refImage, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      if (annotationCanvasRef.current) {
        ctx.drawImage(annotationCanvasRef.current, 0, 0);
      }

      if (!bgImage && lessonTitle) {
        ctx.save();
        ctx.fillStyle =
          boardTheme === 'chalkboard' ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.22)';
        ctx.font = 'bold 22px Cairo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(lessonTitle, BOARD_WIDTH - 28, 40);
        ctx.restore();
      }

      ctx.restore();
    }, [bgImage, refImage, boardTheme, showRuledLines, showReferenceOverlay, lessonTitle]);

    useEffect(() => {
      redrawAnnotationLayer(actions, activeStrokeRef.current);
      drawCompositeFrame();
    }, [actions, redrawAnnotationLayer, drawCompositeFrame]);

    useImperativeHandle(ref, () => ({
      exportCompositeDataUrl: () => {
        drawCompositeFrame();
        try {
          return displayCanvasRef.current?.toDataURL('image/png') || '';
        } catch {
          return '';
        }
      },
      getCompositeCanvas: () => displayCanvasRef.current,
      hasAnnotations: () => actions.length > 0,
      clearAnnotations: () => {
        setActions([]);
        setRedoStack([]);
      },
      setWebcamVideo: (videoEl) => {
        webcamVideoRef.current = videoEl;
      },
    }));

    const mapPointerToCanvas = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH;
      const y = ((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT;
      return {
        x: Math.max(0, Math.min(BOARD_WIDTH, x)),
        y: Math.max(0, Math.min(BOARD_HEIGHT, y)),
      };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const pt = mapPointerToCanvas(e);

      if (tool === 'sticker') {
        if (selectedSticker) {
          const stamp: BoardAction = {
            kind: 'sticker',
            x: pt.x,
            y: pt.y,
            symbol: selectedSticker.symbol,
            label: selectedSticker.label,
            color: selectedSticker.color || '#059669',
            stickerKind: selectedSticker.kind,
            scale: stickerScale,
          };
          setActions((prev) => [...prev, stamp]);
          setRedoStack([]);
        }
        return;
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      activeStrokeRef.current = {
        kind: 'stroke',
        tool,
        color: penColor,
        size: penSize,
        points: [pt],
      };
      redrawAnnotationLayer(actions, activeStrokeRef.current);
      drawCompositeFrame();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      const pt = mapPointerToCanvas(e);
      activeStrokeRef.current.points.push(pt);
      redrawAnnotationLayer(actions, activeStrokeRef.current);
      drawCompositeFrame();
    };

    const finishStroke = () => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      isDrawingRef.current = false;
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      if (finished.points.length > 0) {
        setActions((prev) => [...prev, finished]);
        setRedoStack([]);
      }
    };

    const handleUndo = () => {
      setActions((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        setRedoStack((r) => [...r, last]);
        return prev.slice(0, -1);
      });
    };

    const handleRedo = () => {
      setRedoStack((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        setActions((s) => [...s, last]);
        return prev.slice(0, -1);
      });
    };

    return (
      <div
        className={`bg-white border border-slate-200 overflow-hidden flex flex-col ${
          expanded ? 'fixed inset-2 sm:inset-4 z-50 rounded-2xl shadow-2xl' : 'rounded-2xl'
        }`}
      >
        {/* Main Toolbar */}
        <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Drawing + Sticker Tools */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTool('pen')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                tool === 'pen'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>قلم</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('highlighter')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                tool === 'highlighter'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>تظليل</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('sticker')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                tool === 'sticker'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Sticker className="w-3.5 h-3.5" />
              <span>استيكر / علامة</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                tool === 'eraser'
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
              title="يمسح تصحيح المعلم فقط دون المساس بصورة الطالب"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>ممحاة</span>
            </button>

            <span className="h-5 w-px bg-slate-200 mx-0.5" />

            {/* Colors */}
            <div className="flex items-center gap-1">
              {PEN_COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => {
                    setPenColor(c.color);
                    if (tool === 'eraser' || tool === 'sticker') setTool('pen');
                  }}
                  title={c.label}
                  className={`w-6 h-6 rounded-full border cursor-pointer flex items-center justify-center transition-transform ${
                    penColor === c.color && tool !== 'eraser' && tool !== 'sticker'
                      ? 'ring-2 ring-slate-900 ring-offset-1 scale-110'
                      : 'border-slate-300'
                  }`}
                  style={{ backgroundColor: c.color }}
                >
                  {penColor === c.color && tool !== 'eraser' && tool !== 'sticker' && (
                    <Check
                      className={`w-3 h-3 ${
                        c.color === '#ffffff' ? 'text-slate-900' : 'text-white'
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>

            <span className="h-5 w-px bg-slate-200 mx-0.5" />

            {tool === 'sticker' ? (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <span>الحجم:</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.8}
                  step={0.1}
                  value={stickerScale}
                  onChange={(e) => setStickerScale(Number(e.target.value))}
                  className="w-16 accent-emerald-600 cursor-pointer"
                />
                <span className="w-6 text-center tabular-nums">{stickerScale.toFixed(1)}x</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <span>السُمك:</span>
                <input
                  type="range"
                  min={2}
                  max={18}
                  value={penSize}
                  onChange={(e) => setPenSize(Number(e.target.value))}
                  className="w-16 accent-slate-900 cursor-pointer"
                />
                <span className="w-4 text-center tabular-nums">{penSize}</span>
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={actions.length === 0}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              title="تراجع"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              title="إعادة"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setBoardTheme((p) => (p === 'paper' ? 'chalkboard' : 'paper'))}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border whitespace-nowrap shrink-0 cursor-pointer ${
                boardTheme === 'chalkboard'
                  ? 'bg-emerald-900 text-white border-emerald-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title="تبديل خلفية السبورة"
            >
              {boardTheme === 'chalkboard' ? 'سبورة خضراء' : 'ورق أبيض'}
            </button>

            <button
              type="button"
              onClick={() => setShowRuledLines((p) => !p)}
              className={`p-1.5 rounded-lg border cursor-pointer ${
                showRuledLines
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
              title="تسطير السبورة"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>

            {refImage && (
              <button
                type="button"
                onClick={() => setShowReferenceOverlay((p) => !p)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                  showReferenceOverlay
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                title="إظهار شفاف لصورة النموذج الأصلي للمقارنة"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>شفافية النموذج</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-1.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-mono font-bold text-slate-700 cursor-pointer"
              title="إعادة ضبط الحجم"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))))}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {!compact && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                title={expanded ? 'تصغير السبورة' : 'تكبير السبورة ملء الشاشة'}
              >
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActions([]);
                setRedoStack([]);
              }}
              disabled={actions.length === 0}
              className="px-2 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-40 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              title="مسح كافة علامات التصحيح"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح</span>
            </button>
          </div>
        </div>

        {/* Sticker Quick Bar (always visible so teacher can stamp immediately) */}
        <div className="px-3 py-1.5 bg-slate-50/70 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[11px] font-extrabold text-slate-500 whitespace-nowrap shrink-0 pl-1">
            ختم على الصورة:
          </span>
          {availableStickers.map((st) => {
            const isSelected = tool === 'sticker' && selectedSticker?.id === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setSelectedSticker(st);
                  setTool('sticker');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer border transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
                title="اختر ثم انقر على السبورة لوضع الاستيكر"
              >
                <span className="text-sm leading-none">{st.symbol}</span>
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>

        {/* Canvas Viewport (Large Primary Canvas) */}
        <div
          className={`relative bg-slate-100 overflow-auto flex items-center justify-center p-2 sm:p-3 flex-1 ${
            expanded
              ? 'min-h-0'
              : compact
              ? 'min-h-[360px] max-h-[440px]'
              : 'min-h-[480px] sm:min-h-[560px] lg:min-h-[620px]'
          }`}
        >
          {bgLoadError && studentImageUrl && (
            <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>تعذر تحميل صورة الطالب داخل السبورة — يمكنك الكتابة مباشرة أو فتح الصورة</span>
              <a
                href={studentImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-extrabold"
              >
                فتح
              </a>
            </div>
          )}

          {tool === 'sticker' && selectedSticker && (
            <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-lg bg-slate-900/85 text-white text-[11px] font-bold pointer-events-none flex items-center gap-1.5">
              <span>{selectedSticker.symbol}</span>
              <span>انقر في أي مكان على الصورة لوضع «{selectedSticker.label}»</span>
            </div>
          )}

          <div
            className="relative shadow-md rounded-xl overflow-hidden border border-slate-300 transition-transform origin-center bg-white"
            style={{
              transform: `scale(${zoom})`,
              width: '100%',
              maxWidth: expanded ? '1260px' : compact ? '820px' : '1180px',
              aspectRatio: '16 / 9',
            }}
          >
            <canvas
              ref={displayCanvasRef}
              width={BOARD_WIDTH}
              height={BOARD_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              className={`w-full h-full block touch-none select-none ${
                tool === 'sticker' ? 'cursor-copy' : 'cursor-crosshair'
              }`}
            />
          </div>

          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>إرجاع الحجم</span>
            </button>
          )}
        </div>
      </div>
    );
  }
);

MarkingBlackboard.displayName = 'MarkingBlackboard';

