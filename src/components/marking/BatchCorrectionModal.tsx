import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  CheckSquare,
  Square,
  Send,
  Loader2,
  CheckCircle2,
  Users,
  Layers,
  AlertCircle,
  Image as ImageIcon,
  Mic,
  Trash2,
  Plus,
  Sticker,
  ShieldCheck,
  ClipboardList,
  Search,
  Edit3,
  ExternalLink,
  Link2,
  FileText,
  Upload,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import {
  MarkingConfig,
  MarkingStatus,
  TeacherCorrectionRecord,
  UnifiedMarkingSubmission,
} from '../../types';
import { MarkingPhotoCapture } from './MarkingPhotoCapture';
import { MarkingVideoRecorder, MarkingVideoRecorderHandle } from './MarkingVideoRecorder';
import { CorrectionVideoPlayer } from './CorrectionVideoPlayer';
import { AudioRecorderModal } from './AudioRecorderModal';
import {
  clearMarkingBatchToSheets,
  clearMarkingCorrectionToSheets,
  DEFAULT_MARKING_PRESETS,
  DEFAULT_MARKING_STICKERS,
  saveMarkingBatchToSheets,
  saveMarkingCorrectionToSheets,
  uploadMarkingMediaToDrive,
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
  initialMode?: 'bulk' | 'sheet';
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
  const [workspaceMode, setWorkspaceMode] = useState<'bulk' | 'sheet'>(initialMode);

  const videoScopedSubmissions = useMemo(
    () => submissions.filter((s) => s.exerciseType === 'video'),
    [submissions]
  );

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

  // ====== BULK LESSON BROADCAST STATE ======
  const lessonOptions = useMemo(() => {
    const set = new Set<string>();
    videoScopedSubmissions.forEach((s) => {
      if (s.itemTitle) set.add(s.itemTitle);
    });
    return Array.from(set);
  }, [videoScopedSubmissions]);

  const [selectedLesson, setSelectedLesson] = useState<string>('');
  const [bulkSubTab, setBulkSubTab] = useState<'image' | 'audio'>('image');
  const [audienceMode, setAudienceMode] = useState<BulkAudienceMode>('corrected_only');
  const [customSelectedKeys, setCustomSelectedKeys] = useState<Set<string>>(() => new Set());
  const [recipientsDropdownOpen, setRecipientsDropdownOpen] = useState(false);

  // Scoped Image Bulk State
  const [bImgNotes, setBImgNotes] = useState<string>('');
  const [bImgNotesOpen, setBImgNotesOpen] = useState(false);
  const [bImgStickerSymbol, setBImgStickerSymbol] = useState<string>('');
  const [bImgStickerLabel, setBImgStickerLabel] = useState<string>('');
  const [batchImageBase64s, setBatchImageBase64s] = useState<string[]>([]);
  const [batchStitchImages, setBatchStitchImages] = useState<boolean>(true);
  const [batchImageLinks, setBatchImageLinks] = useState<string[]>([]);
  const [newImageLinkInput, setNewImageLinkInput] = useState('');
  const [uploadingImagePdf, setUploadingImagePdf] = useState(false);
  const [batchVideoUrls, setBatchVideoUrls] = useState<string[]>([]);
  const [newVideoUrlInput, setNewVideoUrlInput] = useState('');

  // Scoped Audio Bulk State
  const [bAudioNotes, setBAudioNotes] = useState<string>('');
  const [bAudioNotesOpen, setBAudioNotesOpen] = useState(false);
  const [bAudioStickerSymbol, setBAudioStickerSymbol] = useState<string>('');
  const [bAudioStickerLabel, setBAudioStickerLabel] = useState<string>('');
  const [batchAudioClips, setBatchAudioClips] = useState<
    Array<{ id: string; blobUrl: string; base64: string; name?: string }>
  >([]);
  const [batchAudioLinks, setBatchAudioLinks] = useState<string[]>([]);
  const [newAudioLinkInput, setNewAudioLinkInput] = useState('');
  const [batchAudioModalOpen, setBatchAudioModalOpen] = useState(false);
  const bulkPdfInputRef = useRef<HTMLInputElement | null>(null);
  const bulkAudioUploadRef = useRef<HTMLInputElement | null>(null);
  const videoRecorderRef = useRef<MarkingVideoRecorderHandle | null>(null);

  const [bAllowRetry, setBAllowRetry] = useState(false);
  const [bSendTelegram, setBSendTelegram] = useState(true);
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
    setRecipientsDropdownOpen(false);
    setBFeedback(null);
    setSelectedLesson((prev) =>
      prev && lessonOptions.includes(prev) ? prev : lessonOptions[0] || ''
    );
  }, [isOpen, initialMode, lessonOptions]);

  const lessonSubmissions = useMemo(() => {
    return !selectedLesson
      ? videoScopedSubmissions
      : videoScopedSubmissions.filter((s) => s.itemTitle === selectedLesson);
  }, [videoScopedSubmissions, selectedLesson]);

  const correctedInLesson = useMemo(
    () =>
      lessonSubmissions.filter((s) =>
        bulkSubTab === 'image'
          ? s.correction?.imageStatus === 'corrected' || s.correction?.status === 'corrected'
          : s.correction?.audioStatus === 'corrected' || s.correction?.status === 'corrected'
      ),
    [lessonSubmissions, bulkSubTab]
  );

  const uncorrectedCountInLesson = lessonSubmissions.length - correctedInLesson.length;

  useEffect(() => {
    if (isOpen) {
      setCustomSelectedKeys(new Set(lessonSubmissions.map((s) => s.submissionKey)));
    }
  }, [isOpen, selectedLesson, lessonSubmissions.length]);

  const targetRecipients = useMemo(() => {
    if (audienceMode === 'corrected_only') {
      return correctedInLesson;
    }
    if (audienceMode === 'all_submitters') {
      return lessonSubmissions;
    }
    return lessonSubmissions.filter((s) => customSelectedKeys.has(s.submissionKey));
  }, [audienceMode, correctedInLesson, lessonSubmissions, customSelectedKeys]);

  const boardPresets = useMemo(() => {
    const filtered = presetTexts.filter((p) => !p.scope || p.scope === 'board' || p.scope === 'both');
    return filtered.length > 0 ? filtered : presetTexts;
  }, [presetTexts]);

  const boardStickers = useMemo(() => {
    const filtered = stickersList.filter((s) => !s.scope || s.scope === 'board' || s.scope === 'both');
    return filtered.length > 0 ? filtered : stickersList;
  }, [stickersList]);

  const audioPresets = useMemo(() => {
    const filtered = presetTexts.filter((p) => p.scope === 'audio' || p.scope === 'both');
    return filtered.length > 0 ? filtered : presetTexts;
  }, [presetTexts]);

  const audioStickers = useMemo(() => {
    const filtered = stickersList.filter((s) => s.scope === 'audio' || s.scope === 'both');
    return filtered.length > 0 ? filtered : stickersList;
  }, [stickersList]);

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

  const toggleCustomKey = (key: string) => {
    setCustomSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleUploadBulkPdfOrImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingImagePdf(true);
    setBFeedback(null);
    try {
      for (const file of files) {
        const b64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : '');
          r.readAsDataURL(file);
        });
        if (!b64) continue;
        const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
        const up = await uploadMarkingMediaToDrive(webhookUrl, {
          mediaType: isPdf ? 'pdf' : 'image',
          base64Data: b64,
          fileName: file.name,
          mimeType: file.type || (isPdf ? 'application/pdf' : 'image/png'),
        });
        if (up.success && up.url) {
          setBatchImageLinks((p) => (p.includes(up.url!) ? p : [...p, up.url!]));
        } else {
          setBFeedback({
            type: 'err',
            text: up.error || `تعذر رفع الملف ${file.name} إلى Google Drive.`,
          });
        }
      }
    } finally {
      setUploadingImagePdf(false);
      e.target.value = '';
    }
  };

  const handleUploadBulkAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const blobUrl = URL.createObjectURL(file);
          setBatchAudioClips((prev) => [
            ...prev,
            {
              id: `b-aud-file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              blobUrl,
              base64: reader.result as string,
              name: file.name,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const executeBulkBatchSend = async (primaryTab: 'image' | 'audio') => {
    if (targetRecipients.length === 0 || bSaving) return;
    setBSaving(true);
    setBFeedback(null);
    try {
      // 1. Ensure any recorded/picked video not yet uploaded finishes uploading now
      let pendingRecordedVideoUrl: string | null = null;
      if (videoRecorderRef.current?.hasPendingRecording()) {
        pendingRecordedVideoUrl = await videoRecorderRef.current.uploadPendingVideo();
        if (!pendingRecordedVideoUrl) {
          setBFeedback({
            type: 'err',
            text: 'تعذر رفع الفيديو المسجّل. تأكد من الاتصال أو من إتمام رفع الفيديو قبل الإرسال.',
          });
          return;
        }
      }

      // 2. Consume typed links even if teacher forgot clicking "+ إضافة"
      const typedVideoUrl = newVideoUrlInput.trim();
      const effectiveVideoUrls = Array.from(
        new Set(
          [...batchVideoUrls, pendingRecordedVideoUrl || '', typedVideoUrl]
            .map((u) => u.trim())
            .filter(Boolean)
        )
      );

      const typedImgLink = newImageLinkInput.trim();
      const effectiveImgLinks = Array.from(
        new Set([...batchImageLinks, typedImgLink].map((u) => u.trim()).filter(Boolean))
      );

      const typedAudLink = newAudioLinkInput.trim();
      const effectiveAudLinks = Array.from(
        new Set([...batchAudioLinks, typedAudLink].map((u) => u.trim()).filter(Boolean))
      );

      // 3. Prepare images (merge if requested)
      let preparedImages: string[] | undefined;
      if (batchImageBase64s.length > 1 && batchStitchImages) {
        const stitched = await combineImagesToSingleBase64(batchImageBase64s);
        preparedImages = stitched ? [stitched] : batchImageBase64s;
      } else if (batchImageBase64s.length > 0) {
        preparedImages = batchImageBase64s;
      }

      // 4. Pre-upload batch audio clips to Drive first so URLs are guaranteed before writing Sheet rows
      const uploadedAudioUrls: string[] = [];
      for (let i = 0; i < batchAudioClips.length; i++) {
        const clip = batchAudioClips[i];
        const upAud = await uploadMarkingMediaToDrive(webhookUrl, {
          mediaType: 'audio',
          mimeType: 'audio/mp3',
          base64Data: clip.base64,
          fileName: clip.name || `batch_audio_${Date.now()}_${i + 1}`,
        });
        if (!upAud.success || !upAud.url) {
          setBFeedback({
            type: 'err',
            text: upAud.error || `تعذر رفع المقطع الصوتي رقم ${i + 1} إلى Google Drive.`,
          });
          return;
        }
        uploadedAudioUrls.push(upAud.url);
      }

      const hasImgSection = Boolean(
        (preparedImages && preparedImages.length > 0) ||
          effectiveImgLinks.length > 0 ||
          bImgNotes.trim() ||
          bImgStickerSymbol
      );
      const hasAudSection = Boolean(
        uploadedAudioUrls.length > 0 ||
          effectiveAudLinks.length > 0 ||
          bAudioNotes.trim() ||
          bAudioStickerSymbol
      );
      const hasVidSection = effectiveVideoUrls.length > 0;

      if (!hasImgSection && !hasAudSection && !hasVidSection) {
        setBFeedback({
          type: 'err',
          text: 'يرجى إضافة صورة أو فيديو أو مقطع صوتي أو ملاحظة قبل الإرسال.',
        });
        return;
      }

      // If both image & audio data are present (or audio tab also has video+image), save everything together!
      const effectiveSaveMode =
        hasImgSection && hasAudSection
          ? 'append_both'
          : hasImgSection
          ? 'append_image'
          : hasAudSection
          ? 'append_audio'
          : primaryTab === 'audio'
          ? 'append_audio'
          : 'append_image';

      const res = await saveMarkingBatchToSheets(webhookUrl, {
        teacherName,
        saveMode: effectiveSaveMode,
        sharedAdditionalImagesBase64: preparedImages,
        sharedImageLinks: effectiveImgLinks.length > 0 ? effectiveImgLinks : undefined,
        sharedTeacherAudios: uploadedAudioUrls.length > 0 ? uploadedAudioUrls : undefined,
        sharedTeacherAudioUrl: uploadedAudioUrls[0] || undefined,
        sharedAudioLinks: effectiveAudLinks.length > 0 ? effectiveAudLinks : undefined,
        sharedTeacherVideos: effectiveVideoUrls.length > 0 ? effectiveVideoUrls : undefined,
        sharedTeacherVideoUrl: effectiveVideoUrls[0] || undefined,
        sharedImageStickerSymbol: bImgStickerSymbol || undefined,
        sharedImageStickerLabel: bImgStickerLabel || undefined,
        sharedAudioStickerSymbol: bAudioStickerSymbol || undefined,
        sharedAudioStickerLabel: bAudioStickerLabel || undefined,
        sharedStickerSymbol:
          primaryTab === 'audio'
            ? bAudioStickerSymbol || bImgStickerSymbol || undefined
            : bImgStickerSymbol || bAudioStickerSymbol || undefined,
        sharedStickerLabel:
          primaryTab === 'audio'
            ? bAudioStickerLabel || bImgStickerLabel || undefined
            : bImgStickerLabel || bAudioStickerLabel || undefined,
        items: targetRecipients.map((p) => {
          const existingImgScore = p.correction?.imageScore ?? p.correction?.score;
          const parsedImgScore =
            existingImgScore !== undefined &&
            String(existingImgScore).trim() !== '' &&
            !Number.isNaN(Number(existingImgScore))
              ? Number(existingImgScore)
              : undefined;
          const preservedImgStatus =
            p.correction?.imageStatus || p.correction?.status || 'corrected';
          const preservedImgRating =
            p.correction?.imageRatingLabel || p.correction?.ratingLabel;

          const existingAudScore = p.correction?.audioScore ?? p.correction?.score;
          const parsedAudScore =
            existingAudScore !== undefined &&
            String(existingAudScore).trim() !== '' &&
            !Number.isNaN(Number(existingAudScore))
              ? Number(existingAudScore)
              : undefined;
          const preservedAudStatus =
            p.correction?.audioStatus || p.correction?.status || 'corrected';
          const preservedAudRating =
            p.correction?.audioRatingLabel || p.correction?.ratingLabel;

          const finalImgNotes = bImgNotes.trim();
          const finalAudNotes = bAudioNotes.trim();

          return {
            submissionKey: p.submissionKey,
            exerciseType: p.exerciseType,
            studentId: p.studentId,
            studentName: p.studentName,
            lessonSubject: p.lessonSubject,
            itemTitle: p.itemTitle,
            saveMode: effectiveSaveMode,
            status:
              bAllowRetry || preservedImgStatus === 'retry' || preservedAudStatus === 'retry'
                ? 'retry'
                : 'corrected',
            score: primaryTab === 'audio' ? parsedAudScore : parsedImgScore,
            ratingLabel: primaryTab === 'audio' ? preservedAudRating : preservedImgRating,
            notes: primaryTab === 'audio' ? finalAudNotes : finalImgNotes,
            imageStatus: hasImgSection || hasVidSection ? preservedImgStatus : undefined,
            imageScore: parsedImgScore,
            imageRatingLabel: preservedImgRating,
            imageNotes: finalImgNotes,
            imageStickerSymbol: bImgStickerSymbol || undefined,
            imageStickerLabel: bImgStickerLabel || undefined,
            audioStatus: hasAudSection ? preservedAudStatus : undefined,
            audioScore: parsedAudScore,
            audioRatingLabel: preservedAudRating,
            audioNotes: finalAudNotes,
            audioStickerSymbol: bAudioStickerSymbol || undefined,
            audioStickerLabel: bAudioStickerLabel || undefined,
            allowRetry:
              bAllowRetry ||
              preservedImgStatus === 'retry' ||
              preservedAudStatus === 'retry',
            sendTelegram: bSendTelegram,
          };
        }),
      });

      if (res.success && res.corrections) {
        onCorrectionsUpdated(res.corrections);
        setBatchImageBase64s([]);
        setBatchImageLinks([]);
        setBatchVideoUrls([]);
        setBatchAudioClips([]);
        setBatchAudioLinks([]);
        setNewImageLinkInput('');
        setNewVideoUrlInput('');
        setNewAudioLinkInput('');
        const sentSummaryParts: string[] = [];
        if (preparedImages?.length || effectiveImgLinks.length) sentSummaryParts.push('الصور');
        if (effectiveVideoUrls.length) sentSummaryParts.push(`الفيديو (${effectiveVideoUrls.length})`);
        if (uploadedAudioUrls.length || effectiveAudLinks.length) {
          sentSummaryParts.push(`الصوت (${uploadedAudioUrls.length + effectiveAudLinks.length})`);
        }
        setBFeedback({
          type: 'ok',
          text: `تم إرسال التصحيح الجماعي (${
            sentSummaryParts.join(' + ') || 'الملاحظات'
          }) وحفظ الروابط في الشيت لـ ${
            res.count || targetRecipients.length
          } طالب بنجاح (${res.telegramSentCount || 0} إشعار تيليغرام).`,
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

  const handleSaveBulkImageBatch = () => executeBulkBatchSend('image');
  const handleSaveBulkAudioBatch = () => executeBulkBatchSend('audio');

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
        imageStatus: eClearImage ? undefined : c?.imageStatus,
        imageScore: eClearImage ? undefined : c?.imageScore,
        imageRatingLabel: eClearImage ? undefined : c?.imageRatingLabel,
        imageNotes: eClearImage ? '' : c?.imageNotes,
        imageStickerSymbol: eClearImage ? '' : c?.imageStickerSymbol,
        imageStickerLabel: eClearImage ? '' : c?.imageStickerLabel,
        imageLinks: eClearImage ? [] : c?.imageLinks,
        correctedImageUrl: eClearImage ? '' : c?.correctedImageUrl,
        additionalImages: eClearImage ? [] : c?.additionalImages,
        audioStatus: eClearAudio ? undefined : c?.audioStatus,
        audioScore: eClearAudio ? undefined : c?.audioScore,
        audioRatingLabel: eClearAudio ? undefined : c?.audioRatingLabel,
        audioNotes: eClearAudio ? '' : c?.audioNotes,
        audioStickerSymbol: eClearAudio ? '' : c?.audioStickerSymbol,
        audioStickerLabel: eClearAudio ? '' : c?.audioStickerLabel,
        audioLinks: eClearAudio ? [] : c?.audioLinks,
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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[110] bg-slate-950/75 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-2 sm:p-4 font-cairo"
    >
      <div className="my-auto bg-slate-50 rounded-3xl w-full max-w-7xl max-h-[calc(100dvh-16px)] sm:h-[92dvh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-right">
        {/* Top Modal Header */}
        <header className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                نافذة التصحيح الجماعي وإدارة التصحيحات
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
        ) : workspaceMode === 'bulk' ? (
          /* ================================================================
             MODE 1: SEPARATED IMAGE & AUDIO LESSON-SCOPED BULK CORRECTION
             ================================================================ */
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
            <input
              ref={bulkPdfInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              className="hidden"
              onChange={handleUploadBulkPdfOrImage}
            />
            <input
              ref={bulkAudioUploadRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={handleUploadBulkAudioFile}
            />

            {/* Step 1: Lesson Dropdown, 2 Sub-Tabs (تصحيح واجب الصورة | تصحيح واجب الصوت) & Audience */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                <div className="md:col-span-5">
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

                <div className="md:col-span-7">
                  <label className="block text-xs font-extrabold text-slate-900 mb-1.5">
                    2. حدد نوع التصحيح الجماعي:
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkSubTab('image');
                        setBFeedback(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        bulkSubTab === 'image'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 shrink-0" />
                      <span>تصحيح واجب الصورة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBulkSubTab('audio');
                        setBFeedback(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        bulkSubTab === 'audio'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <Mic className="w-4 h-4 shrink-0" />
                      <span>تصحيح واجب الصوت</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Audience Targeting */}
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-slate-900">
                  3. حدد الطلاب المستلمين للرسالة والوسائط:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAudienceMode('corrected_only')}
                    className={`px-3 py-2 rounded-xl border text-xs font-extrabold cursor-pointer text-center whitespace-nowrap ${
                      audienceMode === 'corrected_only'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    المصحّح لهم بالدرس ({correctedInLesson.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudienceMode('all_submitters')}
                    className={`px-3 py-2 rounded-xl border text-xs font-extrabold cursor-pointer text-center whitespace-nowrap ${
                      audienceMode === 'all_submitters'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    كل طلاب الدرس يشمل غير المصحّح ({lessonSubmissions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudienceMode('custom')}
                    className={`px-3 py-2 rounded-xl border text-xs font-extrabold cursor-pointer text-center whitespace-nowrap ${
                      audienceMode === 'custom'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    تخصيص طلاب ({customSelectedKeys.size})
                  </button>
                </div>
              </div>

              {/* Strict Exclusion Guarantee Notice */}
              {audienceMode === 'corrected_only' && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      وضع «المصحّح لهم فقط»: سيُضاف هذا الشرح والمرفقات لـ{' '}
                      <strong className="font-mono">{correctedInLesson.length}</strong> طالب تم
                      تصحيحهم، ولن يظهر للطلاب غير المصحّحين ({uncorrectedCountInLesson})، مع الحفاظ
                      التام على درجاتهم السابقة.
                    </span>
                  </div>
                </div>
              )}

              {/* Recipients List / Custom Picker (Collapsible Dropdown) */}
              {targetRecipients.length === 0 && audienceMode !== 'custom' ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {audienceMode === 'corrected_only'
                      ? 'لا يوجد طلاب مصحّحون بعد في هذا الدرس. اختر «كل طلاب الدرس» أو «تخصيص طلاب».'
                      : 'لا توجد تسليمات في هذا الدرس.'}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <div className="px-3.5 py-2.5 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-800">
                    <button
                      type="button"
                      onClick={() => setRecipientsDropdownOpen((o) => !o)}
                      className="flex-1 flex items-center justify-between gap-2 cursor-pointer text-right"
                    >
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>قائمة الطلاب المستلمون ({targetRecipients.length} طالب)</span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 transition-transform ${
                          recipientsDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {recipientsDropdownOpen && audienceMode === 'custom' && (
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
                        className="text-[11px] text-indigo-700 underline cursor-pointer shrink-0"
                      >
                        {customSelectedKeys.size === lessonSubmissions.length
                          ? 'إلغاء تحديد الكل'
                          : 'تحديد الكل'}
                      </button>
                    )}
                  </div>

                  {recipientsDropdownOpen && (
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border-t border-slate-200">
                      {(audienceMode === 'custom' ? lessonSubmissions : targetRecipients).map(
                        (item) => {
                          const checked =
                            audienceMode !== 'custom' || customSelectedKeys.has(item.submissionKey);
                          const isGraded =
                            bulkSubTab === 'image'
                              ? item.correction?.imageStatus === 'corrected' ||
                                item.correction?.status === 'corrected'
                              : item.correction?.audioStatus === 'corrected' ||
                                item.correction?.status === 'corrected';
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
                                <span className={isGraded ? 'text-emerald-700' : 'text-amber-700'}>
                                  {isGraded ? 'مصحّح ✓' : 'غير مصحّح'}
                                </span>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {bulkSubTab === 'image' ? (
              /* ============================================================
                 SUB-TAB 1: IMAGE CORRECTION BROADCAST (append_image)
                 ============================================================ */
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Camera Photo Capture + Multi Image Upload */}
                  <MarkingPhotoCapture
                    images={batchImageBase64s}
                    onChangeImages={setBatchImageBase64s}
                    watermarkSettings={markingConfig.watermark}
                    studentInfo={{ lessonTitle: selectedLesson || 'تصحيح جماعي' }}
                    fallbackLogoUrl={homeLogoUrl}
                    stitchOnSave={batchStitchImages}
                    onChangeStitchOnSave={setBatchStitchImages}
                    compact
                    title={`التقاط صورة بالكاميرا أو رفع صور (${batchImageBase64s.length})`}
                  />

                  {/* Multi-Link Adder + PDF/Image Upload to Drive */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4 text-emerald-600" />
                        <span>روابط خارجية وملفات PDF ({batchImageLinks.length})</span>
                      </div>

                      <button
                        type="button"
                        disabled={uploadingImagePdf}
                        onClick={() => bulkPdfInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {uploadingImagePdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>رفع PDF أو صورة لـ Drive</span>
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        dir="ltr"
                        value={newImageLinkInput}
                        onChange={(e) => setNewImageLinkInput(e.target.value)}
                        placeholder="أضف رابط يوتيوب، جوجل درايف، PDF أو صورة..."
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-left"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = newImageLinkInput.trim();
                          if (!clean) return;
                          setBatchImageLinks((p) => (p.includes(clean) ? p : [...p, clean]));
                          setNewImageLinkInput('');
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة رابط</span>
                      </button>
                    </div>

                    {batchImageLinks.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500 font-semibold text-center">
                        أضف رابطاً أو ارفع ملف PDF ليصل مباشرة داخل صفحة الطالب.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {batchImageLinks.map((lnk, idx) => (
                          <div
                            key={`${lnk}-${idx}`}
                            className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <a
                                href={lnk}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-indigo-700 underline truncate"
                              >
                                {lnk}
                              </a>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setBatchImageLinks((p) => p.filter((_, i) => i !== idx))
                              }
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                              title="حذف الرابط"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Video Recorder (Cloudinary / Drive) + Extra Video URLs */}
                <div className="space-y-2">
                  <MarkingVideoRecorder
                    ref={videoRecorderRef}
                    markingConfig={markingConfig}
                    webhookUrl={webhookUrl}
                    title="تسجيل فيديو شرح للواجب المصوّر بالكاميرا / OBS"
                    autoClearAfterUpload
                    autoUploadOnStop
                    onVideoUploaded={(url) =>
                      setBatchVideoUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
                    }
                  />

                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2">
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        dir="ltr"
                        value={newVideoUrlInput}
                        onChange={(e) => setNewVideoUrlInput(e.target.value)}
                        placeholder="أو أضف رابط فيديو جاهز (Cloudinary / YouTube / Drive)..."
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-left"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = newVideoUrlInput.trim();
                          if (!clean) return;
                          setBatchVideoUrls((p) => (p.includes(clean) ? p : [...p, clean]));
                          setNewVideoUrlInput('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        إضافة فيديو
                      </button>
                    </div>

                    {batchVideoUrls.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {batchVideoUrls.map((vUrl, idx) => (
                          <CorrectionVideoPlayer
                            key={`${vUrl}-${idx}`}
                            url={vUrl}
                            label={`فيديو #${idx + 1}`}
                            compact
                            onRemove={() =>
                              setBatchVideoUrls((p) => p.filter((_, i) => i !== idx))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Notes & Broadcast Footer */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setBImgNotesOpen((o) => !o)}
                      className={`px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-colors ${
                        bImgNotesOpen
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>ملاحظات</span>
                      {(bImgNotes.trim() || bImgStickerSymbol) && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]">
                          {bImgStickerSymbol ? bImgStickerSymbol : '✓'}
                        </span>
                      )}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          bImgNotesOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

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
                        <span>إشعار تيليغرام للمستلمين</span>
                      </label>
                    </div>
                  </div>

                  {bImgNotesOpen && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            نصوص جاهزة:
                          </label>
                          <select
                            value=""
                            onChange={(e) => {
                              const txt = e.target.value;
                              if (!txt) return;
                              setBImgNotes((p) => (p ? `${p}\n${txt}` : txt));
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900"
                          >
                            <option value="">اختر نصاً جاهزاً لإضافته...</option>
                            {boardPresets.map((preset) => (
                              <option key={preset.id} value={preset.text}>
                                {preset.text}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <Sticker className="w-3.5 h-3.5 text-amber-600" />
                            <span>ستيكرات:</span>
                          </label>
                          <select
                            value={bImgStickerSymbol}
                            onChange={(e) => {
                              const sym = e.target.value;
                              if (!sym) {
                                setBImgStickerSymbol('');
                                setBImgStickerLabel('');
                              } else {
                                const found = boardStickers.find((s) => s.symbol === sym);
                                setBImgStickerSymbol(sym);
                                setBImgStickerLabel(found?.label || '');
                              }
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900"
                          >
                            <option value="">بدون ملصق</option>
                            {boardStickers.map((st) => (
                              <option key={st.id} value={st.symbol}>
                                {st.symbol} {st.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          حقل النص (تُدمج مع ملاحظات الطالب السابقة):
                        </label>
                        <textarea
                          rows={3}
                          value={bImgNotes}
                          onChange={(e) => setBImgNotes(e.target.value)}
                          placeholder="اكتب ملاحظة جماعية لصور الدرس..."
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={targetRecipients.length === 0 || bSaving}
                      onClick={handleSaveBulkImageBatch}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {bSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>إرسال تصحيح الصورة الجماعي ({targetRecipients.length})</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ============================================================
                 SUB-TAB 2: AUDIO CORRECTION BROADCAST (append_audio)
                 ============================================================ */
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Audio Mic Recorder + Audio File Upload */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Mic className="w-4 h-4 text-rose-600" />
                        <span>تسجيل أو رفع مقاطع صوتية ({batchAudioClips.length})</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => bulkAudioUploadRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-600" />
                          <span>رفع ملف صوتي</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBatchAudioModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>تسجيل صوت</span>
                        </button>
                      </div>
                    </div>

                    {batchAudioClips.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500 font-semibold text-center">
                        سجّل مقطعاً أو ارفع ملفاً صوتياً (يمكن إضافة أكثر من مقطع).
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {batchAudioClips.map((clip, idx) => (
                          <div
                            key={clip.id}
                            className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200"
                          >
                            <span className="text-[10px] font-bold text-slate-600 shrink-0 tabular-nums">
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
                      </div>
                    )}
                  </div>

                  {/* Multi-Link Adder for Audio (External audio URLs / PDFs / Drive) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Link2 className="w-4 h-4 text-indigo-600" />
                      <span>روابط صوتية أو ملفات PDF خارجية ({batchAudioLinks.length})</span>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        dir="ltr"
                        value={newAudioLinkInput}
                        onChange={(e) => setNewAudioLinkInput(e.target.value)}
                        placeholder="أضف رابط ملف صوتي، يوتيوب، درايف أو PDF..."
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-left"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = newAudioLinkInput.trim();
                          if (!clean) return;
                          setBatchAudioLinks((p) => (p.includes(clean) ? p : [...p, clean]));
                          setNewAudioLinkInput('');
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة رابط</span>
                      </button>
                    </div>

                    {batchAudioLinks.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-500 font-semibold text-center">
                        أضف رابطاً أو أكثر ليصل داخل بطاقة الصوت لدى الطالب.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {batchAudioLinks.map((lnk, idx) => (
                          <div
                            key={`${lnk}-${idx}`}
                            className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                          >
                            <a
                              href={lnk}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-indigo-700 underline truncate"
                            >
                              {lnk}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setBatchAudioLinks((p) => p.filter((_, i) => i !== idx))
                              }
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio Notes & Broadcast Footer */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setBAudioNotesOpen((o) => !o)}
                      className={`px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-colors ${
                        bAudioNotesOpen
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>ملاحظات</span>
                      {(bAudioNotes.trim() || bAudioStickerSymbol) && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]">
                          {bAudioStickerSymbol ? bAudioStickerSymbol : '✓'}
                        </span>
                      )}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          bAudioNotesOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

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
                        <span>إشعار تيليغرام للمستلمين</span>
                      </label>
                    </div>
                  </div>

                  {bAudioNotesOpen && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            نصوص جاهزة:
                          </label>
                          <select
                            value=""
                            onChange={(e) => {
                              const txt = e.target.value;
                              if (!txt) return;
                              setBAudioNotes((p) => (p ? `${p}\n${txt}` : txt));
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900"
                          >
                            <option value="">اختر نصاً جاهزاً لإضافته...</option>
                            {audioPresets.map((preset) => (
                              <option key={preset.id} value={preset.text}>
                                {preset.text}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <Sticker className="w-3.5 h-3.5 text-amber-600" />
                            <span>ستيكرات:</span>
                          </label>
                          <select
                            value={bAudioStickerSymbol}
                            onChange={(e) => {
                              const sym = e.target.value;
                              if (!sym) {
                                setBAudioStickerSymbol('');
                                setBAudioStickerLabel('');
                              } else {
                                const found = audioStickers.find((s) => s.symbol === sym);
                                setBAudioStickerSymbol(sym);
                                setBAudioStickerLabel(found?.label || '');
                              }
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900"
                          >
                            <option value="">بدون ملصق</option>
                            {audioStickers.map((st) => (
                              <option key={st.id} value={st.symbol}>
                                {st.symbol} {st.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          حقل النص (ملاحظات التصحيح الصوتي):
                        </label>
                        <textarea
                          rows={3}
                          value={bAudioNotes}
                          onChange={(e) => setBAudioNotes(e.target.value)}
                          placeholder="اكتب ملاحظة جماعية للتسجيلات الصوتية..."
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={targetRecipients.length === 0 || bSaving}
                      onClick={handleSaveBulkAudioBatch}
                      className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {bSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>إرسال تصحيح الصوت الجماعي ({targetRecipients.length})</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bFeedback && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
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
        ) : (
          /* ================================================================
             MODE 2: CORRECTIONS MANAGEMENT TABLE (FILTER, QUICK EDIT, RESET)
             ================================================================ */
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
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
                                (() => {
                                  const imgUrls = Array.from(
                                    new Set(
                                      [c.correctedImageUrl || '', ...(c.additionalImages || [])].filter(Boolean)
                                    )
                                  );
                                  const audUrls = Array.from(
                                    new Set(
                                      [c.teacherAudioUrl || '', ...(c.teacherAudios || [])].filter(Boolean)
                                    )
                                  );
                                  const vidUrls = Array.from(
                                    new Set(
                                      [c.teacherVideoUrl || '', ...(c.teacherVideos || [])].filter(Boolean)
                                    )
                                  );
                                  const extLinks = [
                                    ...(c.imageLinks || []),
                                    ...(c.audioLinks || []),
                                  ].filter(Boolean);
                                  const hasAny =
                                    imgUrls.length > 0 ||
                                    audUrls.length > 0 ||
                                    vidUrls.length > 0 ||
                                    extLinks.length > 0;
                                  return (
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                                      {imgUrls.length > 0 && (
                                        <a
                                          href={imgUrls[0]}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <span>صور ({imgUrls.length})</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                      {audUrls.length > 0 && (
                                        <a
                                          href={audUrls[0]}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-rose-700 hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <span>صوت ({audUrls.length})</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                      {vidUrls.length > 0 && (
                                        <a
                                          href={vidUrls[0]}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-indigo-700 hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <span>فيديو ({vidUrls.length})</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                      {extLinks.length > 0 && (
                                        <a
                                          href={extLinks[0]}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sky-700 hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <span>روابط ({extLinks.length})</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                      {!hasAny && <span className="text-slate-400">نص فقط</span>}
                                    </div>
                                  );
                                })()
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
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingItem(null);
          }}
          className="fixed inset-0 z-[115] bg-slate-950/75 overflow-y-auto flex items-start sm:items-center justify-center p-3 sm:p-4 font-cairo text-right"
        >
          <div className="my-auto bg-white rounded-2xl max-w-lg w-full max-h-[calc(100dvh-20px)] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 shrink-0">
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

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
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
        </div>
      )}

      <AudioRecorderModal
        isOpen={batchAudioModalOpen}
        onClose={() => setBatchAudioModalOpen(false)}
        title="تسجيل مقطع صوتي للتصحيح الجماعي"
        onAttachAudio={({ blobUrl, base64, name }) => {
          setBatchAudioClips((prev) => [
            ...prev,
            {
              id: `b-aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              blobUrl,
              base64,
              name,
            },
          ]);
        }}
      />
    </div>
  );
};
