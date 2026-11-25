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
  RotateCw,
  Layers,
  Grid,
  Check,
  Image as ImageIcon,
  Sticker,
  Maximize2,
  Minimize2,
  Circle,
  ArrowUpRight,
  Type,
  Hand,
  Eye,
  X,
  Volume2,
  Feather,
  Loader2,
} from 'lucide-react';
import { MarkingPresetText, MarkingSticker, WatermarkSettings } from '../../types';
import { DEFAULT_MARKING_PRESETS, DEFAULT_MARKING_STICKERS } from '../../utils/markingSheets';
import {
  CanvasPoint,
  WatermarkStudentInfo,
  drawChiselSegment,
  exportCanvasWithWatermark,
  rotateCanvasPoint,
  simplifyCanvasPoints,
  toSafeCanvasImageSrc,
} from '../../utils/markingCanvasUtils';

export interface MarkingBlackboardHandle {
  exportCompositeDataUrl: () => string;
  exportWatermarkedDataUrl: (
    watermarkSettings?: Partial<WatermarkSettings>,
    studentInfo?: WatermarkStudentInfo,
    fallbackLogoUrl?: string
  ) => Promise<string>;
  getCompositeCanvas: () => HTMLCanvasElement | null;
  hasAnnotations: () => boolean;
  clearAnnotations: () => void;
}

interface MarkingBlackboardProps {
  studentImageUrl?: string;
  previousCorrectedImageUrl?: string;
  studentAudioUrl?: string;
  studentName?: string;
  referenceImageUrl?: string;
  lessonTitle?: string;
  stickers?: MarkingSticker[];
  presetTexts?: MarkingPresetText[];
  compact?: boolean;
  onAnnotationChange?: (hasMarks: boolean) => void;
}

type ToolGroup = 'draw' | 'textSticker' | 'controls';
type ActiveTool =
  | 'pen'
  | 'chisel'
  | 'highlighter'
  | 'circle'
  | 'arrow'
  | 'eraser'
  | 'text'
  | 'sticker'
  | 'hand';

type BoardAction =
  | {
      kind: 'stroke';
      tool: 'pen' | 'chisel' | 'highlighter' | 'circle' | 'arrow' | 'eraser';
      color: string;
      size: number;
      nibAngle?: number;
      points: CanvasPoint[];
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      lines: string[];
      color: string;
      fontSize: number;
      fontFamily: string;
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

const DEFAULT_BOARD_W = 1280;
const DEFAULT_BOARD_H = 720;

const PEN_COLORS = [
  { color: '#dc2626', label: 'أحمر تصحيح' },
  { color: '#059669', label: 'أخضر اعتماد' },
  { color: '#2563eb', label: 'أزرق توضيح' },
  { color: '#d97706', label: 'ذهبي تمييز' },
  { color: '#0f172a', label: 'أسود' },
  { color: '#ffffff', label: 'أبيض' },
];

const INITIAL_TOOL_CONFIGS: Record<string, { size: number; color: string }> = {
  pen: { size: 5, color: '#dc2626' },
  chisel: { size: 16, color: '#dc2626' },
  highlighter: { size: 10, color: '#eab308' },
  circle: { size: 5, color: '#dc2626' },
  arrow: { size: 5, color: '#2563eb' },
  eraser: { size: 12, color: '#ffffff' },
  text: { size: 32, color: '#0f172a' },
};

export const MarkingBlackboard = forwardRef<MarkingBlackboardHandle, MarkingBlackboardProps>(
  (
    {
      studentImageUrl,
      previousCorrectedImageUrl,
      studentAudioUrl,
      studentName,
      referenceImageUrl,
      lessonTitle,
      stickers,
      presetTexts,
      compact = false,
      onAnnotationChange,
    },
    ref
  ) => {
    const availableStickers =
      stickers && stickers.length > 0 ? stickers : DEFAULT_MARKING_STICKERS;
    const availablePresets =
      presetTexts && presetTexts.length > 0 ? presetTexts : DEFAULT_MARKING_PRESETS;

    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    // Edit Mode: prefer previousCorrectedImageUrl when available unless teacher toggles back to original
    const [useCorrectedAsBase, setUseCorrectedAsBase] = useState<boolean>(
      Boolean(previousCorrectedImageUrl?.trim())
    );
    const activeBaseImageUrl =
      useCorrectedAsBase && previousCorrectedImageUrl?.trim()
        ? previousCorrectedImageUrl.trim()
        : (studentImageUrl || '').trim();

    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [bgLoading, setBgLoading] = useState<boolean>(false);
    const [bgLoadError, setBgLoadError] = useState<boolean>(false);
    const [refImage, setRefImage] = useState<HTMLImageElement | null>(null);

    const [boardDims, setBoardDims] = useState<{ width: number; height: number }>({
      width: DEFAULT_BOARD_W,
      height: DEFAULT_BOARD_H,
    });
    const [imageRotation, setImageRotation] = useState<number>(0);

    // Tool Groups & Per-tool Memory
    const [toolGroup, setToolGroup] = useState<ToolGroup>('draw');
    const [tool, setTool] = useState<ActiveTool>('pen');
    const [toolConfigs, setToolConfigs] = useState(INITIAL_TOOL_CONFIGS);
    const [penColor, setPenColor] = useState<string>('#dc2626');
    const [penSize, setPenSize] = useState<number>(5);
    const [nibAngle, setNibAngle] = useState<number>(45);

    // Text & Sticker State
    const [textFontFamily, setTextFontFamily] = useState<string>('Cairo');
    const [textFontSize, setTextFontSize] = useState<number>(32);
    const [selectedPhrase, setSelectedPhrase] = useState<string>(availablePresets[0]?.text || '');
    const [customText, setCustomText] = useState<string>('');
    const [selectedSticker, setSelectedSticker] = useState<MarkingSticker>(
      availableStickers[0]
    );
    const [stickerScale, setStickerScale] = useState<number>(1);

    // View & Theme Controls
    const [boardTheme, setBoardTheme] = useState<'paper' | 'chalkboard'>('paper');
    const [showRuledLines, setShowRuledLines] = useState<boolean>(true);
    const [showReferenceOverlay, setShowReferenceOverlay] = useState<boolean>(false);
    const [zoom, setZoom] = useState<number>(1);
    const [panOffset, setPanOffset] = useState<CanvasPoint>({ x: 0, y: 0 });
    const [expanded, setExpanded] = useState<boolean>(false);
    const [showOriginalModal, setShowOriginalModal] = useState<boolean>(false);

    // History Stacks
    const [actions, setActions] = useState<BoardAction[]>([]);
    const [redoStack, setRedoStack] = useState<BoardAction[]>([]);
    const activeStrokeRef = useRef<Extract<BoardAction, { kind: 'stroke' }> | null>(null);
    const isDrawingRef = useRef(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef<CanvasPoint>({ x: 0, y: 0 });

    // Sync edit mode toggle when switching submissions
    useEffect(() => {
      setUseCorrectedAsBase(Boolean(previousCorrectedImageUrl?.trim()));
      setActions([]);
      setRedoStack([]);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      setImageRotation(0);
    }, [studentImageUrl, previousCorrectedImageUrl, lessonTitle]);

    useEffect(() => {
      if (availableStickers.length > 0) {
        const stillExists = availableStickers.some((s) => s.id === selectedSticker?.id);
        if (!stillExists) setSelectedSticker(availableStickers[0]);
      }
    }, [availableStickers, selectedSticker?.id]);

    // Switch tool while restoring & saving per-tool size/color memory
    const selectTool = (nextTool: ActiveTool, group?: ToolGroup) => {
      if (group) setToolGroup(group);
      setToolConfigs((prev) => ({
        ...prev,
        [tool]: { size: penSize, color: penColor },
      }));
      const savedCfg = toolConfigs[nextTool];
      if (savedCfg) {
        setPenSize(savedCfg.size);
        setPenColor(savedCfg.color);
      }
      setTool(nextTool);
    };

    const handleColorChange = (nextColor: string) => {
      setPenColor(nextColor);
      setToolConfigs((prev) => ({
        ...prev,
        [tool]: { size: penSize, color: nextColor },
      }));
      if (tool === 'eraser' || tool === 'hand' || tool === 'sticker') {
        setTool('pen');
        setToolGroup('draw');
      }
    };

    const handleSizeChange = (nextSize: number) => {
      setPenSize(nextSize);
      setToolConfigs((prev) => ({
        ...prev,
        [tool]: { size: nextSize, color: penColor },
      }));
    };

    // Load active background image cleanly at natural aspect ratio
    useEffect(() => {
      setBgImage(null);
      setBgLoadError(false);

      if (!activeBaseImageUrl) {
        setBgLoading(false);
        setBoardDims({ width: DEFAULT_BOARD_W, height: DEFAULT_BOARD_H });
        return;
      }

      const proxied = toSafeCanvasImageSrc(activeBaseImageUrl);
      if (!proxied) {
        setBgLoading(false);
        return;
      }

      let cancelled = false;
      setBgLoading(true);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const maxSide = 1600;
        let w = img.width || DEFAULT_BOARD_W;
        let h = img.height || DEFAULT_BOARD_H;
        if (w > maxSide || h > maxSide) {
          const r = Math.min(maxSide / w, maxSide / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        setBoardDims({ width: Math.max(640, w), height: Math.max(480, h) });
        setBgImage(img);
        setBgLoading(false);
        setBgLoadError(false);
        setImageRotation(0);
      };
      img.onerror = () => {
        if (cancelled) return;
        setBgImage(null);
        setBgLoading(false);
        setBgLoadError(true);
        setBoardDims({ width: DEFAULT_BOARD_W, height: DEFAULT_BOARD_H });
      };
      img.src = proxied;

      return () => {
        cancelled = true;
      };
    }, [activeBaseImageUrl]);

    // Load optional reference image
    useEffect(() => {
      setRefImage(null);
      if (!referenceImageUrl) return;
      const proxied = toSafeCanvasImageSrc(referenceImageUrl);
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

    // Keep offscreen annotation canvas matched to boardDims
    useEffect(() => {
      if (!annotationCanvasRef.current) {
        annotationCanvasRef.current = document.createElement('canvas');
      }
      annotationCanvasRef.current.width = boardDims.width;
      annotationCanvasRef.current.height = boardDims.height;
    }, [boardDims.width, boardDims.height]);

    useEffect(() => {
      onAnnotationChange?.(actions.length > 0 || imageRotation !== 0);
    }, [actions.length, imageRotation, onAnnotationChange]);

    const redrawAnnotationLayer = useCallback(
      (allActions: BoardAction[], liveStroke: Extract<BoardAction, { kind: 'stroke' }> | null) => {
        const annCanvas = annotationCanvasRef.current;
        if (!annCanvas) return;
        const actx = annCanvas.getContext('2d');
        if (!actx) return;

        actx.clearRect(0, 0, boardDims.width, boardDims.height);
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

          if (item.kind === 'text') {
            actx.save();
            const fSize = item.fontSize || 32;
            actx.font = `700 ${fSize}px ${item.fontFamily || 'Cairo'}, sans-serif`;
            const lineH = Math.round(fSize * 1.35);
            const maxLineW = Math.max(
              ...item.lines.map((ln) => actx.measureText(ln).width),
              40
            );
            const padX = 16;
            const padY = 10;
            const boxW = maxLineW + padX * 2;
            const boxH = item.lines.length * lineH + padY * 2;

            actx.shadowColor = 'rgba(15, 23, 42, 0.14)';
            actx.shadowBlur = 8;
            actx.fillStyle = 'rgba(255, 255, 255, 0.94)';
            actx.beginPath();
            actx.roundRect(item.x - boxW / 2, item.y - boxH / 2, boxW, boxH, 12);
            actx.fill();

            actx.shadowColor = 'transparent';
            actx.lineWidth = 2;
            actx.strokeStyle = item.color || '#0f172a';
            actx.stroke();

            actx.fillStyle = item.color || '#0f172a';
            actx.textAlign = 'center';
            actx.textBaseline = 'middle';
            item.lines.forEach((ln, idx) => {
              const ly = item.y - boxH / 2 + padY + lineH * idx + lineH / 2;
              actx.fillText(ln, item.x, ly);
            });
            actx.restore();
            continue;
          }

          // Strokes (pen, chisel, highlighter, circle, arrow, eraser)
          if (item.points.length === 0) continue;

          if (item.tool === 'chisel') {
            if (item.points.length === 1) {
              drawChiselSegment(
                actx,
                item.points[0],
                { x: item.points[0].x + 0.5, y: item.points[0].y + 0.5 },
                item.size,
                item.color,
                item.nibAngle ?? 45
              );
            } else {
              for (let i = 1; i < item.points.length; i++) {
                drawChiselSegment(
                  actx,
                  item.points[i - 1],
                  item.points[i],
                  item.size,
                  item.color,
                  item.nibAngle ?? 45
                );
              }
            }
            continue;
          }

          if (item.tool === 'circle' && item.points.length >= 2) {
            const p1 = item.points[0];
            const p2 = item.points[item.points.length - 1];
            const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            actx.save();
            actx.strokeStyle = item.color;
            actx.lineWidth = item.size;
            actx.beginPath();
            actx.arc(p1.x, p1.y, radius, 0, Math.PI * 2);
            actx.stroke();
            actx.restore();
            continue;
          }

          if (item.tool === 'arrow' && item.points.length >= 2) {
            const p1 = item.points[0];
            const p2 = item.points[item.points.length - 1];
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const headLen = Math.max(14, item.size * 3.2);
            actx.save();
            actx.strokeStyle = item.color;
            actx.fillStyle = item.color;
            actx.lineWidth = item.size;
            actx.lineCap = 'round';
            actx.lineJoin = 'round';
            actx.beginPath();
            actx.moveTo(p1.x, p1.y);
            actx.lineTo(p2.x, p2.y);
            actx.stroke();

            actx.beginPath();
            actx.moveTo(p2.x, p2.y);
            actx.lineTo(
              p2.x - headLen * Math.cos(angle - Math.PI / 6),
              p2.y - headLen * Math.sin(angle - Math.PI / 6)
            );
            actx.lineTo(
              p2.x - headLen * Math.cos(angle + Math.PI / 6),
              p2.y - headLen * Math.sin(angle + Math.PI / 6)
            );
            actx.closePath();
            actx.fill();
            actx.restore();
            continue;
          }

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
            actx.lineWidth = item.size * 3.4;
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
      [boardDims.width, boardDims.height]
    );

    const drawCompositeFrame = useCallback(() => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = boardDims.width;
      const H = boardDims.height;

      ctx.save();
      ctx.fillStyle = boardTheme === 'chalkboard' ? '#0f2922' : '#ffffff';
      ctx.fillRect(0, 0, W, H);

      if (showRuledLines) {
        ctx.strokeStyle =
          boardTheme === 'chalkboard' ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.22)';
        ctx.lineWidth = 1;
        const step = 52;
        for (let y = step; y < H; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
      }

      if (bgImage) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate((imageRotation * Math.PI) / 180);
        const swapped = imageRotation % 180 !== 0;
        const drawW = swapped ? H : W;
        const drawH = swapped ? W : H;
        ctx.drawImage(bgImage, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      if (showReferenceOverlay && refImage) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        const padding = 24;
        const availW = W - padding * 2;
        const availH = H - padding * 2;
        const ratio = Math.min(availW / refImage.width, availH / refImage.height);
        const drawW = refImage.width * ratio;
        const drawH = refImage.height * ratio;
        ctx.drawImage(refImage, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);
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
        ctx.fillText(lessonTitle, W - 28, 40);
        ctx.restore();
      }

      ctx.restore();
    }, [
      bgImage,
      refImage,
      boardDims.width,
      boardDims.height,
      imageRotation,
      boardTheme,
      showRuledLines,
      showReferenceOverlay,
      lessonTitle,
    ]);

    useEffect(() => {
      redrawAnnotationLayer(actions, activeStrokeRef.current);
      drawCompositeFrame();
    }, [actions, redrawAnnotationLayer, drawCompositeFrame]);

    useImperativeHandle(ref, () => ({
      exportCompositeDataUrl: () => {
        drawCompositeFrame();
        try {
          return displayCanvasRef.current?.toDataURL('image/jpeg', 0.88) || '';
        } catch {
          return '';
        }
      },
      exportWatermarkedDataUrl: async (wmSettings, studentInfo, fallbackLogoUrl) => {
        drawCompositeFrame();
        if (!displayCanvasRef.current) return '';
        return exportCanvasWithWatermark(
          displayCanvasRef.current,
          wmSettings,
          studentInfo || { studentName, lessonTitle },
          fallbackLogoUrl
        );
      },
      getCompositeCanvas: () => displayCanvasRef.current,
      hasAnnotations: () => actions.length > 0 || imageRotation !== 0,
      clearAnnotations: () => {
        setActions([]);
        setRedoStack([]);
      },
    }));

    const mapPointerToCanvas = (e: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * boardDims.width;
      const y = ((e.clientY - rect.top) / rect.height) * boardDims.height;
      return {
        x: Math.max(0, Math.min(boardDims.width, x)),
        y: Math.max(0, Math.min(boardDims.height, y)),
      };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      if (tool === 'hand') {
        e.currentTarget.setPointerCapture(e.pointerId);
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
        return;
      }

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

      if (tool === 'text') {
        const textVal = customText.trim() || selectedPhrase.trim();
        if (!textVal) return;
        const stamp: BoardAction = {
          kind: 'text',
          x: pt.x,
          y: pt.y,
          lines: textVal.split('\n'),
          color: penColor,
          fontSize: textFontSize,
          fontFamily: textFontFamily,
        };
        setActions((prev) => [...prev, stamp]);
        setRedoStack([]);
        return;
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const isShape = tool === 'circle' || tool === 'arrow';
      activeStrokeRef.current = {
        kind: 'stroke',
        tool,
        color: penColor,
        size: penSize,
        nibAngle: tool === 'chisel' ? nibAngle : undefined,
        points: isShape ? [pt, pt] : [pt],
      };
      redrawAnnotationLayer(actions, activeStrokeRef.current);
      drawCompositeFrame();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current && tool === 'hand') {
        setPanOffset({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
        return;
      }

      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      const pt = mapPointerToCanvas(e);
      if (activeStrokeRef.current.tool === 'circle' || activeStrokeRef.current.tool === 'arrow') {
        activeStrokeRef.current.points[1] = pt;
      } else {
        activeStrokeRef.current.points.push(pt);
      }
      redrawAnnotationLayer(actions, activeStrokeRef.current);
      drawCompositeFrame();
    };

    const finishPointer = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      isDrawingRef.current = false;
      const finished = { ...activeStrokeRef.current };
      if (finished.tool === 'pen' || finished.tool === 'chisel' || finished.tool === 'highlighter') {
        finished.points = simplifyCanvasPoints(finished.points, 1.0);
      }
      activeStrokeRef.current = null;
      if (finished.points.length > 0) {
        setActions((prev) => [...prev, finished]);
        setRedoStack([]);
      }
    };

    // Rotate 90° clockwise: swaps dimensions and transforms every action point
    const handleRotate90 = () => {
      const oldW = boardDims.width;
      const oldH = boardDims.height;
      const newW = oldH;
      const newH = oldW;
      const oldCx = oldW / 2;
      const oldCy = oldH / 2;
      const dxShift = newW / 2 - oldCx;
      const dyShift = newH / 2 - oldCy;

      const mapPt = (p: CanvasPoint): CanvasPoint => {
        const rp = rotateCanvasPoint(p.x, p.y, oldCx, oldCy, 90);
        return { x: rp.x + dxShift, y: rp.y + dyShift };
      };

      setActions((prev) =>
        prev.map((act) => {
          if (act.kind === 'stroke') {
            return { ...act, points: act.points.map(mapPt) };
          }
          const moved = mapPt({ x: act.x, y: act.y });
          return { ...act, x: moved.x, y: moved.y };
        })
      );
      setBoardDims({ width: newW, height: newH });
      setImageRotation((r) => (r + 90) % 360);
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
        {/* Top Row: Tool Groups + Edit Base Mode + Original Preview */}
        <div className="px-3 py-2 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 p-0.5 bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setToolGroup('draw');
                if (tool === 'text' || tool === 'sticker' || tool === 'hand') {
                  selectTool('pen', 'draw');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                toolGroup === 'draw'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              أدوات الرسم
            </button>
            <button
              type="button"
              onClick={() => {
                setToolGroup('textSticker');
                if (tool !== 'text' && tool !== 'sticker') {
                  selectTool('sticker', 'textSticker');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                toolGroup === 'textSticker'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              النصوص والملصقات
            </button>
            <button
              type="button"
              onClick={() => setToolGroup('controls')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                toolGroup === 'controls'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              التحكم والعرض
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {previousCorrectedImageUrl && studentImageUrl && (
              <div className="flex items-center gap-1 p-0.5 bg-slate-800 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setUseCorrectedAsBase(true)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                    useCorrectedAsBase ? 'bg-emerald-600 text-white' : 'text-slate-300'
                  }`}
                >
                  متابعة على المصحّحة
                </button>
                <button
                  type="button"
                  onClick={() => setUseCorrectedAsBase(false)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                    !useCorrectedAsBase ? 'bg-white text-slate-900' : 'text-slate-300'
                  }`}
                >
                  صورة الطالب الأصلية
                </button>
              </div>
            )}

            {(studentImageUrl || studentAudioUrl) && (
              <button
                type="button"
                onClick={() => setShowOriginalModal(true)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>عرض الأصلي</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleUndo}
              disabled={actions.length === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white cursor-pointer"
              title="تراجع"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white cursor-pointer"
              title="إعادة"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-Toolbar Per Group */}
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {toolGroup === 'draw' && (
            <div className="flex flex-wrap items-center gap-1.5 w-full justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => selectTool('pen', 'draw')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'pen'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>قلم عادي</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('chisel', 'draw')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'chisel'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>قلم مائل</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('highlighter', 'draw')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
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
                  onClick={() => selectTool('circle', 'draw')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'circle'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Circle className="w-3.5 h-3.5" />
                  <span>دائرة</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('arrow', 'draw')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'arrow'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>سهم</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('eraser', 'draw')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'eraser'
                      ? 'bg-rose-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                  title="يمسح تصحيح المعلم فقط دون المساس بصورة الطالب"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>ممحاة</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Color Swatches + Custom Color Picker */}
                <div className="flex items-center gap-1">
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => handleColorChange(c.color)}
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
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-6 h-6 rounded-md border border-slate-300 cursor-pointer p-0 bg-white"
                    title="اختيار أي لون مخصص"
                  />
                </div>

                {/* Line Width */}
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <span>السُمك:</span>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={penSize}
                    onChange={(e) => handleSizeChange(Number(e.target.value))}
                    className="w-20 accent-slate-900 cursor-pointer"
                  />
                  <span className="w-7 text-center font-mono tabular-nums">{penSize}px</span>
                </div>

                {/* Nib Angle when Chisel active */}
                {tool === 'chisel' && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                    <span>زاوية القطّة:</span>
                    <input
                      type="range"
                      min={0}
                      max={180}
                      step={5}
                      value={nibAngle}
                      onChange={(e) => setNibAngle(Number(e.target.value))}
                      className="w-16 accent-emerald-600 cursor-pointer"
                    />
                    <span className="w-8 text-center font-mono tabular-nums">{nibAngle}°</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {toolGroup === 'textSticker' && (
            <div className="w-full space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectTool('text', 'textSticker')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'text'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>كتابة نص على السبورة</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('sticker', 'textSticker')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    tool === 'sticker'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Sticker className="w-3.5 h-3.5" />
                  <span>ختم ملصق</span>
                </button>

                {tool === 'text' ? (
                  <>
                    <select
                      value={textFontFamily}
                      onChange={(e) => setTextFontFamily(e.target.value)}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800"
                    >
                      <option value="Cairo">Cairo</option>
                      <option value="Amiri">Amiri (خط نسخ)</option>
                      <option value="Tajawal">Tajawal</option>
                    </select>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                      <span>الحجم:</span>
                      <input
                        type="range"
                        min={18}
                        max={84}
                        value={textFontSize}
                        onChange={(e) => setTextFontSize(Number(e.target.value))}
                        className="w-16 accent-slate-900 cursor-pointer"
                      />
                      <span className="font-mono tabular-nums">{textFontSize}px</span>
                    </div>

                    <input
                      type="color"
                      value={penColor}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="w-6 h-6 rounded border border-slate-300 cursor-pointer bg-white"
                      title="لون النص"
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                    <span>حجم الملصق:</span>
                    <input
                      type="range"
                      min={0.6}
                      max={2.4}
                      step={0.1}
                      value={stickerScale}
                      onChange={(e) => setStickerScale(Number(e.target.value))}
                      className="w-20 accent-emerald-600 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums">{stickerScale.toFixed(1)}x</span>
                  </div>
                )}
              </div>

              {tool === 'text' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <select
                    value={selectedPhrase}
                    onChange={(e) => {
                      setSelectedPhrase(e.target.value);
                      setCustomText(e.target.value);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 max-w-xs"
                  >
                    {availablePresets.map((p) => (
                      <option key={p.id} value={p.text}>
                        {p.text}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="اكتب النص ثم انقر على أي مكان بالسبورة لوضعه..."
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                  />
                </div>
              )}
            </div>
          )}

          {toolGroup === 'controls' && (
            <div className="flex flex-wrap items-center gap-1.5 w-full justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => selectTool('hand', 'controls')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    tool === 'hand'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>تحريك (يد)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(1))))}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="تصغير"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-mono font-bold text-slate-700 cursor-pointer tabular-nums"
                  title="إرجاع الحجم والموضع"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="تكبير"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleRotate90}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تدوير 90°</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBoardTheme((p) => (p === 'paper' ? 'chalkboard' : 'paper'))}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border whitespace-nowrap shrink-0 cursor-pointer ${
                    boardTheme === 'chalkboard'
                      ? 'bg-emerald-900 text-white border-emerald-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
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
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                      showReferenceOverlay
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>شفافية النموذج</span>
                  </button>
                )}

                {!compact && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title={expanded ? 'تصغير السبورة' : 'ملء الشاشة'}
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
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-40 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticker Quick Bar (always handy) */}
        <div className="px-3 py-1.5 bg-slate-50/70 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[11px] font-extrabold text-slate-500 whitespace-nowrap shrink-0 pl-1">
            ختم سريع:
          </span>
          {availableStickers.map((st) => {
            const isSelected = tool === 'sticker' && selectedSticker?.id === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setSelectedSticker(st);
                  selectTool('sticker', 'textSticker');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer border transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="text-sm leading-none">{st.symbol}</span>
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>

        {/* Canvas Viewport */}
        <div
          ref={viewportRef}
          className={`relative bg-slate-200/70 overflow-hidden flex items-center justify-center p-2 sm:p-3 flex-1 ${
            expanded
              ? 'min-h-0'
              : compact
              ? 'min-h-[360px] max-h-[440px]'
              : 'min-h-[480px] sm:min-h-[560px] lg:min-h-[620px]'
          }`}
        >
          {bgLoading && (
            <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-slate-700">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <span className="text-xs font-bold">جاري تحميل صورة الواجب على السبورة...</span>
            </div>
          )}

          {bgLoadError && activeBaseImageUrl && (
            <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>تعذر تحميل الصورة داخل السبورة — يمكنك الكتابة مباشرة أو فتحها</span>
              <a
                href={activeBaseImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-extrabold"
              >
                فتح
              </a>
            </div>
          )}

          {(tool === 'sticker' || tool === 'text' || tool === 'hand') && (
            <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-lg bg-slate-900/85 text-white text-[11px] font-bold pointer-events-none flex items-center gap-1.5">
              {tool === 'sticker' && selectedSticker && (
                <>
                  <span>{selectedSticker.symbol}</span>
                  <span>انقر على السبورة لوضع «{selectedSticker.label}»</span>
                </>
              )}
              {tool === 'text' && (
                <span>انقر في أي مكان على السبورة لتثبيت النص</span>
              )}
              {tool === 'hand' && <span>اسحب بالماوس أو الإصبع لتحريك السبورة</span>}
            </div>
          )}

          <div
            className="relative shadow-md rounded-xl overflow-hidden border border-slate-300 transition-transform duration-100 origin-center bg-white"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              maxWidth: expanded ? '1260px' : compact ? '820px' : '1180px',
              width: '100%',
              aspectRatio: `${boardDims.width} / ${boardDims.height}`,
            }}
          >
            <canvas
              ref={displayCanvasRef}
              width={boardDims.width}
              height={boardDims.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              className={`w-full h-full block touch-none select-none ${
                tool === 'hand'
                  ? 'cursor-grab active:cursor-grabbing'
                  : tool === 'sticker' || tool === 'text'
                  ? 'cursor-copy'
                  : 'cursor-crosshair'
              }`}
            />
          </div>

          {/* Floating Bottom Zoom + Reset Bar */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 bg-slate-900/85 text-white px-2 py-1 rounded-xl shadow-md">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(1))))}
              className="p-1 hover:text-emerald-400 cursor-pointer"
              title="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono font-bold tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))))}
              className="p-1 hover:text-emerald-400 cursor-pointer"
              title="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {(zoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-1.5 py-0.5 text-[10px] font-bold bg-white/15 rounded hover:bg-white/25 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>إرجاع</span>
              </button>
            )}
          </div>
        </div>

        {/* Original Student Media Modal ("عرض الأصلي") */}
        {showOriginalModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 font-cairo">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-5 shadow-2xl border border-slate-200 space-y-4 text-right">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    الملف الأصلي المقدم من الطالب
                  </h3>
                  <p className="text-xs text-slate-500">
                    {studentName || 'الطالب'} {lessonTitle ? `· ${lessonTitle}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOriginalModal(false)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {studentImageUrl && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700">صورة الطالب الأصلية:</div>
                  <img
                    src={toSafeCanvasImageSrc(studentImageUrl)}
                    alt="صورة الطالب الأصلية"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 bg-slate-50"
                  />
                </div>
              )}

              {studentAudioUrl && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-indigo-600" />
                    <span>تسجيل الطالب الصوتي الأصلي:</span>
                  </div>
                  <audio controls src={studentAudioUrl} className="w-full h-9" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

MarkingBlackboard.displayName = 'MarkingBlackboard';
