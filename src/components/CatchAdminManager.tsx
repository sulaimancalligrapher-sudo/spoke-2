import React, { useEffect, useRef, useState } from 'react';
import { CatchExercise, CatchLessonSubject } from '../types';
import {
  saveCatchExerciseToSheets,
  fetchCatchExercisesFromSheets,
  exportAllCatchCurriculumToSheets,
  fetchCatchARRewardsFromSheet,
  saveCatchARRewardsToSheet,
  uploadAudioToDrive,
  callGoogleSheetsPost,
  DEFAULT_DRIVE_AUDIO_FOLDER_ID,
  DEFAULT_WEBHOOK_URL,
  STORAGE_KEY_CATCH_CURRICULUM,
} from '../utils/googleSheets';
import {
  QuestionBlockType,
  parseQuestionBlocks,
  formatQuestionBlocks,
  getQuestionPlainText,
  getDirectImageUrl,
} from '../utils/matchingMedia';
import {
  detectDictationType,
  getDictationTypeLabel,
  parsePoolEntries,
  parseAnswerWithBlanks,
  generateScrambledFromAnswer,
  formatPoolWithPositionalLabels,
} from '../utils/dictationUtils';
import {
  formatCatchSettingsString,
  getDefaultCatchARIntroReward,
} from '../utils/catchArRewards';
import {
  ARRewardTier,
  AR_INTRO_ID,
  AR_REWARD_PRESETS,
  encodeARRewardsShareParam,
  getDefaultARRewards,
  normalizeARRewardTiers,
  normalizeSingleARReward,
} from '../arWriting/services/arRewardsService';
import { extractDriveFileId, formatDirectImageUrl } from '../arWriting/utils/urlHelper';
import { getAlternativeAudioUrls } from '../utils/mediaUrl';
import { DEFAULT_MAX_RETRIES, resolveEffectiveMaxRetries } from '../utils/retryLimit';
import {
  Plus,
  Trash2,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  List,
  Edit3,
  UploadCloud,
  X,
  Image as ImageIcon,
  Volume2,
  Mic,
  MicOff,
  RotateCcw,
  Upload,
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  FileText,
  Loader2,
  Wand2,
  Crown,
  Camera,
  Share2,
  Target,
} from 'lucide-react';

interface CatchAdminManagerProps {
  subjects: CatchLessonSubject[];
  onUpdateSubjects: (subjects: CatchLessonSubject[]) => void;
  webhookUrl?: string;
  driveFolderId?: string;
  arRewards?: ARRewardTier[];
  onUpdateArRewards?: (tiers: ARRewardTier[]) => boolean | void;
  arIntroReward?: ARRewardTier;
  onUpdateArIntroReward?: (intro: ARRewardTier) => boolean | void;
  onPreviewArReward?: (tier: ARRewardTier) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const CatchAdminManager: React.FC<CatchAdminManagerProps> = ({
  subjects,
  onUpdateSubjects,
  webhookUrl,
  driveFolderId,
  arRewards = [],
  onUpdateArRewards = () => {},
  arIntroReward = getDefaultCatchARIntroReward(),
  onUpdateArIntroReward = () => {},
  onPreviewArReward,
}) => {
  const [subTab, setSubTab] = useState<'list' | 'add' | 'ar_rewards'>('list');

  const [editingInfo, setEditingInfo] = useState<{
    subjectId: string;
    exerciseId: string;
    exerciseNumber: number;
  } | null>(null);

  const [selectedSubjectMode, setSelectedSubjectMode] = useState<'existing' | 'new'>('existing');
  const [existingSubjectName, setExistingSubjectName] = useState<string>(
    subjects[0]?.subjectName || ''
  );
  const [newSubjectName, setNewSubjectName] = useState<string>('');

  // Question builder state (Col 1: Text + Image + Audio in custom order)
  const [questionOrder, setQuestionOrder] = useState<QuestionBlockType[]>(['text', 'image', 'audio']);
  const [qText, setQText] = useState<string>('');
  const [qImageUrl, setQImageUrl] = useState<string>('');
  const [qAudioUrl, setQAudioUrl] = useState<string>('');

  // Catch core fields (Col C & Col D + Col E settings without mic duration / voice_only)
  const [correctAnswer, setCorrectAnswer] = useState<string>('');
  const [scrambledPool, setScrambledPool] = useState<string>('');
  const [lockOnMistake, setLockOnMistake] = useState<boolean>(false);
  const [maxRetries, setMaxRetries] = useState<number>(DEFAULT_MAX_RETRIES);

  const answerInputRef = useRef<HTMLInputElement | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Audio playback & lightbox preview
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);
  const [previewLightboxUrl, setPreviewLightboxUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Voice recording modal to Google Drive
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceRecordSeconds, setVoiceRecordSeconds] = useState(0);
  const [isRecordingVoiceModal, setIsRecordingVoiceModal] = useState(false);
  const [modalAudioBlobUrl, setModalAudioBlobUrl] = useState<string | null>(null);
  const [modalAudioBase64, setModalAudioBase64] = useState<string | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveUploadResult, setDriveUploadResult] = useState<{
    success: boolean;
    url?: string;
    message: string;
  } | null>(null);
  const [customVoiceFileName, setCustomVoiceFileName] = useState('');

  const voiceModalRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceModalStreamRef = useRef<MediaStream | null>(null);
  const voiceModalChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<any>(null);

  // Independent Catch AR Rewards draft state
  const [draftARRewards, setDraftARRewards] = useState<ARRewardTier[]>(() =>
    arRewards.length > 0 ? arRewards : getDefaultARRewards()
  );
  const [draftARIntro, setDraftARIntro] = useState<ARRewardTier>(
    () => arIntroReward || getDefaultCatchARIntroReward()
  );
  const [hasUnsavedARChanges, setHasUnsavedARChanges] = useState(false);
  const [isSyncingARCloud, setIsSyncingARCloud] = useState(false);
  const [uploadingTierId, setUploadingTierId] = useState<string | null>(null);
  const [arSaveNotice, setArSaveNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
    needsScriptUpdate?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!hasUnsavedARChanges) {
      if (arRewards && arRewards.length > 0) setDraftARRewards(arRewards);
      if (arIntroReward) setDraftARIntro(arIntroReward);
    }
  }, [arRewards, arIntroReward, hasUnsavedARChanges]);

  useEffect(() => {
    if (subjects.length > 0 && !existingSubjectName) {
      setExistingSubjectName(subjects[0].subjectName);
    }
  }, [subjects, existingSubjectName]);

  const stopVoiceModalMicStream = () => {
    if (voiceModalStreamRef.current) {
      try {
        voiceModalStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      voiceModalStreamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      if (voiceModalRecorderRef.current && voiceModalRecorderRef.current.state !== 'inactive') {
        try {
          voiceModalRecorderRef.current.stop();
        } catch {}
      }
      stopVoiceModalMicStream();
      if (previewAudioRef.current) {
        try {
          previewAudioRef.current.pause();
        } catch {}
      }
    };
  }, []);

  const handlePlayPreviewAudio = (key: string, url: string) => {
    const clean = (url || '').trim();
    if (!clean) return;

    if (playingAudioKey === key && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPlayingAudioKey(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const candidates = getAlternativeAudioUrls(clean);
    if (candidates.length === 0) candidates.push(clean);

    setPlayingAudioKey(key);
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        setPlayingAudioKey(null);
        return;
      }
      const src = candidates[idx++];
      const audio = new Audio(src);
      previewAudioRef.current = audio;
      audio.onended = () => setPlayingAudioKey(null);
      audio.onerror = () => tryNext();
      audio.play().catch(() => tryNext());
    };
    tryNext();
  };

  const handleOpenVoiceModal = () => {
    if (modalAudioBlobUrl) URL.revokeObjectURL(modalAudioBlobUrl);
    setVoiceModalOpen(true);
    setVoiceRecordSeconds(0);
    setIsRecordingVoiceModal(false);
    setModalAudioBlobUrl(null);
    setModalAudioBase64(null);
    setDriveUploadResult(null);
    setCustomVoiceFileName(qText.trim().slice(0, 30) || 'صوت_صيد');
  };

  const handleCloseVoiceModal = () => {
    if (voiceModalRecorderRef.current && voiceModalRecorderRef.current.state !== 'inactive') {
      try {
        voiceModalRecorderRef.current.stop();
      } catch {}
    }
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    stopVoiceModalMicStream();
    if (modalAudioBlobUrl) URL.revokeObjectURL(modalAudioBlobUrl);
    setIsRecordingVoiceModal(false);
    setModalAudioBlobUrl(null);
    setModalAudioBase64(null);
    setVoiceModalOpen(false);
  };

  const handleStartVoiceModalRecording = async () => {
    try {
      voiceModalChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceModalStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      voiceModalRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          voiceModalChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(voiceModalChunksRef.current, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(audioBlob);
        const base64 = await blobToBase64(audioBlob);
        setModalAudioBlobUrl(blobUrl);
        setModalAudioBase64(base64);
        stopVoiceModalMicStream();
        setIsRecordingVoiceModal(false);
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecordingVoiceModal(true);
      setVoiceRecordSeconds(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      alert('يرجى السماح بالوصول للميكروفون لبدء تسجيل صوت السؤال.');
    }
  };

  const handleStopVoiceModalRecording = () => {
    if (voiceModalRecorderRef.current && voiceModalRecorderRef.current.state !== 'inactive') {
      voiceModalRecorderRef.current.stop();
    }
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const handleResetVoiceModalRecording = () => {
    if (modalAudioBlobUrl) URL.revokeObjectURL(modalAudioBlobUrl);
    setModalAudioBlobUrl(null);
    setModalAudioBase64(null);
    setDriveUploadResult(null);
    setVoiceRecordSeconds(0);
    setIsRecordingVoiceModal(false);
  };

  const handleUploadModalAudioToDrive = async () => {
    if (!modalAudioBase64) {
      alert('لا يوجد صوت مسجل للرفع.');
      return;
    }

    const effectiveWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    const targetFolder = (driveFolderId || DEFAULT_DRIVE_AUDIO_FOLDER_ID || '').trim() || DEFAULT_DRIVE_AUDIO_FOLDER_ID;
    setIsUploadingToDrive(true);
    setDriveUploadResult(null);

    try {
      const finalAudioName = customVoiceFileName.trim() || qText.trim() || 'صوت_صيد';
      const res = await uploadAudioToDrive(
        effectiveWebhook,
        modalAudioBase64,
        finalAudioName,
        targetFolder,
        customVoiceFileName.trim() || undefined
      );

      if (res.success && res.audioUrl) {
        setQAudioUrl(res.audioUrl);
        setDriveUploadResult({
          success: true,
          url: res.audioUrl,
          message: 'تم رفع الصوت إلى Google Drive بنجاح وإضافته لحقل السؤال!',
        });
      } else {
        setDriveUploadResult({
          success: false,
          message: res.message || 'فشل الرفع إلى Google Drive.',
        });
      }
    } catch {
      setDriveUploadResult({
        success: false,
        message: 'حدث خطأ أثناء الاتصال بخدمة Google Drive.',
      });
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const handleMoveQuestionBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= questionOrder.length) return;
    setQuestionOrder((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleMarkSelectionAsBlank = () => {
    const input = answerInputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    if (end > start) {
      const before = correctAnswer.slice(0, start);
      const selected = correctAnswer.slice(start, end);
      if (!selected.trim()) {
        alert('الجزء المظلل يحتوي على فراغات فقط — ظلّل الحرف أو الكلمة المطلوبة ثم اضغط الزر.');
        return;
      }
      const after = correctAnswer.slice(end);
      setCorrectAnswer(`${before}|${selected}|${after}`);
    } else {
      alert('ظلّل الحرف أو الكلمة داخل خانة الإجابة الصحيحة أولاً، ثم اضغط هذا الزر لجعله فراغاً ناقصاً |...|');
    }
  };

  const handleAutoGenerateScrambled = () => {
    if (!correctAnswer.trim()) {
      alert('أدخل الإجابة الصحيحة أولاً ليتم تفكيكها تلقائياً.');
      return;
    }
    setScrambledPool(generateScrambledFromAnswer(correctAnswer));
  };

  const handleFormatPositionalPool = () => {
    if (!scrambledPool.trim()) {
      alert('أدخل الحروف في خانة الخيارات المشتتة أولاً (أو اضغط التفكيك التلقائي) ليتم تنسيقها بالمواضع.');
      return;
    }
    setScrambledPool(formatPoolWithPositionalLabels(scrambledPool));
  };

  const resetFormFields = () => {
    setQuestionOrder(['text', 'image', 'audio']);
    setQText('');
    setQImageUrl('');
    setQAudioUrl('');
    setCorrectAnswer('');
    setScrambledPool('');
    setLockOnMistake(false);
    setMaxRetries(DEFAULT_MAX_RETRIES);
  };

  const handleStartEdit = (subj: CatchLessonSubject, ex: CatchExercise) => {
    setSelectedSubjectMode('existing');
    setExistingSubjectName(subj.subjectName);

    const blocks = parseQuestionBlocks(ex.questionText);
    const seenTypes: QuestionBlockType[] = [];
    let nextText = '';
    let nextImg = '';
    let nextAud = '';
    for (const b of blocks) {
      if (!seenTypes.includes(b.type)) seenTypes.push(b.type);
      if (b.type === 'text') nextText = nextText ? `${nextText} ${b.value}` : b.value;
      if (b.type === 'image' && !nextImg) nextImg = b.value;
      if (b.type === 'audio' && !nextAud) nextAud = b.value;
    }
    const allTypes: QuestionBlockType[] = ['text', 'image', 'audio'];
    setQuestionOrder([...seenTypes, ...allTypes.filter((t) => !seenTypes.includes(t))]);
    setQText(nextText);
    setQImageUrl(nextImg);
    setQAudioUrl(nextAud);
    setCorrectAnswer(ex.correctAnswer || '');
    setScrambledPool(ex.scrambledPool || '');
    setLockOnMistake(Boolean(ex.lockOnMistake));
    setMaxRetries(resolveEffectiveMaxRetries(ex));
    setEditingInfo({
      subjectId: subj.id,
      exerciseId: ex.id,
      exerciseNumber: ex.exerciseNumber,
    });
    setSubTab('add');
    setStatusMessage({
      success: true,
      text: `أنت تقوم الآن بتعديل تمرين الصيد ${ex.exerciseNumber} في موضوع «${subj.subjectName}».`,
    });
  };

  const handleCancelEdit = () => {
    setEditingInfo(null);
    resetFormFields();
    setStatusMessage(null);
    setSubTab('list');
  };

  const buildFinalQuestionString = (): string => {
    const blocks = questionOrder
      .map((type) => {
        if (type === 'text') return { type, value: qText.trim() };
        if (type === 'image') return { type, value: qImageUrl.trim() };
        return { type, value: qAudioUrl.trim() };
      })
      .filter((b) => Boolean(b.value));
    return formatQuestionBlocks(blocks);
  };

  const hasEmptyBlankPipe = /\|\s*\|/.test(correctAnswer);

  const handleSaveExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveSubject =
      selectedSubjectMode === 'new'
        ? newSubjectName.trim()
        : existingSubjectName.trim() || subjects[0]?.subjectName || 'تحدي اصطياد الحروف والكلمات';

    if (!effectiveSubject) {
      alert('يرجى كتابة أو اختيار موضوع الدرس');
      return;
    }

    const finalQuestionString = buildFinalQuestionString();
    if (!finalQuestionString) {
      alert('يرجى إدخال عنصر واحد على الأقل في السؤال (نص، أو صورة، أو صوت)');
      return;
    }

    if (!correctAnswer.trim()) {
      alert('يرجى إدخال الإجابة الصحيحة في العمود الثالث.');
      return;
    }

    if (hasEmptyBlankPipe) {
      alert('يوجد فراغ | | فارغ في الإجابة الصحيحة. يرجى وضع الحرف أو الكلمة المطلوبة داخل |...|');
      return;
    }

    const effectivePool = scrambledPool.trim() || generateScrambledFromAnswer(correctAnswer.trim());

    setIsSaving(true);
    setStatusMessage(null);

    const settingsString = formatCatchSettingsString({
      lockOnMistake,
      allowRetry: maxRetries !== 0,
      maxRetries,
    });

    let nextSubjects: CatchLessonSubject[];
    let exerciseNumberToSave = 1;

    if (editingInfo) {
      exerciseNumberToSave = editingInfo.exerciseNumber;
      nextSubjects = subjects.map((s) => {
        if (s.id === editingInfo.subjectId) {
          return {
            ...s,
            exercises: s.exercises.map((ex) => {
              if (ex.id === editingInfo.exerciseId) {
                return {
                  ...ex,
                  questionText: finalQuestionString,
                  scrambledPool: effectivePool,
                  correctAnswer: correctAnswer.trim(),
                  settingsString,
                  lockOnMistake,
                  allowRetry: maxRetries !== 0,
                  maxRetries,
                };
              }
              return ex;
            }),
          };
        }
        return s;
      });
    } else {
      const subjectItem = subjects.find((s) => s.subjectName === effectiveSubject);
      exerciseNumberToSave = subjectItem ? subjectItem.exercises.length + 1 : 1;

      const newExercise: CatchExercise = {
        id: `catch-ex-${Date.now()}`,
        exerciseNumber: exerciseNumberToSave,
        questionText: finalQuestionString,
        scrambledPool: effectivePool,
        correctAnswer: correctAnswer.trim(),
        settingsString,
        lockOnMistake,
        allowRetry: maxRetries !== 0,
        maxRetries,
      };

      if (subjectItem) {
        nextSubjects = subjects.map((s) =>
          s.id === subjectItem.id ? { ...s, exercises: [...s.exercises, newExercise] } : s
        );
      } else {
        nextSubjects = [
          ...subjects,
          {
            id: `catch-subj-${Date.now()}`,
            subjectName: effectiveSubject,
            exercises: [newExercise],
          },
        ];
      }
    }

    onUpdateSubjects(nextSubjects);
    try {
      localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(nextSubjects));
    } catch {}

    const activeWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (activeWebhook) {
      try {
        const sheetRes = await saveCatchExerciseToSheets(activeWebhook, {
          subjectName: effectiveSubject,
          exerciseNumber: exerciseNumberToSave,
          questionText: finalQuestionString,
          scrambledPool: effectivePool,
          correctAnswer: correctAnswer.trim(),
          lockOnMistake,
          allowRetry: maxRetries !== 0,
          maxRetries,
        });
        setStatusMessage({
          success: sheetRes.success,
          text: sheetRes.success
            ? editingInfo
              ? `تم تحديث التمرين ${exerciseNumberToSave} بنجاح في ورقة "صيد"!`
              : 'تم حفظ تمرين الصيد الجديد بنجاح في ورقة "صيد"!'
            : `تم الحفظ محلياً، وتعذر التحديث في الشيت: ${sheetRes.error || ''}`,
        });
      } catch {
        setStatusMessage({
          success: false,
          text: 'تم الحفظ محلياً في المتصفح فقط.',
        });
      }
    } else {
      setStatusMessage({
        success: true,
        text: 'تم الحفظ محلياً في المتصفح بنجاح!',
      });
    }

    setIsSaving(false);
    setEditingInfo(null);
    resetFormFields();
    if (selectedSubjectMode === 'new') {
      setSelectedSubjectMode('existing');
      setExistingSubjectName(effectiveSubject);
    }
  };

  const handleDeleteExercise = (subjectId: string, exerciseId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا التمرين؟')) return;

    const nextSubjects = subjects
      .map((subj) => {
        if (subj.id === subjectId) {
          const filtered = subj.exercises.filter((e) => e.id !== exerciseId);
          return {
            ...subj,
            exercises: filtered.map((e, idx) => ({ ...e, exerciseNumber: idx + 1 })),
          };
        }
        return subj;
      })
      .filter((subj) => subj.exercises.length > 0);

    onUpdateSubjects(nextSubjects);
    try {
      localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(nextSubjects));
    } catch {}
    setStatusMessage({
      success: true,
      text: 'تم حذف التمرين بنجاح. اضغط «تصدير إلى ورقة (صيد)» لمزامنة الحذف مع الشيت.',
    });
  };

  const handleRefreshFromSheet = async () => {
    const activeWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!activeWebhook) {
      alert('يرجى ربط Google Sheets أولاً.');
      return;
    }
    setIsRefreshing(true);
    try {
      const res = await fetchCatchExercisesFromSheets(activeWebhook);
      if (res.success && res.subjects.length > 0) {
        onUpdateSubjects(res.subjects);
        setStatusMessage({
          success: true,
          text: `تم جلب ${res.subjects.length} مواضيع بنجاح من ورقة "صيد"!`,
        });
      } else {
        setStatusMessage({
          success: false,
          text: 'لم يتم العثور على تمارين في ورقة "صيد".',
        });
      }
    } catch {
      setStatusMessage({
        success: false,
        text: 'تعذر جلب التمارين من ورقة "صيد".',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportAllToSheets = async () => {
    const activeWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!activeWebhook) {
      alert('يرجى إدخال رابط Webhook أولاً.');
      return;
    }
    if (!confirm('سيتم تصدير جميع تمارين الصيد الحالية إلى ورقة (صيد) في Google Sheets. هل تود المتابعة؟')) {
      return;
    }
    setIsExporting(true);
    setStatusMessage(null);
    try {
      const normalizedSubjects = subjects.map((subj) => ({
        ...subj,
        exercises: subj.exercises.map((ex) => {
          const effRetries = resolveEffectiveMaxRetries(ex);
          const refreshedSettings = formatCatchSettingsString({
            lockOnMistake: ex.lockOnMistake,
            allowRetry: effRetries !== 0,
            maxRetries: effRetries,
          });
          return {
            ...ex,
            allowRetry: effRetries !== 0,
            maxRetries: effRetries,
            settingsString: refreshedSettings,
          };
        }),
      }));
      onUpdateSubjects(normalizedSubjects);
      try {
        localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(normalizedSubjects));
      } catch {}

      const res = await exportAllCatchCurriculumToSheets(activeWebhook, normalizedSubjects);
      setStatusMessage({ success: res.success, text: res.message });
    } catch {
      setStatusMessage({ success: false, text: 'حدث خطأ أثناء التصدير إلى ورقة صيد.' });
    } finally {
      setIsExporting(false);
    }
  };

  // ========== AR Rewards Handlers (Independent from Writing) ==========
  const handleSaveARRewards = async (
    tiersToSave: ARRewardTier[] = draftARRewards,
    introToSave: ARRewardTier = draftARIntro
  ): Promise<boolean> => {
    const normalizedTiers = normalizeARRewardTiers(tiersToSave);
    const normalizedIntro = normalizeSingleARReward(
      { ...introToSave, id: AR_INTRO_ID, minScore: 0, maxScore: 0 },
      0,
      AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0]
    );

    const savedLocalTiers = onUpdateArRewards(normalizedTiers) !== false;
    const savedLocalIntro = onUpdateArIntroReward(normalizedIntro) !== false;

    const activeWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!activeWebhook) {
      setHasUnsavedARChanges(false);
      setArSaveNotice({
        type: savedLocalTiers && savedLocalIntro ? 'success' : 'error',
        text:
          savedLocalTiers && savedLocalIntro
            ? '✅ تم حفظ مكافآت الصيد في هذا المتصفح بنجاح!'
            : '⚠️ تعذر الحفظ في ذاكرة المتصفح.',
      });
      return savedLocalTiers && savedLocalIntro;
    }

    setIsSyncingARCloud(true);
    try {
      const cloudRes = await saveCatchARRewardsToSheet(
        activeWebhook,
        normalizedTiers,
        normalizedIntro
      );
      if (cloudRes.success) {
        const finalTiers =
          cloudRes.rewards && cloudRes.rewards.length > 0 ? cloudRes.rewards : normalizedTiers;
        const finalIntro = cloudRes.introReward || normalizedIntro;
        setDraftARRewards(finalTiers);
        setDraftARIntro(finalIntro);
        onUpdateArRewards(finalTiers);
        onUpdateArIntroReward(finalIntro);
        setHasUnsavedARChanges(false);
        setArSaveNotice({
          type: 'success',
          text: '✅ تم حفظ ومزامنة مكافآت صيد AR في ورقة «مكافآت صيد AR» بنجاح!',
        });
        return true;
      } else {
        setArSaveNotice({
          type: cloudRes.needsScriptUpdate ? 'warning' : 'error',
          needsScriptUpdate: cloudRes.needsScriptUpdate,
          text:
            cloudRes.error ||
            'تم الحفظ محلياً، وتعذر الحفظ السحابي في ورقة «مكافآت صيد AR».',
        });
        return false;
      }
    } catch {
      setArSaveNotice({
        type: 'warning',
        text: 'تم الحفظ محلياً؛ تعذر الاتصال السحابي الآن.',
      });
      return false;
    } finally {
      setIsSyncingARCloud(false);
    }
  };

  const handleFetchARRewardsFromSheet = async () => {
    const activeWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!activeWebhook) {
      setArSaveNotice({ type: 'error', text: 'يرجى ضبط رابط Google Apps Script أولاً.' });
      return;
    }
    setIsSyncingARCloud(true);
    setArSaveNotice(null);
    const res = await fetchCatchARRewardsFromSheet(activeWebhook);
    setIsSyncingARCloud(false);

    if (res.success) {
      if (res.rewards && res.rewards.length > 0) {
        setDraftARRewards(res.rewards);
        onUpdateArRewards(res.rewards);
      }
      if (res.introReward) {
        setDraftARIntro(res.introReward);
        onUpdateArIntroReward(res.introReward);
      }
      setHasUnsavedARChanges(false);
      setArSaveNotice({
        type: 'success',
        text: '✅ تم جلب إعدادات مكافآت صيد AR من ورقة «مكافآت صيد AR» بنجاح!',
      });
    } else {
      setArSaveNotice({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        needsScriptUpdate: res.needsScriptUpdate,
        text: res.error || 'تعذر جلب مكافآت صيد AR من الشيت.',
      });
    }
  };

  const handleCopyARShareLink = async () => {
    const normalized = normalizeARRewardTiers(draftARRewards);
    const normalizedIntro = normalizeSingleARReward(
      { ...draftARIntro, id: AR_INTRO_ID, minScore: 0, maxScore: 0 },
      0,
      AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0]
    );
    const { token, skippedLocalImages } = encodeARRewardsShareParam(normalized, normalizedIntro);
    const shareUrl = `${window.location.origin}${window.location.pathname}?catch_ar=${token}#/`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setArSaveNotice({
        type: skippedLocalImages ? 'warning' : 'success',
        text: skippedLocalImages
          ? '🔗 تم نسخ رابط مشاركة مكافآت الصيد (الصور المرفوعة محلياً تحتاج الحفظ في الشيت أو رابط خارجي).'
          : '🔗 تم نسخ رابط مشاركة مكافآت صيد AR بنجاح!',
      });
    } catch {
      setArSaveNotice({
        type: 'error',
        text: 'تعذر النسخ التلقائي للحافظة، تأكد من السماح بالنسخ في المتصفح.',
      });
    }
  };

  const handleUpdateTier = (tierId: string, updater: (t: ARRewardTier) => ARRewardTier) => {
    if (tierId === AR_INTRO_ID) {
      setDraftARIntro((prev) => updater(prev));
    } else {
      setDraftARRewards((prev) => prev.map((t) => (t.id === tierId ? updater(t) : t)));
    }
    setHasUnsavedARChanges(true);
    setArSaveNotice(null);
  };

  const handleAddRewardTier = () => {
    const preset = AR_REWARD_PRESETS[3] || AR_REWARD_PRESETS[0];
    const newTier: ARRewardTier = {
      id: `catch_tier_${Date.now()}`,
      title: preset.defaultTitle,
      minScore: 50,
      maxScore: 59,
      presetId: preset.id,
      imageUrl: preset.imageUrl,
      scaleRatio: preset.defaultScaleRatio,
      offsetYRatio: preset.defaultOffsetYRatio,
      enabled: true,
    };
    setDraftARRewards((prev) => [...prev, newTier]);
    setHasUnsavedARChanges(true);
    setArSaveNotice(null);
  };

  const handleDeleteRewardTier = (tierId: string) => {
    setDraftARRewards((prev) => prev.filter((t) => t.id !== tierId));
    setHasUnsavedARChanges(true);
    setArSaveNotice(null);
  };

  const handleUploadRewardImage = (tierId: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      const img = new Image();
      img.onload = async () => {
        const maxDim = 320;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const optimizedPng = c.toDataURL('image/png');

        handleUpdateTier(tierId, (t) => ({
          ...t,
          presetId: undefined,
          imageUrl: optimizedPng,
        }));

        const activeWebhook = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
        if (activeWebhook) {
          setUploadingTierId(tierId);
          const uploadRes = await callGoogleSheetsPost(activeWebhook, {
            action: 'upload_ar_reward_image',
            tierId,
            imageBase64: optimizedPng,
          });
          setUploadingTierId(null);

          if (uploadRes.success && uploadRes.data?.imageUrl) {
            handleUpdateTier(tierId, (t) => ({
              ...t,
              presetId: undefined,
              imageUrl: String(uploadRes.data.imageUrl),
            }));
            setArSaveNotice({
              type: 'success',
              text: '✅ تم رفع الصورة إلى Google Drive ووضع رابطها! اضغط «حفظ ومزامنة مع الشيت» لتثبيتها.',
            });
            return;
          }
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const liveDetectedType = detectDictationType(scrambledPool, correctAnswer);
  const liveBlanks = parseAnswerWithBlanks(correctAnswer);
  const liveTilesPreview = parsePoolEntries(scrambledPool);

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/80 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-sky-600" />
            <span>إدارة تمارين تحدي الصيد AR (ورقة: صيد)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            أضف تمارين اصطياد الحروف أو الكلمات وتكوين الجمل وإكمال الناقص |...| مع حفظ تلقائي في ورقة «صيد» ونتائجها في «اجابات صيد».
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportAllToSheets}
            disabled={isExporting || isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <UploadCloud className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'جاري التصدير...' : 'تصدير إلى ورقة (صيد) 📤'}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshFromSheet}
            disabled={isRefreshing || isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث من الشيت (صيد)</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            statusMessage.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}
        >
          {statusMessage.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSubTab('list')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'list'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <List className="w-4 h-4" />
          <span>قائمة التمارين ({subjects.reduce((acc, s) => acc + s.exercises.length, 0)})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (editingInfo) {
              handleCancelEdit();
            }
            setSubTab('add');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'add'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {editingInfo ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{editingInfo ? `تعديل تمرين ${editingInfo.exerciseNumber}` : 'إضافة / تعديل تمرين'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('ar_rewards')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'ar_rewards'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>مكافآت الواقع المعزز AR</span>
          {hasUnsavedARChanges && (
            <span className="w-2 h-2 rounded-full bg-rose-500" title="تغييرات غير محفوظة" />
          )}
        </button>
      </div>

      {/* TAB 1: LIST */}
      {subTab === 'list' && (
        <div className="space-y-4">
          {subjects.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              لا توجد تمارين صيد مضافة بعد. اضغط «إضافة / تعديل تمرين».
            </div>
          ) : (
            subjects.map((subj) => (
              <div
                key={subj.id}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    {subj.subjectName}{' '}
                    <span className="text-sky-700 font-bold text-xs">
                      ({subj.exercises.length} تمارين)
                    </span>
                  </h4>
                </div>

                <div className="space-y-2">
                  {subj.exercises.map((ex) => {
                    const qType = detectDictationType(ex.scrambledPool, ex.correctAnswer);
                    return (
                      <div
                        key={ex.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-900 font-bold text-[11px]">
                              تمرين {ex.exerciseNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {getDictationTypeLabel(qType)}
                            </span>
                            {ex.lockOnMistake && (
                              <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[10px]">
                                🔒 لا تراجع
                              </span>
                            )}
                            {(() => {
                              const mr = resolveEffectiveMaxRetries(ex);
                              if (mr === 0) {
                                return (
                                  <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">
                                    🔒 منع الإعادة
                                  </span>
                                );
                              }
                              if (mr < 0) {
                                return (
                                  <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[10px]">
                                    ♾️ إعادة مفتوحة
                                  </span>
                                );
                              }
                              return (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
                                  🔄 إعادة {mr}×
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-slate-900">
                            {getQuestionPlainText(ex.questionText)}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            <span>
                              <strong className="text-slate-700">الفقاعات المشتتة:</strong>{' '}
                              {ex.scrambledPool || '—'}
                            </span>
                            <span>•</span>
                            <span>
                              <strong className="text-emerald-700">الإجابة:</strong> {ex.correctAnswer}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(subj, ex)}
                            className="p-2 bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-700 rounded-xl transition-colors cursor-pointer"
                            title="تعديل التمرين"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExercise(subj.id, ex.id)}
                            className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                            title="حذف التمرين"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: ADD / EDIT FORM */}
      {subTab === 'add' && (
        <form onSubmit={handleSaveExercise} className="space-y-5">
          {/* 1. Subject Selector */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <label className="block text-xs font-extrabold text-slate-700">
              1. موضوع الدرس (العمود A):
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedSubjectMode('existing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  selectedSubjectMode === 'existing'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-600'
                }`}
              >
                اختيار موضوع حالي
              </button>
              <button
                type="button"
                onClick={() => setSelectedSubjectMode('new')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  selectedSubjectMode === 'new'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-600'
                }`}
              >
                إضافة موضوع جديد
              </button>
            </div>

            {selectedSubjectMode === 'existing' ? (
              <select
                value={existingSubjectName}
                onChange={(e) => setExistingSubjectName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.subjectName}>
                    {s.subjectName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="مثال: تحدي اصطياد الحروف المتصلة"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              />
            )}
          </div>

          {/* 2. Question Builder */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <label className="block text-xs font-extrabold text-slate-700">
              2. السؤال (العمود الأول في التمرين — يدعم نص | صورة | صوت بترتيب حر):
            </label>

            <div className="space-y-2.5">
              {questionOrder.map((blockType, idx) => (
                <div
                  key={blockType}
                  className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1.5">
                      {blockType === 'text' && <FileText className="w-3.5 h-3.5 text-sky-600" />}
                      {blockType === 'image' && <ImageIcon className="w-3.5 h-3.5 text-cyan-600" />}
                      {blockType === 'audio' && <Volume2 className="w-3.5 h-3.5 text-amber-600" />}
                      <span>
                        {blockType === 'text'
                          ? 'نص السؤال'
                          : blockType === 'image'
                          ? 'رابط الصورة (Google Drive أو مباشر)'
                          : 'ملف الصوت (رابط أو تسجيل مباشر)'}
                      </span>
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveQuestionBlock(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveQuestionBlock(idx, 'down')}
                        disabled={idx === questionOrder.length - 1}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {blockType === 'text' && (
                    <input
                      type="text"
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      placeholder="مثال: اصطد الحروف الصحيحة بالترتيب لتكوين كلمة «باب»"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    />
                  )}

                  {blockType === 'image' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={qImageUrl}
                        onChange={(e) => setQImageUrl(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        dir="ltr"
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                      />
                      {qImageUrl.trim() && (
                        <img
                          src={getDirectImageUrl(qImageUrl)}
                          alt="معاينة"
                          onClick={() => setPreviewLightboxUrl(getDirectImageUrl(qImageUrl))}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-300 cursor-zoom-in shrink-0"
                        />
                      )}
                    </div>
                  )}

                  {blockType === 'audio' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={qAudioUrl}
                        onChange={(e) => setQAudioUrl(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        dir="ltr"
                        className="flex-1 min-w-[180px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleOpenVoiceModal}
                        className="inline-flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold cursor-pointer shrink-0"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>تسجيل صوت</span>
                      </button>
                      {qAudioUrl.trim() && (
                        <button
                          type="button"
                          onClick={() => handlePlayPreviewAudio('catch-q-aud', qAudioUrl)}
                          className="inline-flex items-center gap-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          {playingAudioKey === 'catch-q-aud' ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 3. Correct Answer (Col 3) */}
          <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-emerald-950">
                3. الإجابة الصحيحة (العمود الثالث — يدعم الأنماط الـ 5 والفراغ الناقص |...|):
              </label>
              <button
                type="button"
                onClick={handleMarkSelectionAsBlank}
                className="px-2.5 py-1 bg-white hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-300 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
              >
                وضع فراغ حول النص المظلل |...|
              </button>
            </div>

            <input
              ref={answerInputRef}
              type="text"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="مثال: باب — أو: ذهب محمد إلى المدرسة — أو للفراغ: الـ|ـسـ|ـلام"
              className="w-full px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl font-amiri text-xl font-bold text-slate-900"
            />

            {hasEmptyBlankPipe && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>تحذير: يوجد | | فارغ في الإجابة الصحيحة! اكتب الحرف أو الكلمة المطلوبة داخل الشرطتين |...|.</span>
              </div>
            )}

            {correctAnswer.trim() && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-900 font-bold">
                  النمط المكتشف: {getDictationTypeLabel(liveDetectedType)}
                </span>
                {liveBlanks.hasBlanks && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                    الفراغات المطلوبة: {liveBlanks.expectedBlanks.join(' ، ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 4. Scrambled Air Bubbles Pool (Col 2) */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-slate-800">
                4. فقاعات الهواء المبعثرة (العمود الثاني — تُخلط عشوائياً دائماً في الهواء):
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFormatPositionalPool}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                >
                  <span>🏷️ إضافة تسمية الموضع (مفرد/بداية/وسط/نهاية)</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoGenerateScrambled}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>✨ توليد تلقائي من الإجابة</span>
                </button>
              </div>
            </div>

            <input
              type="text"
              value={scrambledPool}
              onChange={(e) => setScrambledPool(e.target.value)}
              placeholder="مثال: ب ا ب ف ر — أو: ( ـسـ ) وسط ( سـ ) بداية — أو: المدرسة محمد إلى ذهب"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-amiri text-xl font-bold text-slate-900"
            />

            {liveTilesPreview.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-bold text-slate-500 ml-1">معاينة الفقاعات:</span>
                {liveTilesPreview.map((entry, i) => (
                  <span
                    key={i}
                    className="inline-flex flex-col items-center px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-2xl shadow-2xs"
                  >
                    <span className="font-amiri text-lg font-bold text-slate-900 leading-none">
                      {entry.text}
                    </span>
                    {entry.label && (
                      <span className="mt-1 text-[10px] font-bold text-sky-700 leading-none">
                        {entry.label}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 5. Catch Settings (Col 4) — NO mic duration / voice_only / mouse toggles */}
          <div className="p-4 bg-sky-50/70 border border-sky-200/90 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-sky-700" />
              <h4 className="text-xs font-black text-sky-950">
                5. سلوك التمرين وحدود الإعادة للطالب (تُحفظ في العمود الرابع بورقة صيد):
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Control 1: Lock on Mistake */}
              <div className="p-3 bg-white rounded-xl border border-sky-200 shadow-2xs space-y-2">
                <span className="text-[11px] font-extrabold text-slate-800 block">
                  1. خيار التراجع عند الخطأ:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLockOnMistake(false)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                      !lockOnMistake
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    🔄 إتاحة المحاولة
                  </button>
                  <button
                    type="button"
                    onClick={() => setLockOnMistake(true)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                      lockOnMistake
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    🔒 لا تراجع عند الخطأ
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {lockOnMistake
                    ? '✓ تم القفل: لا يمكن سحب الفقاعة بعد وضعها، وإذا أخطأ عند «تحقق» تُسجل 0% وتظهر الإجابة.'
                    : 'الافتراضي: يمكن للطالب إرجاع الفقاعات وتعديل ترتيبه حتى يصل للإجابة الصحيحة.'}
                </p>
              </div>

              {/* Control 2: Max Retries */}
              <div className="p-3 bg-white rounded-xl border border-sky-200 shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-slate-800 block">
                    2. عدد محاولات الإعادة بعد التسجيل (افتراضي 3):
                  </span>
                  <span className="text-[11px] font-bold text-sky-800">
                    {maxRetries === 0
                      ? '🔒 منع الإعادة'
                      : maxRetries < 0
                      ? '♾️ غير محدود'
                      : `🔄 ${maxRetries} محاولات`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMaxRetries((n) => (n > 0 ? n : DEFAULT_MAX_RETRIES))}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                      maxRetries > 0
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    🔢 عدد محدد
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaxRetries(-1)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                      maxRetries < 0
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ♾️ غير محدود
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaxRetries(0)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                      maxRetries === 0
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    🔒 منع (0)
                  </button>
                </div>

                {maxRetries > 0 && (
                  <div className="flex items-center justify-between gap-2 bg-sky-50/70 px-3 py-1.5 rounded-xl border border-sky-100">
                    <span className="text-[11px] font-bold text-slate-700">تعديل العدد:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMaxRetries((n) => Math.max(1, n - 1))}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-black flex items-center justify-center cursor-pointer"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={maxRetries}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setMaxRetries(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
                        }}
                        className="w-14 text-center py-0.5 rounded-lg border border-slate-300 bg-white font-black text-xs text-sky-900"
                      />
                      <button
                        type="button"
                        onClick={() => setMaxRetries((n) => Math.min(99, n + 1))}
                        className="w-7 h-7 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-black flex items-center justify-center cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-extrabold transition-all shadow-md shadow-sky-600/20 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{editingInfo ? 'حفظ التعديلات في ورقة صيد' : 'إضافة التمرين في ورقة صيد'}</span>
            </button>

            {editingInfo && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold cursor-pointer"
              >
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
      )}

      {/* TAB 3: INDEPENDENT AR REWARDS FOR CATCH */}
      {subTab === 'ar_rewards' && (
        <div className="space-y-6 bg-slate-950 rounded-3xl p-5 sm:p-6 text-slate-100 border border-slate-800">
          {/* Header Card */}
          <div className="p-4 sm:p-5 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-100 flex flex-wrap items-center gap-2">
                  <span>مكافآت الواقع المعزز AR لتحدي الصيد (ورقة: مكافآت صيد AR)</span>
                  {hasUnsavedARChanges && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      تغييرات بانتظار الحفظ
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  إعدادات مستقلة تماماً عن تمرين الكتابة — تُحفظ في ورقة «مكافآت صيد AR» وتُعرض فوق رأس الطالب عند إكمال تحدي الصيد.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSyncingARCloud}
                onClick={() => void handleSaveARRewards()}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-60 ${
                  hasUnsavedARChanges
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-300/60'
                    : 'bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                {isSyncingARCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSyncingARCloud ? 'جاري المزامنة...' : 'حفظ ومزامنة مع الشيت'}</span>
              </button>

              <button
                type="button"
                disabled={isSyncingARCloud}
                onClick={handleFetchARRewardsFromSheet}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingARCloud ? 'animate-spin' : ''}`} />
                <span>جلب من الشيت</span>
              </button>

              <button
                type="button"
                onClick={handleCopyARShareLink}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/35 text-xs font-bold cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>نسخ رابط المشاركة</span>
              </button>

              <button
                type="button"
                disabled={isSyncingARCloud}
                onClick={() => {
                  const defaults = getDefaultARRewards();
                  const defaultIntro = getDefaultCatchARIntroReward();
                  setDraftARRewards(defaults);
                  setDraftARIntro(defaultIntro);
                  void handleSaveARRewards(defaults, defaultIntro);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة الافتراضي</span>
              </button>

              <button
                type="button"
                onClick={handleAddRewardTier}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مستوى جديد</span>
              </button>
            </div>
          </div>

          {arSaveNotice && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                arSaveNotice.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : arSaveNotice.type === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              }`}
            >
              {arSaveNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              )}
              <span>{arSaveNotice.text}</span>
            </div>
          )}

          {/* Intro Entrance Head Image Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              draftARIntro.enabled
                ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 border-sky-500/40'
                : 'bg-slate-900/50 border-slate-800 opacity-75'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 font-bold text-xs">
                  بداية الدخول
                </span>
                <div>
                  <div className="font-bold text-sm text-white">صورة الترحيب فوق الرأس (قبل ظهور النتيجة)</div>
                  <div className="text-[11px] text-slate-400">
                    تظهر للطالب أثناء التقاط الحروف بالكاميرا، وتتبدل إلى تاج الدرجة فور النجاح.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onPreviewArReward && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleSaveARRewards(normalizeARRewardTiers(draftARRewards), draftARIntro);
                      onPreviewArReward({ ...draftARIntro, id: AR_INTRO_ID, enabled: true });
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>معاينة في ساحة الصيد AR</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleUpdateTier(AR_INTRO_ID, (t) => ({ ...t, enabled: !t.enabled }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    draftARIntro.enabled
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {draftARIntro.enabled ? 'مفعّلة ✓' : 'معطّلة'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              {/* Silhouette Preview */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950 border border-slate-800 relative h-52 overflow-hidden">
                <div className="relative mt-12 flex flex-col items-center">
                  <div
                    className="absolute flex flex-col items-center pointer-events-none transition-all duration-150"
                    style={{
                      width: `${Math.round(74 * draftARIntro.scaleRatio)}px`,
                      top: `${Math.round(draftARIntro.offsetYRatio * 50 - 34)}px`,
                    }}
                  >
                    {draftARIntro.title.trim() && (
                      <span className="mb-1 px-2 py-0.5 rounded-md bg-slate-900/95 border border-sky-400 text-sky-200 font-bold text-[10px] whitespace-nowrap shadow">
                        {draftARIntro.title}
                      </span>
                    )}
                    {draftARIntro.imageUrl && (
                      <img
                        src={formatDirectImageUrl(draftARIntro.imageUrl) || draftARIntro.imageUrl}
                        alt={draftARIntro.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto max-h-20 object-contain"
                      />
                    )}
                  </div>
                  <div className="w-[72px] h-[86px] rounded-full bg-gradient-to-b from-slate-700 to-slate-800 border-2 border-slate-600 flex flex-col items-center justify-center">
                    <div className="flex gap-3 mb-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                    </div>
                    <div className="w-6 h-2.5 border-b-2 border-slate-400 rounded-b-full" />
                  </div>
                </div>
              </div>

              {/* Intro Controls */}
              <div className="lg:col-span-8 space-y-3">
                <input
                  type="text"
                  value={draftARIntro.title}
                  onChange={(e) => handleUpdateTier(AR_INTRO_ID, (t) => ({ ...t, title: e.target.value }))}
                  placeholder="العنوان الترحيبي فوق الرأس..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={draftARIntro.presetId ? '' : draftARIntro.imageUrl.startsWith('data:image/') ? '' : draftARIntro.imageUrl}
                    onChange={(e) => {
                      const rawVal = e.target.value;
                      if (!rawVal.trim()) {
                        const fallbackPreset = AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0];
                        handleUpdateTier(AR_INTRO_ID, (t) => ({
                          ...t,
                          presetId: fallbackPreset.id,
                          imageUrl: fallbackPreset.imageUrl,
                        }));
                      } else {
                        const converted = formatDirectImageUrl(rawVal.trim()) || rawVal.trim();
                        handleUpdateTier(AR_INTRO_ID, (t) => ({
                          ...t,
                          presetId: undefined,
                          imageUrl: converted,
                        }));
                      }
                    }}
                    placeholder="https://drive.google.com/file/d/.../view"
                    className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-sky-300"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 text-[11px] font-bold cursor-pointer">
                    {uploadingTierId === AR_INTRO_ID ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>رفع صورة لقوقل درايف</span>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/svg+xml,image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleUploadRewardImage(AR_INTRO_ID, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {AR_REWARD_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        handleUpdateTier(AR_INTRO_ID, (t) => ({
                          ...t,
                          presetId: preset.id,
                          imageUrl: preset.imageUrl,
                          scaleRatio: preset.defaultScaleRatio,
                          offsetYRatio: preset.defaultOffsetYRatio,
                        }))
                      }
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 cursor-pointer ${
                        draftARIntro.presetId === preset.id
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <img src={preset.imageUrl} alt={preset.name} className="w-5 h-4 object-contain" />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span>الحجم:</span>
                      <span className="font-mono text-amber-400">{Math.round(draftARIntro.scaleRatio * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.7}
                      max={2.2}
                      step={0.05}
                      value={draftARIntro.scaleRatio}
                      onChange={(e) =>
                        handleUpdateTier(AR_INTRO_ID, (t) => ({ ...t, scaleRatio: Number(e.target.value) }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span>الإزاحة العمودية:</span>
                      <span className="font-mono text-sky-400">{draftARIntro.offsetYRatio.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={-0.95}
                      max={0.45}
                      step={0.05}
                      value={draftARIntro.offsetYRatio}
                      onChange={(e) =>
                        handleUpdateTier(AR_INTRO_ID, (t) => ({ ...t, offsetYRatio: Number(e.target.value) }))
                      }
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Score Tier Cards */}
          <div className="space-y-4">
            {draftARRewards.map((tier, idx) => (
              <div
                key={tier.id}
                className={`p-5 rounded-2xl border transition-all ${
                  tier.enabled
                    ? 'bg-slate-900/95 border-amber-500/30'
                    : 'bg-slate-900/50 border-slate-800 opacity-75'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-sm text-white">{tier.title || 'مستوى مكافأة'}</span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-xs">
                      {tier.minScore}% – {tier.maxScore}%
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {onPreviewArReward && (
                      <button
                        type="button"
                        onClick={async () => {
                          const norm = normalizeARRewardTiers(draftARRewards);
                          await handleSaveARRewards(norm);
                          const targetTier = norm.find((t) => t.id === tier.id) || tier;
                          onPreviewArReward({ ...targetTier, enabled: true });
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>معاينة التاج في AR</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleUpdateTier(tier.id, (t) => ({ ...t, enabled: !t.enabled }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        tier.enabled
                          ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {tier.enabled ? 'مفعّل ✓' : 'معطّل'}
                    </button>

                    {draftARRewards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRewardTier(tier.id)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 text-rose-400 hover:text-white cursor-pointer"
                        title="حذف المستوى"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                  <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950 border border-slate-800 relative h-52 overflow-hidden">
                    <div className="relative mt-12 flex flex-col items-center">
                      <div
                        className="absolute flex flex-col items-center pointer-events-none transition-all duration-150"
                        style={{
                          width: `${Math.round(74 * tier.scaleRatio)}px`,
                          top: `${Math.round(tier.offsetYRatio * 50 - 34)}px`,
                        }}
                      >
                        {tier.title.trim() && (
                          <span className="mb-1 px-2 py-0.5 rounded-md bg-slate-900/95 border border-amber-500 text-amber-300 font-bold text-[10px] whitespace-nowrap shadow">
                            {tier.title}
                          </span>
                        )}
                        {tier.imageUrl && (
                          <img
                            src={formatDirectImageUrl(tier.imageUrl) || tier.imageUrl}
                            alt={tier.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-auto max-h-20 object-contain"
                          />
                        )}
                      </div>
                      <div className="w-[72px] h-[86px] rounded-full bg-gradient-to-b from-slate-700 to-slate-800 border-2 border-slate-600 flex flex-col items-center justify-center">
                        <div className="flex gap-3 mb-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                        </div>
                        <div className="w-6 h-2.5 border-b-2 border-slate-400 rounded-b-full" />
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-8 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-6">
                        <label className="block text-[11px] font-bold text-amber-400 mb-1">العنوان:</label>
                        <input
                          type="text"
                          value={tier.title}
                          onChange={(e) => handleUpdateTier(tier.id, (t) => ({ ...t, title: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">من (%):</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={tier.minScore}
                          onChange={(e) =>
                            handleUpdateTier(tier.id, (t) => ({
                              ...t,
                              minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-emerald-400"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">إلى (%):</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={tier.maxScore}
                          onChange={(e) =>
                            handleUpdateTier(tier.id, (t) => ({
                              ...t,
                              maxScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-sky-400"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="url"
                        dir="ltr"
                        value={tier.presetId ? '' : tier.imageUrl.startsWith('data:image/') ? '' : tier.imageUrl}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          if (!rawVal.trim()) {
                            const fallbackPreset = AR_REWARD_PRESETS[0];
                            handleUpdateTier(tier.id, (t) => ({
                              ...t,
                              presetId: fallbackPreset.id,
                              imageUrl: fallbackPreset.imageUrl,
                            }));
                          } else {
                            const converted = formatDirectImageUrl(rawVal.trim()) || rawVal.trim();
                            handleUpdateTier(tier.id, (t) => ({
                              ...t,
                              presetId: undefined,
                              imageUrl: converted,
                            }));
                          }
                        }}
                        placeholder="https://drive.google.com/file/d/.../view"
                        className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-mono text-sky-300"
                      />
                      {!tier.presetId && extractDriveFileId(tier.imageUrl) && (
                        <span className="text-[10px] font-bold text-emerald-400">Drive ✓</span>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 text-[11px] font-bold cursor-pointer">
                        {uploadingTierId === tier.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>رفع صورة لـ Drive</span>
                        <input
                          type="file"
                          accept="image/png,image/webp,image/svg+xml,image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleUploadRewardImage(tier.id, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {AR_REWARD_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            handleUpdateTier(tier.id, (t) => ({
                              ...t,
                              presetId: preset.id,
                              imageUrl: preset.imageUrl,
                              scaleRatio: preset.defaultScaleRatio,
                              offsetYRatio: preset.defaultOffsetYRatio,
                            }))
                          }
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 cursor-pointer ${
                            tier.presetId === preset.id
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <img src={preset.imageUrl} alt={preset.name} className="w-5 h-4 object-contain" />
                          <span>{preset.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span>الحجم:</span>
                          <span className="font-mono text-amber-400">{Math.round(tier.scaleRatio * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.7}
                          max={2.2}
                          step={0.05}
                          value={tier.scaleRatio}
                          onChange={(e) =>
                            handleUpdateTier(tier.id, (t) => ({ ...t, scaleRatio: Number(e.target.value) }))
                          }
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span>الإزاحة العمودية:</span>
                          <span className="font-mono text-sky-400">{tier.offsetYRatio.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={-0.95}
                          max={0.45}
                          step={0.05}
                          value={tier.offsetYRatio}
                          onChange={(e) =>
                            handleUpdateTier(tier.id, (t) => ({ ...t, offsetYRatio: Number(e.target.value) }))
                          }
                          className="w-full accent-sky-400 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voice Recorder Modal for Question Audio */}
      {voiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative space-y-4">
            <button
              type="button"
              onClick={handleCloseVoiceModal}
              className="absolute left-4 top-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-extrabold text-slate-900">
              تسجيل صوت السؤال ورفعه إلى Google Drive 🎙️
            </h4>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم الملف في Drive:</label>
              <input
                type="text"
                value={customVoiceFileName}
                onChange={(e) => setCustomVoiceFileName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 gap-3">
              {!isRecordingVoiceModal && !modalAudioBlobUrl && (
                <button
                  type="button"
                  onClick={handleStartVoiceModalRecording}
                  className="flex items-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold shadow-md cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>بدء التسجيل</span>
                </button>
              )}

              {isRecordingVoiceModal && (
                <button
                  type="button"
                  onClick={handleStopVoiceModalRecording}
                  className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold animate-pulse cursor-pointer"
                >
                  <MicOff className="w-4 h-4 text-rose-400" />
                  <span>إيقاف التسجيل ({voiceRecordSeconds} ث)</span>
                </button>
              )}

              {modalAudioBlobUrl && (
                <div className="w-full space-y-3">
                  <audio controls src={modalAudioBlobUrl} className="w-full h-10" />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetVoiceModalRecording}
                      className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUploadModalAudioToDrive}
                      disabled={isUploadingToDrive}
                      className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingToDrive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isUploadingToDrive ? 'جاري الرفع...' : 'حفظ ورفع لـ Drive'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {driveUploadResult && (
              <div
                className={`p-3 rounded-xl text-xs font-bold border ${
                  driveUploadResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {driveUploadResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Preview Lightbox */}
      {previewLightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4"
          onClick={() => setPreviewLightboxUrl(null)}
        >
          <img
            src={previewLightboxUrl}
            alt="معاينة الصورة"
            className="max-h-[82vh] rounded-2xl border-4 border-white bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
};
