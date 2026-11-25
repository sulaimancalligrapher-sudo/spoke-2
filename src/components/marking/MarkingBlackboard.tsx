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
} from 'lucide-react';
import { toProxiedCanvasImageUrl } from '../../utils/markingSheets';

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
  compact?: boolean;
  onAnnotationChange?: (hasMarks: boolean) => void;
}

interface StrokePoint {
  x: number;
  y: number;
}

interface BoardStroke {
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  points: StrokePoint[];
}

const BOARD_WIDTH = 960;
const BOARD_HEIGHT = 540;

const PEN_COLORS = [
  { color: '#dc2626', label: 'أحمر تصحيح' },
  { color: '#059669', label: 'أخضر اعتماد' },
  { color: '#2563eb', label: 'أزرق توضيح' },
  { color: '#d97706', label: 'ذهبي تمييز' },
  { color: '#0f172a', label: 'أسود' },
  { color: '#ffffff', label: 'أبيض' },
];

export const MarkingBlackboard = forwardRef<MarkingBlackboardHandle, MarkingBlackboardProps>(
  ({ studentImageUrl, referenceImageUrl, lessonTitle, compact = false, onAnnotationChange }, ref) => {
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [refImage, setRefImage] = useState<HTMLImageElement | null>(null);
    const [bgLoadError, setBgLoadError] = useState(false);

    const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
    const [penColor, setPenColor] = useState<string>('#dc2626');
    const [penSize, setPenSize] = useState<number>(5);
    const [boardTheme, setBoardTheme] = useState<'paper' | 'chalkboard'>('paper');
    const [showRuledLines, setShowRuledLines] = useState<boolean>(true);
    const [showReferenceOverlay, setShowReferenceOverlay] = useState<boolean>(false);
    const [zoom, setZoom] = useState<number>(1);

    const [strokes, setStrokes] = useState<BoardStroke[]>([]);
    const [redoStack, setRedoStack] = useState<BoardStroke[]>([]);
    const activeStrokeRef = useRef<BoardStroke | null>(null);
    const isDrawingRef = useRef(false);

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

    // Reset strokes when switching to a different submission image/lesson
    useEffect(() => {
      setStrokes([]);
      setRedoStack([]);
      setZoom(1);
    }, [studentImageUrl, lessonTitle]);

    useEffect(() => {
      onAnnotationChange?.(strokes.length > 0);
    }, [strokes.length, onAnnotationChange]);

    const redrawAnnotationLayer = useCallback(
      (allStrokes: BoardStroke[], liveStroke: BoardStroke | null) => {
        const annCanvas = annotationCanvasRef.current;
        if (!annCanvas) return;
        const actx = annCanvas.getContext('2d');
        if (!actx) return;

        actx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        const list = liveStroke ? [...allStrokes, liveStroke] : allStrokes;

        for (const s of list) {
          if (s.points.length === 0) continue;
          actx.save();
          actx.lineCap = 'round';
          actx.lineJoin = 'round';
          if (s.tool === 'eraser') {
            actx.globalCompositeOperation = 'destination-out';
            actx.strokeStyle = 'rgba(0,0,0,1)';
            actx.lineWidth = s.size * 2.6;
          } else if (s.tool === 'highlighter') {
            actx.globalCompositeOperation = 'source-over';
            actx.globalAlpha = 0.34;
            actx.strokeStyle = s.color;
            actx.lineWidth = s.size * 3.2;
          } else {
            actx.globalCompositeOperation = 'source-over';
            actx.globalAlpha = 1;
            actx.strokeStyle = s.color;
            actx.lineWidth = s.size;
          }

          actx.beginPath();
          actx.moveTo(s.points[0].x, s.points[0].y);
          if (s.points.length === 1) {
            actx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
          } else {
            for (let i = 1; i < s.points.length; i++) {
              const prev = s.points[i - 1];
              const curr = s.points[i];
              const midX = (prev.x + curr.x) / 2;
              const midY = (prev.y + curr.y) / 2;
              actx.quadraticCurveTo(prev.x, prev.y, midX, midY);
            }
            const last = s.points[s.points.length - 1];
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

      // 1. Background fill
      ctx.save();
      ctx.fillStyle = boardTheme === 'chalkboard' ? '#0f2922' : '#ffffff';
      ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

      // 2. Ruled calligraphy lines (when no photo or subtle guide)
      if (showRuledLines) {
        ctx.strokeStyle =
          boardTheme === 'chalkboard' ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.22)';
        ctx.lineWidth = 1;
        const step = 45;
        for (let y = step; y < BOARD_HEIGHT; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(BOARD_WIDTH, y);
          ctx.stroke();
        }
      }

      // 3. Student submitted writing image
      if (bgImage) {
        const padding = 20;
        const availW = BOARD_WIDTH - padding * 2;
        const availH = BOARD_HEIGHT - padding * 2;
        const ratio = Math.min(availW / bgImage.width, availH / bgImage.height);
        const drawW = bgImage.width * ratio;
        const drawH = bgImage.height * ratio;
        const drawX = (BOARD_WIDTH - drawW) / 2;
        const drawY = (BOARD_HEIGHT - drawH) / 2;
        ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
      }

      // 4. Optional Reference Template Ghost Overlay
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

      // 5. Teacher Annotations Layer
      if (annotationCanvasRef.current) {
        ctx.drawImage(annotationCanvasRef.current, 0, 0);
      }

      // 6. Live Webcam PiP (only when active during recording)
      const camVid = webcamVideoRef.current;
      if (camVid && camVid.readyState >= 2 && camVid.videoWidth > 0) {
        const pipW = 160;
        const pipH = 112;
        const pipX = 18;
        const pipY = BOARD_HEIGHT - pipH - 18;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pipX, pipY, pipW, pipH, 14);
        ctx.clip();
        ctx.drawImage(camVid, pipX, pipY, pipW, pipH);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(pipX, pipY, pipW, pipH, 14);
        ctx.stroke();
        ctx.restore();
      }

      // 7. Lesson Title Watermark on empty chalkboard/whiteboard
      if (!bgImage && lessonTitle) {
        ctx.save();
        ctx.fillStyle =
          boardTheme === 'chalkboard' ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.22)';
        ctx.font = 'bold 18px Cairo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(lessonTitle, BOARD_WIDTH - 24, 34);
        ctx.restore();
      }

      ctx.restore();
    }, [bgImage, refImage, boardTheme, showRuledLines, showReferenceOverlay, lessonTitle]);

    // Continuous redraw loop when strokes/images change or webcam PiP is active
    useEffect(() => {
      redrawAnnotationLayer(strokes, activeStrokeRef.current);
      drawCompositeFrame();
    }, [strokes, redrawAnnotationLayer, drawCompositeFrame]);

    useEffect(() => {
      let rafId = 0;
      const tick = () => {
        if (webcamVideoRef.current && webcamVideoRef.current.readyState >= 2) {
          drawCompositeFrame();
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [drawCompositeFrame]);

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
      hasAnnotations: () => strokes.length > 0,
      clearAnnotations: () => {
        setStrokes([]);
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
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const pt = mapPointerToCanvas(e);
      activeStrokeRef.current = {
        tool,
        color: penColor,
        size: penSize,
        points: [pt],
      };
      redrawAnnotationLayer(strokes, activeStrokeRef.current);
      drawCompositeFrame();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      const pt = mapPointerToCanvas(e);
      activeStrokeRef.current.points.push(pt);
      redrawAnnotationLayer(strokes, activeStrokeRef.current);
      drawCompositeFrame();
    };

    const finishStroke = () => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      isDrawingRef.current = false;
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      if (finished.points.length > 0) {
        setStrokes((prev) => [...prev, finished]);
        setRedoStack([]);
      }
    };

    const handleUndo = () => {
      setStrokes((prev) => {
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
        setStrokes((s) => [...s, last]);
        return prev.slice(0, -1);
      });
    };

    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Blackboard Toolbar */}
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {/* Tools */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTool('pen')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
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
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
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
              onClick={() => setTool('eraser')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
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
                    if (tool === 'eraser') setTool('pen');
                  }}
                  title={c.label}
                  className={`w-6 h-6 rounded-full border cursor-pointer flex items-center justify-center transition-transform ${
                    penColor === c.color && tool !== 'eraser'
                      ? 'ring-2 ring-slate-900 ring-offset-1 scale-110'
                      : 'border-slate-300'
                  }`}
                  style={{ backgroundColor: c.color }}
                >
                  {penColor === c.color && tool !== 'eraser' && (
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

            {/* Size */}
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
          </div>

          {/* Right Controls: Undo / Redo / Layers / Zoom / Clear */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
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
              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                boardTheme === 'chalkboard'
                  ? 'bg-emerald-900 text-white border-emerald-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title="تبديل خلفية السبورة (ورق أبيض / سبورة خضراء)"
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
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
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

            <button
              type="button"
              onClick={() => {
                setStrokes([]);
                setRedoStack([]);
              }}
              disabled={strokes.length === 0}
              className="px-2 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-40 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="مسح كافة علامات التصحيح"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح التصحيح</span>
            </button>
          </div>
        </div>

        {/* Canvas Viewport */}
        <div
          className={`relative bg-slate-100 overflow-auto flex items-center justify-center p-2 ${
            compact ? 'max-h-[340px]' : 'max-h-[480px]'
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

          <div
            className="relative shadow-md rounded-xl overflow-hidden border border-slate-300 transition-transform origin-center"
            style={{
              transform: `scale(${zoom})`,
              width: '100%',
              maxWidth: compact ? '680px' : '860px',
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
              className="w-full h-full block touch-none cursor-crosshair select-none"
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
