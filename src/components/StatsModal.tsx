import React, { useEffect, useRef, useState } from 'react';
import {
  CatchHistoryItem,
  CatchLessonSubject,
  DictationHistoryItem,
  DictationLessonSubject,
  MatchingHistoryItem,
  MatchingLessonSubject,
  PdfFontFamily,
  PdfReleaseControlMode,
  PdfReportSectionsConfig,
  PdfReportSettings,
  PdfTextAlign,
  PracticeHistoryItem,
  StudentRegistrant,
  TeacherCorrectionRecord,
  WordItem,
} from '../types';
import {
  X,
  Award,
  Play,
  Pause,
  User,
  Loader2,
  Link2,
  CheckCircle2,
  Clock,
  Sparkles,
  Target,
  FileText,
  Save,
  RefreshCw,
  RotateCcw,
  Shield,
  Sliders,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Image as ImageIcon,
  Calendar,
} from 'lucide-react';
import {
  SupportedLang,
  TranslationItem,
  translateEvaluationFeedback,
  getTranslatedMatchingSubject,
  getTranslatedDictationSubject,
  getTranslatedCatchSubject,
  translateMatchingCompletionStatus,
  translateMatchingFormulaString,
} from '../utils/translations';
import {
  extractPercentageFromMatchingText,
  fetchIDRegistrants,
  fetchStudentCatchHistory,
  fetchStudentDictationHistory,
  fetchStudentMatchingHistory,
  fetchStudentSubmissionsFromSheet,
  fetchStudentWritingHistory,
} from '../utils/googleSheets';
import { getAlternativeAudioUrls, getDirectImageUrl } from '../utils/mediaUrl';
import {
  CourseScheduleData,
  DEFAULT_PDF_REPORT_SETTINGS,
  buildCertificateHtml,
  buildFullReportHtml,
  buildStudentFullReportSummary,
  createEmptyCourseSchedule,
  fetchAttendanceRecordsFromSheets,
  fetchPdfSettingsFromSheets,
  normalizeCourseScheduleData,
  normalizePdfReportSettings,
  savePdfSettingsToSheets,
} from '../utils/courseSchedule';
import { DrawingTemplate } from '../arWriting/types/drawing';
import { VideoLesson, VideoStudentProgress, fetchStudentVideoProgress } from '../video/videoSheets';
import { PdfPreviewModal } from './CourseScheduleModal';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: PracticeHistoryItem[];
  matchingHistory?: MatchingHistoryItem[];
  dictationHistory?: DictationHistoryItem[];
  catchHistory?: CatchHistoryItem[];
  videoLessons?: VideoLesson[];
  videoProgressMap?: Record<string, VideoStudentProgress>;
  studentCorrections?: TeacherCorrectionRecord[];
  onOpenVideoCorrection?: (lessonTitle?: string) => void;
  onClearHistory?: () => void;
  currentStudent?: StudentRegistrant | null;
  isSyncingFromSheets?: boolean;
  isSyncingMatching?: boolean;
  isSyncingDictation?: boolean;
  isSyncingCatch?: boolean;
  defaultTab?: 'pronunciation' | 'matching' | 'dictation' | 'catch' | 'video';
  currentLang?: SupportedLang;
  translations?: TranslationItem[];
  t?: (id: string, fallback?: string) => string;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  history,
  matchingHistory = [],
  dictationHistory = [],
  catchHistory = [],
  videoLessons = [],
  videoProgressMap = {},
  studentCorrections = [],
  onOpenVideoCorrection,
  currentStudent,
  isSyncingFromSheets = false,
  isSyncingMatching = false,
  isSyncingDictation = false,
  isSyncingCatch = false,
  defaultTab = 'pronunciation',
  currentLang = 'ar',
  translations,
  t,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);
  const [activeTab, setActiveTab] = useState<'pronunciation' | 'matching' | 'dictation' | 'catch' | 'video'>(defaultTab);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  // Pronunciation stats
  const totalPractices = history.length;
  const avgScore =
    totalPractices > 0
      ? Math.round(history.reduce((acc, curr) => acc + curr.score, 0) / totalPractices)
      : 0;
  const masteredCount = history.filter((h) => h.score >= 85).length;

  // Matching stats: resolve each exercise percentage robustly from formulaString / raw percentage
  const totalMatchingSubjects = matchingHistory.length;
  const allMatchingExercises = matchingHistory.flatMap((m) =>
    (m.exercises || []).map((ex) => ({
      ...ex,
      resolvedPercentage: extractPercentageFromMatchingText(ex.formulaString, ex.percentage),
    }))
  );
  const totalMatchingExercises = allMatchingExercises.length;
  const avgMatchingScore =
    totalMatchingExercises > 0
      ? Math.round(
          allMatchingExercises.reduce((acc, ex) => acc + ex.resolvedPercentage, 0) /
            totalMatchingExercises
        )
      : totalMatchingSubjects > 0
      ? Math.round(
          matchingHistory.reduce(
            (acc, m) => acc + extractPercentageFromMatchingText(m.completionStatus || '', 0),
            0
          ) / totalMatchingSubjects
        )
      : 0;

  // Dictation stats (answers 3)
  const totalDictationSubjects = dictationHistory.length;
  const allDictationExercises = dictationHistory.flatMap((d) =>
    (d.exercises || []).map((ex) => ({
      ...ex,
      resolvedPercentage: extractPercentageFromMatchingText(ex.formulaString, ex.percentage),
    }))
  );
  const totalDictationExercises = allDictationExercises.length;
  const avgDictationScore =
    totalDictationExercises > 0
      ? Math.round(
          allDictationExercises.reduce((acc, ex) => acc + ex.resolvedPercentage, 0) /
            totalDictationExercises
        )
      : totalDictationSubjects > 0
      ? Math.round(
          dictationHistory.reduce(
            (acc, d) => acc + extractPercentageFromMatchingText(d.completionStatus || '', 0),
            0
          ) / totalDictationSubjects
        )
      : 0;

  // AR Catch stats (اجابات صيد)
  const totalCatchSubjects = catchHistory.length;
  const allCatchExercises = catchHistory.flatMap((c) =>
    (c.exercises || []).map((ex) => ({
      ...ex,
      resolvedPercentage: extractPercentageFromMatchingText(ex.formulaString, ex.percentage),
    }))
  );
  const totalCatchExercises = allCatchExercises.length;
  const avgCatchScore =
    totalCatchExercises > 0
      ? Math.round(
          allCatchExercises.reduce((acc, ex) => acc + ex.resolvedPercentage, 0) /
            totalCatchExercises
        )
      : totalCatchSubjects > 0
      ? Math.round(
          catchHistory.reduce(
            (acc, c) => acc + extractPercentageFromMatchingText(c.completionStatus || '', 0),
            0
          ) / totalCatchSubjects
        )
      : 0;

  const handlePlayVoice = (url: string) => {
    if (activeAudioUrl === url && isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const candidateUrls = getAlternativeAudioUrls(url);
    if (candidateUrls.length === 0) candidateUrls.push(url);

    setActiveAudioUrl(url);
    setIsPlaying(true);

    let candidateIndex = 0;
    const tryPlayNext = () => {
      if (candidateIndex >= candidateUrls.length) {
        setIsPlaying(false);
        return;
      }
      const targetSrc = candidateUrls[candidateIndex];
      candidateIndex++;
      const audio = new Audio(targetSrc);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        tryPlayNext();
      };
      audio.play().catch(() => {
        tryPlayNext();
      });
    };

    tryPlayNext();
  };

  // Interactive Video & Corrections stats
  const videoCorrectionRows = (() => {
    const map = new Map<
      string,
      {
        title: string;
        quizScore?: number;
        completed: boolean;
        correction?: TeacherCorrectionRecord;
      }
    >();

    videoLessons.forEach((l) => {
      const prog = videoProgressMap[l.id];
      const corr = studentCorrections.find(
        (c) => (c.itemTitle || '').trim().toLowerCase() === l.title.trim().toLowerCase()
      );
      if (prog || corr) {
        map.set(l.title.trim().toLowerCase(), {
          title: l.title,
          quizScore: prog?.videoScore,
          completed: Boolean(prog?.completed),
          correction: corr,
        });
      }
    });

    Object.values(videoProgressMap).forEach((prog) => {
      const key = (prog.title || '').trim().toLowerCase();
      if (!key || map.has(key)) return;
      const corr = studentCorrections.find(
        (c) => (c.itemTitle || '').trim().toLowerCase() === key
      );
      map.set(key, {
        title: prog.title,
        quizScore: prog.videoScore,
        completed: Boolean(prog.completed),
        correction: corr,
      });
    });

    studentCorrections.forEach((corr) => {
      const key = (corr.itemTitle || '').trim().toLowerCase();
      if (!key || map.has(key)) return;
      map.set(key, {
        title: corr.itemTitle,
        completed: true,
        correction: corr,
      });
    });

    return Array.from(map.values());
  })();

  const totalVideoDone = videoCorrectionRows.length;
  const totalVideoGraded = videoCorrectionRows.filter((r) => Boolean(r.correction)).length;
  const avgVideoQuiz =
    videoCorrectionRows.filter((r) => typeof r.quizScore === 'number').length > 0
      ? Math.round(
          videoCorrectionRows
            .filter((r) => typeof r.quizScore === 'number')
            .reduce((acc, r) => acc + (r.quizScore || 0), 0) /
            videoCorrectionRows.filter((r) => typeof r.quizScore === 'number').length
        )
      : 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="my-auto bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-100 max-h-[calc(100dvh-16px)] sm:max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Header & Close Button */}
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {tr('stats_modal_title', 'سجل التقييمات والإنجاز')}
              </h3>
              {currentStudent ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-bold mt-0.5">
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span>{currentStudent.name}</span>
                  </span>
                  <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md text-slate-700 font-mono">
                    ID: {currentStudent.id}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-normal">
                    {activeTab === 'video'
                      ? '(موثق في ورقة تصحيح_الواجبات)'
                      : activeTab === 'catch'
                      ? tr('stats_catch_verified_sheet', '(موثق في ورقة اجابات صيد)')
                      : activeTab === 'dictation'
                      ? tr('stats_dictation_verified_sheet', '(موثق في ورقة answers 3)')
                      : activeTab === 'matching'
                      ? tr('stats_matching_verified_sheet', '(موثق في ورقة answers 2)')
                      : tr('stats_verified_in_sheet', '(موثق في ورقة answers 1)')}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {tr('nav_platform_subtitle', 'متابعة إتقان مخارج الحروف والكلمات')}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Five Tabs: [ 🎙️ سجل النطق ] | [ 🔗 سجل التوصيل ] | [ 📝 سجل الإملاء ] | [ 🎯 سجل الصيد ] | [ 🎬 الفيديو والتصحيح ] */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-slate-100 rounded-2xl mb-4 border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('pronunciation')}
            className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
              activeTab === 'pronunciation'
                ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎙️</span>
            <span className="truncate">{tr('stats_tab_pronunciation', 'سجل النطق')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('matching')}
            className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
              activeTab === 'matching'
                ? 'bg-white text-purple-800 shadow-xs border border-purple-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🔗</span>
            <span className="truncate">{tr('stats_tab_matching', 'سجل التوصيل')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dictation')}
            className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
              activeTab === 'dictation'
                ? 'bg-white text-teal-800 shadow-xs border border-teal-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📝</span>
            <span className="truncate">{tr('stats_tab_dictation', 'سجل الإملاء')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catch')}
            className={`flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
              activeTab === 'catch'
                ? 'bg-white text-sky-800 shadow-xs border border-sky-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎯</span>
            <span className="truncate">{tr('stats_tab_catch', 'سجل الصيد')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`col-span-2 sm:col-span-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
              activeTab === 'video'
                ? 'bg-white text-indigo-800 shadow-xs border border-indigo-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎬</span>
            <span className="truncate">الفيديو والتصحيح</span>
          </button>
        </div>

        {activeTab === 'pronunciation' ? (
          <>
            {/* Live Sync Banner if syncing pronunciation */}
            {isSyncingFromSheets && (
              <div className="mb-4 py-2 px-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-amber-900 animate-pulse">
                <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
                <span>{tr('stats_syncing_answers1', 'جاري مزامنة الإنجازات مباشرة من ورقة answers 1...')}</span>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">
                  {tr('stats_total_practices', 'إجمالي التدريبات')}
                </span>
                <span className="text-2xl font-bold font-cairo text-slate-800">
                  {totalPractices}
                </span>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-emerald-700 font-medium block mb-1">
                  {tr('stats_accuracy_rate', 'معدل الدقة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-emerald-800">
                  {avgScore}%
                </span>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-indigo-700 font-medium block mb-1">
                  {tr('stats_mastered_words', 'كلمات متقنة (ممتاز)')}
                </span>
                <span className="text-2xl font-bold font-cairo text-indigo-800">
                  {masteredCount}
                </span>
              </div>
            </div>

            {/* History list */}
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                {tr('stats_recent_attempts', 'آخر المحاولات الصوتية:')}
              </h4>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
              {history.length === 0 ? (
                isSyncingFromSheets ? (
                  <div className="text-center py-12 text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                    <span>{tr('stats_syncing_answers1', 'جاري مزامنة الإنجازات مباشرة من ورقة answers 1...')}</span>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    {tr('stats_empty_note', 'لم تقم بأي تسجيل صوتي بعد. ابدأ بنطق الكلمات لترى تقييماتك هنا!')}
                  </div>
                )
              ) : (
                history.map((item) => {
                  const translatedGrade = translateEvaluationFeedback(item.grade, currentLang, translations);
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            item.score >= 85
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.score >= 70
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.score}%
                        </div>
                        <div className="min-w-0">
                          <div className="font-amiri text-base font-bold text-slate-900 leading-tight">
                            {item.word}
                          </div>
                          {translatedGrade && (
                            <div className="text-[11px] font-semibold text-emerald-700 mt-0.5 leading-snug truncate" title={translatedGrade}>
                              {translatedGrade}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400">
                            {tr('stats_detected_label', 'سُمع:')} {item.spokenText || tr('practice_recording_active', 'تسجيل صوتي')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.timestamp).toLocaleTimeString('ar-SA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {item.recordedAudioUrl && (
                          <button
                            onClick={() => handlePlayVoice(item.recordedAudioUrl!)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              activeAudioUrl === item.recordedAudioUrl && isPlaying
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white hover:bg-emerald-50 text-emerald-700 border-slate-200'
                            }`}
                            title="استمع لصوتك"
                          >
                            {activeAudioUrl === item.recordedAudioUrl && isPlaying ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : activeTab === 'matching' ? (
          <>
            {/* Live Sync Banner if syncing matching */}
            {isSyncingMatching && (
              <div className="mb-4 py-2 px-3 bg-purple-50/90 border border-purple-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-purple-900 animate-pulse">
                <Loader2 className="w-4 h-4 text-purple-600 animate-spin shrink-0" />
                <span>{tr('stats_matching_syncing', 'جاري مزامنة درجات تمرين التوصيل...')}</span>
              </div>
            )}

            {/* Matching KPI Cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">
                  {tr('stats_matching_subjects', 'المواضيع المسجلة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-slate-800">
                  {totalMatchingSubjects}
                </span>
              </div>

              <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-purple-700 font-medium block mb-1">
                  {tr('stats_matching_completed', 'التمارين المنجزة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-purple-800">
                  {totalMatchingExercises}
                </span>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-emerald-700 font-medium block mb-1">
                  {tr('stats_matching_avg', 'معدل الإتقان')}
                </span>
                <span className="text-2xl font-bold font-cairo text-emerald-800">
                  {avgMatchingScore}%
                </span>
              </div>
            </div>

            {/* Matching History List */}
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                {tr('stats_matching_history_title', 'نتائج تمارين وصل الكلمات حسب الموضوع:')}
              </h4>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
              {matchingHistory.length === 0 ? (
                isSyncingMatching ? (
                  <div className="text-center py-12 text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                    <span>{tr('matching_syncing_answers2', 'جاري جلب درجات تمرين التوصيل...')}</span>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    {tr('stats_matching_empty', 'لم تكمل أي تمرين وصل كلمات بعد. أتمم تمريناً في «تمرين الوصل» لتظهر نتيجتك هنا!')}
                  </div>
                )
              ) : (
                matchingHistory.map((subjItem) => {
                  const isDoneAll = subjItem.completionStatus?.includes('مكتمل');
                  return (
                    <div
                      key={subjItem.id || subjItem.lessonSubject}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5 text-xs"
                    >
                      {/* Subject Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                            <Link2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-slate-900 text-sm truncate">
                              {getTranslatedMatchingSubject(subjItem.lessonSubject, currentLang, translations)}
                            </h5>
                            {subjItem.timestamp && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                <span>{subjItem.timestamp}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {subjItem.completionStatus && (
                          <span
                            className={`px-2 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 shrink-0 border ${
                              isDoneAll
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-purple-50 text-purple-800 border-purple-200'
                            }`}
                          >
                            {isDoneAll && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            <span>
                              {translateMatchingCompletionStatus(
                                subjItem.completionStatus,
                                currentLang,
                                translations
                              )}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Exercises List */}
                      {subjItem.exercises && subjItem.exercises.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                          {subjItem.exercises.map((ex) => {
                            const resolvedPct = extractPercentageFromMatchingText(
                              ex.formulaString,
                              ex.percentage
                            );
                            const translatedFormula = translateMatchingFormulaString(
                              ex.formulaString,
                              currentLang,
                              translations
                            );
                            return (
                              <div
                                key={`${subjItem.lessonSubject}-ex-${ex.exerciseNumber}`}
                                className="flex items-center justify-between gap-2 px-2.5 py-2 bg-white rounded-xl border border-slate-200/70"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] shrink-0">
                                    {tr('matching_modal_exercise_word', 'تمرين')} {ex.exerciseNumber}
                                  </span>
                                  <span
                                    className="text-[11px] text-slate-700 font-semibold truncate"
                                    dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
                                    title={translatedFormula}
                                  >
                                    {translatedFormula}
                                  </span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-lg font-extrabold text-[11px] shrink-0 ${
                                    resolvedPct >= 85
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : resolvedPct >= 70
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {resolvedPct}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : activeTab === 'dictation' ? (
          <>
            {/* Live Sync Banner if syncing dictation (answers 3) */}
            {isSyncingDictation && (
              <div className="mb-4 py-2 px-3 bg-teal-50/90 border border-teal-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-teal-900 animate-pulse">
                <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" />
                <span>{tr('stats_dictation_syncing', 'جاري مزامنة درجات تمرين الإملاء...')}</span>
              </div>
            )}

            {/* Dictation KPI Cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">
                  {tr('stats_matching_subjects', 'المواضيع المسجلة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-slate-800">
                  {totalDictationSubjects}
                </span>
              </div>

              <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-teal-700 font-medium block mb-1">
                  {tr('stats_matching_completed', 'التمارين المنجزة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-teal-800">
                  {totalDictationExercises}
                </span>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-emerald-700 font-medium block mb-1">
                  {tr('stats_matching_avg', 'معدل الإتقان')}
                </span>
                <span className="text-2xl font-bold font-cairo text-emerald-800">
                  {avgDictationScore}%
                </span>
              </div>
            </div>

            {/* Dictation History List */}
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                {tr('stats_dictation_history_title', 'نتائج تمارين الإملاء وترتيب الكلمات حسب الموضوع:')}
              </h4>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
              {dictationHistory.length === 0 ? (
                isSyncingDictation ? (
                  <div className="text-center py-12 text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                    <span>{tr('stats_dictation_syncing', 'جاري مزامنة درجات تمرين الإملاء...')}</span>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    {tr('stats_dictation_empty', 'لم تكمل أي تمرين إملاء بعد. أتمم تمريناً في «تمرين الإملاء» لتظهر نتيجتك هنا!')}
                  </div>
                )
              ) : (
                dictationHistory.map((subjItem) => {
                  const isDoneAll = subjItem.completionStatus?.includes('مكتمل');
                  return (
                    <div
                      key={subjItem.id || subjItem.lessonSubject}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-slate-900 text-sm truncate">
                              {getTranslatedDictationSubject(subjItem.lessonSubject, currentLang, translations)}
                            </h5>
                            {subjItem.timestamp && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                <span>{subjItem.timestamp}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {subjItem.completionStatus && (
                          <span
                            className={`px-2 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 shrink-0 border ${
                              isDoneAll
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-teal-50 text-teal-800 border-teal-200'
                            }`}
                          >
                            {isDoneAll && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            <span>
                              {translateMatchingCompletionStatus(
                                subjItem.completionStatus,
                                currentLang,
                                translations
                              )}
                            </span>
                          </span>
                        )}
                      </div>

                      {subjItem.exercises && subjItem.exercises.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                          {subjItem.exercises.map((ex) => {
                            const resolvedPct = extractPercentageFromMatchingText(
                              ex.formulaString,
                              ex.percentage
                            );
                            const translatedFormula = translateMatchingFormulaString(
                              ex.formulaString,
                              currentLang,
                              translations
                            );
                            return (
                              <div
                                key={`${subjItem.lessonSubject}-dict-ex-${ex.exerciseNumber}`}
                                className="flex items-center justify-between gap-2 px-2.5 py-2 bg-white rounded-xl border border-slate-200/70"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] shrink-0">
                                    {tr('matching_modal_exercise_word', 'تمرين')} {ex.exerciseNumber}
                                  </span>
                                  <span
                                    className="text-[11px] text-slate-700 font-semibold truncate"
                                    dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
                                    title={translatedFormula}
                                  >
                                    {translatedFormula}
                                  </span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-lg font-extrabold text-[11px] shrink-0 ${
                                    resolvedPct >= 85
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : resolvedPct >= 70
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {resolvedPct}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : activeTab === 'catch' ? (
          <>
            {/* Live Sync Banner if syncing AR Catch (اجابات صيد) */}
            {isSyncingCatch && (
              <div className="mb-4 py-2 px-3 bg-sky-50/90 border border-sky-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-sky-900 animate-pulse">
                <Loader2 className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
                <span>{tr('stats_catch_syncing', 'جاري مزامنة درجات تحدي الصيد...')}</span>
              </div>
            )}

            {/* Catch KPI Cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">
                  {tr('stats_matching_subjects', 'المواضيع المسجلة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-slate-800">
                  {totalCatchSubjects}
                </span>
              </div>

              <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-sky-700 font-medium block mb-1">
                  {tr('stats_matching_completed', 'التمارين المنجزة')}
                </span>
                <span className="text-2xl font-bold font-cairo text-sky-800">
                  {totalCatchExercises}
                </span>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-emerald-700 font-medium block mb-1">
                  {tr('stats_matching_avg', 'معدل الإتقان')}
                </span>
                <span className="text-2xl font-bold font-cairo text-emerald-800">
                  {avgCatchScore}%
                </span>
              </div>
            </div>

            {/* Catch History List */}
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                {tr('stats_catch_history_title', 'نتائج تمارين تحدي اصطياد الحروف حسب الموضوع:')}
              </h4>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
              {catchHistory.length === 0 ? (
                isSyncingCatch ? (
                  <div className="text-center py-12 text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
                    <span>{tr('stats_catch_syncing', 'جاري مزامنة درجات تحدي الصيد...')}</span>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    {tr('stats_catch_empty', 'لم تكمل أي تحدي في «تحدي الصيد (AR)» بعد. أتمم تحدياً لتظهر نتيجتك هنا!')}
                  </div>
                )
              ) : (
                catchHistory.map((subjItem) => {
                  const isDoneAll = subjItem.completionStatus?.includes('مكتمل');
                  return (
                    <div
                      key={subjItem.id || subjItem.lessonSubject}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-slate-900 text-sm truncate">
                              {getTranslatedCatchSubject(subjItem.lessonSubject, currentLang, translations)}
                            </h5>
                            {subjItem.timestamp && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                <span>{subjItem.timestamp}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {subjItem.completionStatus && (
                          <span
                            className={`px-2 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 shrink-0 border ${
                              isDoneAll
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-sky-50 text-sky-800 border-sky-200'
                            }`}
                          >
                            {isDoneAll && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            <span>
                              {translateMatchingCompletionStatus(
                                subjItem.completionStatus,
                                currentLang,
                                translations
                              )}
                            </span>
                          </span>
                        )}
                      </div>

                      {subjItem.exercises && subjItem.exercises.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                          {subjItem.exercises.map((ex) => {
                            const resolvedPct = extractPercentageFromMatchingText(
                              ex.formulaString,
                              ex.percentage
                            );
                            const translatedFormula = translateMatchingFormulaString(
                              ex.formulaString,
                              currentLang,
                              translations
                            );
                            return (
                              <div
                                key={`${subjItem.lessonSubject}-catch-ex-${ex.exerciseNumber}`}
                                className="flex items-center justify-between gap-2 px-2.5 py-2 bg-white rounded-xl border border-slate-200/70"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] shrink-0">
                                    {tr('matching_modal_exercise_word', 'تمرين')} {ex.exerciseNumber}
                                  </span>
                                  <span
                                    className="text-[11px] text-slate-700 font-semibold truncate"
                                    dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
                                    title={translatedFormula}
                                  >
                                    {translatedFormula}
                                  </span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-lg font-extrabold text-[11px] shrink-0 ${
                                    resolvedPct >= 85
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : resolvedPct >= 70
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {resolvedPct}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* TAB 5: INTERACTIVE VIDEO & TEACHER CORRECTIONS SUMMARY */
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">
                  الدروس المنجزة
                </span>
                <span className="text-2xl font-bold font-cairo text-slate-800 tabular-nums">
                  {totalVideoDone}
                </span>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-indigo-700 font-medium block mb-1">
                  تم تصحيحها
                </span>
                <span className="text-2xl font-bold font-cairo text-indigo-800 tabular-nums">
                  {totalVideoGraded}
                </span>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
                <span className="text-[11px] text-emerald-700 font-medium block mb-1">
                  معدل أسئلة الفيديو
                </span>
                <span className="text-2xl font-bold font-cairo text-emerald-800 tabular-nums">
                  {avgVideoQuiz}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                تفاصيل درجات الفيديو وتصحيح المعلم (الصورة والصوت):
              </h4>
              {onOpenVideoCorrection && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVideoCorrection();
                  }}
                  className="text-xs font-extrabold text-indigo-700 hover:underline cursor-pointer"
                >
                  فتح سجل التصحيحات الكامل
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
              {videoCorrectionRows.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  لا توجد دروس فيديو تفاعلي مكتملة أو مصحّحة حتى الآن.
                </div>
              ) : (
                videoCorrectionRows.map((row) => {
                  const c = row.correction;
                  const imgSt = c?.imageStatus || (c?.correctedImageUrl ? c?.status : undefined);
                  const imgScore = c?.imageScore ?? (c?.correctedImageUrl ? c?.score : undefined);
                  const audSt = c?.audioStatus || (c?.teacherAudioUrl ? c?.status : undefined);
                  const audScore = c?.audioScore ?? (c?.teacherAudioUrl ? c?.score : undefined);

                  return (
                    <div
                      key={row.title}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h5 className="font-extrabold text-slate-900 text-sm">{row.title}</h5>
                        {onOpenVideoCorrection && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenVideoCorrection(row.title);
                            }}
                            className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            عرض التصحيح والملفات
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <div className="text-[10px] text-slate-400 font-bold">أسئلة الفيديو</div>
                          <div className="font-mono font-extrabold text-slate-900 tabular-nums mt-0.5">
                            {row.quizScore !== undefined ? `${row.quizScore}%` : row.completed ? 'مكتمل' : '—'}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <div className="text-[10px] text-emerald-700 font-bold">تصحيح الصورة</div>
                          <div className="font-extrabold text-slate-900 tabular-nums mt-0.5">
                            {imgScore !== undefined ? `${imgScore}/100` : '—'}{' '}
                            {imgSt && (
                              <span className="text-[10px] text-emerald-700">
                                ({imgSt === 'corrected' ? 'مصحّح' : imgSt === 'retry' ? 'إعادة' : 'انتظار'})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <div className="text-[10px] text-indigo-700 font-bold">تصحيح الصوت</div>
                          <div className="font-extrabold text-slate-900 tabular-nums mt-0.5">
                            {audScore !== undefined ? `${audScore}/100` : '—'}{' '}
                            {audSt && (
                              <span className="text-[10px] text-indigo-700">
                                ({audSt === 'corrected' ? 'مصحّح' : audSt === 'retry' ? 'إعادة' : 'انتظار'})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(c?.imageNotes || c?.audioNotes || c?.notes) && (
                        <div className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/80 line-clamp-2">
                          {c?.imageNotes || c?.audioNotes || c?.notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// لوحة تحكم تقارير نهاية البرنامج والشهادات التفاعلية (PDF) في لوحة الإدارة
// =========================================================================

export interface PdfSettingsAdminPanelProps {
  settings?: PdfReportSettings;
  onUpdateSettings: (next: PdfReportSettings) => void;
  webhookUrl: string;
  courseSchedule?: CourseScheduleData;
  curriculum?: WordItem[];
  matchingSubjects?: MatchingLessonSubject[];
  dictationSubjects?: DictationLessonSubject[];
  writingTemplates?: DrawingTemplate[];
  catchSubjects?: CatchLessonSubject[];
  videoLessons?: VideoLesson[];
  homeLogoUrl?: string;
  platformTitle?: string;
}

type PdfAdminSubTab = 'access' | 'report' | 'certificate';

const RELEASE_MODE_OPTIONS: { value: PdfReleaseControlMode; label: string }[] = [
  { value: 'always_on', label: 'مفتوح دائماً للطلاب' },
  { value: 'always_off', label: 'مغلق حالياً عن الطلاب' },
  { value: 'after_date', label: 'يُفتح بدءاً من تاريخ محدد' },
  { value: 'on_completion', label: 'يُفتح عند إتمام 100% من خطة البرنامج' },
];

const PDF_SECTION_LABELS: { key: keyof PdfReportSectionsConfig; label: string }[] = [
  { key: 'overallSummary', label: 'الملخص العام والنجوم (من 10)' },
  { key: 'encouragement', label: 'رسالة التشجيع والتقدير' },
  { key: 'attendance', label: 'سجل حضور الحصص اليومية' },
  { key: 'scheduleProgress', label: 'التقدم حسب أيام الجدول الدراسي' },
  { key: 'pronunciation', label: 'نتائج تدريب النطق (answers 1)' },
  { key: 'matching', label: 'نتائج تمارين الوصل (answers 2)' },
  { key: 'dictation', label: 'نتائج تمرين الإملاء (answers 3)' },
  { key: 'writing', label: 'نتائج الخط والكتابة (answers 4)' },
  { key: 'catchAr', label: 'نتائج تحدي الصيد AR (اجابات صيد)' },
  { key: 'video', label: 'نتائج الفيديو التفاعلي والواجبات' },
];

const CERT_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{{اسم_الطالب}}', label: 'اسم الطالب' },
  { token: '{{رقم_الطالب}}', label: 'رقم المشترك' },
  { token: '{{اسم_البرنامج}}', label: 'اسم البرنامج' },
  { token: '{{النسبة_العامة}}', label: 'النسبة العامة' },
  { token: '{{التقدير}}', label: 'التقدير' },
  { token: '{{تاريخ_الاصدار}}', label: 'تاريخ الإصدار' },
  { token: '{{ايام_الحضور}}', label: 'أيام الحضور' },
  { token: '{{عدد_الدروس_المكتملة}}', label: 'الدروس المكتملة' },
];

export const PdfSettingsAdminPanel: React.FC<PdfSettingsAdminPanelProps> = ({
  settings,
  onUpdateSettings,
  webhookUrl,
  courseSchedule,
  curriculum = [],
  matchingSubjects = [],
  dictationSubjects = [],
  writingTemplates = [],
  catchSubjects = [],
  videoLessons = [],
  homeLogoUrl,
  platformTitle,
}) => {
  const [draft, setDraft] = useState<PdfReportSettings>(() =>
    normalizePdfReportSettings(settings || DEFAULT_PDF_REPORT_SETTINGS)
  );
  const [subTab, setSubTab] = useState<PdfAdminSubTab>('access');
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'warn' | 'error';
    text: string;
  } | null>(null);

  const [registrants, setRegistrants] = useState<StudentRegistrant[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('__sample__');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    html: string;
    orientation: 'portrait' | 'landscape';
  } | null>(null);

  const [overrideStudentIdInput, setOverrideStudentIdInput] = useState('');
  const [overrideStudentAction, setOverrideStudentAction] = useState<'allow' | 'deny'>('allow');

  useEffect(() => {
    if (settings) {
      setDraft(normalizePdfReportSettings(settings));
    }
  }, [settings]);

  useEffect(() => {
    if (!webhookUrl) return;
    fetchIDRegistrants(webhookUrl)
      .then((list) => {
        if (Array.isArray(list)) setRegistrants(list);
      })
      .catch(() => {});
  }, [webhookUrl]);

  const normalizedSchedule = normalizeCourseScheduleData(
    courseSchedule || createEmptyCourseSchedule()
  );
  const programs = normalizedSchedule.programs || [];

  const updateDraft = (updater: (prev: PdfReportSettings) => PdfReportSettings) => {
    setDraft((prev) => {
      const next = updater(prev);
      onUpdateSettings(next);
      return next;
    });
  };

  const handleSaveToSheets = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const normalized = normalizePdfReportSettings(draft);
      onUpdateSettings(normalized);
      const res = await savePdfSettingsToSheets(webhookUrl, normalized);
      setStatusMsg({
        type: res.cloudSaved ? 'success' : res.needsScriptUpdate ? 'warn' : 'error',
        text: res.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePullFromSheets = async () => {
    if (!webhookUrl) return;
    setIsPulling(true);
    setStatusMsg(null);
    try {
      const res = await fetchPdfSettingsFromSheets(webhookUrl);
      if (!res.scriptSupported) {
        setStatusMsg({
          type: 'warn',
          text: 'كود Google Apps Script المنشور قديم ولا يدعم إعدادات_PDF بعد. انسخ الكود المحدث وانشر إصداراً جديداً.',
        });
      } else if (res.settings) {
        setDraft(res.settings);
        onUpdateSettings(res.settings);
        setStatusMsg({
          type: 'success',
          text: 'تم جلب إعدادات تقارير PDF والشهادات من Google Sheets بنجاح!',
        });
      } else {
        setStatusMsg({
          type: 'warn',
          text: 'لا توجد إعدادات محفوظة في ورقة إعدادات_PDF بعد — اضغط حفظ لرفع الإعدادات الحالية.',
        });
      }
    } finally {
      setIsPulling(false);
    }
  };

  const handleResetDefaults = () => {
    const def = normalizePdfReportSettings(DEFAULT_PDF_REPORT_SETTINGS);
    setDraft(def);
    onUpdateSettings(def);
    setStatusMsg({
      type: 'warn',
      text: 'تمت استعادة الإعدادات الافتراضية محلياً. اضغط «حفظ ومزامنة» لتثبيتها في الشيت.',
    });
  };

  const handleOpenPreview = async (kind: 'report' | 'certificate') => {
    setIsPreviewLoading(true);
    try {
      let studentObj: { id: string; name: string; programId?: string } = {
        id: '1001',
        name: 'أحمد بن سالم النموذجي',
        programId: programs[0]?.id,
      };
      let stuPron: PracticeHistoryItem[] = [
        {
          id: 'p1',
          wordId: 'w1',
          word: 'مَدْرَسَةٌ',
          score: 94,
          grade: 'ممتاز',
          timestamp: Date.now(),
          spokenText: 'مَدْرَسَةٌ',
        },
        {
          id: 'p2',
          wordId: 'w2',
          word: 'قَلَمٌ',
          score: 88,
          grade: 'جيد جداً',
          timestamp: Date.now(),
          spokenText: 'قَلَمٌ',
        },
      ];
      let stuMatch: MatchingHistoryItem[] = [
        {
          id: 'm1',
          timestamp: '2026/01/10',
          studentId: '1001',
          studentName: studentObj.name,
          lessonSubject: matchingSubjects[0]?.subjectName || 'الدرس الأول',
          completionStatus: 'مكتمل (92%)',
          exercises: [{ exerciseNumber: 1, formulaString: '(5 - 5 صحيح - 0 خطأ = 100%)', percentage: 100 }],
        },
      ];
      let stuDict: DictationHistoryItem[] = [];
      let stuWrite: any[] = [];
      let stuCatch: CatchHistoryItem[] = [];
      let stuVideo: Record<string, any> = {};
      let stuAtt: any[] = [
        {
          date: new Date().toISOString().slice(0, 10),
          time: '09:00',
          studentId: '1001',
          studentName: studentObj.name,
          sessionTitle: 'الحصة التأسيسية الأولى',
        },
      ];

      if (selectedStudentId !== '__sample__') {
        const reg = registrants.find((r) => r.id === selectedStudentId);
        if (reg) {
          studentObj = { id: reg.id, name: reg.name, programId: reg.programId };
          if (webhookUrl) {
            const [sh, mh, dh, wh, ch, vp, att] = await Promise.all([
              fetchStudentSubmissionsFromSheet(webhookUrl, reg.id, reg.name).catch(() => []),
              fetchStudentMatchingHistory(webhookUrl, reg.id, reg.name).catch(() => []),
              fetchStudentDictationHistory(webhookUrl, reg.id, reg.name).catch(() => []),
              fetchStudentWritingHistory(webhookUrl, reg.id, reg.name).catch(() => []),
              fetchStudentCatchHistory(webhookUrl, reg.id, reg.name).catch(() => []),
              fetchStudentVideoProgress(webhookUrl, reg.id, reg.name).catch(() => ({})),
              fetchAttendanceRecordsFromSheets(webhookUrl, { studentId: reg.id }).catch(() => ({
                records: [],
              })),
            ]);
            stuPron = sh || [];
            stuMatch = mh || [];
            stuDict = dh || [];
            stuWrite = wh || [];
            stuCatch = ch || [];
            stuVideo = vp || {};
            stuAtt = att?.records || [];
          } else {
            stuPron = [];
            stuMatch = [];
            stuAtt = [];
          }
        }
      }

      const summary = buildStudentFullReportSummary({
        student: studentObj,
        schedule: normalizedSchedule,
        attendanceRecords: stuAtt,
        curriculum,
        studentHistory: stuPron,
        matchingSubjects,
        matchingHistory: stuMatch,
        dictationSubjects,
        dictationHistory: stuDict,
        writingTemplates,
        writingHistory: stuWrite,
        catchSubjects,
        catchHistory: stuCatch,
        videoLessons,
        videoProgressMap: stuVideo,
      });

      if (kind === 'report') {
        setPreviewDoc({
          title: `معاينة التقرير الشامل - ${summary.studentName}`,
          orientation: 'portrait',
          html: buildFullReportHtml({
            summary,
            pdfSettings: draft,
            platformTitle,
            homeLogoUrl,
          }),
        });
      } else {
        setPreviewDoc({
          title: `معاينة الشهادة - ${summary.studentName}`,
          orientation: draft.certificate.orientation,
          html: buildCertificateHtml({
            summary,
            pdfSettings: draft,
            platformTitle,
            homeLogoUrl,
          }),
        });
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const appendCertToken = (token: string) => {
    updateDraft((prev) => ({
      ...prev,
      certificate: {
        ...prev.certificate,
        bodyText: prev.certificate.bodyText
          ? `${prev.certificate.bodyText} ${token}`
          : token,
      },
    }));
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Toolbar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                نظام تقارير نهاية البرنامج والشهادات التفاعلية (PDF)
              </h2>
              <p className="text-xs text-slate-500">
                تحكم كامل من المتصفح في تصميم التقرير الشامل والشهادات وصلاحيات الفتح والطباعة بجودة A4 عالية
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveToSheets}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ ومزامنة للشيت'}</span>
            </button>
            <button
              type="button"
              onClick={handlePullFromSheets}
              disabled={isPulling || !webhookUrl}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
              <span>جلب من الشيت</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>افتراضي</span>
            </button>
          </div>
        </div>

        {/* Live Student Picker + Instant PDF Preview */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-extrabold text-slate-700 shrink-0">
              معاينة وتصدير لطالب:
            </span>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 min-w-[200px] flex-1 sm:flex-initial"
            >
              <option value="__sample__">طالب تجريبي (بيانات نموذجية للمعاينة)</option>
              {registrants.map((reg) => (
                <option key={reg.id} value={reg.id}>
                  {reg.name} (#{reg.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenPreview('report')}
              disabled={isPreviewLoading}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              {isPreviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              <span>معاينة التقرير الشامل (PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenPreview('certificate')}
              disabled={isPreviewLoading}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              {isPreviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Award className="w-3.5 h-3.5" />}
              <span>معاينة الشهادة (PDF)</span>
            </button>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : statusMsg.type === 'warn'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Sub-tabs */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => setSubTab('access')}
            className={`py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              subTab === 'access'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>الصلاحيات والإتاحة</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('report')}
            className={`py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              subTab === 'report'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>تصميم التقرير (A4)</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('certificate')}
            className={`py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              subTab === 'certificate'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>مصمم الشهادات</span>
          </button>
        </div>
      </div>

      {/* ============================================================
          SUB-TAB 1: ACCESS & RELEASE CONTROLS
         ============================================================ */}
      {subTab === 'access' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>الضوابط العامة لفتح التقرير والشهادة للطلاب</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-xs font-extrabold text-slate-800">
                  السماح للطلاب بتصدير التقرير الشامل (PDF)
                </span>
                <input
                  type="checkbox"
                  checked={draft.allowStudentFullReport}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, allowStudentFullReport: e.target.checked }))
                  }
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>

              <label className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-xs font-extrabold text-slate-800">
                  السماح للطلاب بتصدير شهادة إتمام البرنامج
                </span>
                <input
                  type="checkbox"
                  checked={draft.allowStudentCertificate}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, allowStudentCertificate: e.target.checked }))
                  }
                  className="w-4 h-4 accent-amber-500"
                />
              </label>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-2.5">
              <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span>إظهار / إخفاء الأزرار في نافذة انتهاء البرنامج</span>
              </div>
              <p className="text-[11px] text-slate-500">
                عند انتهاء البرنامج وظهور شاشة «تم إنهاء البرنامج وإخفاء الجدول»، تحكم بظهور زر التقرير (PDF) وزر الشهادة (PDF) فيها:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    updateDraft((p) => ({
                      ...p,
                      showReportButtonWhenEnded: p.showReportButtonWhenEnded === false,
                    }))
                  }
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-extrabold transition-all cursor-pointer ${
                    draft.showReportButtonWhenEnded !== false
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-white border-slate-300 text-slate-500'
                  }`}
                >
                  <span>زر التقرير الشامل (PDF)</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px]">
                    {draft.showReportButtonWhenEnded !== false ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>ظاهر</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        <span>مخفي</span>
                      </>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateDraft((p) => ({
                      ...p,
                      showCertificateButtonWhenEnded: p.showCertificateButtonWhenEnded === false,
                    }))
                  }
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-extrabold transition-all cursor-pointer ${
                    draft.showCertificateButtonWhenEnded !== false
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-white border-slate-300 text-slate-500'
                  }`}
                >
                  <span>زر شهادة الإتمام (PDF)</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px]">
                    {draft.showCertificateButtonWhenEnded !== false ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-amber-600" />
                        <span>ظاهر</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        <span>مخفي</span>
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">قاعدة التفعيل الافتراضية</label>
                <select
                  value={draft.releaseMode}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      releaseMode: e.target.value as PdfReleaseControlMode,
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                >
                  {RELEASE_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {draft.releaseMode === 'after_date' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>تاريخ فتح التقرير والشهادة</span>
                  </label>
                  <input
                    type="date"
                    value={draft.releaseDate}
                    onChange={(e) =>
                      updateDraft((p) => ({ ...p, releaseDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Per-program rules */}
          {programs.length > 0 && (
            <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                تخصيص موعد الفتح لكل برنامج تدريبي (اختياري)
              </h3>
              <div className="space-y-2.5">
                {programs.map((prog) => {
                  const rule = draft.programReleaseOverrides?.[prog.id];
                  return (
                    <div
                      key={prog.id}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="text-xs font-extrabold text-slate-800">{prog.name}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={rule?.releaseMode || '__inherit__'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateDraft((p) => {
                              const nextMap = { ...(p.programReleaseOverrides || {}) };
                              if (val === '__inherit__') {
                                delete nextMap[prog.id];
                              } else {
                                nextMap[prog.id] = {
                                  releaseMode: val as PdfReleaseControlMode,
                                  releaseDate: rule?.releaseDate || '',
                                };
                              }
                              return { ...p, programReleaseOverrides: nextMap };
                            });
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold"
                        >
                          <option value="__inherit__">اتباع الإعداد العام</option>
                          {RELEASE_MODE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {rule?.releaseMode === 'after_date' && (
                          <input
                            type="date"
                            value={rule.releaseDate || ''}
                            onChange={(e) =>
                              updateDraft((p) => ({
                                ...p,
                                programReleaseOverrides: {
                                  ...(p.programReleaseOverrides || {}),
                                  [prog.id]: {
                                    releaseMode: 'after_date',
                                    releaseDate: e.target.value,
                                  },
                                },
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-mono"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-student allow / deny overrides */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              استثناءات مخصصة لرقم المشترك (ID)
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                list="pdf_registrant_ids_list"
                value={overrideStudentIdInput}
                onChange={(e) => setOverrideStudentIdInput(e.target.value)}
                placeholder="أدخل أو اختر رقم المشترك ID"
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono min-w-[190px]"
              />
              <datalist id="pdf_registrant_ids_list">
                {registrants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </datalist>

              <select
                value={overrideStudentAction}
                onChange={(e) => setOverrideStudentAction(e.target.value as 'allow' | 'deny')}
                className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold"
              >
                <option value="allow">فتح فوري لهذا الطالب</option>
                <option value="deny">منع التقرير عن هذا الطالب</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  const clean = overrideStudentIdInput.trim();
                  if (!clean) return;
                  updateDraft((p) => ({
                    ...p,
                    studentAllowOverrides: {
                      ...(p.studentAllowOverrides || {}),
                      [clean]: overrideStudentAction,
                    },
                  }));
                  setOverrideStudentIdInput('');
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة استثناء</span>
              </button>
            </div>

            {Object.keys(draft.studentAllowOverrides || {}).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(draft.studentAllowOverrides).map(([sid, mode]) => {
                  const stuName = registrants.find((r) => r.id === sid)?.name;
                  return (
                    <div
                      key={sid}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                        mode === 'allow'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-rose-50 border-rose-300 text-rose-900'
                      }`}
                    >
                      <span>
                        #{sid} {stuName ? `(${stuName})` : ''} — {mode === 'allow' ? 'مفتوح' : 'مغلق'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((p) => {
                            const next = { ...(p.studentAllowOverrides || {}) };
                            delete next[sid];
                            return { ...p, studentAllowOverrides: next };
                          })
                        }
                        className="text-slate-500 hover:text-rose-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 2: GENERAL A4 REPORT DESIGN & SECTIONS
         ============================================================ */}
      {subTab === 'report' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">
              النصوص والهوية البصرية للتقرير الشامل (A4)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">العنوان الرئيسي للتقرير</label>
                <input
                  type="text"
                  value={draft.headerTitle}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, headerTitle: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">العنوان الفرعي / الوصف</label>
                <input
                  type="text"
                  value={draft.headerSubtitle}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, headerSubtitle: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">تذييل الصفحة (Footer)</label>
                <input
                  type="text"
                  value={draft.footerNote}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, footerNote: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">لون التقرير</label>
                <select
                  value={draft.accentColor}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      accentColor: e.target.value as PdfReportSettings['accentColor'],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value="emerald">أخضر زمردي</option>
                  <option value="indigo">أزرق نيلي</option>
                  <option value="amber">ذهبي كهرماني</option>
                  <option value="slate">رمادي رسمي داكن</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {[
                { key: 'logoUrl' as const, label: 'رابط الشعار (يدعم Google Drive)' },
                { key: 'backgroundUrl' as const, label: 'رابط صورة خلفية شفافة (Watermark)' },
                { key: 'coverImageBeforeUrl' as const, label: 'صفحة غلاف اختيارية قبل التقرير (صورة)' },
                { key: 'closingImageAfterUrl' as const, label: 'صفحة خاتمة اختيارية بعد التقرير (صورة)' },
              ].map((fld) => {
                const rawVal = draft[fld.key];
                const previewSrc = rawVal ? getDirectImageUrl(rawVal) : '';
                return (
                  <div key={fld.key} className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{fld.label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={rawVal}
                        onChange={(e) =>
                          updateDraft((p) => ({ ...p, [fld.key]: e.target.value }))
                        }
                        placeholder="https://..."
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                      {previewSrc && (
                        <img
                          src={previewSrc}
                          alt=""
                          className="w-9 h-9 rounded-lg border border-slate-200 object-contain bg-slate-50 shrink-0"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              الأقسام المضمّنة في التقرير الشامل
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PDF_SECTION_LABELS.map((sec) => (
                <label
                  key={sec.key}
                  className="p-3 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-800">{sec.label}</span>
                  <input
                    type="checkbox"
                    checked={draft.includeSections[sec.key]}
                    onChange={(e) =>
                      updateDraft((p) => ({
                        ...p,
                        includeSections: {
                          ...p.includeSections,
                          [sec.key]: e.target.checked,
                        },
                      }))
                    }
                    className="w-4 h-4 accent-emerald-600"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 3: CERTIFICATE DESIGNER
         ============================================================ */}
      {subTab === 'certificate' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                إعدادات تصميم شهادة إتمام البرنامج
              </h3>
              <label className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.certificate.enabled}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: { ...p.certificate, enabled: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-amber-500"
                />
                <span>تفعيل الشهادة</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">اتجاه الصفحة</label>
                <select
                  value={draft.certificate.orientation}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        orientation: e.target.value === 'portrait' ? 'portrait' : 'landscape',
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value="landscape">أفقي (Landscape - الأفضل للشهادات)</option>
                  <option value="portrait">عمودي (Portrait)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الهامش العلوي (px)</label>
                <input
                  type="number"
                  value={draft.certificate.marginTop}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        marginTop: Number(e.target.value) || 40,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الهوامش الجانبية (px)</label>
                <input
                  type="number"
                  value={draft.certificate.marginSide}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        marginSide: Number(e.target.value) || 50,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الهامش السفلي (px)</label>
                <input
                  type="number"
                  value={draft.certificate.marginBottom}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        marginBottom: Number(e.target.value) || 40,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
            </div>

            {/* Subject Title Controls */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-xs font-extrabold text-slate-800">عنوان الشهادة</div>
              <input
                type="text"
                value={draft.certificate.subjectText}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    certificate: { ...p.certificate, subjectText: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <select
                  value={draft.certificate.subjectFontFamily}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        subjectFontFamily: e.target.value as PdfFontFamily,
                      },
                    }))
                  }
                  className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold"
                >
                  <option value="Amiri">خط Amiri (نسخ كلاسيكي)</option>
                  <option value="Aref Ruqaa">خط Aref Ruqaa (رقعة)</option>
                  <option value="Cairo">خط Cairo (حديث)</option>
                </select>
                <input
                  type="number"
                  value={draft.certificate.subjectFontSize}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        subjectFontSize: Number(e.target.value) || 32,
                      },
                    }))
                  }
                  className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono"
                  title="حجم الخط"
                />
                <select
                  value={draft.certificate.subjectAlign}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        subjectAlign: e.target.value as PdfTextAlign,
                      },
                    }))
                  }
                  className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold"
                >
                  <option value="center">توسيط</option>
                  <option value="right">محاذاة لليمين</option>
                  <option value="left">محاذاة لليسار</option>
                </select>
                <input
                  type="color"
                  value={draft.certificate.subjectColor}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: { ...p.certificate, subjectColor: e.target.value },
                    }))
                  }
                  className="w-full h-9 rounded-xl border border-slate-300 bg-white cursor-pointer"
                />
              </div>
            </div>

            {/* Body Text Controls + Placeholders */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-800">نص الشهادة التلقائي</span>
                <span className="text-[11px] text-slate-500">
                  انقر على أي متغير لإدراجه في نص الشهادة:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CERT_PLACEHOLDERS.map((tok) => (
                  <button
                    key={tok.token}
                    type="button"
                    onClick={() => appendCertToken(tok.token)}
                    className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-[11px] font-bold cursor-pointer"
                  >
                    + {tok.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={4}
                value={draft.certificate.bodyText}
                onChange={(e) =>
                  updateDraft((p) => ({
                    ...p,
                    certificate: { ...p.certificate, bodyText: e.target.value },
                  }))
                }
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs leading-relaxed"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <select
                  value={draft.certificate.bodyFontFamily}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        bodyFontFamily: e.target.value as PdfFontFamily,
                      },
                    }))
                  }
                  className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold"
                >
                  <option value="Cairo">خط Cairo</option>
                  <option value="Amiri">خط Amiri</option>
                  <option value="Aref Ruqaa">خط Aref Ruqaa</option>
                </select>
                <input
                  type="number"
                  value={draft.certificate.bodyFontSize}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        bodyFontSize: Number(e.target.value) || 18,
                      },
                    }))
                  }
                  className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono"
                />
                <select
                  value={draft.certificate.bodyAlign}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        bodyAlign: e.target.value as PdfTextAlign,
                      },
                    }))
                  }
                  className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold"
                >
                  <option value="center">توسيط</option>
                  <option value="right">محاذاة لليمين</option>
                  <option value="left">محاذاة لليسار</option>
                </select>
                <input
                  type="color"
                  value={draft.certificate.bodyColor}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: { ...p.certificate, bodyColor: e.target.value },
                    }))
                  }
                  className="w-full h-9 rounded-xl border border-slate-300 bg-white cursor-pointer"
                />
              </div>
            </div>

            {/* Frame, Background, Footer Images */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'frameUrl' as const, label: 'رابط إطار الشهادة المزخرف (PNG شفاف)' },
                { key: 'backgroundUrl' as const, label: 'رابط صورة خلفية الشهادة' },
                { key: 'footerImageUrl' as const, label: 'رابط صورة تذييل الشهادة (اختياري)' },
              ].map((fld) => {
                const rawVal = draft.certificate[fld.key];
                const previewSrc = rawVal ? getDirectImageUrl(rawVal) : '';
                return (
                  <div key={fld.key} className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">{fld.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={rawVal}
                        onChange={(e) =>
                          updateDraft((p) => ({
                            ...p,
                            certificate: { ...p.certificate, [fld.key]: e.target.value },
                          }))
                        }
                        placeholder="https://..."
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                      {previewSrc && (
                        <img
                          src={previewSrc}
                          alt=""
                          className="w-9 h-9 rounded-lg border border-slate-200 object-contain bg-slate-50 shrink-0"
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">ارتفاع صورة التذييل (px)</label>
                <input
                  type="number"
                  value={draft.certificate.footerImageHeight}
                  onChange={(e) =>
                    updateDraft((p) => ({
                      ...p,
                      certificate: {
                        ...p.certificate,
                        footerImageHeight: Number(e.target.value) || 46,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
            </div>

            {/* Signatures & Stamps Managers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Signatures */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">التواقيع المعتمدة</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((p) => ({
                        ...p,
                        certificate: {
                          ...p.certificate,
                          signatures: [
                            ...p.certificate.signatures,
                            {
                              id: `sig_${Date.now()}`,
                              title: 'توقيع جديد',
                              url: '',
                              width: 120,
                            },
                          ],
                        },
                      }))
                    }
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>إضافة توقيع</span>
                  </button>
                </div>

                {draft.certificate.signatures.map((sig, sIdx) => (
                  <div
                    key={sig.id}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={sig.title}
                        onChange={(e) =>
                          updateDraft((p) => {
                            const next = p.certificate.signatures.slice();
                            next[sIdx] = { ...sig, title: e.target.value };
                            return { ...p, certificate: { ...p.certificate, signatures: next } };
                          })
                        }
                        placeholder="المسمى (مثال: المعلم المشرف)"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                      />
                      <input
                        type="number"
                        value={sig.width}
                        onChange={(e) =>
                          updateDraft((p) => {
                            const next = p.certificate.signatures.slice();
                            next[sIdx] = { ...sig, width: Number(e.target.value) || 120 };
                            return { ...p, certificate: { ...p.certificate, signatures: next } };
                          })
                        }
                        className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                        title="العرض px"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((p) => ({
                            ...p,
                            certificate: {
                              ...p.certificate,
                              signatures: p.certificate.signatures.filter((_, i) => i !== sIdx),
                            },
                          }))
                        }
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={sig.url}
                      onChange={(e) =>
                        updateDraft((p) => {
                          const next = p.certificate.signatures.slice();
                          next[sIdx] = { ...sig, url: e.target.value };
                          return { ...p, certificate: { ...p.certificate, signatures: next } };
                        })
                      }
                      placeholder="رابط صورة التوقيع (PNG/Drive)"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-mono"
                    />
                  </div>
                ))}
              </div>

              {/* Stamps */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">الأختام الرسمية</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((p) => ({
                        ...p,
                        certificate: {
                          ...p.certificate,
                          stamps: [
                            ...p.certificate.stamps,
                            {
                              id: `stp_${Date.now()}`,
                              title: 'الختم الرسمي',
                              url: '',
                              width: 95,
                            },
                          ],
                        },
                      }))
                    }
                    className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>إضافة ختم</span>
                  </button>
                </div>

                {draft.certificate.stamps.map((stp, stIdx) => (
                  <div
                    key={stp.id}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={stp.title}
                        onChange={(e) =>
                          updateDraft((p) => {
                            const next = p.certificate.stamps.slice();
                            next[stIdx] = { ...stp, title: e.target.value };
                            return { ...p, certificate: { ...p.certificate, stamps: next } };
                          })
                        }
                        placeholder="عنوان الختم"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                      />
                      <input
                        type="number"
                        value={stp.width}
                        onChange={(e) =>
                          updateDraft((p) => {
                            const next = p.certificate.stamps.slice();
                            next[stIdx] = { ...stp, width: Number(e.target.value) || 95 };
                            return { ...p, certificate: { ...p.certificate, stamps: next } };
                          })
                        }
                        className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                        title="العرض px"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((p) => ({
                            ...p,
                            certificate: {
                              ...p.certificate,
                              stamps: p.certificate.stamps.filter((_, i) => i !== stIdx),
                            },
                          }))
                        }
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={stp.url}
                      onChange={(e) =>
                        updateDraft((p) => {
                          const next = p.certificate.stamps.slice();
                          next[stIdx] = { ...stp, url: e.target.value };
                          return { ...p, certificate: { ...p.certificate, stamps: next } };
                        })
                      }
                      placeholder="رابط صورة الختم (PNG/Drive)"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <PdfPreviewModal
        isOpen={Boolean(previewDoc)}
        title={previewDoc?.title || ''}
        html={previewDoc?.html || ''}
        orientation={previewDoc?.orientation || 'portrait'}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
};


