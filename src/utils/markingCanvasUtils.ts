import { WatermarkSettings } from '../types';
import { getDirectImageUrl } from './mediaUrl';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface WatermarkStudentInfo {
  studentId?: string;
  studentName?: string;
  lessonTitle?: string;
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  enabled: true,
  logoUrl: '',
  opacity: 0.85,
  sizeFactor: 0.14,
  logoPosition: 'bottom-right',
  textPrefix: 'التصحيح المعتمد -',
  fontSize: 18,
  textPosition: 'bottom-left',
  textBgOpacity: 0.78,
};

/**
 * Resolve any Drive or external image URL to the same-origin proxy
 * so HTML5 Canvas stays untainted during export/watermarking.
 */
export function toSafeCanvasImageSrc(rawUrl: string): string {
  const direct = getDirectImageUrl((rawUrl || '').trim());
  if (!direct) return '';
  if (direct.startsWith('data:') || direct.startsWith('blob:') || direct.startsWith('/')) {
    return direct;
  }
  const driveIdMatch =
    direct.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/) ||
    direct.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    return `/api/proxy-image?id=${encodeURIComponent(driveIdMatch[1])}`;
  }
  return `/api/proxy-image?url=${encodeURIComponent(direct)}`;
}

/**
 * Rotate a 2D point by angleDeg clockwise around (cx, cy).
 */
export function rotateCanvasPoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angleDeg: number
): CanvasPoint {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/**
 * Draw an angled calligraphy chisel nib segment between two points.
 */
export function drawChiselSegment(
  ctx: CanvasRenderingContext2D,
  p1: CanvasPoint,
  p2: CanvasPoint,
  width: number,
  color: string,
  nibAngleDeg = 45
) {
  const rad = (nibAngleDeg * Math.PI) / 180;
  const halfLen = width * 0.52;
  const dx = Math.cos(rad) * halfLen;
  const dy = -Math.sin(rad) * halfLen;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(p1.x - dx, p1.y - dy);
  ctx.lineTo(p1.x + dx, p1.y + dy);
  ctx.lineTo(p2.x + dx, p2.y + dy);
  ctx.lineTo(p2.x - dx, p2.y - dy);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(1, width * 0.12);
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * Simplify consecutive stroke points by minimum Euclidean distance.
 */
export function simplifyCanvasPoints(points: CanvasPoint[], tolerance = 1.2): CanvasPoint[] {
  if (points.length <= 2) return points;
  const res: CanvasPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = res[res.length - 1];
    const dist = Math.hypot(points[i].x - prev.x, points[i].y - prev.y);
    if (dist >= tolerance) {
      res.push(points[i]);
    }
  }
  res.push(points[points.length - 1]);
  return res;
}

/**
 * Load an image safely with optional crossOrigin and proxy resolution.
 */
export function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const clean = (src || '').trim();
    if (!clean) {
      resolve(null);
      return;
    }
    const safeSrc = toSafeCanvasImageSrc(clean);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = safeSrc;
  });
}

/**
 * Stamp teacher/academy watermark (text banner + optional logo) onto a 2D canvas context.
 */
export async function renderWatermarkOnContext(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  settings: Partial<WatermarkSettings> | undefined,
  studentInfo: WatermarkStudentInfo,
  fallbackLogoUrl?: string
): Promise<void> {
  const wm: WatermarkSettings = {
    ...DEFAULT_WATERMARK_SETTINGS,
    ...(settings || {}),
  };
  if (wm.enabled === false) return;

  const scaleFactor = Math.max(0.65, Math.min(2.2, canvasWidth / 1000));
  const padding = Math.round(16 * scaleFactor);

  // 1) Optional Logo Image
  const effectiveLogo = (wm.logoUrl || fallbackLogoUrl || '').trim();
  if (effectiveLogo) {
    const logoImg = await loadImageSafe(effectiveLogo);
    if (logoImg && logoImg.width > 0 && logoImg.height > 0) {
      const targetLogoW = Math.max(
        42,
        Math.round(canvasWidth * (wm.sizeFactor || 0.14))
      );
      const targetLogoH = Math.round(targetLogoW * (logoImg.height / logoImg.width));

      let lx = padding;
      let ly = padding;
      if (wm.logoPosition.includes('right')) {
        lx = canvasWidth - targetLogoW - padding;
      }
      if (wm.logoPosition.includes('bottom')) {
        ly = canvasHeight - targetLogoH - padding;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, wm.opacity ?? 0.85));
      ctx.drawImage(logoImg, lx, ly, targetLogoW, targetLogoH);
      ctx.restore();
    }
  }

  // 2) Student & Date Stamp Text Banner
  const nowStr = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const textParts = [
    wm.textPrefix?.trim() || '',
    studentInfo.studentId ? `#${studentInfo.studentId}` : '',
    studentInfo.studentName?.trim() || '',
    studentInfo.lessonTitle?.trim() || '',
    nowStr,
  ].filter(Boolean);

  if (textParts.length === 0) return;
  const fullText = textParts.join(' · ');

  const fontSize = Math.max(12, Math.round((wm.fontSize || 18) * scaleFactor));
  ctx.save();
  ctx.font = `700 ${fontSize}px Cairo, sans-serif`;
  const metrics = ctx.measureText(fullText);
  const padX = Math.round(14 * scaleFactor);
  const padY = Math.round(8 * scaleFactor);
  const boxW = Math.min(canvasWidth - padding * 2, metrics.width + padX * 2);
  const boxH = fontSize + padY * 2;

  let tx = padding;
  let ty = padding;
  if (wm.textPosition.includes('right')) {
    tx = canvasWidth - boxW - padding;
  }
  if (wm.textPosition.includes('bottom')) {
    ty = canvasHeight - boxH - padding;
  }

  ctx.fillStyle = `rgba(15, 23, 42, ${Math.max(0.15, Math.min(0.95, wm.textBgOpacity ?? 0.78))})`;
  ctx.beginPath();
  ctx.roundRect(tx, ty, boxW, boxH, Math.round(10 * scaleFactor));
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(fullText, tx + boxW / 2, ty + boxH / 2 + 1, boxW - padX);
  ctx.restore();
}

/**
 * Apply watermark & resize optimization to a single captured or uploaded image.
 */
export async function applyWatermarkToImageDataUrl(
  dataUrl: string,
  settings: Partial<WatermarkSettings> | undefined,
  studentInfo: WatermarkStudentInfo,
  fallbackLogoUrl?: string,
  maxWidth = 1600,
  quality = 0.88
): Promise<string> {
  const img = await loadImageSafe(dataUrl);
  if (!img) return dataUrl;

  let w = img.width || 1280;
  let h = img.height || 720;
  if (w > maxWidth) {
    const ratio = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  await renderWatermarkOnContext(ctx, w, h, settings, studentInfo, fallbackLogoUrl);

  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

/**
 * Export a canvas element with watermark applied cleanly as compressed JPEG.
 */
export async function exportCanvasWithWatermark(
  sourceCanvas: HTMLCanvasElement,
  settings: Partial<WatermarkSettings> | undefined,
  studentInfo: WatermarkStudentInfo,
  fallbackLogoUrl?: string,
  maxDim = 1400,
  quality = 0.86
): Promise<string> {
  let w = sourceCanvas.width;
  let h = sourceCanvas.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  await renderWatermarkOnContext(ctx, w, h, settings, studentInfo, fallbackLogoUrl);

  try {
    return tempCanvas.toDataURL('image/jpeg', quality);
  } catch {
    return '';
  }
}

/**
 * Combine multiple images vertically into a single high-clarity teaching image.
 * Matches marking3's combineImagesToSingleBase64 workflow.
 */
export async function combineImagesToSingleBase64(
  imageSources: string[],
  maxWidth = 1600,
  gap = 8
): Promise<string | null> {
  if (!imageSources || imageSources.length === 0) return null;
  if (imageSources.length === 1) return imageSources[0];

  const loaded = (await Promise.all(imageSources.map((src) => loadImageSafe(src)))).filter(
    (img): img is HTMLImageElement => Boolean(img && img.width > 0 && img.height > 0)
  );
  if (loaded.length === 0) return imageSources[0] || null;
  if (loaded.length === 1) return imageSources[0];

  const targetWidth = Math.min(
    maxWidth,
    Math.max(...loaded.map((img) => img.width))
  );

  const scaledDims = loaded.map((img) => {
    const scale = targetWidth / img.width;
    return {
      img,
      w: targetWidth,
      h: Math.round(img.height * scale),
    };
  });

  const totalHeight =
    scaledDims.reduce((sum, item) => sum + item.h, 0) + gap * (scaledDims.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageSources[0];

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, targetWidth, totalHeight);

  let y = 0;
  for (let i = 0; i < scaledDims.length; i++) {
    const item = scaledDims[i];
    ctx.drawImage(item.img, 0, y, item.w, item.h);
    y += item.h + gap;
  }

  try {
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return imageSources[0];
  }
}
