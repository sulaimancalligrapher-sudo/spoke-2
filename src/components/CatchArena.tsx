import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  CatchExercise,
  CatchHistoryItem,
  CatchLessonSubject,
  StudentRegistrant,
} from '../types';
import {
  SupportedLang,
  TranslationItem,
  getTranslatedCatchQuestionText,
} from '../utils/translations';
import {
  submitCatchAnswerToSheet,
  extractPercentageFromMatchingText,
} from '../utils/googleSheets';
import {
  parseQuestionBlocks,
  getDirectImageUrl,
} from '../utils/matchingMedia';
import { getAlternativeAudioUrls } from '../utils/mediaUrl';
import {
  DictationTile,
  detectDictationType,
  getDictationTypeLabel,
  parseAnswerWithBlanks,
  buildShuffledTiles,
  formatAssembledPreview,
  verifyDictationAnswer,
} from '../utils/dictationUtils';
import {
  formatStudentRetryBannerMessage,
  getRetryStatus,
  recordStudentRetryAttempt,
} from '../utils/retryLimit';
import { ARCameraOverlay } from '../arWriting/components/ARCameraOverlay';
import { ARRewardTier, findARRewardForScore } from '../arWriting/services/arRewardsService';
import { HandTrackingDisplayMode } from '../arWriting/types/drawing';
import {
  Target,
  Camera,
  CameraOff,
  FlipHorizontal2,
  RefreshCw,
  Hand,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Delete,
  Volume2,
  Pause,
  ZoomIn,
  X,
  Lock,
  Loader2,
  Award,
  ArrowRight,
  Crown,
  MousePointerClick,
} from 'lucide-react';

interface CatchArenaProps {
  subjects: CatchLessonSubject[];
  currentStudent: StudentRegistrant | null;
  webhookUrl?: string;
  currentLang?: SupportedLang;
  translations?: TranslationItem[];
  t?: (id: string, fallback?: string) => string;
  onRequestLogin?: () => void;
  onBackToPronunciation?: () => void;
  activeSubjectId?: string;
  activeExerciseIndex?: number;
  onSelectSubjectExercise?: (subjectId: string, exerciseIndex: number) => void;
  catchHistory?: CatchHistoryItem[];
  retryNonce?: number;
  retryBanner?: { nonce: number; message: string } | null;
  arRewards?: ARRewardTier[];
  arIntroReward?: ARRewardTier | null;
  previewRewardRequest?: { tier: ARRewardTier; nonce: number } | null;
  onCatchSubmitted?: (submitted?: {
    subjectName: string;
    exerciseNumber: number;
    formulaString: string;
    percentage: number;
    completionStatus: string;
  }) => void;
}

// Cross-browser WAV audio chimes (zero external sound dependency)
const catchWavCache: Partial<Record<'success' | 'error' | 'tap' | 'grab', string>> = {};

function makeCatchWavUri(
  durationSec: number,
  sampleGenerator: (t: number) => number
): string {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const clamped = Math.max(-1, Math.min(1, sampleGenerator(t)));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function playCatchChime(type: 'success' | 'error' | 'tap' | 'grab') {
  try {
    if (!catchWavCache[type]) {
      if (type === 'success') {
        const notes = [
          { freq: 523.25, start: 0 },
          { freq: 659.25, start: 0.08 },
          { freq: 783.99, start: 0.16 },
          { freq: 1046.5, start: 0.25 },
        ];
        catchWavCache[type] = makeCatchWavUri(0.6, (t) => {
          let sum = 0;
          for (const n of notes) {
            if (t >= n.start && t <= n.start + 0.35) {
              const lt = t - n.start;
              const env = Math.min(1, lt / 0.01) * Math.exp(-lt * 8.5);
              sum += Math.sin(2 * Math.PI * n.freq * lt) * env * 0.24;
            }
          }
          return sum;
        });
      } else if (type === 'error') {
        catchWavCache[type] = makeCatchWavUri(0.24, (t) => {
          const freq = 220 - (80 * t) / 0.24;
          const env = Math.min(1, t / 0.01) * Math.exp(-t * 8);
          return Math.sin(2 * Math.PI * freq * t) * env * 0.28;
        });
      } else if (type === 'grab') {
        catchWavCache[type] = makeCatchWavUri(0.06, (t) => {
          const env = Math.min(1, t / 0.004) * Math.exp(-t * 40);
          return Math.sin(2 * Math.PI * 620 * t) * env * 0.2;
        });
      } else {
        catchWavCache[type] = makeCatchWavUri(0.08, (t) => {
          const env = Math.min(1, t / 0.004) * Math.exp(-t * 36);
          return Math.sin(2 * Math.PI * 880 * t) * env * 0.22;
        });
      }
    }
    const audio = new Audio(catchWavCache[type]!);
    audio.volume = type === 'tap' || type === 'grab' ? 0.5 : 0.72;
    audio.play().catch(() => {});
  } catch {}
}

export const CatchArena: React.FC<CatchArenaProps> = ({
  subjects,
  currentStudent,
  webhookUrl,
  currentLang = 'ar',
  translations = [],
  t,
  onRequestLogin,
  activeSubjectId: propSubjectId,
  activeExerciseIndex: propExerciseIndex,
  onSelectSubjectExercise,
  catchHistory = [],
  retryNonce = 0,
  retryBanner = null,
  arRewards = [],
  arIntroReward = null,
  previewRewardRequest = null,
  onCatchSubmitted,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);

  const translatePosLabel = (rawLabel?: string): string => {
    const clean = (rawLabel || '').trim();
    if (!clean) return '';
    if (clean === 'مفرد') return tr('dictation_pos_isolated', 'مفرد');
    if (clean === 'بداية') return tr('dictation_pos_initial', 'بداية');
    if (clean === 'وسط') return tr('dictation_pos_medial', 'وسط');
    if (clean === 'نهاية') return tr('dictation_pos_final', 'نهاية');
    return clean;
  };

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    propSubjectId || subjects[0]?.id || ''
  );
  const [exerciseIndex, setExerciseIndex] = useState<number>(propExerciseIndex || 0);

  useEffect(() => {
    if (propSubjectId) setSelectedSubjectId(propSubjectId);
  }, [propSubjectId]);

  useEffect(() => {
    if (typeof propExerciseIndex === 'number') setExerciseIndex(propExerciseIndex);
  }, [propExerciseIndex]);

  const activeSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || subjects[0] || null;
  }, [subjects, selectedSubjectId]);

  const activeExercise: CatchExercise | null = useMemo(() => {
    if (!activeSubject || activeSubject.exercises.length === 0) return null;
    const safeIdx = Math.min(exerciseIndex, activeSubject.exercises.length - 1);
    return activeSubject.exercises[safeIdx] || null;
  }, [activeSubject, exerciseIndex]);

  const detectedType = useMemo(() => {
    if (!activeExercise) return 'letters_word';
    return detectDictationType(activeExercise.scrambledPool, activeExercise.correctAnswer);
  }, [activeExercise]);

  const parsedBlanks = useMemo(() => {
    if (!activeExercise) return parseAnswerWithBlanks('');
    return parseAnswerWithBlanks(activeExercise.correctAnswer);
  }, [activeExercise]);

  // AR Camera & Tracking State
  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(true);
  const [trackingMode, setTrackingMode] = useState<HandTrackingDisplayMode>('one_hand');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [arStatus, setArStatus] = useState<{
    handsCount: number;
    isPinching: boolean;
    faceDetected: boolean;
    fps: number;
  }>({ handsCount: 0, isPinching: false, faceDetected: false, fps: 0 });
  const [activePreviewReward, setActivePreviewReward] = useState<ARRewardTier | null>(null);

  useEffect(() => {
    if (previewRewardRequest) {
      setIsCameraEnabled(true);
      setFacingMode('user');
      setIsMirrored(true);
      setActivePreviewReward(previewRewardRequest.tier);
    }
  }, [previewRewardRequest]);

  // Exercise Gameplay State
  const [shuffledTiles, setShuffledTiles] = useState<DictationTile[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<DictationTile[]>([]);
  const [blankAssignments, setBlankAssignments] = useState<Record<number, DictationTile | null>>({});
  const [activeBlankIdx, setActiveBlankIdx] = useState<number>(0);

  const [wrongAttempts, setWrongAttempts] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [finalScore, setFinalScore] = useState<number>(100);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [sheetSyncSuccess, setSheetSyncSuccess] = useState<string | null>(null);
  const [completedExercisesInSubject, setCompletedExercisesInSubject] = useState<
    Record<number, number>
  >({});

  const [guidanceBox, setGuidanceBox] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);

  // Media Lightbox & Question Audio
  const [playingMediaKey, setPlayingMediaKey] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const mediaAudioRef = useRef<HTMLAudioElement | null>(null);

  // AR Cursor & Pinch Drag State
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const blankSlotRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [arCursor, setArCursor] = useState<{ x: number; y: number } | null>(null);
  const [arPinching, setArPinching] = useState<boolean>(false);
  const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null);
  const [grabbedTile, setGrabbedTile] = useState<DictationTile | null>(null);
  const [isOverDropZone, setIsOverDropZone] = useState<boolean>(false);

  const prevPinchingRef = useRef<boolean>(false);
  const grabbedTileRef = useRef<DictationTile | null>(null);
  const isCompletedRef = useRef<boolean>(false);
  isCompletedRef.current = isCompleted;

  const stopMediaAudio = () => {
    if (mediaAudioRef.current) {
      try {
        mediaAudioRef.current.pause();
      } catch {}
      mediaAudioRef.current = null;
    }
    setPlayingMediaKey(null);
  };

  useEffect(() => {
    return () => {
      stopMediaAudio();
    };
  }, []);

  // Retry pass state
  const [hasActiveRetryPass, setHasActiveRetryPass] = useState(false);
  const [retryBannerMessage, setRetryBannerMessage] = useState<string | null>(null);
  const lastHandledRetryNonceRef = useRef<number>(0);
  const prevExerciseKeyRef = useRef<string>('');

  const initExercise = useCallback(() => {
    stopMediaAudio();
    if (!activeExercise) return;

    const exType = detectDictationType(activeExercise.scrambledPool, activeExercise.correctAnswer);
    const effectivePool =
      activeExercise.scrambledPool?.trim() ||
      activeExercise.correctAnswer
        .replace(/\|/g, '')
        .split('')
        .filter((c) => c.trim())
        .join(' ');
    const tiles = buildShuffledTiles(effectivePool, activeExercise.correctAnswer, exType);

    setShuffledTiles(tiles);
    setSelectedTiles([]);
    setBlankAssignments({});
    setActiveBlankIdx(0);
    setGrabbedTile(null);
    grabbedTileRef.current = null;
    setHoveredBubbleId(null);
    setIsOverDropZone(false);
    setWrongAttempts(0);
    setIsCompleted(false);
    setFinalScore(100);
    setLastSubmittedAnswer('');
    setSheetSyncSuccess(null);

    const blanks = parseAnswerWithBlanks(activeExercise.correctAnswer);
    const locked = Boolean(activeExercise.lockOnMistake);
    let initMsg = blanks.hasBlanks
      ? tr(
          'catch_init_fill',
          'اقبض بأصابعك (Pinch) واسحب الفقاعة الصحيحة لإفلاتها داخل الفراغ في الأعلى — أو اضغط عليها مباشرة!'
        )
      : tr(
          'catch_init_order',
          'اصطد الفقاعات بالترتيب الصحيح في الهواء واسحبها لمنطقة التجميع بالأعلى — أو انقر عليها!'
        );
    if (locked) {
      initMsg = tr(
        'catch_init_locked',
        '🔒 وضع بدون تراجع: اصطد وأفلت الإجابة بدقة ثم اضغط «تحقق من الإجابة».'
      );
    }
    setGuidanceBox({ type: 'info', message: initMsg });
  }, [activeExercise]);

  useEffect(() => {
    const currentExKey =
      activeSubject && activeExercise
        ? `${activeSubject.subjectName.trim()}::ex-${activeExercise.exerciseNumber}`
        : '';
    if (currentExKey !== prevExerciseKeyRef.current) {
      prevExerciseKeyRef.current = currentExKey;
      setHasActiveRetryPass(false);
      setRetryBannerMessage(null);
    }
    if (retryNonce > 0 && retryNonce !== lastHandledRetryNonceRef.current) {
      lastHandledRetryNonceRef.current = retryNonce;
      setHasActiveRetryPass(true);
      setRetryBannerMessage(
        retryBanner && retryBanner.nonce === retryNonce ? retryBanner.message : null
      );
    }
    initExercise();
  }, [activeExercise, activeSubject, retryNonce, retryBanner, initExercise]);

  // Seed already completed exercises from catchHistory
  useEffect(() => {
    if (!activeSubject) return;
    const cleanSubj = (activeSubject.subjectName || '').trim();
    const rec = catchHistory.find((h) => (h.lessonSubject || '').trim() === cleanSubj);
    if (rec && Array.isArray(rec.exercises)) {
      const nextMap: Record<number, number> = {};
      rec.exercises.forEach((ex) => {
        nextMap[ex.exerciseNumber] = extractPercentageFromMatchingText(
          ex.formulaString,
          ex.percentage
        );
      });
      setCompletedExercisesInSubject(nextMap);
    } else {
      setCompletedExercisesInSubject({});
    }
  }, [activeSubject, catchHistory]);

  const recordedExerciseEntry = useMemo(() => {
    if (!activeSubject || !activeExercise || !catchHistory.length) return null;
    const cleanSubj = (activeSubject.subjectName || '').trim();
    const rec = catchHistory.find((h) => (h.lessonSubject || '').trim() === cleanSubj);
    if (!rec || !Array.isArray(rec.exercises)) return null;
    return rec.exercises.find((e) => e.exerciseNumber === activeExercise.exerciseNumber) || null;
  }, [activeSubject, activeExercise, catchHistory]);

  const catchRetryKey =
    activeSubject && activeExercise
      ? `${(activeSubject.subjectName || '').trim()}::ex-${activeExercise.exerciseNumber}`
      : '';
  const catchRetryStatus = getRetryStatus(
    'catch',
    currentStudent,
    catchRetryKey,
    activeExercise || undefined
  );

  const isRetryLockedSubmitted = Boolean(
    activeExercise &&
      !isCompleted &&
      !hasActiveRetryPass &&
      recordedExerciseEntry &&
      !catchRetryStatus.canRetry
  );

  const usedTileIds = useMemo(() => {
    const ids = new Set<string>();
    if (parsedBlanks.hasBlanks) {
      Object.values(blankAssignments).forEach((tile) => {
        if (tile) ids.add(tile.id);
      });
    } else {
      selectedTiles.forEach((tile) => ids.add(tile.id));
    }
    if (grabbedTile) ids.add(grabbedTile.id);
    return ids;
  }, [parsedBlanks.hasBlanks, blankAssignments, selectedTiles, grabbedTile]);

  const placeTileIntoTarget = useCallback(
    (tile: DictationTile, specificBlankIdx?: number) => {
      if (isCompletedRef.current) return;
      playCatchChime('tap');

      if (parsedBlanks.hasBlanks) {
        const totalBlanks = parsedBlanks.expectedBlanks.length;
        if (totalBlanks === 0) return;

        let targetBlank =
          specificBlankIdx !== undefined ? specificBlankIdx : activeBlankIdx;
        if (
          targetBlank < 0 ||
          targetBlank >= totalBlanks ||
          blankAssignments[targetBlank]
        ) {
          const firstEmpty = parsedBlanks.expectedBlanks.findIndex(
            (_, i) => !blankAssignments[i]
          );
          targetBlank = firstEmpty !== -1 ? firstEmpty : activeBlankIdx;
        }

        const nextAssignments = {
          ...blankAssignments,
          [targetBlank]: tile,
        };
        setBlankAssignments(nextAssignments);

        const nextEmpty = parsedBlanks.expectedBlanks.findIndex(
          (_, i) => !nextAssignments[i]
        );
        if (nextEmpty !== -1) {
          setActiveBlankIdx(nextEmpty);
        }
        setGuidanceBox({
          type: 'info',
          message: tr('catch_msg_ready_check', 'رائع! اضغط «تحقق من الإجابة» عندما تنتهي.'),
        });
      } else {
        setSelectedTiles((prev) => {
          if (prev.some((t) => t.id === tile.id)) return prev;
          return [...prev, tile];
        });
        setGuidanceBox({
          type: 'info',
          message: tr('catch_msg_continue', 'استمر في الاصطياد بالترتيب أو اضغط «تحقق من الإجابة».'),
        });
      }
    },
    [parsedBlanks, activeBlankIdx, blankAssignments]
  );

  const placeTileRef = useRef(placeTileIntoTarget);
  placeTileRef.current = placeTileIntoTarget;

  // Refs to current state for AR hit-testing loop
  const shuffledTilesRef = useRef<DictationTile[]>(shuffledTiles);
  shuffledTilesRef.current = shuffledTiles;
  const usedTileIdsRef = useRef<Set<string>>(usedTileIds);
  usedTileIdsRef.current = usedTileIds;
  const parsedBlanksRef = useRef(parsedBlanks);
  parsedBlanksRef.current = parsedBlanks;

  // Handle continuous AR hand cursor updates from ARCameraOverlay
  const handleCursorUpdate = useCallback(
    (cursor: { x: number; y: number } | null, isPinching: boolean) => {
      setArCursor(cursor);
      setArPinching(isPinching);

      const stageEl = stageRef.current;
      if (!stageEl || !cursor) {
        setHoveredBubbleId(null);
        setIsOverDropZone(false);
        if (!cursor && grabbedTileRef.current) {
          grabbedTileRef.current = null;
          setGrabbedTile(null);
        }
        prevPinchingRef.current = false;
        return;
      }

      const stageRect = stageEl.getBoundingClientRect();
      const wasPinching = prevPinchingRef.current;
      prevPinchingRef.current = isPinching;

      // Hit-test Drop Zone (top area) with generous 26px margin
      let overDrop = false;
      let hoveredBlank: number | undefined = undefined;
      if (dropZoneRef.current) {
        const dzRect = dropZoneRef.current.getBoundingClientRect();
        const dzLeft = dzRect.left - stageRect.left - 26;
        const dzRight = dzRect.right - stageRect.left + 26;
        const dzTop = dzRect.top - stageRect.top - 26;
        const dzBottom = dzRect.bottom - stageRect.top + 26;
        if (
          cursor.x >= dzLeft &&
          cursor.x <= dzRight &&
          cursor.y >= dzTop &&
          cursor.y <= dzBottom
        ) {
          overDrop = true;
          if (parsedBlanksRef.current.hasBlanks) {
            for (const [idxStr, slotEl] of Object.entries(blankSlotRefs.current)) {
              if (!slotEl) continue;
              const sRect = slotEl.getBoundingClientRect();
              const sLeft = sRect.left - stageRect.left - 14;
              const sRight = sRect.right - stageRect.left + 14;
              const sTop = sRect.top - stageRect.top - 14;
              const sBottom = sRect.bottom - stageRect.top + 14;
              if (cursor.x >= sLeft && cursor.x <= sRight && cursor.y >= sTop && cursor.y <= sBottom) {
                hoveredBlank = Number(idxStr);
                break;
              }
            }
          }
        }
      }
      setIsOverDropZone(overDrop);

      // Find hovered bubble in lower air zone
      let foundBubbleId: string | null = null;
      if (!isCompletedRef.current && !grabbedTileRef.current) {
        for (const tile of shuffledTilesRef.current) {
          if (usedTileIdsRef.current.has(tile.id)) continue;
          const el = bubbleRefs.current[tile.id];
          if (!el) continue;
          const bRect = el.getBoundingClientRect();
          const bLeft = bRect.left - stageRect.left - 16;
          const bRight = bRect.right - stageRect.left + 16;
          const bTop = bRect.top - stageRect.top - 16;
          const bBottom = bRect.bottom - stageRect.top + 16;
          if (
            cursor.x >= bLeft &&
            cursor.x <= bRight &&
            cursor.y >= bTop &&
            cursor.y <= bBottom
          ) {
            foundBubbleId = tile.id;
            break;
          }
        }
      }
      setHoveredBubbleId(foundBubbleId);

      // Transition: Open -> Pinch (Grab!)
      if (!wasPinching && isPinching && !isCompletedRef.current && !grabbedTileRef.current) {
        if (foundBubbleId) {
          const targetTile = shuffledTilesRef.current.find((t) => t.id === foundBubbleId) || null;
          if (targetTile) {
            grabbedTileRef.current = targetTile;
            setGrabbedTile(targetTile);
            playCatchChime('grab');
          }
        }
      }

      // Transition: Pinch -> Open (Drop!)
      if (wasPinching && !isPinching && grabbedTileRef.current) {
        const released = grabbedTileRef.current;
        grabbedTileRef.current = null;
        setGrabbedTile(null);
        setIsOverDropZone(false);

        if (overDrop && !isCompletedRef.current) {
          placeTileRef.current(released, hoveredBlank);
        }
      }
    },
    []
  );

  const handleVideoElementReady = useCallback((_video: HTMLVideoElement | null) => {}, []);

  const handlePlayMediaAudio = (key: string, rawUrl: string) => {
    const clean = (rawUrl || '').trim();
    if (!clean) return;

    if (playingMediaKey === key && mediaAudioRef.current) {
      mediaAudioRef.current.pause();
      setPlayingMediaKey(null);
      return;
    }

    stopMediaAudio();
    const candidates = getAlternativeAudioUrls(clean);
    if (candidates.length === 0) candidates.push(clean);

    setPlayingMediaKey(key);
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        setPlayingMediaKey(null);
        return;
      }
      const src = candidates[idx++];
      const audio = new Audio(src);
      mediaAudioRef.current = audio;
      audio.onended = () => setPlayingMediaKey(null);
      audio.onerror = () => tryNext();
      audio.play().catch(() => tryNext());
    };
    tryNext();
  };

  const handleRemovePlacedTile = (tileId: string) => {
    if (isCompleted || activeExercise?.lockOnMistake) return;
    playCatchChime('grab');
    if (parsedBlanks.hasBlanks) {
      const next = { ...blankAssignments };
      for (const k of Object.keys(next)) {
        const idx = Number(k);
        if (next[idx]?.id === tileId) {
          next[idx] = null;
          setActiveBlankIdx(idx);
        }
      }
      setBlankAssignments(next);
    } else {
      setSelectedTiles((prev) => prev.filter((t) => t.id !== tileId));
    }
  };

  const handleUndo = () => {
    if (isCompleted || activeExercise?.lockOnMistake) return;
    playCatchChime('grab');
    if (parsedBlanks.hasBlanks) {
      const filledKeys = Object.keys(blankAssignments)
        .map(Number)
        .filter((k) => Boolean(blankAssignments[k]));
      if (filledKeys.length === 0) return;
      const lastK = filledKeys[filledKeys.length - 1];
      setBlankAssignments((prev) => ({ ...prev, [lastK]: null }));
      setActiveBlankIdx(lastK);
    } else {
      setSelectedTiles((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (isCompleted || activeExercise?.lockOnMistake) return;
    playCatchChime('grab');
    setSelectedTiles([]);
    setBlankAssignments({});
    setActiveBlankIdx(0);
  };

  const assembledPreview = useMemo(() => {
    if (parsedBlanks.hasBlanks) return '';
    return formatAssembledPreview(selectedTiles, detectedType);
  }, [parsedBlanks.hasBlanks, selectedTiles, detectedType]);

  const hasAnyInput = useMemo(() => {
    if (parsedBlanks.hasBlanks) {
      return parsedBlanks.expectedBlanks.every((_, idx) => Boolean(blankAssignments[idx]));
    }
    return selectedTiles.length > 0;
  }, [parsedBlanks, blankAssignments, selectedTiles.length]);

  const handleVerifyAnswer = () => {
    if (!activeExercise || isCompleted) return;

    if (parsedBlanks.hasBlanks) {
      const missingBlank = parsedBlanks.expectedBlanks.some((_, idx) => !blankAssignments[idx]);
      if (missingBlank) {
        playCatchChime('error');
        setGuidanceBox({
          type: 'error',
          message: tr('catch_err_fill_blanks', 'يرجى إكمال جميع الفراغات قبل الضغط على «تحقق من الإجابة».'),
        });
        return;
      }
    } else if (selectedTiles.length === 0) {
      playCatchChime('error');
      setGuidanceBox({
        type: 'error',
        message: tr('catch_err_empty', 'اصطد أو اختر الفقاعات أولاً ثم اضغط «تحقق من الإجابة».'),
      });
      return;
    }

    const res = verifyDictationAnswer({
      type: detectedType,
      correctAnswer: activeExercise.correctAnswer,
      scrambledPool: activeExercise.scrambledPool,
      selectedTiles,
      blankAssignments,
    });

    if (res.isCorrect) {
      const computedScore = Math.max(40, 100 - wrongAttempts * 15);
      setFinalScore(computedScore);
      setLastSubmittedAnswer(res.assembledAnswer);
      setIsCompleted(true);
      playCatchChime('success');
      setGuidanceBox({
        type: 'success',
        message: tr(
          'catch_success_msg',
          'إجابة رائعة! تم اصطياد وترتيب الإجابة الصحيحة بنجاح!'
        ),
      });
    } else {
      playCatchChime('error');
      const nextWrong = wrongAttempts + 1;
      setWrongAttempts(nextWrong);

      if (activeExercise.lockOnMistake) {
        setFinalScore(0);
        setLastSubmittedAnswer(res.assembledAnswer);
        setIsCompleted(true);
        setGuidanceBox({
          type: 'error',
          message: `${tr('catch_locked_wrong', '❌ الإجابة غير مطابقة (وضع بدون تراجع). الإجابة الصحيحة:')} ${activeExercise.correctAnswer.replace(/\|/g, '')}`,
        });
      } else {
        setGuidanceBox({
          type: 'error',
          message: tr(
            'catch_wrong_retry',
            'حاول مرة أخرى! يمكنك التراجع أو إعادة ترتيب الفقاعات ثم التحقق من جديد.'
          ),
        });
      }
    }
  };

  const handleSubmitToSheet = async () => {
    if (!activeSubject || !activeExercise) return;
    if (!currentStudent) {
      onRequestLogin?.();
      return;
    }

    const effectiveWebhook = (webhookUrl || '').trim();
    const updatedCompletedMap = {
      ...completedExercisesInSubject,
      [activeExercise.exerciseNumber]: finalScore,
    };
    setCompletedExercisesInSubject(updatedCompletedMap);

    const totalExercisesInSubj = activeSubject.exercises.length;
    const completedVals = Object.values(updatedCompletedMap) as number[];
    const completedCountInSubj = completedVals.length;
    const overallPct =
      completedCountInSubj > 0
        ? Math.round(
            completedVals.reduce((sum, p) => sum + p, 0) / completedCountInSubj
          )
        : finalScore;

    const summaryString =
      finalScore === 0 && activeExercise.lockOnMistake
        ? `(خطأ - وضع مقفل = 0%)`
        : wrongAttempts > 0
        ? `(صحيح - أخطاء التحقق ${wrongAttempts} = ${finalScore}%)`
        : `(صحيح من أول محاولة = ${finalScore}%)`;

    const completionStatus =
      completedCountInSubj >= totalExercisesInSubj
        ? `مكتمل (${completedCountInSubj} من ${totalExercisesInSubj} تمارين) - النسبة: ${overallPct}%`
        : `جاري الإنجاز (${completedCountInSubj} من ${totalExercisesInSubj} تمارين) - النسبة التراكمية: ${overallPct}%`;

    setIsSubmitting(true);
    const res = await submitCatchAnswerToSheet(effectiveWebhook, {
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      subjectName: activeSubject.subjectName,
      exerciseNumber: activeExercise.exerciseNumber,
      wrongAttempts,
      percentage: finalScore,
      totalExercisesInSubject: totalExercisesInSubj,
      completedCountInSubject: completedCountInSubj,
      overallPercentage: overallPct,
      summaryString,
    });
    setIsSubmitting(false);

    onCatchSubmitted?.({
      subjectName: activeSubject.subjectName,
      exerciseNumber: activeExercise.exerciseNumber,
      formulaString: summaryString,
      percentage: finalScore,
      completionStatus,
    });

    setSheetSyncSuccess(
      res.success
        ? tr('catch_saved_sheet', '✅ تم حفظ الدرجة بنجاح في ورقة (اجابات صيد)!')
        : tr('catch_saved_local', '✅ تم الحفظ محلياً (مؤقتاً لحين توفر الاتصال بورقة اجابات صيد).')
    );
  };

  const handleTriggerRetryInArena = () => {
    if (!activeExercise) return;
    const status = getRetryStatus('catch', currentStudent, catchRetryKey, activeExercise);
    if (!status.canRetry) return;
    const outcome = recordStudentRetryAttempt(
      'catch',
      currentStudent,
      catchRetryKey,
      activeExercise,
      webhookUrl
    );
    setRetryBannerMessage(formatStudentRetryBannerMessage(outcome, currentStudent, tr));
    setHasActiveRetryPass(true);
    initExercise();
  };

  const handleGoNextExercise = () => {
    if (!activeSubject) return;
    const nextIdx = exerciseIndex + 1;
    if (nextIdx < activeSubject.exercises.length) {
      setExerciseIndex(nextIdx);
      onSelectSubjectExercise?.(activeSubject.id, nextIdx);
    } else if (subjects.length > 1) {
      const sIdx = subjects.findIndex((s) => s.id === activeSubject.id);
      const nextSubj = subjects[(sIdx + 1) % subjects.length];
      setSelectedSubjectId(nextSubj.id);
      setExerciseIndex(0);
      onSelectSubjectExercise?.(nextSubj.id, 0);
    }
  };

  // Resolve Active AR Crown Tier
  const earnedRewardTier = useMemo(() => {
    if (activePreviewReward) return activePreviewReward;
    if (isCompleted) {
      return findARRewardForScore(finalScore, arRewards);
    }
    if (arIntroReward && arIntroReward.enabled) {
      return arIntroReward;
    }
    return null;
  }, [activePreviewReward, isCompleted, finalScore, arRewards, arIntroReward]);

  const showCrownOverlay = Boolean(
    isCameraEnabled &&
      (activePreviewReward ||
        isCompleted ||
        (arIntroReward && arIntroReward.enabled)) &&
      earnedRewardTier
  );

  // Parsed Question Blocks
  const questionBlocks = useMemo(() => {
    if (!activeExercise) return [];
    return parseQuestionBlocks(activeExercise.questionText);
  }, [activeExercise]);

  if (!activeSubject || !activeExercise) {
    return (
      <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-xs">
        <Target className="w-10 h-10 text-sky-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-600">
          {tr('catch_no_exercises', 'لا توجد تمارين صيد متاحة حالياً. يمكن للمعلم إضافتها من لوحة الإدارة.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Retry Banner */}
      {retryBannerMessage && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl text-xs font-bold text-sky-900 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-sky-600 shrink-0" />
          <span>{retryBannerMessage}</span>
        </div>
      )}

      {/* Preview Reward Banner */}
      {activePreviewReward && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs font-bold text-amber-950 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {tr('catch_preview_crown', 'معاينة تاج المكافأة AR:')} {activePreviewReward.title}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActivePreviewReward(null)}
            className="px-2.5 py-1 bg-white border border-amber-300 rounded-xl text-[11px] hover:bg-amber-100 cursor-pointer"
          >
            {tr('btn_close', 'إغلاق')}
          </button>
        </div>
      )}

      {/* Question Card Header (Text | Image | Audio) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-xl bg-sky-100 text-sky-900 font-extrabold text-xs">
              {tr('matching_modal_exercise_word', 'تمرين')} {activeExercise.exerciseNumber}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-[11px]">
              {getDictationTypeLabel(detectedType)}
            </span>
            {activeExercise.lockOnMistake && (
              <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[11px]">
                🔒 {tr('catch_locked_badge', 'بدون تراجع')}
              </span>
            )}
          </div>

          {/* Camera & AR Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCameraEnabled((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isCameraEnabled
                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {isCameraEnabled ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
              <span>
                {isCameraEnabled
                  ? tr('catch_camera_on', 'كاميرا AR مفعلة')
                  : tr('catch_touch_mode', 'وضع اللمس والفأرة')}
              </span>
            </button>

            {isCameraEnabled && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
                    setIsMirrored((prev) => !prev);
                  }}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
                  title={tr('catch_flip_cam', 'تبديل الكاميرا')}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMirrored((prev) => !prev)}
                  className={`p-1.5 rounded-xl border cursor-pointer ${
                    isMirrored
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title={tr('catch_mirror_cam', 'عكس المرآة')}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTrackingMode((prev) =>
                      prev === 'one_hand' ? 'off' : 'one_hand'
                    )
                  }
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border cursor-pointer ${
                    trackingMode !== 'off'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title={tr('catch_toggle_hand', 'تفعيل/إيقاف تتبع اليد')}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {arStatus.handsCount > 0
                      ? arStatus.isPinching
                        ? tr('catch_hand_pinched', 'قابض ✊')
                        : tr('catch_hand_open', 'يد مكتشفة 🖐️')
                      : trackingMode === 'off'
                      ? tr('catch_hand_off', 'يد معطلة')
                      : tr('catch_hand_waiting', 'بانتظار اليد...')}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Question Blocks */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {questionBlocks.map((blk, i) => {
            if (blk.type === 'text') {
              const displayQ = getTranslatedCatchQuestionText(
                activeSubject.subjectName,
                activeExercise.exerciseNumber,
                blk.value,
                currentLang,
                translations
              );
              return (
                <p
                  key={`qblk-txt-${i}`}
                  className="text-base sm:text-xl font-extrabold text-slate-900 font-amiri leading-relaxed"
                >
                  {displayQ}
                </p>
              );
            }
            if (blk.type === 'image') {
              const imgUrl = getDirectImageUrl(blk.value);
              return (
                <button
                  key={`qblk-img-${i}`}
                  type="button"
                  onClick={() => setLightboxImageUrl(imgUrl)}
                  className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 w-16 h-16 sm:w-20 sm:h-20 shrink-0 cursor-zoom-in shadow-2xs"
                >
                  <img
                    src={imgUrl}
                    alt="صورة السؤال"
                    className="w-full h-full object-contain p-1"
                  />
                  <span className="absolute bottom-1 right-1 bg-slate-900/70 text-white p-0.5 rounded-md opacity-80">
                    <ZoomIn className="w-3 h-3" />
                  </span>
                </button>
              );
            }
            const audKey = `catch-q-aud-${activeExercise.id}-${i}`;
            const isAudPlaying = playingMediaKey === audKey;
            return (
              <button
                key={`qblk-aud-${i}`}
                type="button"
                onClick={() => handlePlayMediaAudio(audKey, blk.value)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                  isAudPlaying
                    ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                }`}
              >
                {isAudPlaying ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{tr('catch_listen_question', 'استماع للسؤال')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Retry Lock Banner if student exhausted retries */}
      {isRetryLockedSubmitted ? (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200 shadow-xs text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
            {tr('catch_already_submitted_title', 'تم إرسال وتوثيق إجابتك في هذا التمرين')}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600">
            {tr('catch_your_score', 'درجتك المسجلة:')}{' '}
            <strong className="text-emerald-700">{recordedExerciseEntry?.percentage ?? 100}%</strong>
          </p>
          <p className="text-xs text-rose-700 font-bold">
            {catchRetryStatus.maxRetries > 0
              ? tr(
                  'retry_limit_reached_notice',
                  '🔒 وصلت للحد الأقصى لمحاولات الإعادة المسموح بها.'
                )
              : tr('lessons_retry_locked', 'الإعادة مغلقة من قبل المعلم')}
          </p>
        </div>
      ) : (
        /* INTERACTIVE AR AIR CATCH STAGE */
        <div
          ref={stageRef}
          className="relative w-full min-h-[460px] sm:min-h-[540px] rounded-3xl overflow-hidden border-2 border-slate-800 bg-slate-950 shadow-2xl select-none flex flex-col justify-between p-3 sm:p-5"
        >
          {/* Ambient Non-Camera Backdrop (when AR Camera is toggled OFF) */}
          {!isCameraEnabled && (
            <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-sky-950 to-slate-900 pointer-events-none">
              <div className="absolute top-6 right-8 w-56 h-56 rounded-full bg-sky-500/15 blur-3xl" />
              <div className="absolute bottom-6 left-8 w-64 h-64 rounded-full bg-cyan-500/15 blur-3xl" />
            </div>
          )}

          {/* Live AR Camera + MediaPipe Hand Tracking + Face Crown Overlay */}
          <ARCameraOverlay
            isARMode={isCameraEnabled}
            trackingMode={trackingMode}
            showCrown={showCrownOverlay}
            activeReward={earnedRewardTier}
            facingMode={facingMode}
            isMirrored={isMirrored}
            onCursorUpdate={handleCursorUpdate}
            onVideoElementReady={handleVideoElementReady}
            onDetectionUpdate={setArStatus}
            currentLang={currentLang}
            translations={translations}
          />

          {/* TOP: Target Answer Drop Zone */}
          <div
            ref={dropZoneRef}
            className={`relative z-10 w-full rounded-2xl p-3 sm:p-4 transition-all backdrop-blur-md border-2 ${
              isOverDropZone && grabbedTile
                ? 'bg-emerald-900/75 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.55)] scale-[1.01]'
                : 'bg-slate-900/75 border-sky-400/50 shadow-lg'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] sm:text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {isOverDropZone && grabbedTile
                    ? tr('catch_drop_now', 'أفلت الفقاعة الآن لوضعها هنا!')
                    : parsedBlanks.hasBlanks
                    ? tr('catch_target_fill', 'منطقة الإفلات — اسحب الفقاعة داخل الفراغ المضاء:')
                    : tr('catch_target_order', 'صندوق التكوين — اسحب أو انقر على الفقاعات لترتيبها هنا:')}
                </span>
              </span>

              {!isCompleted && !activeExercise.lockOnMistake && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[11px] font-bold cursor-pointer min-h-[34px]"
                  >
                    <Delete className="w-3 h-3" />
                    <span>{tr('dictation_btn_undo', 'تراجع')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-rose-600 text-slate-200 border border-slate-600 text-[11px] font-bold cursor-pointer min-h-[34px]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{tr('dictation_btn_clear', 'مسح')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Blanks Fill View OR Ordered Composition View */}
            {parsedBlanks.hasBlanks ? (
              <div
                className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 min-h-[64px]"
                dir="rtl"
              >
                {parsedBlanks.segments.map((seg, idx) => {
                  if (seg.kind === 'fixed') {
                    return (
                      <span
                        key={`seg-txt-${idx}`}
                        className="font-amiri text-2xl sm:text-3xl font-bold text-white leading-relaxed"
                      >
                        {seg.text}
                      </span>
                    );
                  }
                  const bIdx = seg.blankIndex ?? 0;
                  const assigned = blankAssignments[bIdx];
                  const isActiveSlot = activeBlankIdx === bIdx;

                  return (
                    <button
                      key={`seg-blk-${bIdx}`}
                      ref={(el) => {
                        blankSlotRefs.current[bIdx] = el;
                      }}
                      type="button"
                      onClick={() => {
                        if (assigned && !isCompleted && !activeExercise.lockOnMistake) {
                          handleRemovePlacedTile(assigned.id);
                        } else {
                          setActiveBlankIdx(bIdx);
                        }
                      }}
                      className={`min-w-[64px] min-h-[48px] px-3 py-1 rounded-xl border-2 font-amiri text-2xl font-bold transition-all cursor-pointer flex items-center justify-center ${
                        assigned
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                          : isActiveSlot
                          ? 'bg-sky-500/25 text-sky-200 border-sky-400 animate-pulse'
                          : 'bg-slate-800/80 text-slate-400 border-slate-600 border-dashed'
                      }`}
                    >
                      {assigned ? assigned.text : '؟'}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Assembled live preview */}
                {assembledPreview && (
                  <div
                    className="text-center font-amiri text-2xl sm:text-3xl font-extrabold text-amber-300 drop-shadow tracking-wide py-1"
                    dir="rtl"
                  >
                    {assembledPreview}
                  </div>
                )}

                <div
                  className="flex flex-wrap items-center justify-center gap-2 min-h-[62px] p-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80"
                  dir="rtl"
                >
                  {selectedTiles.length === 0 ? (
                    <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                      <MousePointerClick className="w-4 h-4 text-sky-400" />
                      <span>
                        {tr('catch_dropzone_empty', 'أفلت الفقاعات هنا أو اضغط على أي فقاعة بالأسفل')}
                      </span>
                    </span>
                  ) : (
                    selectedTiles.map((tile, tIdx) => (
                      <button
                        key={`placed-${tile.id}-${tIdx}`}
                        type="button"
                        onClick={() => handleRemovePlacedTile(tile.id)}
                        disabled={isCompleted || Boolean(activeExercise.lockOnMistake)}
                        className="min-w-[48px] min-h-[48px] px-3.5 py-1.5 rounded-2xl bg-linear-to-b from-sky-400 to-cyan-500 text-slate-950 font-amiri text-xl sm:text-2xl font-black border-2 border-white shadow-lg flex flex-col items-center justify-center hover:scale-105 transition-transform cursor-pointer disabled:cursor-default"
                      >
                        <span className="leading-none">{tile.text}</span>
                        {tile.label && (
                          <span className="text-[10px] font-cairo font-bold text-slate-900 mt-0.5 leading-none">
                            {translatePosLabel(tile.label)}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* MIDDLE: Floating Air Bubbles Pool */}
          {!isCompleted && (
            <div className="relative z-10 flex-1 flex items-center justify-center py-6 sm:py-8">
              <div
                className="flex flex-wrap items-center justify-center gap-3.5 sm:gap-5 max-w-2xl mx-auto"
                dir="rtl"
              >
                {shuffledTiles.map((tile, idx) => {
                  const isUsed = usedTileIds.has(tile.id);
                  const isHovered = hoveredBubbleId === tile.id;
                  const verticalShift = idx % 3 === 0 ? '-translate-y-2' : idx % 3 === 1 ? 'translate-y-2' : 'translate-y-0';

                  if (isUsed) {
                    return (
                      <div
                        key={`ghost-${tile.id}`}
                        className={`min-w-[60px] min-h-[60px] sm:min-w-[74px] sm:min-h-[74px] rounded-full border-2 border-dashed border-sky-400/25 bg-slate-900/20 ${verticalShift}`}
                      />
                    );
                  }

                  return (
                    <button
                      key={tile.id}
                      ref={(el) => {
                        bubbleRefs.current[tile.id] = el;
                      }}
                      type="button"
                      onClick={() => placeTileIntoTarget(tile)}
                      className={`min-w-[60px] min-h-[60px] sm:min-w-[76px] sm:min-h-[76px] px-4 py-2 rounded-full border-2 transition-all duration-150 cursor-pointer flex flex-col items-center justify-center shadow-xl ${verticalShift} ${
                        isHovered
                          ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 border-white scale-115 ring-4 ring-amber-300/60 shadow-[0_0_25px_rgba(251,191,36,0.75)]'
                          : 'bg-slate-900/80 hover:bg-sky-500 text-white border-sky-300/80 hover:border-white backdrop-blur-md hover:scale-110 shadow-[0_8px_22px_rgba(14,165,233,0.35)]'
                      }`}
                    >
                      <span className="font-amiri text-2xl sm:text-3xl font-black leading-none">
                        {tile.text}
                      </span>
                      {tile.label && (
                        <span
                          className={`mt-1 text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full ${
                            isHovered
                              ? 'bg-slate-950/20 text-slate-950'
                              : 'bg-sky-400/20 text-sky-200'
                          }`}
                        >
                          {translatePosLabel(tile.label)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* BOTTOM: Verify Button & Result Celebration Card */}
          <div className="relative z-10 space-y-2.5">
            {guidanceBox && (
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold backdrop-blur-md border flex items-center gap-2 ${
                  guidanceBox.type === 'success'
                    ? 'bg-emerald-950/85 text-emerald-200 border-emerald-400/60'
                    : guidanceBox.type === 'error'
                    ? 'bg-rose-950/85 text-rose-200 border-rose-400/60'
                    : 'bg-slate-900/80 text-sky-100 border-sky-400/40'
                }`}
              >
                {guidanceBox.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : guidanceBox.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                )}
                <span>{guidanceBox.message}</span>
              </div>
            )}

            {!isCompleted ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleVerifyAnswer}
                  disabled={!hasAnyInput}
                  className="flex items-center justify-center gap-2 px-8 py-3.5 min-h-[48px] rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-45 disabled:hover:scale-100 disabled:cursor-not-allowed"
                >
                  <Check className="w-5 h-5" />
                  <span>{tr('matching_btn_check', 'تحقق من الإجابة')}</span>
                </button>
              </div>
            ) : (
              /* Result Card inside Stage Bottom */
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 border-2 border-emerald-400 shadow-2xl space-y-3.5 text-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                        finalScore >= 70
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {finalScore}%
                    </div>
                    <div>
                      <h4 className="font-black text-sm sm:text-base text-slate-900 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-amber-500" />
                        <span>
                          {finalScore >= 70
                            ? tr('catch_result_win', 'أحسنت! نتيجة تحدي الصيد')
                            : tr('catch_result_done', 'نتيجة التمرين')}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-600 font-bold mt-0.5">
                        {tr('catch_your_answer', 'إجابتك:')} {lastSubmittedAnswer || '—'}
                      </p>
                    </div>
                  </div>

                  {earnedRewardTier && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold">
                      <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{earnedRewardTier.title}</span>
                    </div>
                  )}
                </div>

                {sheetSyncSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
                    {sheetSyncSuccess}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!sheetSyncSuccess && (
                      <button
                        type="button"
                        onClick={handleSubmitToSheet}
                        disabled={isSubmitting}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50 min-h-[44px]"
                      >
                        {isSubmitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>
                          {currentStudent
                            ? tr('catch_save_score_btn', 'حفظ النتيجة في (اجابات صيد)')
                            : tr('catch_login_to_save', 'سجل الدخول لحفظ النتيجة')}
                        </span>
                      </button>
                    )}

                    {(!sheetSyncSuccess || catchRetryStatus.canRetry) && (
                      <button
                        type="button"
                        onClick={sheetSyncSuccess ? handleTriggerRetryInArena : initExercise}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer min-h-[44px]"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>{tr('matching_btn_retry', 'إعادة المحاولة')}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleGoNextExercise}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md cursor-pointer min-h-[44px]"
                  >
                    <span>{tr('btn_next', 'التمرين التالي')}</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* LIVE AR VISUAL HAND CURSOR + DRAGGED FLOATING BUBBLE OVERLAY */}
          {isCameraEnabled && arCursor && (
            <div
              className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${arCursor.x}px`, top: `${arCursor.y}px` }}
            >
              {grabbedTile ? (
                <div className="min-w-[66px] min-h-[66px] px-4 py-2 rounded-full bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 border-3 border-white shadow-[0_0_28px_rgba(251,191,36,0.9)] flex flex-col items-center justify-center scale-110">
                  <span className="font-amiri text-2xl sm:text-3xl font-black leading-none">
                    {grabbedTile.text}
                  </span>
                  {grabbedTile.label && (
                    <span className="text-[10px] font-bold text-slate-900 mt-0.5 leading-none">
                      {translatePosLabel(grabbedTile.label)}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className={`w-10 h-10 rounded-full border-3 flex items-center justify-center transition-transform duration-75 ${
                    arPinching
                      ? 'bg-amber-400/50 border-amber-200 scale-75 shadow-[0_0_16px_rgba(251,191,36,0.9)]'
                      : hoveredBubbleId
                      ? 'bg-emerald-400/35 border-emerald-300 scale-125 shadow-[0_0_16px_rgba(52,211,153,0.8)]'
                      : 'bg-sky-400/25 border-sky-300 scale-100 shadow-[0_0_12px_rgba(56,189,248,0.7)]'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      arPinching ? 'bg-amber-200' : 'bg-white'
                    }`}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lightbox for Question Image */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[95] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div className="relative max-w-2xl max-h-[85dvh]">
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-white text-slate-800 shadow-lg flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImageUrl}
              alt="تكبير صورة السؤال"
              className="max-h-[82dvh] rounded-2xl border-4 border-white bg-white object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
