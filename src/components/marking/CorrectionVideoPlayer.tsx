import React from 'react';
import { ExternalLink, Trash2, Video } from 'lucide-react';
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
  if (!cleanUrl) return null;

  const ytId = extractYouTubeVideoId(cleanUrl);
  const driveId = !ytId ? extractDriveFileId(cleanUrl) : null;
  const playableMp4 = toCloudinaryMp4Url(cleanUrl);
  const openExternalUrl = getViewableVideoUrl(cleanUrl);
  const frameHeightClass = compact ? 'h-44 sm:h-48' : 'aspect-video max-h-80';

  return (
    <div className={`rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xs ${className}`}>
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px] font-bold">
        <div className="flex items-center gap-1.5 text-slate-800 min-w-0">
          <Video className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openExternalUrl && !cleanUrl.startsWith('blob:') && (
            <a
              href={openExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-700 hover:underline inline-flex items-center gap-1"
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

      <div className="bg-slate-950 w-full">
        {ytId ? (
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            title={label}
            className={`w-full ${frameHeightClass}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : driveId ? (
          <iframe
            src={`https://drive.google.com/file/d/${driveId}/preview`}
            title={label}
            className={`w-full ${frameHeightClass}`}
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        ) : (
          <video
            src={playableMp4}
            controls
            playsInline
            preload="metadata"
            className={`w-full ${compact ? 'max-h-48' : 'max-h-80'} bg-slate-950`}
          />
        )}
      </div>
    </div>
  );
};
