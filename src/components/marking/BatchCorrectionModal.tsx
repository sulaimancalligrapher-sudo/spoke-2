import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  CheckSquare,
  Square,
  Send,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Users,
  Layers,
  Sparkles,
  RotateCcw,
  Award,
  AlertCircle,
} from 'lucide-react';
import {
  MarkingConfig,
  MarkingStatus,
  TeacherCorrectionRecord,
  UnifiedMarkingSubmission,
} from '../../types';
import { MarkingBlackboard, MarkingBlackboardHandle } from './MarkingBlackboard';
import { MarkingAudioStudio } from './MarkingAudioStudio';
import { MarkingVideoRecorder } from './MarkingVideoRecorder';
import { saveMarkingBatchToSheets, saveMarkingCorrectionToSheets } from '../../utils/markingSheets';

interface BatchCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: UnifiedMarkingSubmission[];
  markingConfig: MarkingConfig;
  webhookUrl: string;
  teacherName: string;
  initialMode?: 'bulk' | 'queue';
  onCorrectionsUpdated: (updated: TeacherCorrectionRecord[]) => void;
}

const QUICK_FEEDBACK_PRESETS = [
  'أحسنت! كتابة متقنة وتنفيذ رائع.',
  'عمل ممتاز، استمر على هذا المستوى المتميز.',
  'نطق سليم ومخارج واضحة، بارك الله فيك.',
  'ملاحظة: يرجى الانتباه لاستقامة الحرف على السطر.',
  'تحتاج المحاولة لإعادة مع خفض سرعة القراءة قليلاً.',
];

const RATING_LABELS = ['ممتاز', 'جيد جداً', 'جيد', 'يحتاج تحسين', 'إعادة المحاولة'];

export const BatchCorrectionModal: React.FC<BatchCorrectionModalProps> = ({
  isOpen,
  onClose,
  submissions,
  markingConfig,
  webhookUrl,
  teacherName,
  initialMode = 'queue',
  onCorrectionsUpdated,
}) => {
  const [workspaceMode, setWorkspaceMode] = useState<'queue' | 'bulk'>(initialMode);
  const [onlyPending, setOnlyPending] = useState(true);

  const queueItems = useMemo(() => {
    if (!onlyPending) return submissions;
    const pending = submissions.filter(
      (s) => !s.correction || s.correction.status !== 'corrected'
    );
    return pending.length > 0 ? pending : submissions;
  }, [submissions, onlyPending]);

  // ====== QUEUE MODE STATE ======
  const [activeIndex, setActiveIndex] = useState(0);
  const currentItem = queueItems[activeIndex] || queueItems[0] || null;
  const queueBlackboardRef = useRef<MarkingBlackboardHandle | null>(null);

  const [qStatus, setQStatus] = useState<MarkingStatus>('corrected');
  const [qScore, setQScore] = useState<string>('95');
  const [qRating, setQRating] = useState<string>('ممتاز');
  const [qNotes, setQNotes] = useState<string>('');
  const [qTeacherAudioB64, setQTeacherAudioB64] = useState<string | null>(null);
  const [qTeacherVideoUrl, setQTeacherVideoUrl] = useState<string>('');
  const [qAllowRetry, setQAllowRetry] = useState(false);
  const [qSendTelegram, setQSendTelegram] = useState(true);
  const [qSaving, setQSaving] = useState(false);
  const [qFeedback, setQFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setWorkspaceMode(initialMode);
    setActiveIndex(0);
    setQFeedback(null);
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!currentItem) return;
    const c = currentItem.correction;
    setQStatus(c?.status || 'corrected');
    setQScore(
      c?.score !== undefined
        ? String(c.score)
        : currentItem.studentScore !== undefined
        ? String(currentItem.studentScore)
        : '95'
    );
    setQRating(c?.ratingLabel || 'ممتاز');
    setQNotes(c?.notes || '');
    setQTeacherAudioB64(null);
    setQTeacherVideoUrl(c?.teacherVideoUrl || '');
    setQAllowRetry(Boolean(c?.allowRetry));
  }, [currentItem?.submissionKey]);

  // ====== BULK MULTI-SELECT STATE ======
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bStatus, setBStatus] = useState<MarkingStatus>('corrected');
  const [bScore, setBScore] = useState<string>('95');
  const [bRating, setBRating] = useState<string>('ممتاز');
  const [bNotes, setBNotes] = useState<string>('');
  const [bAllowRetry, setBAllowRetry] = useState(false);
  const [bSendTelegram, setBSendTelegram] = useState(true);
  const [bSharedAudioB64, setBSharedAudioB64] = useState<string | null>(null);
  const [bSharedVideoUrl, setBSharedVideoUrl] = useState<string>('');
  const [bSaving, setBSaving] = useState(false);
  const [bFeedback, setBFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedKeys(new Set(queueItems.map((s) => s.submissionKey)));
      setBFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveQueueItem = async (advanceNext: boolean) => {
    if (!currentItem || qSaving) return;
    setQSaving(true);
    setQFeedback(null);
    try {
      let annotatedBase64: string | undefined;
      if (queueBlackboardRef.current?.hasAnnotations()) {
        const exported = queueBlackboardRef.current.exportCompositeDataUrl();
        if (exported && exported.startsWith('data:image/')) {
          annotatedBase64 = exported;
        }
      }

      const res = await saveMarkingCorrectionToSheets(webhookUrl, {
        submissionKey: currentItem.submissionKey,
        exerciseType: currentItem.exerciseType,
        studentId: currentItem.studentId,
        studentName: currentItem.studentName,
        lessonSubject: currentItem.lessonSubject,
        itemTitle: currentItem.itemTitle,
        status: qStatus,
        score: qScore.trim() !== '' ? Number(qScore) : undefined,
        ratingLabel: qRating,
        notes: qNotes.trim(),
        correctedImageUrl: !annotatedBase64 ? currentItem.correction?.correctedImageUrl : undefined,
        correctedImageBase64: annotatedBase64,
        teacherAudioUrl: !qTeacherAudioB64 ? currentItem.correction?.teacherAudioUrl : undefined,
        teacherAudioBase64: qTeacherAudioB64 || undefined,
        teacherVideoUrl: qTeacherVideoUrl.trim() || undefined,
        allowRetry: qAllowRetry || qStatus === 'retry',
        sendTelegram: qSendTelegram,
        teacherName,
      });

      if (res.success && res.correction) {
        onCorrectionsUpdated([res.correction]);
        setQFeedback({
          type: 'ok',
          text: res.telegramNotified
            ? `تم حفظ تصحيح ${currentItem.studentName} وإرسال إشعار تيليغرام فوراً.`
            : `تم حفظ تصحيح ${currentItem.studentName} في الشيت بنجاح.`,
        });
        if (advanceNext && activeIndex + 1 < queueItems.length) {
          window.setTimeout(() => {
            setActiveIndex((idx) => Math.min(queueItems.length - 1, idx + 1));
          }, 300);
        }
      } else {
        setQFeedback({
          type: 'err',
          text: res.error || 'تعذر حفظ التصحيح.',
        });
      }
    } finally {
      setQSaving(false);
    }
  };

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleAllBulk = () => {
    if (selectedKeys.size === queueItems.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(queueItems.map((i) => i.submissionKey)));
    }
  };

  const handleSaveBulkBatch = async () => {
    const picked = queueItems.filter((i) => selectedKeys.has(i.submissionKey));
    if (picked.length === 0 || bSaving) return;
    setBSaving(true);
    setBFeedback(null);
    try {
      const res = await saveMarkingBatchToSheets(webhookUrl, {
        teacherName,
        sharedTeacherAudioBase64: bSharedAudioB64 || undefined,
        sharedTeacherVideoUrl: bSharedVideoUrl.trim() || undefined,
        items: picked.map((p) => ({
          submissionKey: p.submissionKey,
          exerciseType: p.exerciseType,
          studentId: p.studentId,
          studentName: p.studentName,
          lessonSubject: p.lessonSubject,
          itemTitle: p.itemTitle,
          status: bStatus,
          score: bScore.trim() !== '' ? Number(bScore) : undefined,
          ratingLabel: bRating,
          notes: bNotes.trim(),
          allowRetry: bAllowRetry || bStatus === 'retry',
          sendTelegram: bSendTelegram,
        })),
      });

      if (res.success && res.corrections) {
        onCorrectionsUpdated(res.corrections);
        setBFeedback({
          type: 'ok',
          text: `تم التصحيح الجماعي لـ ${res.count || picked.length} تسليم، وإرسال ${res.telegramSentCount || 0} إشعار عبر تيليغرام.`,
        });
      } else {
        setBFeedback({
          type: 'err',
          text: res.error || 'تعذر تنفيذ التصحيح الجماعي.',
        });
      }
    } finally {
      setBSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 font-cairo">
      <div className="bg-slate-50 rounded-3xl w-full max-w-7xl h-[94vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-right">
        {/* Top Modal Header */}
        <header className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                نافذة التصحيح الجماعي والطابور السريع
              </h2>
              <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                <span>إجمالي المعروض: {queueItems.length} تسليم</span>
                <span>·</span>
                <span>المعلم: {teacherName}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setWorkspaceMode('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                  workspaceMode === 'queue'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                طابور التصحيح المتسلسل
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('bulk')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors flex items-center gap-1.5 ${
                  workspaceMode === 'bulk'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>تصحيح وإرسال جماعي ({selectedKeys.size})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOnlyPending((p) => !p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                onlyPending
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {onlyPending ? 'عرض غير المصحح فقط' : 'عرض جميع التسليمات'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Body */}
        {queueItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div className="text-sm font-bold text-slate-800">
              لا توجد تسليمات مطابقة للفلاتر الحالية.
            </div>
          </div>
        ) : workspaceMode === 'queue' ? (
          /* ================================================================
             MODE 1: RAPID SEQUENTIAL QUEUE WORKSPACE
             ================================================================ */
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Right Sidebar: Student Queue */}
            <aside className="lg:w-72 bg-white border-b lg:border-b-0 lg:border-l border-slate-200 overflow-y-auto shrink-0 max-h-48 lg:max-h-none">
              <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs font-extrabold text-slate-700 sticky top-0 bg-white z-10">
                <span>قائمة الطابور ({queueItems.length})</span>
                <span className="font-mono text-slate-500">
                  {activeIndex + 1} / {queueItems.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {queueItems.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const cStatus = item.correction?.status;
                  return (
                    <button
                      key={item.submissionKey}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      className={`w-full text-right px-3.5 py-2.5 transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        isActive ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {item.studentName || item.studentId}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {item.lessonSubject} · {item.itemTitle}
                        </div>
                        {(item.programName || item.classroomName) && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {[item.programName, item.classroomName].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${
                          cStatus === 'corrected'
                            ? 'text-emerald-700'
                            : cStatus === 'retry'
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {cStatus === 'corrected'
                          ? 'مصحح ✓'
                          : cStatus === 'retry'
                          ? 'إعادة'
                          : 'جديد'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main Correction Stage */}
            {currentItem && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Active Student Header */}
                <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {currentItem.studentName} ({currentItem.studentId || 'بدون ID'})
                    </div>
                    <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
                      <span>{currentItem.lessonSubject}</span>
                      <span>·</span>
                      <span>{currentItem.itemTitle}</span>
                      {currentItem.studentScore !== undefined && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 font-bold tabular-nums">
                            تقييم النظام: {currentItem.studentScore}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={activeIndex === 0}
                      onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>السابق</span>
                    </button>
                    <button
                      type="button"
                      disabled={activeIndex + 1 >= queueItems.length}
                      onClick={() => setActiveIndex((i) => Math.min(queueItems.length - 1, i + 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span>التالي</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Blackboard (Images & Annotation) */}
                <MarkingBlackboard
                  ref={queueBlackboardRef}
                  studentImageUrl={currentItem.studentImageUrl}
                  referenceImageUrl={currentItem.referenceImageUrl}
                  lessonTitle={`${currentItem.lessonSubject} — ${currentItem.itemTitle}`}
                  compact
                />

                {/* Dual Audio Studio */}
                <MarkingAudioStudio
                  studentAudioUrl={currentItem.studentAudioUrl}
                  studentName={currentItem.studentName}
                  referenceAudioUrl={currentItem.referenceAudioUrl}
                  referenceAutoReadText={currentItem.referenceAutoReadText || currentItem.itemTitle}
                  existingTeacherAudioUrl={currentItem.correction?.teacherAudioUrl}
                  onTeacherAudioRecorded={setQTeacherAudioB64}
                />

                {/* Live Video Recorder */}
                <MarkingVideoRecorder
                  blackboardRef={queueBlackboardRef}
                  markingConfig={markingConfig}
                  webhookUrl={webhookUrl}
                  existingVideoUrl={qTeacherVideoUrl}
                  onVideoUploaded={setQTeacherVideoUrl}
                />

                {/* Evaluation Rubric & Submit */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        قرار التصحيح:
                      </label>
                      <select
                        value={qStatus}
                        onChange={(e) => setQStatus(e.target.value as MarkingStatus)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                      >
                        <option value="corrected">مصحّح ومعتمد</option>
                        <option value="retry">مطلوب إعادة المحاولة</option>
                        <option value="pending">قيد الانتظار</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        الدرجة (من 100):
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={qScore}
                        onChange={(e) => setQScore(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        التقدير اللفظي:
                      </label>
                      <select
                        value={qRating}
                        onChange={(e) => setQRating(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                      >
                        {RATING_LABELS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-bold text-slate-700">ملاحظة المعلم:</label>
                      <div className="flex flex-wrap items-center gap-1">
                        {QUICK_FEEDBACK_PRESETS.slice(0, 3).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setQNotes((prev) => (prev ? `${prev}\n${preset}` : preset))
                            }
                            className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-[10px] font-bold text-slate-700 cursor-pointer"
                          >
                            + {preset.slice(0, 26)}...
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={qNotes}
                      onChange={(e) => setQNotes(e.target.value)}
                      placeholder="اكتب ملاحظتك أو توجيهك للطالب..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={qAllowRetry}
                          onChange={(e) => setQAllowRetry(e.target.checked)}
                          className="accent-amber-600"
                        />
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>فتح محاولة جديدة للطالب</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={qSendTelegram}
                          onChange={(e) => setQSendTelegram(e.target.checked)}
                          className="accent-sky-600"
                        />
                        <Send className="w-3.5 h-3.5 text-sky-600" />
                        <span>إشعار الطالب عبر تيليغرام</span>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={qSaving}
                        onClick={() => handleSaveQueueItem(false)}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
                      >
                        حفظ فقط
                      </button>
                      <button
                        type="button"
                        disabled={qSaving}
                        onClick={() => handleSaveQueueItem(true)}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        {qSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>حفظ وإرسال والانتقال للتالي</span>
                      </button>
                    </div>
                  </div>

                  {qFeedback && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        qFeedback.type === 'ok'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-rose-50 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {qFeedback.type === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{qFeedback.text}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ================================================================
             MODE 2: BULK MULTI-SELECT CORRECTION & TELEGRAM BROADCAST
             ================================================================ */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Selection Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleToggleAllBulk}
                  className="text-xs font-extrabold text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  {selectedKeys.size === queueItems.length ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    تحديد الكل ({selectedKeys.size} من {queueItems.length})
                  </span>
                </button>
                <span className="text-[11px] text-slate-500 font-semibold">
                  اختر الطلاب لتطبيق نفس التقييم والملاحظة والملفات وإرسالها دفعة واحدة
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {queueItems.map((item) => {
                  const checked = selectedKeys.has(item.submissionKey);
                  return (
                    <div
                      key={item.submissionKey}
                      onClick={() => toggleSelectKey(item.submissionKey)}
                      className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        checked ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 truncate">
                            {item.studentName} {item.studentId ? `(${item.studentId})` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.lessonSubject} · {item.itemTitle}
                            {item.classroomName ? ` · ${item.classroomName}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-xs font-bold">
                        {item.studentScore !== undefined && (
                          <span className="text-slate-600 tabular-nums">{item.studentScore}%</span>
                        )}
                        <span
                          className={
                            item.correction?.status === 'corrected'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }
                        >
                          {item.correction?.status === 'corrected' ? 'مصحّح' : 'بانتظار التصحيح'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bulk Shared Decision Form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>بيانات التصحيح الجماعي الموحّد</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الحالة الجماعية:
                  </label>
                  <select
                    value={bStatus}
                    onChange={(e) => setBStatus(e.target.value as MarkingStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                  >
                    <option value="corrected">مصحّح ومعتمد للجميع</option>
                    <option value="retry">طلب إعادة المحاولة للجميع</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الدرجة الموحّدة:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bScore}
                    onChange={(e) => setBScore(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    التقدير الموحّد:
                  </label>
                  <select
                    value={bRating}
                    onChange={(e) => setBRating(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                  >
                    {RATING_LABELS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    الملاحظة الجماعية للطلاب المحددين:
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    {QUICK_FEEDBACK_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBNotes((p) => (p ? `${p}\n${preset}` : preset))}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-[10px] font-bold text-slate-700 cursor-pointer"
                      >
                        + {preset.slice(0, 24)}...
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={bNotes}
                  onChange={(e) => setBNotes(e.target.value)}
                  placeholder="اكتب توجيهاً موحداً يصل لكل الطلاب المحددين..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                />
              </div>

              {/* Optional Shared Teacher Audio + Optional Shared Cloudinary Video URL */}
              <MarkingAudioStudio
                studentName="المجموعة المحددة"
                onTeacherAudioRecorded={setBSharedAudioB64}
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رابط فيديو شرح جماعي (اختياري — Cloudinary MP4):
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={bSharedVideoUrl}
                  onChange={(e) => setBSharedVideoUrl(e.target.value)}
                  placeholder="https://res.cloudinary.com/..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 text-left"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bAllowRetry}
                      onChange={(e) => setBAllowRetry(e.target.checked)}
                      className="accent-amber-600"
                    />
                    <span>فتح محاولة إضافية للمحددين</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bSendTelegram}
                      onChange={(e) => setBSendTelegram(e.target.checked)}
                      className="accent-sky-600"
                    />
                    <span>إرسال إشعار تيليغرام لجميع المحددين</span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={selectedKeys.size === 0 || bSaving}
                  onClick={handleSaveBulkBatch}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                >
                  {bSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>اعتماد وإرسال التصحيح الجماعي ({selectedKeys.size})</span>
                </button>
              </div>

              {bFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    bFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {bFeedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{bFeedback.text}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
