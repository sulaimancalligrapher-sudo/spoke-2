import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Trash2, Video } from 'lucide-react';
import { extractYouTubeVideoId } from '../../video/videoSheets';
import { extractDriveFileId } from '../../utils/mediaUrl';
import { toCloudinaryMp4Url } from '../../utils/markingSheets';

interface CorrectionVideoPlayerProps {
  url: string;
  label?: string;
  compact?: boolean;
  onRemove?: () => void;
  className?: string;
}

export function getViewableVideoUrl(rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  const driveId = extractDriveFileId(clean);
  if (driveId) {
    return `https://drive.google.com/file/d/${driveId}/view`;
  }
  return toCloudinaryMp4Url(clean);
}

export const CorrectionVideoPlayer: React.FC<CorrectionVideoPlayerProps> = ({
  url,
  label = 'فيديو التصحيح',
  compact = false,
  onRemove,
  className = '',
}) => {
  const cleanUrl = (url || '').trim();
  const [useProxyStream, setUseProxyStream] = useState(true);

  useEffect(() => {
    setUseProxyStream(true);
  }, [cleanUrl]);

  if (!cleanUrl) return null;

  const ytId = extractYouTubeVideoId(cleanUrl);
  const driveId = !ytId ? extractDriveFileId(cleanUrl) : null;
  const playableMp4 = toCloudinaryMp4Url(cleanUrl);
  const openExternalUrl = getViewableVideoUrl(cleanUrl);
  const frameContainerClass = compact
    ? 'w-full aspect-video max-h-52 sm:max-h-56 bg-slate-950 flex items-center justify-center overflow-hidden'
    : 'w-full aspect-video max-h-[55dvh] sm:max-h-80 lg:max-h-96 bg-slate-950 flex items-center justify-center overflow-hidden';

  return (
    <div className={`rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xs w-full ${className}`}>
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
        <div className="flex items-center gap-1.5 text-slate-800 min-w-0 flex-1">
          <Video className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">{label}</span>
          {driveId && (
            <span className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 text-[10px] font-bold shrink-0">
              Drive
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {driveId && (
            <button
              type="button"
              onClick={() => setUseProxyStream((v) => !v)}
              className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="التبديل بين المشغل المباشر ومشغل Drive"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{useProxyStream ? 'مشغل Drive' : 'بث مباشر'}</span>
            </button>
          )}
          {openExternalUrl && !cleanUrl.startsWith('blob:') && (
            <a
              href={openExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-700 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
              title="فتح الفيديو"
            >
              <span>فتح</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
              title="إزالة الفيديو"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className={frameContainerClass}>
        {ytId ? (
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            title={label}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : driveId ? (
          useProxyStream ? (
            <video
              key={`proxy-${driveId}`}
              src={`/api/proxy-video?id=${encodeURIComponent(driveId)}`}
              controls
              playsInline
              preload="metadata"
              onError={() => setUseProxyStream(false)}
              className="w-full h-full object-contain bg-slate-950"
            />
          ) : (
            <iframe
              key={`iframe-${driveId}`}
              src={`https://drive.google.com/file/d/${driveId}/preview`}
              title={label}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          )
        ) : (
          <video
            src={playableMp4}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain bg-slate-950"
          />
        )}
      </div>
    </div>
  );
};

