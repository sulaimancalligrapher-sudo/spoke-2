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
  Image as ImageIcon,
  Mic,
  Video,
  Trash2,
  Plus,
  Sticker,
  ShieldCheck,
  ClipboardList,
  Search,
  Edit3,
  ExternalLink,
} from 'lucide-react';
import {
  MarkingConfig,
  MarkingStatus,
  TeacherCorrectionRecord,
  UnifiedMarkingSubmission,
} from '../../types';
import { MarkingBlackboard, MarkingBlackboardHandle } from './MarkingBlackboard';
import { MarkingAudioStudio } from './MarkingAudioStudio';
import { MarkingPhotoCapture } from './MarkingPhotoCapture';
import { MarkingVideoRecorder } from './MarkingVideoRecorder';
import {
  clearMarkingBatchToSheets,
  clearMarkingCorrectionToSheets,
  DEFAULT_MARKING_PRESETS,
  DEFAULT_MARKING_STICKERS,
  saveMarkingBatchToSheets,
  saveMarkingCorrectionToSheets,
  toCloudinaryMp4Url,
} from '../../utils/markingSheets';
import { combineImagesToSingleBase64 } from '../../utils/markingCanvasUtils';

interface BatchCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: UnifiedMarkingSubmission[];
  markingConfig: MarkingConfig;
  webhookUrl: string;
  teacherName: string;
  homeLogoUrl?: string;
  initialMode?: 'bulk' | 'queue' | 'sheet';
  onCorrectionsUpdated: (updated: TeacherCorrectionRecord[]) => void;
  onCorrectionsCleared?: (keys: string[]) => void;
}

type BulkAudienceMode = 'corrected_only' | 'all_submitters' | 'custom';
type BulkMediaFilter = 'all' | 'has_image' | 'has_audio';

const RATING_LABELS = ['ممتاز', 'جيد جداً', 'جيد', 'يحتاج تحسين', 'إعادة المحاولة'];

export const BatchCorrectionModal: React.FC<BatchCorrectionModalProps> = ({
  isOpen,
  onClose,
  submissions,
  markingConfig,
  webhookUrl,
  teacherName,
  homeLogoUrl,
  initialMode = 'bulk',
  onCorrectionsUpdated,
  onCorrectionsCleared,
}) => {
  const [workspaceMode, setWorkspaceMode] = useState<'queue' | 'bulk' | 'sheet'>(initialMode);
  const [onlyPendingQueue, setOnlyPendingQueue] = useState(false);

  const videoScopedSubmissions = useMemo(() => {
    const vids = submissions.filter((s) => s.exerciseType === 'video');
    return vids.length > 0 ? vids : submissions;
  }, [submissions]);

  const presetTexts = useMemo(
    () =>
      markingConfig.presetTexts && markingConfig.presetTexts.length > 0
        ? markingConfig.presetTexts
        : DEFAULT_MARKING_PRESETS,
    [markingConfig.presetTexts]
  );

  const stickersList = useMemo(
    () =>
      markingConfig.stickers && markingConfig.stickers.length > 0
        ? markingConfig.stickers
        : DEFAULT_MARKING_STICKERS,
    [markingConfig.stickers]
  );

  // ====== QUEUE MODE STATE ======
  const queueItems = useMemo(() => {
    if (!onlyPendingQueue) return videoScopedSubmissions;
    const pending = videoScopedSubmissions.filter(
      (s) => !s.correction || s.correction.status !== 'corrected'
    );
    return pending.length > 0 ? pending : videoScopedSubmissions;
  }, [videoScopedSubmissions, onlyPendingQueue]);

  const [activeIndex, setActiveIndex] = useState(0);
  const currentItem = queueItems[activeIndex] || queueItems[0] || null;
  const queueBlackboardRef = useRef<MarkingBlackboardHandle | null>(null);
  const [qForceShowBoard, setQForceShowBoard] = useState(false);

  const [qStatus, setQStatus] = useState<MarkingStatus>('corrected');
  const [qScore, setQScore] = useState<string>('95');
  const [qRating, setQRating] = useState<string>('ممتاز');
  const [qNotes, setQNotes] = useState<string>('');
  const [qStickerSymbol, setQStickerSymbol] = useState<string>('');
  const [qStickerLabel, setQStickerLabel] = useState<string>('');
  const [qTeacherAudioB64, setQTeacherAudioB64] = useState<string | null>(null);
  const [qTeacherVideoUrl, setQTeacherVideoUrl] = useState<string>('');
  const [qAllowRetry, setQAllowRetry] = useState(false);
  const [qSendTelegram, setQSendTelegram] = useState(true);
  const [qSaving, setQSaving] = useState(false);
  const [qFeedback, setQFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ====== BULK LESSON BROADCAST STATE ======
  const lessonOptions = useMemo(() => {
    const set = new Set<string>();
    videoScopedSubmissions.forEach((s) => {
      if (s.itemTitle) set.add(s.itemTitle);
    });
    return Array.from(set);
  }, [videoScopedSubmissions]);

  const [selectedLesson, setSelectedLesson] = useState<string>('');
  const [audienceMode, setAudienceMode] = useState<BulkAudienceMode>('corrected_only');
  const [bulkMediaFilter, setBulkMediaFilter] = useState<BulkMediaFilter>('all');
  const [customSelectedKeys, setCustomSelectedKeys] = useState<Set<string>>(() => new Set());

  const [bStatus, setBStatus] = useState<MarkingStatus>('corrected');
  const [bScore, setBScore] = useState<string>('');
  const [bRating, setBRating] = useState<string>('ممتاز');
  const [bNotes, setBNotes] = useState<string>('');
  const [bStickerSymbol, setBStickerSymbol] = useState<string>('');
  const [bStickerLabel, setBStickerLabel] = useState<string>('');
  const [bAllowRetry, setBAllowRetry] = useState(false);
  const [bSendTelegram, setBSendTelegram] = useState(true);

  // Multi-media attachments (1 or MORE of each)
  const [batchImageBase64s, setBatchImageBase64s] = useState<string[]>([]);
  const [batchStitchImages, setBatchStitchImages] = useState<boolean>(true);
  const [batchImageUrls, setBatchImageUrls] = useState<string[]>([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState('');

  const [batchAudioClips, setBatchAudioClips] = useState<
    Array<{ id: string; blobUrl: string; base64: string }>
  >([]);
  const [batchAudioUrls, setBatchAudioUrls] = useState<string[]>([]);
  const [newAudioUrlInput, setNewAudioUrlInput] = useState('');
  const [bAudioRecording, setBAudioRecording] = useState(false);
  const [bAudioSeconds, setBAudioSeconds] = useState(0);
  const bAudioRecorderRef = useRef<MediaRecorder | null>(null);
  const bAudioChunksRef = useRef<Blob[]>([]);
  const bAudioTimerRef = useRef<number | null>(null);

  const [batchVideoUrls, setBatchVideoUrls] = useState<string[]>([]);
  const [newVideoUrlInput, setNewVideoUrlInput] = useState('');

  const [bSaving, setBSaving] = useState(false);
  const [bFeedback, setBFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ====== SHEET MANAGEMENT TAB STATE ======
  const [sheetSearch, setSheetSearch] = useState('');
  const [sheetLesson, setSheetLesson] = useState<string>('all');
  const [sheetStatus, setSheetStatus] = useState<'all' | MarkingStatus>('all');
  const [sheetMedia, setSheetMedia] = useState<BulkMediaFilter>('all');
  const [sheetSelectedKeys, setSheetSelectedKeys] = useState<Set<string>>(() => new Set());
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetFeedback, setSheetFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Quick Inline Edit Modal State
  const [editingItem, setEditingItem] = useState<UnifiedMarkingSubmission | null>(null);
  const [eStatus, setEStatus] = useState<MarkingStatus>('corrected');
  const [eScore, setEScore] = useState<string>('');
  const [eRating, setERating] = useState<string>('ممتاز');
  const [eNotes, setENotes] = useState<string>('');
  const [eStickerSymbol, setEStickerSymbol] = useState<string>('');
  const [eStickerLabel, setEStickerLabel] = useState<string>('');
  const [eClearImage, setEClearImage] = useState(false);
  const [eClearAudio, setEClearAudio] = useState(false);
  const [eClearVideo, setEClearVideo] = useState(false);
  const [eAllowRetry, setEAllowRetry] = useState(false);
  const [eSendTelegram, setESendTelegram] = useState(false);
  const [eSaving, setESaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setWorkspaceMode(initialMode);
    setActiveIndex(0);
    setQFeedback(null);
    setBFeedback(null);
    setSelectedLesson((prev) =>
      prev && lessonOptions.includes(prev) ? prev : lessonOptions[0] || ''
    );
  }, [isOpen, initialMode, lessonOptions]);

  useEffect(() => {
    if (!currentItem) return;
    const c = currentItem.correction;
    setQForceShowBoard(false);
    setQStatus(c?.status || 'corrected');
    setQScore(
      c?.score !== undefined
        ? String(c.score)
        : currentItem.videoScore !== undefined
        ? String(currentItem.videoScore)
        : '95'
    );
    setQRating(c?.ratingLabel || 'ممتاز');
    setQNotes(c?.notes || '');
    setQStickerSymbol(c?.stickerSymbol || '');
    setQStickerLabel(c?.stickerLabel || '');
    setQTeacherAudioB64(null);
    setQTeacherVideoUrl(c?.teacherVideoUrl || '');
    setQAllowRetry(Boolean(c?.allowRetry));
  }, [currentItem?.submissionKey]);

  const lessonSubmissions = useMemo(() => {
    const byLesson = !selectedLesson
      ? videoScopedSubmissions
      : videoScopedSubmissions.filter((s) => s.itemTitle === selectedLesson);
    if (bulkMediaFilter === 'has_image') {
      return byLesson.filter((s) => Boolean(s.studentImageUrl?.trim()));
    }
    if (bulkMediaFilter === 'has_audio') {
      return byLesson.filter((s) => Boolean(s.studentAudioUrl?.trim()));
    }
    return byLesson;
  }, [videoScopedSubmissions, selectedLesson, bulkMediaFilter]);

  const correctedInLesson = useMemo(
    () => lessonSubmissions.filter((s) => s.correction?.status === 'corrected'),
    [lessonSubmissions]
  );

  const uncorrectedCountInLesson = lessonSubmissions.length - correctedInLesson.length;

  useEffect(() => {
    if (isOpen) {
      setCustomSelectedKeys(new Set(lessonSubmissions.map((s) => s.submissionKey)));
    }
  }, [isOpen, selectedLesson, bulkMediaFilter, lessonSubmissions.length]);

  const targetRecipients = useMemo(() => {
    if (audienceMode === 'corrected_only') {
      // Strictly ONLY students already corrected for this lesson
      return correctedInLesson;
    }
    if (audienceMode === 'all_submitters') {
      return lessonSubmissions;
    }
    return lessonSubmissions.filter((s) => customSelectedKeys.has(s.submissionKey));
  }, [audienceMode, correctedInLesson, lessonSubmissions, customSelectedKeys]);

  const sheetFilteredSubmissions = useMemo(() => {
    const q = sheetSearch.trim().toLowerCase();
    return videoScopedSubmissions.filter((s) => {
      if (sheetLesson !== 'all' && s.itemTitle !== sheetLesson) return false;
      const st: MarkingStatus = s.correction?.status || 'pending';
      if (sheetStatus !== 'all' && st !== sheetStatus) return false;
      if (sheetMedia === 'has_image' && !s.studentImageUrl?.trim()) return false;
      if (sheetMedia === 'has_audio' && !s.studentAudioUrl?.trim()) return false;
      if (q) {
        const hay = `${s.studentName} ${s.studentId} ${s.itemTitle} ${s.correction?.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [videoScopedSubmissions, sheetLesson, sheetStatus, sheetMedia, sheetSearch]);

  if (!isOpen) return null;

  const handleSaveQueueItem = async (advanceNext: boolean) => {
    if (!currentItem || qSaving) return;
    setQSaving(true);
    setQFeedback(null);
    try {
      let annotatedBase64: string | undefined;
      const showBoard = Boolean(currentItem.studentImageUrl?.trim()) || qForceShowBoard;
      if (showBoard && queueBlackboardRef.current?.hasAnnotations()) {
        const exported = await queueBlackboardRef.current.exportWatermarkedDataUrl(
          markingConfig.watermark,
          {
            studentId: currentItem.studentId,
            studentName: currentItem.studentName,
            lessonTitle: currentItem.itemTitle,
          },
          homeLogoUrl
        );
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
        stickerSymbol: qStickerSymbol || undefined,
        stickerLabel: qStickerLabel || undefined,
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

  const startBatchAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      bAudioChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) bAudioChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(bAudioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setBatchAudioClips((prev) => [
              ...prev,
              { id: `b-aud-${Date.now()}`, blobUrl, base64: reader.result as string },
            ]);
          }
        };
        reader.readAsDataURL(blob);
      };
      bAudioRecorderRef.current = mr;
      mr.start();
      setBAudioRecording(true);
      setBAudioSeconds(0);
      bAudioTimerRef.current = window.setInterval(() => setBAudioSeconds((s) => s + 1), 1000);
    } catch {
      setBFeedback({ type: 'err', text: 'تعذر الوصول للميكروفون لتسجيل مقطع صوتي.' });
    }
  };

  const stopBatchAudioRecording = () => {
    if (bAudioTimerRef.current) {
      window.clearInterval(bAudioTimerRef.current);
      bAudioTimerRef.current = null;
    }
    if (bAudioRecorderRef.current && bAudioRecorderRef.current.state !== 'inactive') {
      bAudioRecorderRef.current.stop();
    }
    setBAudioRecording(false);
  };

  const toggleCustomKey = (key: string) => {
    setCustomSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSaveBulkBatch = async () => {
    if (targetRecipients.length === 0 || bSaving) return;
    setBSaving(true);
    setBFeedback(null);
    try {
      let preparedImages: string[] | undefined;
      if (batchImageBase64s.length > 1 && batchStitchImages) {
        const stitched = await combineImagesToSingleBase64(batchImageBase64s);
        preparedImages = stitched ? [stitched] : batchImageBase64s;
      } else if (batchImageBase64s.length > 0) {
        preparedImages = batchImageBase64s;
      }

      const res = await saveMarkingBatchToSheets(webhookUrl, {
        teacherName,
        sharedAdditionalImages: batchImageUrls.length > 0 ? batchImageUrls : undefined,
        sharedAdditionalImagesBase64: preparedImages,
        sharedTeacherAudios: batchAudioUrls.length > 0 ? batchAudioUrls : undefined,
        sharedTeacherAudiosBase64:
          batchAudioClips.length > 0 ? batchAudioClips.map((c) => c.base64) : undefined,
        sharedTeacherVideos: batchVideoUrls.length > 0 ? batchVideoUrls : undefined,
        sharedTeacherVideoUrl: batchVideoUrls[0] || undefined,
        sharedStickerSymbol: bStickerSymbol || undefined,
        sharedStickerLabel: bStickerLabel || undefined,
        items: targetRecipients.map((p) => {
          const finalScore =
            bScore.trim() !== ''
              ? Number(bScore)
              : p.correction?.score !== undefined
              ? p.correction.score
              : p.videoScore;
          const finalNotes = bNotes.trim() || p.correction?.notes || '';
          return {
            submissionKey: p.submissionKey,
            exerciseType: p.exerciseType,
            studentId: p.studentId,
            studentName: p.studentName,
            lessonSubject: p.lessonSubject,
            itemTitle: p.itemTitle,
            status: bStatus,
            score: finalScore,
            ratingLabel: bRating || p.correction?.ratingLabel,
            notes: finalNotes,
            stickerSymbol: bStickerSymbol || p.correction?.stickerSymbol,
            stickerLabel: bStickerLabel || p.correction?.stickerLabel,
            allowRetry: bAllowRetry || bStatus === 'retry',
            sendTelegram: bSendTelegram,
          };
        }),
      });

      if (res.success && res.corrections) {
        onCorrectionsUpdated(res.corrections);
        setBatchAudioClips([]);
        setBatchImageBase64s([]);
        setBFeedback({
          type: 'ok',
          text: `تم حفظ وإرسال التصحيح الجماعي لـ ${res.count || targetRecipients.length} طالب${
            audienceMode === 'corrected_only' ? ' (الذين تم تصحيحهم فقط)' : ''
          }، وتم إرسال ${res.telegramSentCount || 0} إشعار عبر تيليغرام.`,
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

  const openQuickEditModal = (item: UnifiedMarkingSubmission) => {
    const c = item.correction;
    setEditingItem(item);
    setEStatus(c?.status || 'corrected');
    setEScore(
      c?.score !== undefined
        ? String(c.score)
        : item.videoScore !== undefined
        ? String(item.videoScore)
        : ''
    );
    setERating(c?.ratingLabel || 'ممتاز');
    setENotes(c?.notes || '');
    setEStickerSymbol(c?.stickerSymbol || '');
    setEStickerLabel(c?.stickerLabel || '');
    setEClearImage(false);
    setEClearAudio(false);
    setEClearVideo(false);
    setEAllowRetry(Boolean(c?.allowRetry));
    setESendTelegram(false);
  };

  const handleSaveQuickEdit = async () => {
    if (!editingItem || eSaving) return;
    setESaving(true);
    setSheetFeedback(null);
    try {
      const c = editingItem.correction;
      const res = await saveMarkingCorrectionToSheets(webhookUrl, {
        submissionKey: editingItem.submissionKey,
        exerciseType: editingItem.exerciseType,
        studentId: editingItem.studentId,
        studentName: editingItem.studentName,
        lessonSubject: editingItem.lessonSubject,
        itemTitle: editingItem.itemTitle,
        status: eStatus,
        score: eScore.trim() !== '' ? Number(eScore) : undefined,
        ratingLabel: eRating,
        notes: eNotes.trim(),
        correctedImageUrl: eClearImage ? '' : c?.correctedImageUrl,
        additionalImages: eClearImage ? [] : c?.additionalImages,
        teacherAudioUrl: eClearAudio ? '' : c?.teacherAudioUrl,
        teacherAudios: eClearAudio ? [] : c?.teacherAudios,
        teacherVideoUrl: eClearVideo ? '' : c?.teacherVideoUrl,
        teacherVideos: eClearVideo ? [] : c?.teacherVideos,
        stickerSymbol: eStickerSymbol || undefined,
        stickerLabel: eStickerLabel || undefined,
        allowRetry: eAllowRetry || eStatus === 'retry',
        sendTelegram: eSendTelegram,
        teacherName,
      });

      if (res.success && res.correction) {
        onCorrectionsUpdated([res.correction]);
        setSheetFeedback({
          type: 'ok',
          text: `تم تحديث تصحيح الطالب ${editingItem.studentName} بنجاح.`,
        });
        setEditingItem(null);
      } else {
        setSheetFeedback({
          type: 'err',
          text: res.error || 'تعذر تحديث بيانات التصحيح.',
        });
      }
    } finally {
      setESaving(false);
    }
  };

  const handleClearSingleRow = async (item: UnifiedMarkingSubmission) => {
    if (sheetBusy) return;
    setSheetBusy(true);
    setSheetFeedback(null);
    try {
      const res = await clearMarkingCorrectionToSheets(webhookUrl, item.submissionKey);
      if (res.success) {
        onCorrectionsCleared?.([item.submissionKey]);
        setSheetSelectedKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.submissionKey);
          return next;
        });
        setSheetFeedback({
          type: 'ok',
          text: `تم تصفير وحذف سجل التصحيح لـ ${item.studentName} من الشيت.`,
        });
      } else {
        setSheetFeedback({
          type: 'err',
          text: res.error || 'تعذر مسح التصحيح من الشيت.',
        });
      }
    } finally {
      setSheetBusy(false);
    }
  };

  const handleClearSelectedRows = async () => {
    const keys = Array.from(sheetSelectedKeys);
    if (keys.length === 0 || sheetBusy) return;
    setSheetBusy(true);
    setSheetFeedback(null);
    try {
      const res = await clearMarkingBatchToSheets(webhookUrl, keys);
      if (res.success) {
        onCorrectionsCleared?.(keys);
        setSheetSelectedKeys(new Set());
        setSheetFeedback({
          type: 'ok',
          text: `تم مسح وتصفير ${res.count || keys.length} تصحيحاً من جدول التصحيحات بنجاح.`,
        });
      } else {
        setSheetFeedback({
          type: 'err',
          text: res.error || 'تعذر مسح التصحيحات المحددة.',
        });
      }
    } finally {
      setSheetBusy(false);
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
                نافذة التصحيح الجماعي للدرس والطابور السريع
              </h2>
              <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                <span>دروس الفيديو: {lessonOptions.length}</span>
                <span>·</span>
                <span>المعلم: {teacherName}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setWorkspaceMode('bulk')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  workspaceMode === 'bulk'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>تصحيح وإرسال جماعي ({targetRecipients.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  workspaceMode === 'queue'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                طابور التصحيح المتسلسل
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('sheet')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  workspaceMode === 'sheet'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>جدول إدارة التصحيحات</span>
              </button>
            </div>

            {workspaceMode === 'queue' && (
              <button
                type="button"
                onClick={() => setOnlyPendingQueue((p) => !p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  onlyPendingQueue
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                {onlyPendingQueue ? 'غير المصحح فقط' : 'جميع التسليمات'}
              </button>
            )}

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
        {videoScopedSubmissions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div className="text-sm font-bold text-slate-800">
              لا توجد تسليمات متاحة في دروس الفيديو التفاعلي.
            </div>
          </div>
        ) : workspaceMode === 'queue' ? (
          /* ================================================================
             MODE 1: RAPID SEQUENTIAL QUEUE WORKSPACE
             ================================================================ */
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
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
                        <div className="text-[11px] text-slate-500 truncate">{item.itemTitle}</div>
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

            {currentItem && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {currentItem.studentName} ({currentItem.studentId || 'بدون ID'})
                    </div>
                    <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
                      <span>{currentItem.itemTitle}</span>
                      {currentItem.videoScore !== undefined && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 font-bold tabular-nums">
                            نتيجة أسئلة الفيديو: {currentItem.videoScore}%
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

                {Boolean(currentItem.studentImageUrl?.trim()) || qForceShowBoard ? (
                  <MarkingBlackboard
                    ref={queueBlackboardRef}
                    studentImageUrl={currentItem.studentImageUrl}
                    previousCorrectedImageUrl={currentItem.correction?.correctedImageUrl}
                    studentAudioUrl={currentItem.studentAudioUrl}
                    studentName={currentItem.studentName}
                    referenceImageUrl={currentItem.referenceImageUrl}
                    lessonTitle={currentItem.itemTitle}
                    stickers={stickersList}
                    presetTexts={presetTexts}
                    compact
                  />
                ) : (
                  <div className="px-4 py-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-indigo-950">
                      تسليم صوتي فقط — تم إخفاء السبورة تلقائياً.
                    </span>
                    <button
                      type="button"
                      onClick={() => setQForceShowBoard(true)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-900 font-bold cursor-pointer"
                    >
                      إظهار السبورة
                    </button>
                  </div>
                )}

                <MarkingAudioStudio
                  studentAudioUrl={currentItem.studentAudioUrl}
                  studentName={currentItem.studentName}
                  referenceAudioUrl={currentItem.referenceAudioUrl}
                  referenceAutoReadText={currentItem.referenceAutoReadText || currentItem.itemTitle}
                  existingTeacherAudioUrl={currentItem.correction?.teacherAudioUrl}
                  onTeacherAudioRecorded={setQTeacherAudioB64}
                />

                <MarkingVideoRecorder
                  markingConfig={markingConfig}
                  webhookUrl={webhookUrl}
                  existingVideoUrl={qTeacherVideoUrl}
                  onRemoveExistingVideo={() => setQTeacherVideoUrl('')}
                  onVideoUploaded={setQTeacherVideoUrl}
                />

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

                  {/* Stickers */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {stickersList.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          if (qStickerSymbol === st.symbol) {
                            setQStickerSymbol('');
                            setQStickerLabel('');
                          } else {
                            setQStickerSymbol(st.symbol);
                            setQStickerLabel(st.label);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                          qStickerSymbol === st.symbol
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <span>{st.symbol}</span>
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-1 mb-1">
                      {presetTexts.slice(0, 4).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setQNotes((prev) => (prev ? `${prev}\n${preset.text}` : preset.text))
                          }
                          className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-[10px] font-bold text-slate-700 cursor-pointer"
                        >
                          + {preset.text.slice(0, 28)}
                        </button>
                      ))}
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
                        <span>فتح محاولة جديدة</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={qSendTelegram}
                          onChange={(e) => setQSendTelegram(e.target.checked)}
                          className="accent-sky-600"
                        />
                        <Send className="w-3.5 h-3.5 text-sky-600" />
                        <span>إشعار تيليغرام</span>
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
                        <span>حفظ والانتقال للتالي</span>
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
        ) : workspaceMode === 'bulk' ? (
          /* ================================================================
             MODE 2: LESSON-SCOPED BULK MULTI-MEDIA CORRECTION & BROADCAST
             ================================================================ */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Step 1: Select Lesson, Media Filter & Strict Audience Targeting */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                <div className="md:col-span-4">
                  <label className="block text-xs font-extrabold text-slate-900 mb-1.5">
                    1. اختر درس الفيديو التفاعلي المستهدف:
                  </label>
                  <select
                    value={selectedLesson}
                    onChange={(e) => setSelectedLesson(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-extrabold text-slate-900"
                  >
                    {lessonOptions.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-extrabold text-slate-900 mb-1.5">
                    نوع وسائط الواجب:
                  </label>
                  <select
                    value={bulkMediaFilter}
                    onChange={(e) => setBulkMediaFilter(e.target.value as BulkMediaFilter)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                  >
                    <option value="all">الكل (صورة وصوت)</option>
                    <option value="has_image">لديهم واجب صورة</option>
                    <option value="has_audio">لديهم واجب صوتي</option>
                  </select>
                </div>

                <div className="md:col-span-5">
                  <label className="block text-xs font-extrabold text-slate-900 mb-1.5">
                    2. حدد المستلمين بدقة:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAudienceMode('corrected_only')}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-extrabold cursor-pointer text-center whitespace-nowrap ${
                        audienceMode === 'corrected_only'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      المصحّح لهم ({correctedInLesson.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudienceMode('all_submitters')}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-extrabold cursor-pointer text-center whitespace-nowrap ${
                        audienceMode === 'all_submitters'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      كل الدرس ({lessonSubmissions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudienceMode('custom')}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-extrabold cursor-pointer text-center whitespace-nowrap ${
                        audienceMode === 'custom'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      تخصيص ({customSelectedKeys.size})
                    </button>
                  </div>
                </div>
              </div>

              {/* Strict Exclusion Guarantee Notice */}
              {audienceMode === 'corrected_only' && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      وضع «الذين تم تصحيح الدرس لهم فقط»: سيصل هذا التصحيح والوسائط لـ{' '}
                      <strong className="font-mono">{correctedInLesson.length}</strong> طالب تم
                      تصحيحهم، ولن يظهر أو يُرسل إطلاقاً للطلاب غير المصحّحين ({uncorrectedCountInLesson}
                      ).
                    </span>
                  </div>
                </div>
              )}

              {/* Recipients Preview / Custom Selection Table */}
              {targetRecipients.length === 0 && audienceMode !== 'custom' ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {audienceMode === 'corrected_only'
                      ? 'لا يوجد طلاب مصحّحون بعد في هذا الدرس. قم بتصحيح طالب واحد على الأقل أو اختر «كل طلاب الدرس».'
                      : 'لا توجد تسليمات في هذا الدرس.'}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-extrabold text-slate-700">
                    <span>
                      المستلمون الفعليون ({targetRecipients.length} طالب)
                    </span>
                    {audienceMode === 'custom' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (customSelectedKeys.size === lessonSubmissions.length) {
                            setCustomSelectedKeys(new Set());
                          } else {
                            setCustomSelectedKeys(
                              new Set(lessonSubmissions.map((s) => s.submissionKey))
                            );
                          }
                        }}
                        className="text-indigo-700 underline cursor-pointer"
                      >
                        {customSelectedKeys.size === lessonSubmissions.length
                          ? 'إلغاء تحديد الكل'
                          : 'تحديد الكل'}
                      </button>
                    )}
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {(audienceMode === 'custom' ? lessonSubmissions : targetRecipients).map(
                      (item) => {
                        const checked =
                          audienceMode !== 'custom' || customSelectedKeys.has(item.submissionKey);
                        return (
                          <div
                            key={item.submissionKey}
                            onClick={() =>
                              audienceMode === 'custom' && toggleCustomKey(item.submissionKey)
                            }
                            className={`px-3.5 py-2 flex items-center justify-between gap-2 text-xs ${
                              audienceMode === 'custom' ? 'cursor-pointer hover:bg-slate-50' : ''
                            } ${checked ? 'bg-white' : 'bg-slate-50/50 opacity-60'}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {audienceMode === 'custom' &&
                                (checked ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                ))}
                              <span className="font-extrabold text-slate-900 truncate">
                                {item.studentName}
                              </span>
                              {item.studentId && (
                                <span className="text-[11px] font-mono text-slate-400">
                                  #{item.studentId}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-[11px] font-bold">
                              {item.videoScore !== undefined && (
                                <span className="font-mono text-slate-500 tabular-nums">
                                  الاختبار: {item.videoScore}%
                                </span>
                              )}
                              <span
                                className={
                                  item.correction?.status === 'corrected'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }
                              >
                                {item.correction?.status === 'corrected'
                                  ? 'مصحّح ✓'
                                  : 'غير مصحّح'}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Multi-Media Attachments (1 or MORE Images, Audios, Videos) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* A. Camera Capture & Multiple Images (with Auto Watermark + Vertical Stitch) */}
              <div className="space-y-2">
                <MarkingPhotoCapture
                  images={batchImageBase64s}
                  onChangeImages={setBatchImageBase64s}
                  watermarkSettings={markingConfig.watermark}
                  studentInfo={{ lessonTitle: selectedLesson || 'تصحيح جماعي' }}
                  fallbackLogoUrl={homeLogoUrl}
                  stitchOnSave={batchStitchImages}
                  onChangeStitchOnSave={setBatchStitchImages}
                  compact
                  title={`صور الشرح والكاميرا (${batchImageBase64s.length + batchImageUrls.length})`}
                />

                <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      dir="ltr"
                      value={newImageUrlInput}
                      onChange={(e) => setNewImageUrlInput(e.target.value)}
                      placeholder="أو أضف رابط صورة خارجية..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-left"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = newImageUrlInput.trim();
                        if (!clean) return;
                        setBatchImageUrls((p) => [...p, clean]);
                        setNewImageUrlInput('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer shrink-0"
                    >
                      إضافة
                    </button>
                  </div>

                  {batchImageUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {batchImageUrls.map((url, idx) => (
                        <div
                          key={`url-${idx}`}
                          className="relative aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-50"
                        >
                          <img
                            src={url}
                            alt={`رابط ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setBatchImageUrls((p) => p.filter((_, i) => i !== idx))
                            }
                            className="absolute top-1 left-1 p-1 rounded bg-rose-600 text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* B. Multiple Teacher Audios */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-rose-600" />
                    <span>مقاطع صوتية ({batchAudioClips.length + batchAudioUrls.length})</span>
                  </div>
                  {!bAudioRecording ? (
                    <button
                      type="button"
                      onClick={startBatchAudioRecording}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>تسجيل صوت</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopBatchAudioRecording}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-rose-500 text-rose-500" />
                      <span>إيقاف ({bAudioSeconds}ث)</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="url"
                    dir="ltr"
                    value={newAudioUrlInput}
                    onChange={(e) => setNewAudioUrlInput(e.target.value)}
                    placeholder="أو أضف رابط ملف صوتي..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-left"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newAudioUrlInput.trim();
                      if (!clean) return;
                      setBatchAudioUrls((p) => [...p, clean]);
                      setNewAudioUrlInput('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    إضافة
                  </button>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {batchAudioClips.map((clip, idx) => (
                    <div
                      key={clip.id}
                      className="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <span className="text-[10px] font-bold text-slate-600 shrink-0">
                        #{idx + 1}
                      </span>
                      <audio controls src={clip.blobUrl} className="flex-1 h-8 min-w-0" />
                      <button
                        type="button"
                        onClick={() =>
                          setBatchAudioClips((p) => p.filter((c) => c.id !== clip.id))
                        }
                        className="p-1 rounded text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {batchAudioUrls.map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                    >
                      <span className="font-mono text-slate-700 truncate">{url}</span>
                      <button
                        type="button"
                        onClick={() => setBatchAudioUrls((p) => p.filter((_, i) => i !== idx))}
                        className="p-1 rounded text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* C. Multiple Videos List Summary */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-indigo-600" />
                  <span>فيديوهات التصحيح المرفقة ({batchVideoUrls.length})</span>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="url"
                    dir="ltr"
                    value={newVideoUrlInput}
                    onChange={(e) => setNewVideoUrlInput(e.target.value)}
                    placeholder="https://res.cloudinary.com/..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-left"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newVideoUrlInput.trim();
                      if (!clean) return;
                      setBatchVideoUrls((p) => (p.includes(clean) ? p : [...p, clean]));
                      setNewVideoUrlInput('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    إضافة
                  </button>
                </div>

                {batchVideoUrls.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500 font-semibold text-center">
                    استخدم مسجل كاميرا OBS بالأسفل لتسجيل فيديو أو أكثر وإضافته تلقائياً هنا.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {batchVideoUrls.map((vUrl, idx) => (
                      <div
                        key={`${vUrl}-${idx}`}
                        className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                          <span className="text-indigo-900">فيديو #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => setBatchVideoUrls((p) => p.filter((_, i) => i !== idx))}
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <video
                          src={toCloudinaryMp4Url(vUrl)}
                          controls
                          playsInline
                          className="w-full max-h-28 rounded-lg bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Direct OBS / Camera Video Recorder -> appends multiple videos */}
            <MarkingVideoRecorder
              markingConfig={markingConfig}
              webhookUrl={webhookUrl}
              title="تسجيل فيديو جماعي بالكاميرا / OBS (كل فيديو يتم رفعه يُضاف لقائمة الفيديوهات أعلاه)"
              autoClearAfterUpload
              onVideoUploaded={(url) =>
                setBatchVideoUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
              }
            />

            {/* Step 3: Shared Rubric, Big Sticker, Presets & Broadcast */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>البيانات الموحدة المرسلة للمستلمين</span>
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
                    الدرجة (اختياري — اتركه فارغاً للحفاظ على درجة كل طالب):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bScore}
                    onChange={(e) => setBScore(e.target.value)}
                    placeholder="احتفاظ بدرجة الطالب الحالية"
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

              {/* Big Sticker Selector */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sticker className="w-3.5 h-3.5 text-amber-600" />
                  <span>ملصق جماعي مشترك (اختياري):</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {stickersList.map((st) => {
                    const active = bStickerSymbol === st.symbol;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setBStickerSymbol('');
                            setBStickerLabel('');
                          } else {
                            setBStickerSymbol(st.symbol);
                            setBStickerLabel(st.label);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <span className="text-base leading-none">{st.symbol}</span>
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preset Texts & Shared Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  الملاحظة الجماعية (يمكنك الإضافة من النصوص الجاهزة):
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {presetTexts.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setBNotes((p) => (p ? `${p}\n${preset.text}` : preset.text))
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 border border-slate-200 text-[11px] font-bold text-slate-800 cursor-pointer"
                    >
                      + {preset.text}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={bNotes}
                  onChange={(e) => setBNotes(e.target.value)}
                  placeholder="اكتب توجيهاً موحداً يصل لجميع الطلاب المستهدفين في هذا الدرس..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
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
                    <span>فتح محاولة إضافية للمستلمين</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bSendTelegram}
                      onChange={(e) => setBSendTelegram(e.target.checked)}
                      className="accent-sky-600"
                    />
                    <span>إرسال إشعار ووسائط تيليغرام للمستلمين</span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={targetRecipients.length === 0 || bSaving}
                  onClick={handleSaveBulkBatch}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {bSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>اعتماد وإرسال التصحيح الجماعي ({targetRecipients.length})</span>
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
        ) : (
          /* ================================================================
             MODE 3: CORRECTIONS MANAGEMENT TABLE (FILTER, QUICK EDIT, RESET)
             ================================================================ */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Filters & Bulk Actions Toolbar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
                <div className="lg:col-span-4 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sheetSearch}
                    onChange={(e) => setSheetSearch(e.target.value)}
                    placeholder="ابحث باسم الطالب أو رقمه أو الملاحظات..."
                    className="w-full pr-8 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div className="lg:col-span-3">
                  <select
                    value={sheetLesson}
                    onChange={(e) => setSheetLesson(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    <option value="all">كل دروس الفيديو</option>
                    {lessonOptions.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <select
                    value={sheetStatus}
                    onChange={(e) => setSheetStatus(e.target.value as 'all' | MarkingStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    <option value="all">كل الحالات</option>
                    <option value="corrected">مصحّح</option>
                    <option value="retry">إعادة</option>
                    <option value="pending">بانتظار التصحيح</option>
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <select
                    value={sheetMedia}
                    onChange={(e) => setSheetMedia(e.target.value as BulkMediaFilter)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    <option value="all">كل الوسائط ({videoScopedSubmissions.length})</option>
                    <option value="has_image">واجب بصورة</option>
                    <option value="has_audio">واجب بصوت</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-3 text-slate-600 font-bold">
                  <span>المعروض: {sheetFilteredSubmissions.length} سجل</span>
                  <span>·</span>
                  <span className="text-indigo-700">المحدد: {sheetSelectedKeys.size}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const correctedVisible = sheetFilteredSubmissions
                        .filter((s) => Boolean(s.correction))
                        .map((s) => s.submissionKey);
                      if (
                        correctedVisible.length > 0 &&
                        correctedVisible.every((k) => sheetSelectedKeys.has(k))
                      ) {
                        setSheetSelectedKeys(new Set());
                      } else {
                        setSheetSelectedKeys(new Set(correctedVisible));
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    تحديد المصحّحين المعروضين
                  </button>

                  <button
                    type="button"
                    disabled={sheetSelectedKeys.size === 0 || sheetBusy}
                    onClick={handleClearSelectedRows}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-45 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {sheetBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>مسح تصحيحات المحددة ({sheetSelectedKeys.size})</span>
                  </button>
                </div>
              </div>

              {sheetFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    sheetFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {sheetFeedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{sheetFeedback.text}</span>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">تحديد</th>
                      <th className="py-3 px-3">الطالب</th>
                      <th className="py-3 px-3">الدرس</th>
                      <th className="py-3 px-3">تسليم الطالب</th>
                      <th className="py-3 px-3">الحالة والدرجة</th>
                      <th className="py-3 px-3">مرفقات التصحيح</th>
                      <th className="py-3 px-3 text-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheetFilteredSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-bold">
                          لا توجد صفوف مطابقة لخيارات البحث والفلترة.
                        </td>
                      </tr>
                    ) : (
                      sheetFilteredSubmissions.map((row) => {
                        const c = row.correction;
                        const st: MarkingStatus = c?.status || 'pending';
                        const isChecked = sheetSelectedKeys.has(row.submissionKey);
                        return (
                          <tr key={row.submissionKey} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSheetSelectedKeys((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(row.submissionKey)) next.delete(row.submissionKey);
                                    else next.add(row.submissionKey);
                                    return next;
                                  });
                                }}
                                className="accent-indigo-600 w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-extrabold text-slate-900">
                                {row.studentName || row.studentId}
                              </div>
                              {row.studentId && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  #{row.studentId}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-700 max-w-[180px] truncate">
                              {row.itemTitle}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] font-bold text-slate-600">
                              <div className="flex items-center gap-2">
                                {row.studentImageUrl && (
                                  <a
                                    href={row.studentImageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <ImageIcon className="w-3 h-3" />
                                    <span>صورة</span>
                                  </a>
                                )}
                                {row.studentAudioUrl && (
                                  <a
                                    href={row.studentAudioUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-700 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <Mic className="w-3 h-3" />
                                    <span>صوت</span>
                                  </a>
                                )}
                                {!row.studentImageUrl && !row.studentAudioUrl && (
                                  <span className="text-slate-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5 font-extrabold">
                                <span
                                  className={
                                    st === 'corrected'
                                      ? 'text-emerald-700'
                                      : st === 'retry'
                                      ? 'text-amber-700'
                                      : 'text-slate-400'
                                  }
                                >
                                  {st === 'corrected'
                                    ? 'مصحّح ✓'
                                    : st === 'retry'
                                    ? 'إعادة'
                                    : 'جديد'}
                                </span>
                                {c?.score !== undefined && (
                                  <>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-mono text-slate-800 tabular-nums">
                                      {c.score}/100
                                    </span>
                                  </>
                                )}
                              </div>
                              {c?.notes && (
                                <div className="text-[10px] text-slate-500 max-w-[200px] truncate">
                                  {c.notes}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {c ? (
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                                  {c.correctedImageUrl && (
                                    <a
                                      href={c.correctedImageUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      <span>لوحة</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                  {c.teacherAudioUrl && (
                                    <a
                                      href={c.teacherAudioUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-rose-700 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      <span>صوت</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                  {c.teacherVideoUrl && (
                                    <a
                                      href={c.teacherVideoUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-700 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      <span>فيديو</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                  {!c.correctedImageUrl &&
                                    !c.teacherAudioUrl &&
                                    !c.teacherVideoUrl && <span className="text-slate-400">نص فقط</span>}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-left">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openQuickEditModal(row)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-800 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  title="تعديل سريع"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>تعديل</span>
                                </button>
                                {c && (
                                  <button
                                    type="button"
                                    disabled={sheetBusy}
                                    onClick={() => handleClearSingleRow(row)}
                                    className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                    title="مسح وتصفير التصحيح من الشيت"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>مسح</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Inline Edit Modal for Sheet Tab */}
      {editingItem && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 flex items-center justify-center p-4 font-cairo text-right">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  تعديل سريع للتصحيح · {editingItem.studentName}
                </h3>
                <div className="text-[11px] text-slate-500 font-semibold">
                  {editingItem.itemTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحالة:</label>
                <select
                  value={eStatus}
                  onChange={(e) => setEStatus(e.target.value as MarkingStatus)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                >
                  <option value="corrected">مصحّح ومعتمد</option>
                  <option value="retry">إعادة المحاولة</option>
                  <option value="pending">قيد الانتظار</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الدرجة:</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={eScore}
                  onChange={(e) => setEScore(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">التقدير:</label>
                <select
                  value={eRating}
                  onChange={(e) => setERating(e.target.value)}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">الملاحظات:</label>
              <textarea
                rows={3}
                value={eNotes}
                onChange={(e) => setENotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-bold text-slate-700">
              <div className="text-[11px] text-slate-500">تنظيف المرفقات الحالية (اختياري):</div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eClearImage}
                    onChange={(e) => setEClearImage(e.target.checked)}
                    className="accent-rose-600"
                  />
                  <span>حذف الصور المصححة</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eClearAudio}
                    onChange={(e) => setEClearAudio(e.target.checked)}
                    className="accent-rose-600"
                  />
                  <span>حذف صوت المعلم</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eClearVideo}
                    onChange={(e) => setEClearVideo(e.target.checked)}
                    className="accent-rose-600"
                  />
                  <span>حذف فيديو المعلم</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eAllowRetry}
                    onChange={(e) => setEAllowRetry(e.target.checked)}
                    className="accent-amber-600"
                  />
                  <span>محاولة جديدة</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eSendTelegram}
                    onChange={(e) => setESendTelegram(e.target.checked)}
                    className="accent-sky-600"
                  />
                  <span>إشعار تيليغرام</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={eSaving}
                  onClick={handleSaveQuickEdit}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  {eSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
