import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Award,
  CheckCircle2,
  RotateCcw,
  Clock,
  Volume2,
  Video,
  Image as ImageIcon,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { TeacherCorrectionRecord } from '../../types';
import { getAlternativeAudioUrls, getDirectImageUrl } from '../../utils/mediaUrl';
import { toCloudinaryMp4Url } from '../../utils/markingSheets';

interface StudentCorrectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  corrections: TeacherCorrectionRecord[];
  onRefresh: () => Promise<void> | void;
}

const EXERCISE_LABELS: Record<TeacherCorrectionRecord['exerciseType'], string> = {
  writing: 'تمرين الكتابة',
  pronunciation: 'تمرين النطق',
  video: 'فيديو تفاعلي',
  dictation: 'تمرين الإملاء',
};

export const StudentCorrectionsModal: React.FC<StudentCorrectionsModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  corrections,
  onRefresh,
}) => {
  const [refreshing, setRefreshing] = useState(false);

  if (!isOpen) return null;

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-cairo">
      <div className="bg-slate-50 rounded-3xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-right">
        {/* Header */}
        <header className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                تصحيحات وملاحظات المعلم
              </h2>
              <div className="text-xs text-slate-500 font-semibold">
                {studentName} {studentId ? `· #${studentId}` : ''} · {corrections.length} تصحيح
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {corrections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-extrabold text-slate-800">
                لا توجد تصحيحات محفوظة من المعلم بعد
              </div>
              <p className="text-xs text-slate-500">
                عند قيام المعلم بتصحيح واجباتك وإرسال الملاحظات أو الفيديو، ستظهر جميعها هنا مع إشعار تيليغرام.
              </p>
            </div>
          ) : (
            corrections.map((c) => {
              const audioCandidates = c.teacherAudioUrl
                ? getAlternativeAudioUrls(c.teacherAudioUrl)
                : [];
              const audioSrc = audioCandidates[0] || c.teacherAudioUrl || '';

              return (
                <article
                  key={c.id || c.submissionKey}
                  className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">
                        {c.lessonSubject} — {c.itemTitle}
                      </div>
                      <div className="text-[11px] text-slate-500 font-semibold flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{EXERCISE_LABELS[c.exerciseType] || c.exerciseType}</span>
                        {c.teacherName && (
                          <>
                            <span>·</span>
                            <span>المعلم: {c.teacherName}</span>
                          </>
                        )}
                        {c.updatedAt && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{c.updatedAt}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-extrabold">
                      {c.score !== undefined && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-900 font-mono tabular-nums">
                          {c.score}%
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 ${
                          c.status === 'corrected'
                            ? 'text-emerald-700'
                            : c.status === 'retry'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {c.status === 'corrected' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : c.status === 'retry' ? (
                          <RotateCcw className="w-4 h-4" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                        <span>
                          {c.ratingLabel ||
                            (c.status === 'corrected'
                              ? 'مصحّح'
                              : c.status === 'retry'
                              ? 'مطلوب إعادة المحاولة'
                              : 'قيد المراجعة')}
                        </span>
                      </span>
                    </div>
                  </div>

                  {c.notes && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-800 whitespace-pre-line">
                      {c.notes}
                    </div>
                  )}

                  {/* Annotated Correction Image */}
                  {c.correctedImageUrl && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>صورة تصحيح المعلم:</span>
                        </span>
                        <a
                          href={c.correctedImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 underline inline-flex items-center gap-1"
                        >
                          <span>فتح بحجم كامل</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <img
                        src={getDirectImageUrl(c.correctedImageUrl)}
                        alt="تصحيح المعلم"
                        className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                  )}

                  {/* Teacher Voice Note */}
                  {audioSrc && (
                    <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-1">
                      <div className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>ملاحظة المعلم الصوتية:</span>
                      </div>
                      <audio controls src={audioSrc} className="w-full h-9" />
                    </div>
                  )}

                  {/* Cloudinary MP4 Correction Video */}
                  {c.teacherVideoUrl && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1">
                          <Video className="w-3.5 h-3.5 text-indigo-600" />
                          <span>فيديو الشرح والتصحيح:</span>
                        </span>
                        <a
                          href={toCloudinaryMp4Url(c.teacherVideoUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-700 underline inline-flex items-center gap-1"
                        >
                          <span>فتح الفيديو</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <video
                        src={toCloudinaryMp4Url(c.teacherVideoUrl)}
                        controls
                        playsInline
                        className="w-full max-h-72 rounded-xl bg-slate-950"
                      />
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
