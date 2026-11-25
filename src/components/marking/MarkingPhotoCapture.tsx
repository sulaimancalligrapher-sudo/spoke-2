import React, { useRef, useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Layers,
  RotateCw,
  Trash2,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { WatermarkSettings } from '../../types';
import {
  WatermarkStudentInfo,
  applyWatermarkToImageDataUrl,
  renderWatermarkOnContext,
} from '../../utils/markingCanvasUtils';

interface MarkingPhotoCaptureProps {
  images: string[];
  onChangeImages: React.Dispatch<React.SetStateAction<string[]>>;
  watermarkSettings?: Partial<WatermarkSettings>;
  studentInfo?: WatermarkStudentInfo;
  fallbackLogoUrl?: string;
  stitchOnSave: boolean;
  onChangeStitchOnSave?: (val: boolean) => void;
  compact?: boolean;
  title?: string;
}

export const MarkingPhotoCapture: React.FC<MarkingPhotoCaptureProps> = ({
  images,
  onChangeImages,
  watermarkSettings,
  studentInfo,
  fallbackLogoUrl,
  stitchOnSave,
  onChangeStitchOnSave,
  compact = false,
  title = 'صور التدريس والتقاط الكاميرا',
}) => {
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  };

  const startLiveCamera = async (targetFacing: 'environment' | 'user' = facingMode) => {
    setCameraModalOpen(true);
    setCameraError(null);
    stopCameraStream();

    const constraintsList: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      { video: true, audio: false },
    ];

    let stream: MediaStream | null = null;
    for (const c of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch {
        // try next fallback constraint
      }
    }

    if (stream) {
      streamRef.current = stream;
      window.setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 40);
    } else {
      setCameraError(
        'تعذر فتح البث الحي للكاميرا. يمكنك استخدام زر «كاميرا الجهاز المباشرة» لفتح كاميرا الجوال.'
      );
    }
  };

  const handleFlipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    await startLiveCamera(next);
  };

  const handleCaptureFrame = async () => {
    const video = liveVideoRef.current;
    if (!video || !video.videoWidth) return;
    setProcessingPhoto(true);
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth || 1280;
      tempCanvas.height = video.videoHeight || 720;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        if (facingMode === 'user') {
          ctx.translate(tempCanvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        await renderWatermarkOnContext(
          ctx,
          tempCanvas.width,
          tempCanvas.height,
          watermarkSettings,
          studentInfo || {},
          fallbackLogoUrl
        );
        const jpegUrl = tempCanvas.toDataURL('image/jpeg', 0.88);
        onChangeImages((prev) => [...prev, jpegUrl]);
      }
    } finally {
      setProcessingPhoto(false);
    }
  };

  const processFilesList = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessingPhoto(true);
    try {
      const nextUrls: string[] = [];
      for (const file of Array.from(files)) {
        const rawDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.readAsDataURL(file);
        });
        if (!rawDataUrl) continue;
        const watermarked = await applyWatermarkToImageDataUrl(
          rawDataUrl,
          watermarkSettings,
          studentInfo || {},
          fallbackLogoUrl
        );
        nextUrls.push(watermarked);
      }
      if (nextUrls.length > 0) {
        onChangeImages((prev) => [...prev, ...nextUrls]);
      }
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleCloseModal = () => {
    stopCameraStream();
    setCameraModalOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Hidden Native Mobile Camera File Input */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          processFilesList(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 text-emerald-600" />
          <span>
            {title} ({images.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => startLiveCamera('environment')}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>تصوير بالكاميرا</span>
          </button>

          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600" />
            <span>كاميرا الجهاز</span>
          </button>

          <label className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
            <ImageIcon className="w-3.5 h-3.5 text-slate-700" />
            <span>رفع صور</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                processFilesList(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {processingPhoto && (
        <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>جاري معالجة الصورة وتطبيق العلامة المائية...</span>
        </div>
      )}

      {/* Vertical Stitch Toggle when >1 image */}
      {images.length > 1 && onChangeStitchOnSave && (
        <label className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs font-bold text-emerald-950 cursor-pointer">
          <input
            type="checkbox"
            checked={stitchOnSave}
            onChange={(e) => onChangeStitchOnSave(e.target.checked)}
            className="accent-emerald-600 w-4 h-4"
          />
          <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            دمج الصور المرفقة ({images.length}) عمودياً في صورة تعليمية واحدة عند الحفظ
          </span>
        </label>
      )}

      {/* Attached Images Preview Grid */}
      {images.length > 0 && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6'}`}>
          {images.map((src, idx) => (
            <div
              key={idx}
              className="relative aspect-video rounded-xl border border-slate-200 overflow-hidden bg-slate-100"
            >
              <img
                src={src}
                alt={`صورة ${idx + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <span className="absolute top-1 right-1 bg-slate-900/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => onChangeImages((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute top-1 left-1 p-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                title="حذف الصورة"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Live WebRTC Photo Capture Modal */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-cairo">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  التقاط صور بالكاميرا (صفحة واحدة أو عدة صفحات)
                </h3>
                <p className="text-xs text-slate-500">
                  تُختم كل لقطة تلقائياً بالعلامة المائية وتُضاف إلى شريط المعاينة بالأسفل
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cameraError ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold">
                {cameraError}
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video border border-slate-800">
                <video
                  ref={liveVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-contain ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  }`}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!cameraError && (
                <button
                  type="button"
                  disabled={processingPhoto}
                  onClick={handleCaptureFrame}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {images.length > 0
                      ? `التقاط صورة إضافية (#${images.length + 1})`
                      : 'التقاط الصورة المباشرة'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleFlipCamera}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>{facingMode === 'environment' ? 'الكاميرا الأمامية' : 'الكاميرا الخلفية'}</span>
              </button>

              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                <span>كاميرا الجهاز المباشرة</span>
              </button>

              <button
                type="button"
                onClick={handleCloseModal}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>اعتماد وإغلاق ({images.length})</span>
              </button>
            </div>

            {images.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((imgSrc, idx) => (
                    <div
                      key={idx}
                      className="relative shrink-0 w-28 aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                    >
                      <img
                        src={imgSrc}
                        alt={`لقطة ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1 right-1 bg-slate-900/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-1 left-1 p-1 rounded bg-rose-600 text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
