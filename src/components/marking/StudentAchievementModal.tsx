import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  Award,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Video,
  Mic,
  Image as ImageIcon,
  BookOpen,
} from 'lucide-react';
import { StudentAchievementSummary } from '../../types';
import { fetchStudentAchievementSummary } from '../../utils/markingSheets';

interface StudentAchievementModalProps {
  isOpen: boolean;
  onClose: () => void;
  webhookUrl: string;
  studentId: string;
  studentName: string;
  activeVideoAnswers?: Record<string, unknown>;
  activeVideoLessonTitle?: string;
}

export const StudentAchievementModal: React.FC<StudentAchievementModalProps> = ({
  isOpen,
  onClose,
  webhookUrl,
  studentId,
  studentName,
  activeVideoAnswers,
  activeVideoLessonTitle,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StudentAchievementSummary | null>(null);
  const [expandedModuleKey, setExpandedModuleKey] = useState<string | null>('video');

  const loadSummary = async () => {
    if (!studentId && !studentName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentAchievementSummary(webhookUrl, studentId, studentName);
      if (res.success && res.summary) {
        setSummary(res.summary);
      } else {
        setError(res.error || 'تعذر جلب تقرير إنجاز الطالب.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSummary();
    }
  }, [isOpen, studentId, studentName]);

  if (!isOpen) return null;

  const activeAnsEntries = activeVideoAnswers ? Object.entries(activeVideoAnswers) : [];

  const totals = (summary?.modules || []).reduce(
    (acc, m) => ({
      total: acc.total + m.totalLessons,
      done: acc.done + m.completedLessons,
      pending: acc.pending + m.pendingLessons,
    }),
    { total: 0, done: 0, pending: 0 }
  );

  const videoModule = summary?.modules?.find((m) => m.key === 'video');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-cairo text-right">
      <div className="bg-slate-50 rounded-3xl w-full max-w-5xl max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-5 py-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                تقرير إنجاز الطالب
              </h2>
              <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-1.5">
                <span className="text-slate-800 font-bold">{studentName || 'طالب'}</span>
                {studentId && (
                  <>
                    <span>·</span>
                    <span className="font-mono">#{studentId}</span>
                  </>
                )}
                {summary?.generatedAt && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{summary.generatedAt}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Active Video Lesson Answers Breakdown (if provided from current workspace item) */}
          {activeAnsEntries.length > 0 && (
            <section className="bg-white rounded-2xl border border-indigo-200 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-indigo-600" />
                  <span>
                    إجابات أسئلة الفيديو للدرس الحالي
                    {activeVideoLessonTitle ? `: ${activeVideoLessonTitle}` : ''}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold text-indigo-700 tabular-nums">
                  {activeAnsEntries.length} سؤال مُجاب
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeAnsEntries.map(([qKey, qVal], idx) => {
                  const obj =
                    qVal && typeof qVal === 'object' ? (qVal as Record<string, unknown>) : null;
                  const isCorrect =
                    obj && typeof obj.isCorrect === 'boolean' ? obj.isCorrect : undefined;
                  const selectedText = obj
                    ? String(
                        obj.selectedOption ??
                          obj.answer ??
                          obj.value ??
                          obj.text ??
                          JSON.stringify(obj)
                      )
                    : String(qVal ?? '');
                  return (
                    <div
                      key={qKey}
                      className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                        isCorrect === true
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : isCorrect === false
                          ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold">سؤال {idx + 1}</div>
                        <div className="text-[11px] font-semibold truncate">{selectedText}</div>
                      </div>
                      {isCorrect !== undefined && (
                        <span className="shrink-0 font-bold text-[11px]">
                          {isCorrect ? '✓ صحيح' : '✗ خطأ'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {loading && !summary ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <span className="text-xs font-bold">جاري قراءة سجل الطالب من جميع المسارات...</span>
            </div>
          ) : error && !summary ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : summary ? (
            <>
              {/* Overall Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
                  <div className="text-[11px] font-bold text-slate-500">إجمالي الدروس المنجزة</div>
                  <div className="text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-0.5">
                    {totals.done} / {totals.total}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
                  <div className="text-[11px] font-bold text-slate-500">الدروس المتبقية</div>
                  <div className="text-xl font-extrabold text-amber-700 font-mono tabular-nums mt-0.5">
                    {totals.pending}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
                  <div className="text-[11px] font-bold text-slate-500">دروس الفيديو المنجزة</div>
                  <div className="text-xl font-extrabold text-indigo-700 font-mono tabular-nums mt-0.5">
                    {videoModule ? `${videoModule.completedLessons} / ${videoModule.totalLessons}` : '0'}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
                  <div className="text-[11px] font-bold text-slate-500">متوسط درجات الفيديو</div>
                  <div className="text-xl font-extrabold text-emerald-700 font-mono tabular-nums mt-0.5">
                    {videoModule?.averageScore !== null && videoModule?.averageScore !== undefined
                      ? `${videoModule.averageScore}%`
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Interactive Video Quizzes & Media Breakdown */}
              <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-indigo-600" />
                    <span>تفاصيل دروس الفيديو التفاعلي ({summary.videoQuizDetails.length})</span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    نتيجة الأسئلة · الصوت · الصورة
                  </span>
                </div>

                {summary.videoQuizDetails.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 font-semibold">
                    لا توجد دروس فيديو مسجلة بعد.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-50/70 text-[11px] text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">الدرس</th>
                          <th className="px-3 py-2.5">الحالة</th>
                          <th className="px-3 py-2.5">نتيجة الأسئلة</th>
                          <th className="px-3 py-2.5">الأسئلة المجابة</th>
                          <th className="px-3 py-2.5">الواجبات المرفقة</th>
                          <th className="px-3 py-2.5">آخر تحديث</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.videoQuizDetails.map((vq) => {
                          const isStarted = vq.completed !== 'لم يبدأ';
                          return (
                            <tr key={vq.lessonId || vq.lessonTitle} className="hover:bg-slate-50/70">
                              <td className="px-4 py-2.5">
                                <div className="font-extrabold text-slate-900">{vq.lessonTitle}</div>
                                <div className="text-[11px] text-slate-500">{vq.topic}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`font-bold ${
                                    isStarted ? 'text-emerald-700' : 'text-slate-400'
                                  }`}
                                >
                                  {vq.completed}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono font-extrabold tabular-nums text-slate-900">
                                {isStarted ? `${vq.videoScore}%` : '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono tabular-nums text-slate-600">
                                {vq.answeredCount} / {vq.totalQuestions}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 text-[11px] font-bold">
                                  <span
                                    className={`inline-flex items-center gap-1 ${
                                      vq.hasImage ? 'text-emerald-700' : 'text-slate-300'
                                    }`}
                                  >
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    <span>صورة</span>
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 ${
                                      vq.hasAudio ? 'text-indigo-700' : 'text-slate-300'
                                    }`}
                                  >
                                    <Mic className="w-3.5 h-3.5" />
                                    <span>صوت</span>
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                                {vq.updatedAt || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* All 6 Curriculum Modules */}
              <section className="space-y-2.5">
                <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <span>مستوى الإنجاز عبر جميع المسارات (المحلول والمتبقي)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summary.modules.map((mod) => {
                    const pct =
                      mod.totalLessons > 0
                        ? Math.round((mod.completedLessons / mod.totalLessons) * 100)
                        : 0;
                    const isExpanded = expandedModuleKey === mod.key;

                    return (
                      <div
                        key={mod.key}
                        className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-extrabold text-slate-900">{mod.label}</div>
                            <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                              <span className="text-emerald-700 font-bold">
                                منجز: {mod.completedLessons}
                              </span>
                              <span>·</span>
                              <span className="text-amber-700 font-bold">
                                متبقي: {mod.pendingLessons}
                              </span>
                              <span>·</span>
                              <span>من {mod.totalLessons}</span>
                            </div>
                          </div>

                          <div className="text-left shrink-0">
                            <div className="text-sm font-mono font-extrabold text-slate-900 tabular-nums">
                              {mod.averageScore !== null ? `${mod.averageScore}%` : `${pct}%`}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-400">
                              {mod.averageScore !== null ? 'المتوسط' : 'الإنجاز'}
                            </div>
                          </div>
                        </div>

                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedModuleKey((prev) => (prev === mod.key ? null : mod.key))
                          }
                          className="text-[11px] font-extrabold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                        >
                          {isExpanded
                            ? 'إخفاء تفاصيل الدروس ▲'
                            : `عرض التفاصيل (${mod.completedItems.length} محلول · ${mod.pendingItems.length} غير محلول) ▼`}
                        </button>

                        {isExpanded && (
                          <div className="pt-2 border-t border-slate-100 space-y-2.5 text-xs">
                            {mod.completedItems.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>الدروس المحلولة ({mod.completedItems.length}):</span>
                                </div>
                                <div className="space-y-1">
                                  {mod.completedItems.map((ci, idx) => (
                                    <div
                                      key={`${ci.title}-${idx}`}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-100 flex items-center justify-between gap-2"
                                    >
                                      <span className="font-bold text-slate-800 truncate">
                                        {ci.title}
                                      </span>
                                      <span className="font-mono font-extrabold text-emerald-700 shrink-0 tabular-nums">
                                        {ci.score !== undefined ? `${ci.score}%` : ci.status || '✓'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {mod.pendingItems.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-extrabold text-amber-800 flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>الدروس غير المحلولة ({mod.pendingItems.length}):</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {mod.pendingItems.map((pi, idx) => (
                                    <span
                                      key={`${pi}-${idx}`}
                                      className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200/70 text-[11px] font-semibold text-amber-900"
                                    >
                                      {pi}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
