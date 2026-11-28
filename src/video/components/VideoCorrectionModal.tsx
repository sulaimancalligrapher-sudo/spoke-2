import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Image as ImageIcon,
  Volume2,
  CheckCircle2,
  XCircle,
  Loader2,
  Award,
  ZoomIn,
  ClipboardList,
  Video,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { TeacherCorrectionRecord } from '../../types';
import { dedupeMediaUrls } from '../../utils/mediaUrl';
import { CorrectionVideoPlayer } from '../../components/marking/CorrectionVideoPlayer';
import {
  VideoCorrectionEntry,
  VideoLesson,
  VideoStudentProgress,
  fetchVideoCorrections,
  resolveVideoAudioAlternatives,
  resolveVideoQuestionImage,
} from '../videoSheets';

interface VideoCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  webhookUrl: string;
  studentId: string;
  studentName: string;
  lessons: VideoLesson[];
  progressMap: Record<string, VideoStudentProgress>;
  studentCorrections?: TeacherCorrectionRecord[];
  selectedLessonTitle?: string;
  onRefreshProgress?: () => Promise<void>;
  t?: (id: string, fallback?: string) => string;
}

type MergedCorrectionView = VideoCorrectionEntry & {
  imageRatingLabel?: string;
  audioRatingLabel?: string;
  imageStickerSymbol?: string;
  imageStickerLabel?: string;
  audioStickerSymbol?: string;
  audioStickerLabel?: string;
};

const AudioPlayerItem: React.FC<{ url: string; label: string }> = ({ url, label }) => {
  const candidates = useMemo(() => resolveVideoAudioAlternatives(url), [url]);
  const [candIdx, setCandIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  const currentSrc = candidates[candIdx] || url;

  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
        <span>{label}</span>
      </div>
      {!failed ? (
        <audio
          controls
          src={currentSrc}
          className="w-full h-9"
          onError={() => {
            if (candIdx + 1 < candidates.length) {
              setCandIdx((prev) => prev + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 underline font-bold"
        >
          فتح ملف الصوت في نافذة جديدة
        </a>
      )}
    </div>
  );
};

export const VideoCorrectionModal: React.FC<VideoCorrectionModalProps> = ({
  isOpen,
  onClose,
  webhookUrl,
  studentId,
  studentName,
  lessons,
  progressMap,
  studentCorrections = [],
  selectedLessonTitle,
  onRefreshProgress,
  t,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);

  const [activeTab, setActiveTab] = useState<'image' | 'audio' | 'quiz'>('image');
  const [loading, setLoading] = useState(false);
  const [corrections, setCorrections] = useState<VideoCorrectionEntry[]>([]);
  const [filterByLesson, setFilterByLesson] = useState<boolean>(Boolean(selectedLessonTitle));
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadCorrections = async () => {
    if (!studentId && !studentName) return;
    setLoading(true);
    try {
      const [list] = await Promise.all([
        fetchVideoCorrections(webhookUrl, studentId, studentName),
        onRefreshProgress ? onRefreshProgress().catch(() => {}) : Promise.resolve(),
      ]);
      if (isMountedRef.current) {
        setCorrections(list);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFilterByLesson(Boolean(selectedLessonTitle));
      loadCorrections();
    }
  }, [isOpen, studentId, studentName, selectedLessonTitle]);

  const mergedCorrections = useMemo<MergedCorrectionView[]>(() => {
    const map = new Map<string, MergedCorrectionView>();

    const uniq = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.map((s) => (s || '').trim()).filter(Boolean)));

    corrections.forEach((entry) => {
      const key = entry.lessonTitle.trim().toLowerCase();
      map.set(key, { ...entry });
    });

    studentCorrections
      .filter((tc) => tc.exerciseType === 'video' || Boolean(tc.itemTitle))
      .forEach((tc) => {
        const key = (tc.itemTitle || '').trim().toLowerCase();
        if (!key) return;
        const prev = map.get(key);
        const statusAr = (st?: string) =>
          st === 'corrected' ? 'مصحّح ✓' : st === 'retry' ? 'مطلوب إعادة' : '';

        const nextImgStatus =
          statusAr(tc.imageStatus) || prev?.imageStatus || statusAr(tc.status);
        const nextImgScore =
          tc.imageScore !== undefined
            ? String(tc.imageScore)
            : prev?.imageScore || (tc.score !== undefined ? String(tc.score) : '');
        const nextAudioStatus =
          statusAr(tc.audioStatus) || prev?.audioStatus || statusAr(tc.status);
        const nextAudioScore =
          tc.audioScore !== undefined
            ? String(tc.audioScore)
            : prev?.audioScore || (tc.score !== undefined ? String(tc.score) : '');

        map.set(key, {
          studentId: tc.studentId || prev?.studentId || studentId,
          studentName: tc.studentName || prev?.studentName || studentName,
          lessonTitle: tc.itemTitle || prev?.lessonTitle || '',
          imageStatus: nextImgStatus,
          imageScore: nextImgScore,
          imageNotes: tc.imageNotes || prev?.imageNotes || tc.notes || '',
          correctedImage: tc.correctedImageUrl || prev?.correctedImage || '',
          additionalImages: uniq([
            ...(prev?.additionalImages || []),
            ...(tc.additionalImages || []),
          ]),
          imageDate: tc.updatedAt || prev?.imageDate || '',
          audioStatus: nextAudioStatus,
          audioScore: nextAudioScore,
          audioNotes: tc.audioNotes || prev?.audioNotes || tc.notes || '',
          teacherAudios: uniq([
            ...(prev?.teacherAudios || []),
            tc.teacherAudioUrl,
            ...(tc.teacherAudios || []),
          ]),
          teacherVideos: dedupeMediaUrls([
            ...(prev?.teacherVideos || []),
            tc.teacherVideoUrl,
            ...(tc.teacherVideos || []),
          ]),
          audioDate: tc.updatedAt || prev?.audioDate || '',
          imageLinks: uniq([...(prev?.imageLinks || []), ...(tc.imageLinks || [])]),
          audioLinks: uniq([...(prev?.audioLinks || []), ...(tc.audioLinks || [])]),
          imageRatingLabel: tc.imageRatingLabel || tc.ratingLabel,
          audioRatingLabel: tc.audioRatingLabel || tc.ratingLabel,
          imageStickerSymbol: tc.imageStickerSymbol || tc.stickerSymbol,
          imageStickerLabel: tc.imageStickerLabel || tc.stickerLabel,
          audioStickerSymbol: tc.audioStickerSymbol || tc.stickerSymbol,
          audioStickerLabel: tc.audioStickerLabel || tc.stickerLabel,
        });
      });

    return Array.from(map.values());
  }, [corrections, studentCorrections, studentId, studentName]);

  const filteredCorrections = useMemo(() => {
    if (!filterByLesson || !selectedLessonTitle) return mergedCorrections;
    const target = selectedLessonTitle.trim().toLowerCase();
    const matched = mergedCorrections.filter((c) => c.lessonTitle.trim().toLowerCase() === target);
    return matched.length > 0 ? matched : mergedCorrections;
  }, [mergedCorrections, filterByLesson, selectedLessonTitle]);

  const quizEntries = useMemo(() => {
    const entries: Array<{
      lessonId: string;
      lessonTitle: string;
      videoScore: number;
      answers: Array<{
        key: string;
        question: string;
        selectedAnswer: string;
        isCorrect: boolean | null;
        type: 'video' | 'audio';
      }>;
    }> = [];

    Object.values(progressMap).forEach((prog) => {
      if (filterByLesson && selectedLessonTitle && prog.title.trim() !== selectedLessonTitle.trim()) {
        return;
      }
      const matchedLesson = lessons.find((l) => l.id === prog.lessonId || l.title.trim() === prog.title.trim());
      const ansList = Object.entries(prog.answeredQuestions || {}).map(([key, item]) => {
        const parts = key.split('_');
        const qIdx = Number(parts[1] || 0);
        const qPrefix = item.type === 'audio' ? 'aq' : 'vq';
        const qObj = matchedLesson
          ? (item.type === 'audio' ? matchedLesson.audioQuestions : matchedLesson.questions)?.[qIdx]
          : undefined;
        const translatedQ = matchedLesson
          ? tr(`video_${qPrefix}_q_${matchedLesson.id}_${qIdx}`, item.question)
          : item.question;
        let translatedAns = item.selectedAnswer;
        if (matchedLesson && qObj) {
          const clean = (item.selectedAnswer || '').trim();
          const optIdx = (qObj.options || []).findIndex((o) => o.trim() === clean);
          if (optIdx >= 0) {
            translatedAns = tr(`video_${qPrefix}_opt_${matchedLesson.id}_${qIdx}_${optIdx}`, item.selectedAnswer);
          } else if (qObj.correctAnswer && qObj.correctAnswer.trim() === clean) {
            translatedAns = tr(`video_${qPrefix}_ans_${matchedLesson.id}_${qIdx}`, item.selectedAnswer);
          }
        }
        return {
          key,
          question: translatedQ,
          selectedAnswer: translatedAns,
          isCorrect: item.isCorrect,
          type: item.type,
        };
      });
      if (ansList.length > 0 || prog.videoScore > 0) {
        entries.push({
          lessonId: matchedLesson?.id || prog.lessonId,
          lessonTitle: matchedLesson
            ? tr(`video_title_${matchedLesson.id}`, matchedLesson.title)
            : prog.title || tr('video_lessons_btn', 'درس فيديو'),
          videoScore: prog.videoScore || 0,
          answers: ansList,
        });
      }
    });

    return entries;
  }, [progressMap, filterByLesson, selectedLessonTitle, lessons, t]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[110] overflow-y-auto flex items-start sm:items-center justify-center p-2.5 sm:p-4 bg-slate-950/65 backdrop-blur-xs font-cairo animate-in fade-in duration-150"
    >
      <div className="my-auto bg-white rounded-3xl max-w-2xl md:max-w-3xl lg:max-w-4xl w-full max-h-[calc(100dvh-16px)] sm:max-h-[90dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0c3868] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                {tr('video_teacher_corrections_btn', 'تصحيح المعلم والمتابعة')}
              </h3>
              <p className="text-xs text-blue-100 truncate">
                {studentName ? `${studentName} (${studentId})` : tr('video_teacher_corrections_btn', 'سجل التصحيح والدرجات')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadCorrections}
              disabled={loading}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title={tr('video_refresh_btn', 'تحديث التصحيح')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title={tr('video_close', 'إغلاق')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Segmented Tabs + Lesson Filter */}
        <div className="px-4 sm:px-5 pt-3 pb-2 bg-slate-50 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'image'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tr('video_tab_image_hw', 'واجب الصورة')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'audio'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tr('video_corr_audio_tab', 'التصحيح الصوتي')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('quiz')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'quiz'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tr('video_corr_quiz_tab', 'إجابات الفيديو')}</span>
            </button>
          </div>

          {selectedLessonTitle && (
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-500 font-semibold truncate">
                {filterByLesson
                  ? selectedLessonTitle
                  : tr('video_corr_all_lessons', 'عرض تصحيح جميع الدروس')}
              </span>
              <button
                type="button"
                onClick={() => setFilterByLesson((p) => !p)}
                className="text-indigo-600 hover:text-indigo-800 font-bold shrink-0 cursor-pointer"
              >
                {filterByLesson
                  ? tr('video_corr_show_all', 'عرض كل الدروس')
                  : tr('video_corr_current_only', 'الدرس الحالي فقط')}
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          {!studentId ? (
            <div className="text-center py-10 text-slate-500 text-sm font-bold">
              {tr('video_corr_login_prompt', 'يرجى تسجيل دخول الطالب أولاً لعرض تصحيحات المعلم.')}
            </div>
          ) : loading && activeTab !== 'quiz' ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs font-bold">{tr('video_uploading', 'جاري تحميل ملاحظات المعلم من الشيت...')}</span>
            </div>
          ) : activeTab === 'image' ? (
            filteredCorrections.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
                {tr('video_corr_no_images', 'لا توجد تصحيحات للصور مسجلة حالياً.')}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCorrections.map((entry, idx) => {
                  const mainImg = resolveVideoQuestionImage(entry.correctedImage);
                  const extras = (entry.additionalImages || [])
                    .map((u) => resolveVideoQuestionImage(u))
                    .filter(Boolean);
                  const matchedLesson = lessons.find((l) => l.title.trim() === entry.lessonTitle.trim());
                  return (
                    <div
                      key={`${entry.lessonTitle}-${idx}`}
                      className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {matchedLesson ? tr(`video_title_${matchedLesson.id}`, entry.lessonTitle) : entry.lessonTitle}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                          {entry.imageStatus && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {entry.imageStatus}
                            </span>
                          )}
                          {entry.imageScore && (
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                              {tr('video_score_label', 'الدرجة:')} {entry.imageScore}
                            </span>
                          )}
                          {entry.imageRatingLabel && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                              {entry.imageRatingLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {entry.imageStickerSymbol && (
                        <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center gap-2.5">
                          <span className="text-2xl leading-none">{entry.imageStickerSymbol}</span>
                          {entry.imageStickerLabel && (
                            <span className="text-xs font-extrabold text-amber-950">
                              {entry.imageStickerLabel}
                            </span>
                          )}
                        </div>
                      )}

                      {entry.imageNotes && (
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span className="leading-relaxed whitespace-pre-line">{entry.imageNotes}</span>
                        </div>
                      )}

                      {mainImg && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-bold text-slate-500">
                            {tr('video_corr_teacher_img', 'الصورة المصححة من المعلم:')}
                          </div>
                          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                            <img
                              src={mainImg}
                              alt="الصورة المصححة"
                              referrerPolicy="no-referrer"
                              onClick={() => setZoomedImg(mainImg)}
                              className="w-full max-h-64 object-contain cursor-zoom-in mx-auto"
                            />
                            <button
                              type="button"
                              onClick={() => setZoomedImg(mainImg)}
                              className="absolute bottom-2 left-2 p-2 rounded-xl bg-slate-900/75 text-white cursor-pointer"
                            >
                              <ZoomIn className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {extras.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {extras.map((img, i) => (
                            <img
                              key={i}
                              src={img}
                              alt={`صورة إضافية ${i + 1}`}
                              referrerPolicy="no-referrer"
                              onClick={() => setZoomedImg(img)}
                              className="h-28 w-full object-cover rounded-xl border border-slate-200 cursor-zoom-in"
                            />
                          ))}
                        </div>
                      )}

                      {entry.imageLinks && entry.imageLinks.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                            <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>روابط وملفات التصحيح المرفقة:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {entry.imageLinks
                              .filter((lnk) => /^https?:\/\//i.test(lnk))
                              .map((lnk, lIdx) => (
                                <a
                                  key={`${lnk}-${lIdx}`}
                                  href={lnk}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                  <span>مرفق / رابط #{lIdx + 1}</span>
                                </a>
                              ))}
                          </div>
                        </div>
                      )}

                      {entry.teacherVideos.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div
                            className={
                              entry.teacherVideos.length > 1
                                ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
                                : 'max-w-2xl'
                            }
                          >
                            {entry.teacherVideos.map((vidUrl, vIdx) => (
                              <CorrectionVideoPlayer
                                key={`img-vid-${vIdx}`}
                                url={vidUrl}
                                label={`فيديو التوضيح ${entry.teacherVideos.length > 1 ? vIdx + 1 : ''}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.imageDate && (
                        <div className="text-[11px] text-slate-400 font-mono">{entry.imageDate}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'audio' ? (
            filteredCorrections.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
                {tr('video_corr_no_audio', 'لا توجد ملاحظات أو تسجيلات صوتية من المعلم حالياً.')}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCorrections.map((entry, idx) => {
                  const matchedLesson = lessons.find((l) => l.title.trim() === entry.lessonTitle.trim());
                  return (
                    <div
                      key={`${entry.lessonTitle}-aud-${idx}`}
                      className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-extrabold text-slate-900 text-sm">
                          {matchedLesson ? tr(`video_title_${matchedLesson.id}`, entry.lessonTitle) : entry.lessonTitle}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                          {entry.audioStatus && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {entry.audioStatus}
                            </span>
                          )}
                          {entry.audioScore && (
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 tabular-nums">
                              {tr('video_score_label', 'الدرجة:')} {entry.audioScore}
                            </span>
                          )}
                          {entry.audioRatingLabel && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                              {entry.audioRatingLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {entry.audioStickerSymbol && (
                        <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center gap-2.5">
                          <span className="text-2xl leading-none">{entry.audioStickerSymbol}</span>
                          {entry.audioStickerLabel && (
                            <span className="text-xs font-extrabold text-amber-950">
                              {entry.audioStickerLabel}
                            </span>
                          )}
                        </div>
                      )}

                      {entry.audioNotes && (
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span className="leading-relaxed whitespace-pre-line">{entry.audioNotes}</span>
                        </div>
                      )}

                      {entry.teacherAudios.map((audUrl, aIdx) => (
                        <AudioPlayerItem
                          key={aIdx}
                          url={audUrl}
                          label={`${tr('video_teacher_explain_audio', 'تسجيل المعلم التوجيهي')} ${entry.teacherAudios.length > 1 ? aIdx + 1 : ''}`}
                        />
                      ))}

                      {entry.audioLinks && entry.audioLinks.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                            <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>روابط صوتية أو ملفات إضافية:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {entry.audioLinks
                              .filter((lnk) => /^https?:\/\//i.test(lnk))
                              .map((lnk, lIdx) => (
                                <a
                                  key={`${lnk}-${lIdx}`}
                                  href={lnk}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1.5"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                  <span>رابط صوتي / ملف #{lIdx + 1}</span>
                                </a>
                              ))}
                          </div>
                        </div>
                      )}

                      {entry.audioDate && (
                        <div className="text-[11px] text-slate-400 font-mono">{entry.audioDate}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : quizEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
              {tr('video_corr_no_quiz', 'لم تقم بالإجابة على أي أسئلة زمنية بعد.')}
            </div>
          ) : (
            <div className="space-y-4">
              {quizEntries.map((item, idx) => (
                <div
                  key={`${item.lessonTitle}-${idx}`}
                  className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-extrabold text-slate-900 text-sm">{item.lessonTitle}</h4>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-extrabold">
                      {tr('video_score_label', 'النتيجة:')} {item.videoScore}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {item.answers.map((ans) => (
                      <div
                        key={ans.key}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="font-bold text-slate-800">{ans.question}</div>
                          <div className="text-slate-600">
                            {tr('video_q_your_answer', 'إجابتك:')}{' '}
                            <span className="font-extrabold text-slate-900">{ans.selectedAnswer}</span>
                          </div>
                        </div>
                        {ans.isCorrect === true ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : ans.isCorrect === false ? (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {zoomedImg && (
        <div
          onClick={() => setZoomedImg(null)}
          className="fixed inset-0 z-[120] bg-slate-950/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomedImg}
            alt="صورة مكبرة"
            className="max-w-full max-h-[90dvh] rounded-2xl object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setZoomedImg(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
