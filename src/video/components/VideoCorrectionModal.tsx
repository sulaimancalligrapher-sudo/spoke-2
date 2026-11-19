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
} from 'lucide-react';
import { VideoCorrectionEntry, VideoLesson, VideoStudentProgress } from '../types';
import {
  fetchVideoCorrections,
  getPlayableVideoInfo,
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
  selectedLessonTitle?: string;
  t?: (id: string, fallback?: string) => string;
}

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
  selectedLessonTitle,
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
      const list = await fetchVideoCorrections(webhookUrl, studentId, studentName);
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
  }, [isOpen, studentId, studentName]);

  const filteredCorrections = useMemo(() => {
    if (!filterByLesson || !selectedLessonTitle) return corrections;
    const target = selectedLessonTitle.trim().toLowerCase();
    const matched = corrections.filter((c) => c.lessonTitle.trim().toLowerCase() === target);
    return matched.length > 0 ? matched : corrections;
  }, [corrections, filterByLesson, selectedLessonTitle]);

  const quizEntries = useMemo(() => {
    const entries: Array<{
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
      const ansList = Object.entries(prog.answeredQuestions || {}).map(([key, item]) => ({
        key,
        question: item.question,
        selectedAnswer: item.selectedAnswer,
        isCorrect: item.isCorrect,
        type: item.type,
      }));
      if (ansList.length > 0 || prog.videoScore > 0) {
        const matchedLesson = lessons.find((l) => l.id === prog.lessonId);
        entries.push({
          lessonTitle: prog.title || matchedLesson?.title || 'درس فيديو',
          videoScore: prog.videoScore || 0,
          answers: ansList,
        });
      }
    });

    return entries;
  }, [progressMap, filterByLesson, selectedLessonTitle, lessons]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs font-cairo animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
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
                {studentName ? `${studentName} (${studentId})` : 'سجل التصحيح والدرجات'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadCorrections}
              disabled={loading}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="تحديث التصحيح"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="إغلاق"
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
              <span className="truncate">التصحيح الصوتي</span>
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
              <span className="truncate">إجابات الفيديو</span>
            </button>
          </div>

          {selectedLessonTitle && (
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-slate-500 font-semibold truncate">
                {filterByLesson ? `عرض تصحيح: ${selectedLessonTitle}` : 'عرض تصحيح جميع الدروس'}
              </span>
              <button
                type="button"
                onClick={() => setFilterByLesson((p) => !p)}
                className="text-indigo-600 hover:text-indigo-800 font-bold shrink-0 cursor-pointer"
              >
                {filterByLesson ? 'عرض كل الدروس' : 'الدرس الحالي فقط'}
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {!studentId ? (
            <div className="text-center py-10 text-slate-500 text-sm font-bold">
              يرجى تسجيل دخول الطالب أولاً لعرض تصحيحات المعلم.
            </div>
          ) : loading && activeTab !== 'quiz' ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs font-bold">جاري تحميل ملاحظات المعلم من الشيت...</span>
            </div>
          ) : activeTab === 'image' ? (
            filteredCorrections.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
                لا توجد تصحيحات للصور مسجلة حالياً في ورقة «فيديو_التصحيح».
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCorrections.map((entry, idx) => {
                  const mainImg = resolveVideoQuestionImage(entry.correctedImage);
                  const extras = (entry.additionalImages || [])
                    .map((u) => resolveVideoQuestionImage(u))
                    .filter(Boolean);
                  return (
                    <div
                      key={`${entry.lessonTitle}-${idx}`}
                      className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-extrabold text-slate-900 text-sm">{entry.lessonTitle}</h4>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          {entry.imageStatus && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {entry.imageStatus}
                            </span>
                          )}
                          {entry.imageScore && (
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                              الدرجة: {entry.imageScore}
                            </span>
                          )}
                        </div>
                      </div>

                      {entry.imageNotes && (
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{entry.imageNotes}</span>
                        </div>
                      )}

                      {mainImg && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-bold text-slate-500">الصورة المصححة من المعلم:</div>
                          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                            <img
                              src={mainImg}
                              alt="الصورة المصححة"
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
                              onClick={() => setZoomedImg(img)}
                              className="h-28 w-full object-cover rounded-xl border border-slate-200 cursor-zoom-in"
                            />
                          ))}
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
                لا توجد ملاحظات صوتية أو فيديو تصحيح من المعلم حالياً.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCorrections.map((entry, idx) => (
                  <div
                    key={`${entry.lessonTitle}-aud-${idx}`}
                    className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-extrabold text-slate-900 text-sm">{entry.lessonTitle}</h4>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        {entry.audioStatus && (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {entry.audioStatus}
                          </span>
                        )}
                        {entry.audioScore && (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                            الدرجة: {entry.audioScore}
                          </span>
                        )}
                      </div>
                    </div>

                    {entry.audioNotes && (
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{entry.audioNotes}</span>
                      </div>
                    )}

                    {entry.teacherAudios.map((audUrl, aIdx) => (
                      <AudioPlayerItem
                        key={aIdx}
                        url={audUrl}
                        label={`تسجيل المعلم التوجيهي ${entry.teacherAudios.length > 1 ? aIdx + 1 : ''}`}
                      />
                    ))}

                    {entry.teacherVideos.map((vidUrl, vIdx) => {
                      const info = getPlayableVideoInfo(vidUrl);
                      return (
                        <div key={vIdx} className="space-y-1.5">
                          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-rose-600" />
                            <span>فيديو التصحيح {entry.teacherVideos.length > 1 ? vIdx + 1 : ''}</span>
                          </div>
                          {info.kind === 'youtube' && info.youtubeId ? (
                            <iframe
                              src={`https://www.youtube.com/embed/${info.youtubeId}`}
                              className="w-full aspect-video rounded-2xl border border-slate-200"
                              allowFullScreen
                              title={`teacher-video-${vIdx}`}
                            />
                          ) : info.embedUrl || info.src ? (
                            <a
                              href={vidUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold"
                            >
                              <Video className="w-4 h-4" />
                              <span>مشاهدة فيديو التصحيح</span>
                            </a>
                          ) : null}
                        </div>
                      );
                    })}

                    {entry.audioDate && (
                      <div className="text-[11px] text-slate-400 font-mono">{entry.audioDate}</div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : quizEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
              لم تقم بالإجابة على أي أسئلة زمنية بعد.
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
                      النتيجة: {item.videoScore}%
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
                            إجابتك: <span className="font-extrabold text-slate-900">{ans.selectedAnswer}</span>
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
