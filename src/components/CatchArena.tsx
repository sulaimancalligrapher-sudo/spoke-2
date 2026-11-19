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
  getTranslatedCatchSubject,
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
  buildCatchPlayableTiles,
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
import { arTrackingService } from '../arWriting/services/arTrackingService';
import { HandTrackingDisplayMode } from '../arWriting/types/drawing';
import { isMobileOrTabletDevice, isTouchLandscapeViewport } from '../arWriting/utils/devicePerformance';
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
  Play,
  ZoomIn,
  X,
  Lock,
  Loader2,
  Award,
  ArrowRight,
  ArrowLeftRight,
  Crown,
  MousePointerClick,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Settings,
  Home,
  Shuffle,
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
  onOpenLessons?: () => void;
  onGoHome?: () => void;
  isAdminAuthenticated?: boolean;
  onOpenAdminCatch?: () => void;
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

type CatchTouchMode = 'pinch_drag' | 'pinch_tap' | 'hover_touch';

interface BubblePhysics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
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
  onOpenLessons,
  onGoHome,
  isAdminAuthenticated,
  onOpenAdminCatch,
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
  const tr = useCallback(
    (id: string, fallback: string) => (t ? t(id, fallback) : fallback),
    [t]
  );

  const translatePosLabel = useCallback(
    (rawLabel?: string): string => {
      const clean = (rawLabel || '').trim();
      if (!clean) return '';
      if (clean === 'مفرد') return tr('dictation_pos_isolated', 'مفرد');
      if (clean === 'بداية') return tr('dictation_pos_initial', 'بداية');
      if (clean === 'وسط') return tr('dictation_pos_medial', 'وسط');
      if (clean === 'نهاية') return tr('dictation_pos_final', 'نهاية');
      return clean;
    },
    [tr]
  );

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
    const safeIdx = Math.min(Math.max(0, exerciseIndex), activeSubject.exercises.length - 1);
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
  const [trackingMode, setTrackingMode] = useState<HandTrackingDisplayMode>(() =>
    isMobileOrTabletDevice() ? 'finger_only' : 'one_hand'
  );
  const [touchCatchMode, setTouchCatchMode] = useState<CatchTouchMode>('pinch_drag');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [showCrownPref, setShowCrownPref] = useState<boolean>(true);
  const [isMotionPaused, setIsMotionPaused] = useState<boolean>(false);
  const [isArSettingsOpen, setIsArSettingsOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() => isTouchLandscapeViewport());
  const [showToolbarInLandscape, setShowToolbarInLandscape] = useState<boolean>(false);
  const prevMobileLandscapeRef = useRef<boolean>(isMobileLandscape);

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
      setShowCrownPref(true);
      setActivePreviewReward(previewRewardRequest.tier);
    }
  }, [previewRewardRequest]);

  // Mobile/Tablet landscape auto-fullscreen + collapsible toolbar & clean unmount stop of AR tracking
  useEffect(() => {
    const checkLandscape = () => {
      const landscape = isTouchLandscapeViewport();
      setIsMobileLandscape(landscape);
      if (landscape && !prevMobileLandscapeRef.current) {
        setShowToolbarInLandscape(false);
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        window.scrollTo?.(0, 1);
      } else if (!landscape && prevMobileLandscapeRef.current) {
        setShowToolbarInLandscape(false);
      }
      prevMobileLandscapeRef.current = landscape;
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    window.addEventListener('orientationchange', checkLandscape);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('resize', checkLandscape);
      window.removeEventListener('orientationchange', checkLandscape);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      try {
        arTrackingService.stop();
      } catch {}
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

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

  // Slim Side Result Panel State (right or left overlay over stage)
  const [resultSidebarOpen, setResultSidebarOpen] = useState<boolean>(false);
  const [resultSidebarSide, setResultSidebarSide] = useState<'right' | 'left'>(
    currentLang === 'ar' ? 'right' : 'left'
  );
  const [isResultSidebarCollapsed, setIsResultSidebarCollapsed] = useState<boolean>(false);
  const [attemptFeedback, setAttemptFeedback] = useState<{
    type: 'error' | 'info';
    message: string;
  } | null>(null);

  // Media Lightbox & Question Audio
  const [playingMediaKey, setPlayingMediaKey] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const mediaAudioRef = useRef<HTMLAudioElement | null>(null);

  // DOM & Physics Refs
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const arCursorDomRef = useRef<HTMLDivElement | null>(null);
  const dwellRingDomRef = useRef<HTMLDivElement | null>(null);
  const draggedCursorDomRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const bubblePhysicsRef = useRef<Record<string, BubblePhysics>>({});
  const blankSlotRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Discrete AR UI States (high-frequency position uses arCursorDomRef directly!)
  const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null);
  const [grabbedTile, setGrabbedTile] = useState<DictationTile | null>(null);
  const [isOverDropZone, setIsOverDropZone] = useState<boolean>(false);
  const [cursorPinchingVisual, setCursorPinchingVisual] = useState<boolean>(false);

  const prevPinchingRef = useRef<boolean>(false);
  const grabbedTileRef = useRef<DictationTile | null>(null);
  const grabStartTimeRef = useRef<number>(0);
  const grabStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredBubbleIdRef = useRef<string | null>(null);
  const dwellTargetIdRef = useRef<string | null>(null);
  const dwellStartTimeRef = useRef<number>(0);
  const catchCooldownUntilRef = useRef<number>(0);
  const isCompletedRef = useRef<boolean>(false);
  isCompletedRef.current = isCompleted;
  const touchCatchModeRef = useRef<CatchTouchMode>(touchCatchMode);
  touchCatchModeRef.current = touchCatchMode;
  const isMotionPausedRef = useRef<boolean>(isMotionPaused);
  isMotionPausedRef.current = isMotionPaused;

  useEffect(() => {
    dwellTargetIdRef.current = null;
    dwellStartTimeRef.current = 0;
    if (dwellRingDomRef.current) {
      dwellRingDomRef.current.style.background = 'transparent';
    }
    grabbedTileRef.current = null;
    setGrabbedTile(null);
    setIsOverDropZone(false);
  }, [touchCatchMode]);

  const stopMediaAudio = useCallback(() => {
    if (mediaAudioRef.current) {
      try {
        mediaAudioRef.current.pause();
      } catch {}
      mediaAudioRef.current = null;
    }
    setPlayingMediaKey(null);
  }, []);

  useEffect(() => {
    return () => {
      stopMediaAudio();
    };
  }, [stopMediaAudio]);

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
    const tiles = buildCatchPlayableTiles(effectivePool, activeExercise.correctAnswer, exType);

    setShuffledTiles(tiles);
    setSelectedTiles([]);
    setBlankAssignments({});
    setActiveBlankIdx(0);
    setGrabbedTile(null);
    grabbedTileRef.current = null;
    setHoveredBubbleId(null);
    hoveredBubbleIdRef.current = null;
    dwellTargetIdRef.current = null;
    dwellStartTimeRef.current = 0;
    catchCooldownUntilRef.current = 0;
    setIsOverDropZone(false);
    setWrongAttempts(0);
    setIsCompleted(false);
    setFinalScore(100);
    setLastSubmittedAnswer('');
    setSheetSyncSuccess(null);
    setResultSidebarOpen(false);
    setIsResultSidebarCollapsed(false);
    setAttemptFeedback(null);
    bubblePhysicsRef.current = {};
  }, [activeExercise, stopMediaAudio]);

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
      setAttemptFeedback(null);

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
      } else {
        setSelectedTiles((prev) => {
          if (prev.some((t) => t.id === tile.id)) return prev;
          return [...prev, tile];
        });
      }
    },
    [parsedBlanks, activeBlankIdx, blankAssignments]
  );

  const placeTileRef = useRef(placeTileIntoTarget);
  placeTileRef.current = placeTileIntoTarget;

  // Refs to current state for 60fps AR hit-testing & physics loops
  const shuffledTilesRef = useRef<DictationTile[]>(shuffledTiles);
  shuffledTilesRef.current = shuffledTiles;
  const usedTileIdsRef = useRef<Set<string>>(usedTileIds);
  usedTileIdsRef.current = usedTileIds;
  const parsedBlanksRef = useRef(parsedBlanks);
  parsedBlanksRef.current = parsedBlanks;

  // ---------------------------------------------------------------------------
  // 60FPS FLOATING BUBBLES PHYSICS ANIMATION LOOP
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isCompleted || isRetryLockedSubmitted) return;
    let rafId = 0;
    let lastTime = performance.now();

    const seedBubblePositions = () => {
      const pf = playfieldRef.current;
      if (!pf) return;
      const pfW = pf.clientWidth;
      const pfH = pf.clientHeight;
      if (pfW < 40 || pfH < 40) return;

      const activeTiles = shuffledTilesRef.current.filter(
        (t) => !usedTileIdsRef.current.has(t.id)
      );
      if (activeTiles.length === 0) return;

      const isSmallScreen = pfW < 520;
      const cols = Math.max(2, Math.min(isSmallScreen ? 4 : 6, Math.ceil(Math.sqrt(activeTiles.length * 1.4))));
      const rows = Math.max(1, Math.ceil(activeTiles.length / cols));
      const cellW = pfW / cols;
      const cellH = pfH / rows;
      const baseSpeed = isSmallScreen ? 32 : 44;

      activeTiles.forEach((tile, idx) => {
        const el = bubbleRefs.current[tile.id];
        const w = el?.offsetWidth || (isSmallScreen ? 62 : 76);
        const h = el?.offsetHeight || (isSmallScreen ? 62 : 76);

        if (!bubblePhysicsRef.current[tile.id]) {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const jitterX = (Math.random() - 0.5) * Math.max(8, cellW * 0.35);
          const jitterY = (Math.random() - 0.5) * Math.max(8, cellH * 0.35);
          const initX = Math.max(4, Math.min(pfW - w - 4, col * cellW + (cellW - w) / 2 + jitterX));
          const initY = Math.max(4, Math.min(pfH - h - 4, row * cellH + (cellH - h) / 2 + jitterY));
          const angle = Math.random() * Math.PI * 2;
          const speed = baseSpeed * (0.75 + Math.random() * 0.55);

          bubblePhysicsRef.current[tile.id] = {
            x: initX,
            y: initY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            w,
            h,
          };
          if (el) {
            el.style.transform = `translate3d(${initX}px, ${initY}px, 0)`;
          }
        } else {
          bubblePhysicsRef.current[tile.id].w = w;
          bubblePhysicsRef.current[tile.id].h = h;
        }
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const pf = playfieldRef.current;
      if (pf && pf.clientWidth > 40 && pf.clientHeight > 40) {
        seedBubblePositions();
        const pfW = pf.clientWidth;
        const pfH = pf.clientHeight;
        const visibleIds = shuffledTilesRef.current
          .filter((t) => !usedTileIdsRef.current.has(t.id))
          .map((t) => t.id);

        if (!isMotionPausedRef.current) {
          // Move & bounce
          for (const id of visibleIds) {
            const p = bubblePhysicsRef.current[id];
            if (!p) continue;
            const slowFactor = hoveredBubbleIdRef.current === id ? 0.1 : 1;
            p.x += p.vx * dt * slowFactor;
            p.y += p.vy * dt * slowFactor;

            const maxX = Math.max(4, pfW - p.w - 4);
            const maxY = Math.max(4, pfH - p.h - 4);
            if (p.x <= 4) {
              p.x = 4;
              p.vx = Math.abs(p.vx);
            } else if (p.x >= maxX) {
              p.x = maxX;
              p.vx = -Math.abs(p.vx);
            }
            if (p.y <= 4) {
              p.y = 4;
              p.vy = Math.abs(p.vy);
            } else if (p.y >= maxY) {
              p.y = maxY;
              p.vy = -Math.abs(p.vy);
            }
          }

          // Gentle bubble-to-bubble separation so letters stay readable
          for (let i = 0; i < visibleIds.length; i++) {
            const a = bubblePhysicsRef.current[visibleIds[i]];
            if (!a) continue;
            for (let j = i + 1; j < visibleIds.length; j++) {
              const b = bubblePhysicsRef.current[visibleIds[j]];
              if (!b) continue;
              const ax = a.x + a.w / 2;
              const ay = a.y + a.h / 2;
              const bx = b.x + b.w / 2;
              const by = b.y + b.h / 2;
              const dx = bx - ax;
              const dy = by - ay;
              const dist = Math.hypot(dx, dy) || 0.01;
              const minDist = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) * 0.56;
              if (dist < minDist) {
                const overlap = (minDist - dist) * 0.5;
                const nx = dx / dist;
                const ny = dy / dist;
                a.x -= nx * overlap;
                a.y -= ny * overlap;
                b.x += nx * overlap;
                b.y += ny * overlap;
              }
            }
          }
        }

        // Write transforms directly to DOM (60fps, zero React re-renders)
        for (const id of visibleIds) {
          const p = bubblePhysicsRef.current[id];
          const el = bubbleRefs.current[id];
          if (p && el) {
            el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [shuffledTiles, isCompleted, isRetryLockedSubmitted]);

  // ---------------------------------------------------------------------------
  // FIXED 60FPS AR CURSOR + DIRECT AIR-TOUCH + PINCH GRAB / CLICK-DROP
  // ---------------------------------------------------------------------------
  const handleCursorUpdate = useCallback(
    (cursor: { x: number; y: number } | null, isPinching: boolean) => {
      const stageEl = stageRef.current;
      const cursorDom = arCursorDomRef.current;
      const draggedDom = draggedCursorDomRef.current;
      const dwellRingDom = dwellRingDomRef.current;

      if (!stageEl || !cursor) {
        if (cursorDom) cursorDom.style.opacity = '0';
        if (draggedDom) draggedDom.style.opacity = '0';
        if (dwellRingDom) dwellRingDom.style.background = 'transparent';
        if (hoveredBubbleIdRef.current !== null) {
          hoveredBubbleIdRef.current = null;
          setHoveredBubbleId(null);
        }
        dwellTargetIdRef.current = null;
        dwellStartTimeRef.current = 0;
        setIsOverDropZone(false);
        setCursorPinchingVisual(false);
        if (!cursor && grabbedTileRef.current) {
          grabbedTileRef.current = null;
          setGrabbedTile(null);
        }
        prevPinchingRef.current = false;
        return;
      }

      // Position AR hand cursor in stage percentages (ARCameraOverlay returns normalized [0, 1]!)
      const pctX = `${(cursor.x * 100).toFixed(2)}%`;
      const pctY = `${(cursor.y * 100).toFixed(2)}%`;
      if (cursorDom) {
        cursorDom.style.opacity = '1';
        cursorDom.style.left = pctX;
        cursorDom.style.top = pctY;
      }
      if (draggedDom) {
        draggedDom.style.opacity = grabbedTileRef.current ? '1' : '0';
        draggedDom.style.left = pctX;
        draggedDom.style.top = pctY;
      }

      const stageRect = stageEl.getBoundingClientRect();
      // Convert normalized [0, 1] -> absolute client coordinates for getBoundingClientRect() hit-testing
      const clientX = stageRect.left + cursor.x * stageRect.width;
      const clientY = stageRect.top + cursor.y * stageRect.height;

      const wasPinching = prevPinchingRef.current;
      prevPinchingRef.current = isPinching;
      if (isPinching !== wasPinching) {
        setCursorPinchingVisual(isPinching);
      }

      // 1. Hit-test Bottom Answer Drop Zone (extra +48px top margin for effortless drop)
      let overDrop = false;
      let hoveredBlank: number | undefined = undefined;
      if (dropZoneRef.current) {
        const dzRect = dropZoneRef.current.getBoundingClientRect();
        if (
          clientX >= dzRect.left - 32 &&
          clientX <= dzRect.right + 32 &&
          clientY >= dzRect.top - 48 &&
          clientY <= dzRect.bottom + 32
        ) {
          overDrop = true;
          if (parsedBlanksRef.current.hasBlanks) {
            for (const [idxStr, slotEl] of Object.entries(blankSlotRefs.current)) {
              if (!slotEl) continue;
              const sRect = slotEl.getBoundingClientRect();
              if (
                clientX >= sRect.left - 18 &&
                clientX <= sRect.right + 18 &&
                clientY >= sRect.top - 18 &&
                clientY <= sRect.bottom + 18
              ) {
                hoveredBlank = Number(idxStr);
                break;
              }
            }
          }
        }
      }
      setIsOverDropZone((prev) => (prev === overDrop ? prev : overDrop));

      // 2. Hit-test Floating Bubbles (distance to nearest center within radius + 22px tolerance)
      let foundBubbleId: string | null = null;
      let bestDist = Infinity;
      if (!isCompletedRef.current && !grabbedTileRef.current) {
        for (const tile of shuffledTilesRef.current) {
          if (usedTileIdsRef.current.has(tile.id)) continue;
          const el = bubbleRefs.current[tile.id];
          if (!el) continue;
          const bRect = el.getBoundingClientRect();
          if (bRect.width <= 0 || bRect.height <= 0) continue;
          const margin = 22;
          if (
            clientX >= bRect.left - margin &&
            clientX <= bRect.right + margin &&
            clientY >= bRect.top - margin &&
            clientY <= bRect.bottom + margin
          ) {
            const cx = (bRect.left + bRect.right) / 2;
            const cy = (bRect.top + bRect.bottom) / 2;
            const d = Math.hypot(clientX - cx, clientY - cy);
            if (d < bestDist) {
              bestDist = d;
              foundBubbleId = tile.id;
            }
          }
        }
      }

      if (hoveredBubbleIdRef.current !== foundBubbleId) {
        hoveredBubbleIdRef.current = foundBubbleId;
        setHoveredBubbleId(foundBubbleId);
      }

      const now = performance.now();
      const mode = touchCatchModeRef.current;

      // 3. Index-Finger Dwell Auto-Catch: ONLY active when explicitly set to 'hover_touch'!
      if (
        mode === 'hover_touch' &&
        !isCompletedRef.current &&
        !grabbedTileRef.current &&
        !isPinching &&
        foundBubbleId &&
        now >= catchCooldownUntilRef.current
      ) {
        if (dwellTargetIdRef.current !== foundBubbleId) {
          dwellTargetIdRef.current = foundBubbleId;
          dwellStartTimeRef.current = now;
        }
        const elapsed = now - dwellStartTimeRef.current;
        const DWELL_MS = 450;
        const progress = Math.min(1, elapsed / DWELL_MS);
        if (dwellRingDom) {
          const deg = Math.round(progress * 360);
          dwellRingDom.style.background = `conic-gradient(#34d399 ${deg}deg, rgba(255,255,255,0.16) ${deg}deg)`;
        }
        if (elapsed >= DWELL_MS) {
          const touchedTile =
            shuffledTilesRef.current.find((t) => t.id === foundBubbleId) || null;
          dwellTargetIdRef.current = null;
          dwellStartTimeRef.current = 0;
          catchCooldownUntilRef.current = now + 480;
          if (dwellRingDom) dwellRingDom.style.background = 'transparent';
          if (touchedTile) {
            hoveredBubbleIdRef.current = null;
            setHoveredBubbleId(null);
            placeTileRef.current(touchedTile);
            return;
          }
        }
      } else {
        dwellTargetIdRef.current = null;
        dwellStartTimeRef.current = 0;
        if (dwellRingDom) dwellRingDom.style.background = 'transparent';
      }

      // 4. Transition: Open -> Pinch (Thumb + Index meet over a bubble => Grab!)
      if (!wasPinching && isPinching && !isCompletedRef.current && !grabbedTileRef.current) {
        if (foundBubbleId && now >= catchCooldownUntilRef.current) {
          const targetTile =
            shuffledTilesRef.current.find((t) => t.id === foundBubbleId) || null;
          if (targetTile) {
            grabbedTileRef.current = targetTile;
            grabStartTimeRef.current = now;
            grabStartPosRef.current = { x: clientX, y: clientY };
            setGrabbedTile(targetTile);
            playCatchChime('grab');
          }
        }
      }

      // 5. Transition: Pinch -> Open (Thumb & Index separate => Drop or Tap-Catch)
      if (wasPinching && !isPinching && grabbedTileRef.current) {
        const released = grabbedTileRef.current;
        grabbedTileRef.current = null;
        grabStartPosRef.current = null;
        setGrabbedTile(null);
        setIsOverDropZone(false);

        if (!isCompletedRef.current) {
          if (mode === 'pinch_drag') {
            // Strict Drag-and-Drop: ONLY place if dropped inside the lower Answer Box!
            if (overDrop) {
              catchCooldownUntilRef.current = now + 400;
              placeTileRef.current(released, hoveredBlank);
            }
          } else if (mode === 'pinch_tap') {
            // Intentional Pinch-Tap: pinching thumb+index over bubble catches it immediately on release!
            catchCooldownUntilRef.current = now + 400;
            placeTileRef.current(released, overDrop ? hoveredBlank : undefined);
          } else if (mode === 'hover_touch' && overDrop) {
            catchCooldownUntilRef.current = now + 400;
            placeTileRef.current(released, hoveredBlank);
          }
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
    setAttemptFeedback(null);
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
    setAttemptFeedback(null);
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
    setAttemptFeedback(null);
    setSelectedTiles([]);
    setBlankAssignments({});
    setActiveBlankIdx(0);
  };

  const handleReshuffleRemaining = () => {
    bubblePhysicsRef.current = {};
    setShuffledTiles((prev) => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  };

  const assembledPreview = useMemo(() => {
    if (parsedBlanks.hasBlanks) return '';
    return formatAssembledPreview(selectedTiles, detectedType, activeExercise?.correctAnswer);
  }, [parsedBlanks.hasBlanks, selectedTiles, detectedType, activeExercise?.correctAnswer]);

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
        setAttemptFeedback({
          type: 'error',
          message: tr('catch_err_fill_blanks', 'يرجى إكمال جميع الفراغات أولاً.'),
        });
        setResultSidebarOpen(true);
        setIsResultSidebarCollapsed(false);
        return;
      }
    } else if (selectedTiles.length === 0) {
      playCatchChime('error');
      setAttemptFeedback({
        type: 'error',
        message: tr('catch_err_empty', 'اصطد الفقاعات أولاً ثم اضغط «تحقق».'),
      });
      setResultSidebarOpen(true);
      setIsResultSidebarCollapsed(false);
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
      setAttemptFeedback(null);
      setResultSidebarOpen(true);
      setIsResultSidebarCollapsed(false);
      playCatchChime('success');
    } else {
      playCatchChime('error');
      const nextWrong = wrongAttempts + 1;
      setWrongAttempts(nextWrong);

      if (activeExercise.lockOnMistake) {
        setFinalScore(0);
        setLastSubmittedAnswer(res.assembledAnswer);
        setIsCompleted(true);
        setAttemptFeedback(null);
        setResultSidebarOpen(true);
        setIsResultSidebarCollapsed(false);
      } else {
        setAttemptFeedback({
          type: 'error',
          message: tr(
            'catch_wrong_retry',
            'حاول مرة أخرى! يمكنك التعديل في الصندوق بالأسفل ثم التحقق مجدداً.'
          ),
        });
        setResultSidebarOpen(true);
        setIsResultSidebarCollapsed(false);
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
        ? tr('catch_saved_sheet', '✅ تم حفظ الدرجة في (اجابات صيد)')
        : tr('catch_saved_local', '✅ تم الحفظ محلياً مؤقتاً')
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

  const handleCloseAfterSave = () => {
    initExercise();
    onOpenLessons?.();
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
      showCrownPref &&
      (activePreviewReward || isCompleted || (arIntroReward && arIntroReward.enabled)) &&
      earnedRewardTier
  );

  // Parsed Question Blocks
  const questionBlocks = useMemo(() => {
    if (!activeExercise) return [];
    return parseQuestionBlocks(activeExercise.questionText);
  }, [activeExercise]);

  const totalExercises = activeSubject?.exercises.length || 0;
  const safeExIdx =
    totalExercises > 0 ? Math.min(Math.max(0, exerciseIndex), totalExercises - 1) : 0;

  if (!activeSubject || !activeExercise) {
    return (
      <div className="flex flex-col w-full h-[calc(100dvh-96px)] sm:h-[calc(100dvh-65px)] min-h-[540px] bg-slate-950 text-slate-100 font-cairo items-center justify-center p-6 text-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md space-y-3 shadow-2xl">
          <Target className="w-12 h-12 text-sky-400 mx-auto" />
          <p className="text-sm font-bold text-slate-300">
            {tr('catch_no_exercises', 'لا توجد تمارين صيد متاحة حالياً. يمكن للمعلم إضافتها من لوحة الإدارة.')}
          </p>
          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              {tr('home_title', 'الصفحة الرئيسية')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      className={
        isMobileLandscape || isFullscreen
          ? 'fixed inset-0 z-[80] flex flex-col h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 font-cairo'
          : 'flex flex-col w-full h-[calc(100dvh-96px)] sm:h-[calc(100dvh-65px)] min-h-[540px] shrink-0 overflow-hidden bg-slate-950 text-slate-100 font-cairo'
      }
    >
      {/* ================================================================ */}
      {/* BAR 1: TOP TOOLS HEADER (شريط الأدوات العلوي على غرار تمرين الكتابة) */}
      {/* ================================================================ */}
      {(!isMobileLandscape || showToolbarInLandscape) && (
      <header className="relative w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 z-50 select-none shadow-md">
        <div
          className={`max-w-7xl mx-auto px-2 sm:px-4 ${
            isMobileLandscape ? 'py-1' : 'py-1.5 sm:py-2'
          } flex items-center justify-between gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-none`}
        >
          {/* Start Section: Home + Lessons Folder + Subject & Exercise Navigator */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onGoHome && (
              <button
                type="button"
                onClick={onGoHome}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all active:scale-95 cursor-pointer"
                title={tr('catch_home_btn', 'الصفحة الرئيسية')}
              >
                <Home className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {onOpenLessons && (
              <button
                type="button"
                onClick={onOpenLessons}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-sky-400 border border-slate-700 transition-all active:scale-95 cursor-pointer relative"
                title={tr('catch_lessons_list_btn', 'قائمة دروس الصيد')}
                aria-label={tr('catch_lessons_list_btn', 'قائمة دروس الصيد')}
              >
                <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-sky-400 ring-2 ring-slate-900" />
              </button>
            )}

            <div className="h-5 w-px bg-slate-800 mx-0.5 hidden sm:block" />

            {/* Subject Dropdown */}
            <div className="px-2 py-1 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center">
              <select
                value={activeSubject.id}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setExerciseIndex(0);
                  onSelectSubjectExercise?.(e.target.value, 0);
                }}
                className="bg-transparent text-xs font-bold text-sky-200 focus:outline-hidden cursor-pointer max-w-[110px] sm:max-w-[175px] truncate"
              >
                {subjects.map((subj) => (
                  <option key={subj.id} value={subj.id} className="bg-slate-900 text-slate-100">
                    {getTranslatedCatchSubject(subj.subjectName, currentLang, translations)} ({subj.exercises.length})
                  </option>
                ))}
              </select>
            </div>

            {/* Exercise Prev / Next */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-800/90 border border-slate-700 rounded-xl px-1 py-0.5 text-[11px] sm:text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  if (safeExIdx > 0) {
                    setExerciseIndex(safeExIdx - 1);
                    onSelectSubjectExercise?.(activeSubject.id, safeExIdx - 1);
                  }
                }}
                disabled={safeExIdx === 0}
                className="p-1 rounded-lg hover:bg-slate-700 disabled:opacity-35 text-slate-200 cursor-pointer disabled:cursor-not-allowed"
                title={tr('catch_prev_exercise', 'التمرين السابق')}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="px-1 sm:px-1.5 text-slate-200 whitespace-nowrap tabular-nums">
                {activeExercise.exerciseNumber}/{totalExercises}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (safeExIdx < totalExercises - 1) {
                    setExerciseIndex(safeExIdx + 1);
                    onSelectSubjectExercise?.(activeSubject.id, safeExIdx + 1);
                  }
                }}
                disabled={safeExIdx >= totalExercises - 1}
                className="p-1 rounded-lg hover:bg-slate-700 disabled:opacity-35 text-slate-200 cursor-pointer disabled:cursor-not-allowed"
                title={tr('catch_next_exercise', 'التمرين التالي')}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Center / End Controls: AR Mode + Settings + Motion + Hand Status + Admin + Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Toggle AR Camera vs Dark Backdrop */}
            <button
              type="button"
              onClick={() => setIsCameraEnabled((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isCameraEnabled
                  ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={isCameraEnabled ? tr('catch_camera_on', 'كاميرا AR مفعلة') : tr('catch_touch_mode', 'وضع اللمس والفأرة')}
            >
              {isCameraEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              <span className="hidden md:inline">
                {isCameraEnabled ? tr('catch_ar_on_short', 'كاميرا AR') : tr('catch_ar_off_short', 'خلفية داكنة')}
              </span>
            </button>

            {/* AR Settings Popover Trigger (shows active catch mode pill on larger screens) */}
            {isCameraEnabled && (
              <button
                type="button"
                onClick={() => setIsArSettingsOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-all cursor-pointer text-[11px] font-bold ${
                  isArSettingsOpen
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title={tr('catch_ar_settings', 'إعدادات اليد والكاميرا')}
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">
                  {touchCatchMode === 'pinch_drag'
                    ? tr('catch_mode_badge_pinch_drag', 'السبابة + الإبهام (سحب)')
                    : touchCatchMode === 'pinch_tap'
                    ? tr('catch_mode_badge_pinch_tap', 'السبابة + الإبهام (نقر)')
                    : tr('catch_mode_badge_hover', 'لمس بالسبابة')}
                </span>
              </button>
            )}

            {/* Bubble Motion Play/Pause */}
            <button
              type="button"
              onClick={() => setIsMotionPaused((prev) => !prev)}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isMotionPaused
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border-slate-700'
              }`}
              title={isMotionPaused ? tr('catch_resume_motion', 'تشغيل حركة الحروف') : tr('catch_pause_motion', 'تثبيت الحروف مؤقتاً')}
            >
              {isMotionPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>

            {/* Shuffle Bubbles */}
            <button
              type="button"
              onClick={handleReshuffleRemaining}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
              title={tr('catch_shuffle_btn', 'توزيع جديد للفقاعات')}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Hand Tracking Live Status Indicator */}
            {isCameraEnabled && (
              <div
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${
                  arStatus.handsCount > 0
                    ? arStatus.isPinching
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700'
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
                <span>
                  {arStatus.handsCount > 0
                    ? arStatus.isPinching
                      ? tr('catch_hand_pinched', 'قابض ✊')
                      : tr('catch_hand_open', 'يد مكتشفة 🖐️')
                    : trackingMode === 'off'
                    ? tr('catch_hand_off', 'يد معطلة')
                    : tr('catch_hand_waiting', 'بانتظار اليد...')}
                </span>
              </div>
            )}

            {isAdminAuthenticated && onOpenAdminCatch && (
              <button
                type="button"
                onClick={onOpenAdminCatch}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-all cursor-pointer"
                title={tr('catch_admin_manage_link', 'إدارة تحدي الصيد')}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
              title={
                isFullscreen
                  ? tr('catch_btn_exit_fullscreen', 'إلغاء ملء الشاشة')
                  : tr('catch_btn_fullscreen', 'ملء الشاشة')
              }
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* AR Settings Popover Dropdown */}
        {isArSettingsOpen && isCameraEnabled && (
          <div className="absolute top-full left-2 sm:left-6 mt-1.5 w-[min(92vw,340px)] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-3.5 z-50 space-y-3 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-extrabold text-sky-300 flex items-center gap-1.5">
                <Hand className="w-4 h-4" />
                <span>{tr('catch_ar_settings', 'إعدادات اليد والكاميرا')}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsArSettingsOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Catch Method: Pinch+Drag vs Pinch-Tap vs Index Hover Auto */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">
                {tr('catch_ar_method_label', 'طريقة اصطياد الحرف باليد:')}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setTouchCatchMode('pinch_drag')}
                  className={`w-full px-2.5 py-2 rounded-xl font-bold border text-[11px] cursor-pointer transition-all text-right flex items-center justify-between gap-2 ${
                    touchCatchMode === 'pinch_drag'
                      ? 'bg-sky-500 text-slate-950 border-sky-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <span>{tr('catch_method_pinch_drag', 'قبض وسحب (السبابة + الإبهام)')}</span>
                  <span>🤌</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTouchCatchMode('pinch_tap')}
                  className={`w-full px-2.5 py-2 rounded-xl font-bold border text-[11px] cursor-pointer transition-all text-right flex items-center justify-between gap-2 ${
                    touchCatchMode === 'pinch_tap'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <span>{tr('catch_method_pinch_tap', 'نقرة (السبابة + الإبهام)')}</span>
                  <span>👌</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTouchCatchMode('hover_touch')}
                  className={`w-full px-2.5 py-2 rounded-xl font-bold border text-[11px] cursor-pointer transition-all text-right flex items-center justify-between gap-2 ${
                    touchCatchMode === 'hover_touch'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <span>{tr('catch_method_hover_touch', 'لمس بالسبابة فقط (تلقائي)')}</span>
                  <span>☝️</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1.5">
                {touchCatchMode === 'pinch_drag'
                  ? tr(
                      'catch_method_pinch_drag_hint',
                      'قرّب الإبهام والسبابة على الحرف لالتقاطه ثم اسحبه لصندوق الإجابة بالأسفل وأفلته.'
                    )
                  : touchCatchMode === 'pinch_tap'
                  ? tr(
                      'catch_method_pinch_tap_hint',
                      'وجّه المؤشر على الحرف ثم طبّق السبابة والإبهام معاً لوضعه مباشرة في الصندوق.'
                    )
                  : tr(
                      'catch_method_hover_touch_hint',
                      'ثبّت إصبع السبابة فوق الحرف نصف ثانية ليتم التقاطه تلقائياً دون قبض.'
                    )}
              </p>
            </div>

            {/* Hand Tracking Visual Display Mode */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">
                {tr('catch_tracking_display', 'عرض شكل اليد على الشاشة (مرئي فقط):')}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 'finger_only', label: tr('catch_track_finger_only', 'السبابة') },
                    { id: 'one_hand', label: tr('catch_track_one_hand', 'يد واحدة') },
                    { id: 'two_hands', label: tr('catch_track_two_hands', 'يدان') },
                    { id: 'off', label: tr('catch_track_off', 'إيقاف') },
                  ] as { id: HandTrackingDisplayMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTrackingMode(opt.id)}
                    className={`px-1.5 py-1.5 rounded-xl font-bold border text-[10px] cursor-pointer transition-all ${
                      trackingMode === opt.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Facing / Mirror / Crown */}
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
                  setIsMirrored((prev) => !prev);
                }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{tr('catch_flip_cam', 'تبديل الكاميرا')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMirrored((prev) => !prev)}
                className={`flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl border font-bold cursor-pointer ${
                  isMirrored
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title={tr('catch_mirror_cam', 'عكس المرآة')}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                <span>{tr('catch_mirror_short', 'مرآة')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCrownPref((prev) => !prev)}
                className={`flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl border font-bold cursor-pointer ${
                  showCrownPref
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title={tr('catch_crown_toggle', 'تاج المكافأة AR')}
              >
                <Crown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>
      )}

      {/* ================================================================ */}
      {/* MAIN AR STAGE WORKSPACE                                           */}
      {/* ================================================================ */}
      <div
        className={`relative flex-1 min-h-0 w-full overflow-hidden flex flex-col items-center justify-center ${
          isMobileLandscape ? 'p-0' : 'p-1.5 sm:p-3'
        }`}
      >
        <div
          ref={stageRef}
          className={`relative flex-1 w-full h-full min-h-0 overflow-hidden shadow-2xl bg-slate-950 select-none ${
            isMobileLandscape
              ? 'max-w-none rounded-none border-0'
              : 'max-w-6xl rounded-2xl border border-slate-800'
          }`}
        >
          {/* Ambient Non-Camera Backdrop (when AR Camera is toggled OFF) */}
          {!isCameraEnabled && (
            <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-sky-950 to-slate-900 pointer-events-none z-0">
              <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-sky-500/15 blur-3xl" />
              <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full bg-cyan-500/15 blur-3xl" />
            </div>
          )}

          {/* Layer 0: Live AR Camera + Hand Skeleton + Royal Crown */}
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

          {/* ============================================================ */}
          {/* STAGE FOREGROUND LAYOUT: BAR 2 + PLAYFIELD + BOTTOM ANSWER BOX */}
          {/* ============================================================ */}
          <div className="relative z-10 w-full h-full flex flex-col justify-between pointer-events-none">
            {/* BAR 2: INNER TOP BAR (Compact Controls + Action + Mobile Tools Toggle) */}
            <div
              className={`shrink-0 pointer-events-none ${
                isMobileLandscape ? 'px-0 pt-0' : 'px-2 sm:px-4 pt-2 sm:pt-3'
              }`}
            >
              <div
                className={`pointer-events-auto mx-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 flex items-center justify-between shadow-xl ${
                  isMobileLandscape
                    ? 'w-full px-2.5 py-1 rounded-b-xl border-t-0 gap-1.5'
                    : 'max-w-5xl rounded-2xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 gap-2'
                }`}
              >
                {/* Start Side: AR Badge + Exercise Type / Lock */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
                  <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/40 text-[10px] sm:text-xs font-black shrink-0">
                    AR
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700 text-[10px] sm:text-xs font-bold tabular-nums shrink-0">
                    {activeExercise.exerciseNumber}/{totalExercises}
                  </span>
                  {activeExercise.lockOnMistake && (
                    <span className="hidden sm:inline-flex px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                      🔒 {tr('catch_locked_badge', 'بدون تراجع')}
                    </span>
                  )}
                  <span className="hidden md:inline-flex px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-bold">
                    {tr(`catch_type_${detectedType}`, getDictationTypeLabel(detectedType))}
                  </span>
                </div>

                {/* Center: Check / Result / Post-Save Close Action */}
                <div className="flex items-center justify-center gap-1.5 shrink-0">
                  {!isRetryLockedSubmitted && (
                    !isCompleted ? (
                      <button
                        type="button"
                        onClick={handleVerifyAnswer}
                        className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-xl font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer whitespace-nowrap ${
                          hasAnyInput
                            ? 'bg-linear-to-r from-emerald-400 to-teal-400 hover:brightness-110 text-slate-950 active:scale-95'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'
                        }`}
                      >
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{tr('catch_btn_check', 'تحقق')}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setResultSidebarOpen((prev) => !prev)}
                          className="flex items-center gap-1.5 px-3 sm:px-4 py-1 sm:py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <Award className="w-4 h-4 shrink-0" />
                          <span>
                            {resultSidebarOpen
                              ? tr('catch_hide_result', 'إخفاء النتيجة')
                              : `${tr('catch_show_result', 'النتيجة')} (${finalScore}%)`}
                          </span>
                        </button>
                        {sheetSyncSuccess && onOpenLessons && (
                          <button
                            type="button"
                            onClick={handleCloseAfterSave}
                            className="flex items-center gap-1 px-3 sm:px-4 py-1 sm:py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                            title={tr('catch_btn_close', 'إغلاق')}
                          >
                            <X className="w-3.5 h-3.5 shrink-0" />
                            <span>{tr('catch_btn_close', 'إغلاق')}</span>
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>

                {/* End Side: Mobile Landscape Tools Toggle + Quick Lessons + Fullscreen */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {isMobileLandscape && (
                    <button
                      type="button"
                      onClick={() => setShowToolbarInLandscape((prev) => !prev)}
                      title={tr('catch_btn_tools_short', 'الأدوات')}
                      className={`p-1 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0 ${
                        showToolbarInLandscape
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                          : 'bg-slate-800/85 hover:bg-slate-700 text-amber-300 border-slate-700/60'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span>{tr('catch_btn_tools_short', 'الأدوات')}</span>
                    </button>
                  )}

                  {isMobileLandscape && onOpenLessons && !showToolbarInLandscape && (
                    <button
                      type="button"
                      onClick={onOpenLessons}
                      title={tr('catch_lessons_list_btn', 'قائمة دروس الصيد')}
                      aria-label={tr('catch_lessons_list_btn', 'قائمة دروس الصيد')}
                      className="p-1 rounded-lg bg-slate-800/85 hover:bg-slate-700 text-sky-300 border border-slate-700/60 active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={
                      isFullscreen
                        ? tr('catch_btn_exit_fullscreen', 'إلغاء ملء الشاشة')
                        : tr('catch_btn_fullscreen', 'ملء الشاشة')
                    }
                    className={`${
                      isMobileLandscape
                        ? 'p-1 rounded-lg'
                        : 'p-1.5 sm:p-2 rounded-xl'
                    } bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 active:scale-95 transition-all cursor-pointer shrink-0`}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Optional Compact Retry / Preview Reward Notices below Bar 2 */}
              {(retryBannerMessage || activePreviewReward) && (
                <div className="max-w-3xl mx-auto mt-1.5 flex flex-wrap items-center justify-center gap-2 pointer-events-auto">
                  {retryBannerMessage && (
                    <div className="px-3 py-1 rounded-xl bg-sky-900/90 border border-sky-400/50 text-[11px] font-bold text-sky-100 flex items-center gap-1.5 shadow-md">
                      <RotateCcw className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span>{retryBannerMessage}</span>
                    </div>
                  )}
                  {activePreviewReward && (
                    <div className="px-3 py-1 rounded-xl bg-amber-900/90 border border-amber-400/60 text-[11px] font-bold text-amber-100 flex items-center gap-2 shadow-md">
                      <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>{activePreviewReward.title}</span>
                      <button
                        type="button"
                        onClick={() => setActivePreviewReward(null)}
                        className="p-0.5 rounded-md bg-amber-950/60 hover:bg-amber-950 text-amber-200 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* RETRY LOCKED STATE OR FLEXIBLE MIDDLE FLOATING PLAYFIELD     */}
            {/* ============================================================ */}
            {isRetryLockedSubmitted ? (
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 pointer-events-auto">
                <div className="bg-slate-900/92 border border-amber-400/50 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-3 shadow-2xl">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white">
                    {tr('catch_already_submitted_title', 'تم إرسال وتوثيق إجابتك في هذا التمرين')}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {tr('catch_your_score', 'درجتك المسجلة:')}{' '}
                    <strong className="text-emerald-400">{recordedExerciseEntry?.percentage ?? 100}%</strong>
                  </p>
                  <p className="text-xs text-rose-300 font-bold">
                    {catchRetryStatus.maxRetries > 0
                      ? tr(
                          'retry_limit_reached_notice',
                          '🔒 وصلت للحد الأقصى لمحاولات الإعادة المسموح بها.'
                        )
                      : tr('lessons_retry_locked', 'الإعادة مغلقة من قبل المعلم')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* MIDDLE FLOATING PLAYFIELD (Dynamically fills space between Bar 2 & Bottom Box) */}
                {!isCompleted ? (
                  <div
                    ref={playfieldRef}
                    className="relative flex-1 min-h-[120px] mx-2 sm:mx-4 my-1 pointer-events-none overflow-hidden"
                  >
                    {shuffledTiles.map((tile) => {
                      const isUsed = usedTileIds.has(tile.id);
                      if (isUsed) return null;
                      const isHovered = hoveredBubbleId === tile.id;

                      return (
                        <button
                          key={tile.id}
                          ref={(el) => {
                            bubbleRefs.current[tile.id] = el;
                          }}
                          type="button"
                          onClick={() => placeTileIntoTarget(tile)}
                          className={`pointer-events-auto absolute top-0 left-0 min-w-[54px] min-h-[54px] sm:min-w-[72px] sm:min-h-[72px] px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full border-2 cursor-pointer flex flex-col items-center justify-center transition-colors duration-100 will-change-transform ${
                            isHovered
                              ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 border-white ring-4 ring-emerald-400/75 shadow-[0_0_28px_rgba(251,191,36,0.85)] z-20'
                              : 'bg-slate-900/82 hover:bg-sky-500 text-white border-sky-300/85 hover:border-white backdrop-blur-sm shadow-[0_8px_22px_rgba(14,165,233,0.35)]'
                          }`}
                        >
                          <span className="font-amiri text-xl sm:text-3xl font-black leading-none select-none">
                            {tile.text}
                          </span>
                          {tile.label && (
                            <span
                              className={`mt-1 text-[9px] sm:text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full ${
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
                ) : (
                  <div className="flex-1 min-h-0 pointer-events-none" />
                )}

                {/* ======================================================== */}
                {/* BOTTOM: ANSWER COLLECTION BOX (يضم السؤال + الصورة + الصوت + حقل الإجابة) */}
                {/* ======================================================== */}
                <div
                  className={`shrink-0 pointer-events-none ${
                    isMobileLandscape ? 'px-1.5 pb-1' : 'px-2 sm:px-4 pb-2 sm:pb-3'
                  }`}
                >
                  <div
                    ref={dropZoneRef}
                    className={`pointer-events-auto max-w-4xl mx-auto rounded-2xl ${
                      isMobileLandscape ? 'p-1.5 sm:p-2' : 'p-2 sm:p-3'
                    } transition-all backdrop-blur-md border-2 ${
                      isOverDropZone && grabbedTile
                        ? 'bg-emerald-950/85 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.6)] scale-[1.01]'
                        : 'bg-slate-900/85 border-sky-400/50 shadow-2xl'
                    }`}
                  >
                    {/* Header Row of Bottom Box: Question Text + Image + Audio (Replaces static banner) + Undo/Clear */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {questionBlocks.length > 0 ? (
                          questionBlocks.map((blk, i) => {
                            if (blk.type === 'text') {
                              const displayQ = getTranslatedCatchQuestionText(
                                activeSubject.subjectName,
                                activeExercise.exerciseNumber,
                                blk.value,
                                currentLang,
                                translations
                              );
                              return (
                                <span
                                  key={`qblk-txt-${i}`}
                                  className="text-xs sm:text-base font-extrabold text-white font-amiri leading-relaxed break-words"
                                >
                                  {displayQ}
                                </span>
                              );
                            }
                            if (blk.type === 'image') {
                              const imgUrl = getDirectImageUrl(blk.value);
                              return (
                                <button
                                  key={`qblk-img-${i}`}
                                  type="button"
                                  onClick={() => setLightboxImageUrl(imgUrl)}
                                  className="relative group rounded-xl overflow-hidden border border-slate-600 bg-white w-9 h-9 sm:w-11 sm:h-11 shrink-0 cursor-zoom-in shadow-xs"
                                  title={tr('catch_zoom_img', 'تكبير الصورة')}
                                >
                                  <img
                                    src={imgUrl}
                                    alt={tr('catch_question_img_alt', 'صورة السؤال')}
                                    className="w-full h-full object-contain p-0.5"
                                  />
                                  <span className="absolute bottom-0 right-0 bg-slate-900/80 text-white p-0.5 rounded-tl-md">
                                    <ZoomIn className="w-2.5 h-2.5" />
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
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer shrink-0 ${
                                  isAudPlaying
                                    ? 'bg-amber-400 text-slate-950 border-amber-300 animate-pulse'
                                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40'
                                }`}
                                title={tr('catch_listen_question', 'استماع')}
                              >
                                {isAudPlaying ? (
                                  <Pause className="w-3.5 h-3.5" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5" />
                                )}
                                <span className="hidden sm:inline">
                                  {tr('catch_listen_question', 'استماع')}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <span className="text-xs sm:text-sm font-bold text-sky-200">
                            {getTranslatedCatchSubject(activeSubject.subjectName, currentLang, translations)} ({activeExercise.exerciseNumber})
                          </span>
                        )}
                      </div>

                      {!isCompleted && !activeExercise.lockOnMistake && (
                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleUndo}
                            title={tr('catch_btn_undo', 'تراجع')}
                            aria-label={tr('catch_btn_undo', 'تراجع')}
                            className="flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[11px] font-bold cursor-pointer min-h-[30px] min-w-[32px]"
                          >
                            <Delete className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden sm:inline">{tr('catch_btn_undo', 'تراجع')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClear}
                            title={tr('catch_btn_clear', 'مسح')}
                            aria-label={tr('catch_btn_clear', 'مسح')}
                            className="flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-800/90 hover:bg-rose-600 text-slate-200 border border-slate-600 text-[11px] font-bold cursor-pointer min-h-[30px] min-w-[32px]"
                          >
                            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden sm:inline">{tr('catch_btn_clear', 'مسح')}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Blanks Fill View OR Ordered Composition View (With Guidance Text Inside the Field) */}
                    {parsedBlanks.hasBlanks ? (
                      <div className="p-1.5 sm:p-2 rounded-xl bg-slate-950/65 border border-slate-700/80 space-y-1">
                        <div
                          className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[50px]"
                          dir="rtl"
                        >
                          {parsedBlanks.segments.map((seg, idx) => {
                            if (seg.kind === 'fixed') {
                              return (
                                <span
                                  key={`seg-txt-${idx}`}
                                  className="font-amiri text-xl sm:text-3xl font-bold text-white leading-relaxed"
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
                                className={`min-w-[52px] min-h-[40px] sm:min-h-[42px] px-2.5 sm:px-3 py-1 rounded-xl border-2 font-amiri text-xl sm:text-2xl font-bold transition-all cursor-pointer flex items-center justify-center ${
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
                        {!isCompleted && (
                          <div className="text-[10px] sm:text-xs font-bold text-center flex items-center justify-center gap-1 text-slate-400">
                            {isOverDropZone && grabbedTile ? (
                              <span className="text-emerald-300 flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>{tr('catch_drop_now', 'أفلت الفقاعة الآن لوضعها هنا!')}</span>
                              </span>
                            ) : (
                              <span>
                                {tr(
                                  'catch_dropzone_fill_empty',
                                  'التقط الفقاعة باليد أو المسها لوضعها في الفراغ المحدد'
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {assembledPreview && (
                          <div
                            className="text-center font-amiri text-lg sm:text-2xl font-extrabold text-amber-300 drop-shadow tracking-wide leading-tight"
                            dir="rtl"
                          >
                            {assembledPreview}
                          </div>
                        )}

                        <div
                          className="flex flex-col items-center justify-center gap-1 min-h-[48px] sm:min-h-[54px] p-1.5 sm:p-2 rounded-xl bg-slate-950/65 border border-slate-700/80"
                          dir="rtl"
                        >
                          {selectedTiles.length === 0 ? (
                            <span
                              className={`text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 text-center ${
                                isOverDropZone && grabbedTile ? 'text-emerald-300' : 'text-slate-400'
                              }`}
                            >
                              {isOverDropZone && grabbedTile ? (
                                <>
                                  <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span>{tr('catch_drop_now', 'أفلت الفقاعة الآن لوضعها هنا!')}</span>
                                </>
                              ) : (
                                <>
                                  <MousePointerClick className="w-4 h-4 text-sky-400 shrink-0" />
                                  <span>
                                    {tr(
                                      'catch_dropzone_empty',
                                      'المس أي حرف بيدك في الهواء أو اضغط عليه لإضافته هنا'
                                    )}
                                  </span>
                                </>
                              )}
                            </span>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                                {selectedTiles.map((tile, tIdx) => (
                                  <button
                                    key={`placed-${tile.id}-${tIdx}`}
                                    type="button"
                                    onClick={() => handleRemovePlacedTile(tile.id)}
                                    disabled={isCompleted || Boolean(activeExercise.lockOnMistake)}
                                    className="min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-1 rounded-xl bg-linear-to-b from-sky-400 to-cyan-500 text-slate-950 font-amiri text-lg sm:text-2xl font-black border-2 border-white shadow-md flex flex-col items-center justify-center hover:scale-105 transition-transform cursor-pointer disabled:cursor-default"
                                  >
                                    <span className="leading-none">{tile.text}</span>
                                    {tile.label && (
                                      <span className="text-[9px] font-cairo font-bold text-slate-900 mt-0.5 leading-none">
                                        {translatePosLabel(tile.label)}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                              {isOverDropZone && grabbedTile && !isCompleted && (
                                <span className="text-[10px] sm:text-xs font-bold text-emerald-300 flex items-center gap-1">
                                  <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>{tr('catch_drop_now', 'أفلت الفقاعة الآن لوضعها هنا!')}</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ============================================================ */}
          {/* LAYER 4: SLIM FLOATING VERTICAL SIDE RESULT PANEL (يمين/يسار) */}
          {/* ============================================================ */}
          {resultSidebarOpen && (isCompleted || attemptFeedback) && (
            <div
              dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
              className={`absolute inset-y-0 z-[25] pointer-events-none flex items-center p-1 sm:p-2 lg:p-3 animate-in fade-in duration-200 ${
                resultSidebarSide === 'left' ? 'left-0 justify-end' : 'right-0 justify-start'
              }`}
            >
              {isResultSidebarCollapsed ? (
                <button
                  type="button"
                  onClick={() => setIsResultSidebarCollapsed(false)}
                  className="pointer-events-auto px-2 py-1.5 rounded-2xl bg-slate-900/95 border border-sky-400/50 text-sky-300 shadow-2xl flex items-center gap-1 text-[11px] sm:text-xs font-bold cursor-pointer hover:bg-slate-800"
                >
                  {isCompleted ? (
                    <>
                      <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                      <span className="font-mono">{finalScore}%</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
                      <span>{tr('catch_try_again_short', 'محاولة')}</span>
                    </>
                  )}
                  {resultSidebarSide === 'left' ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronLeft className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <aside className="pointer-events-auto w-[96px] sm:w-[144px] lg:w-[220px] max-h-[82%] bg-slate-900/92 border border-sky-400/45 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] text-white text-center overflow-y-auto p-1.5 sm:p-2 lg:p-3 flex flex-col gap-1 sm:gap-1.5 lg:gap-2">
                  {/* Compact Window Controls: Close / Swap Side / Collapse */}
                  <div className="flex items-center justify-between gap-0.5 lg:gap-1">
                    <button
                      type="button"
                      onClick={() => setResultSidebarOpen(false)}
                      title={tr('catch_btn_close', 'إغلاق')}
                      aria-label={tr('catch_btn_close', 'إغلاق')}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                    </button>
                    <div className="flex items-center gap-0.5 lg:gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setResultSidebarSide((prev) => (prev === 'left' ? 'right' : 'left'))
                        }
                        title={tr('catch_swap_side', 'نقل النافذة يمين/يسار')}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsResultSidebarCollapsed(true)}
                        title={tr('catch_collapse_panel', 'طي النافذة')}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      >
                        {resultSidebarSide === 'left' ? (
                          <ChevronLeft className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                        ) : (
                          <ChevronRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isCompleted ? (
                    <>
                      {/* Result Header Icon + Score */}
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center shadow-md ${
                            finalScore >= 70
                              ? 'bg-linear-to-tr from-emerald-400 to-teal-300 text-slate-950'
                              : 'bg-linear-to-tr from-rose-500 to-amber-500 text-white'
                          }`}
                        >
                          <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                        </div>
                        <h4 className="font-bold text-[10px] sm:text-[11px] lg:text-sm text-sky-300 leading-tight">
                          {finalScore >= 70
                            ? tr('catch_result_win', 'أحسنت! ممتاز')
                            : tr('catch_result_done', 'نتيجة التمرين')}
                        </h4>
                      </div>

                      <div className="font-extrabold font-mono text-lg sm:text-2xl lg:text-3xl text-white tabular-nums leading-none">
                        {finalScore}%
                      </div>

                      {/* Answers Summary */}
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-1 sm:p-1.5 lg:p-2 space-y-0.5 sm:space-y-1 text-[9px] sm:text-[10px] lg:text-xs">
                        <div className="text-slate-400">{tr('catch_your_answer', 'إجابتك:')}</div>
                        <div className="font-amiri text-sm sm:text-base lg:text-lg font-extrabold text-amber-300 leading-tight break-words">
                          {lastSubmittedAnswer || '—'}
                        </div>
                        {finalScore === 0 && (
                          <>
                            <div className="border-t border-slate-800 pt-1 text-slate-400">
                              {tr('catch_correct_answer_label', 'الصحيحة:')}
                            </div>
                            <div className="font-amiri text-xs sm:text-sm lg:text-base font-bold text-emerald-300 leading-tight break-words">
                              {activeExercise.correctAnswer.replace(/\|/g, '')}
                            </div>
                          </>
                        )}
                        {wrongAttempts > 0 && (
                          <div className="text-[9px] lg:text-[10px] text-rose-300 font-bold border-t border-slate-800 pt-1">
                            {tr('catch_wrong_count', 'الأخطاء:')} {wrongAttempts}
                          </div>
                        )}
                      </div>

                      {/* Earned AR Crown Reward */}
                      {earnedRewardTier && (
                        <div className="flex items-center justify-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[9px] sm:text-[10px] lg:text-[11px] font-bold">
                          <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{earnedRewardTier.title}</span>
                        </div>
                      )}

                      {sheetSyncSuccess && (
                        <div className="p-1 sm:p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-[8px] sm:text-[9px] lg:text-[10px] font-bold text-emerald-300 leading-tight">
                          {sheetSyncSuccess}
                        </div>
                      )}

                      {/* Bottom Action Buttons (Mobile optimized: Save=Icon, Retry=Text, Next=Icon) */}
                      <div className="flex flex-col gap-1 sm:gap-1.5 pt-0.5">
                        {!sheetSyncSuccess && (
                          <button
                            type="button"
                            onClick={handleSubmitToSheet}
                            disabled={isSubmitting}
                            title={
                              currentStudent
                                ? tr('catch_save_score_short', 'حفظ النتيجة')
                                : tr('catch_login_short', 'دخول للحفظ')
                            }
                            aria-label={
                              currentStudent
                                ? tr('catch_save_score_short', 'حفظ النتيجة')
                                : tr('catch_login_short', 'دخول للحفظ')
                            }
                            className="w-full py-1.5 sm:py-2 px-1.5 sm:px-2 rounded-xl bg-linear-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-[10px] lg:text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            {isSubmitting ? (
                              <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                            )}
                            <span className="hidden sm:inline">
                              {currentStudent
                                ? tr('catch_save_score_short', 'حفظ النتيجة')
                                : tr('catch_login_short', 'دخول للحفظ')}
                            </span>
                          </button>
                        )}

                        {sheetSyncSuccess && onOpenLessons && (
                          <button
                            type="button"
                            onClick={handleCloseAfterSave}
                            title={tr('catch_btn_close', 'إغلاق')}
                            className="w-full py-1.5 sm:py-2 px-1.5 sm:px-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-[10px] lg:text-xs font-extrabold shadow-md cursor-pointer flex items-center justify-center gap-1"
                          >
                            <X className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                            <span>{tr('catch_btn_close', 'إغلاق')}</span>
                          </button>
                        )}

                        {(!sheetSyncSuccess || catchRetryStatus.canRetry) && (
                          <button
                            type="button"
                            onClick={sheetSyncSuccess ? handleTriggerRetryInArena : initExercise}
                            className="w-full py-1 sm:py-1.5 px-1.5 sm:px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] lg:text-xs font-bold cursor-pointer flex items-center justify-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                            <span>{tr('catch_btn_retry', 'إعادة')}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleGoNextExercise}
                          title={tr('catch_btn_next', 'التالي')}
                          aria-label={tr('catch_btn_next', 'التالي')}
                          className="w-full py-1.5 sm:py-2 px-1.5 sm:px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] lg:text-xs font-black shadow-md cursor-pointer flex items-center justify-center gap-1"
                        >
                          <span className="hidden sm:inline">{tr('catch_btn_next', 'التالي')}</span>
                          <ArrowRight
                            className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${
                              currentLang === 'ar' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </>
                  ) : attemptFeedback ? (
                    /* Slim Retry / Wrong Feedback while still playing */
                    <div className="space-y-1.5 sm:space-y-2 py-1">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                      </div>
                      <div className="text-[10px] sm:text-[11px] lg:text-xs font-extrabold text-rose-300 leading-snug">
                        {attemptFeedback.message}
                      </div>
                      {wrongAttempts > 0 && (
                        <div className="text-[9px] sm:text-[10px] font-bold text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl py-1 px-1.5 sm:px-2">
                          {tr('catch_wrong_count', 'الأخطاء:')} {wrongAttempts}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setResultSidebarOpen(false)}
                        className="w-full py-1 sm:py-1.5 px-1.5 sm:px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] lg:text-xs font-bold cursor-pointer"
                      >
                        {tr('catch_continue_playing', 'متابعة اللعب')}
                      </button>
                    </div>
                  ) : null}
                </aside>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* LAYER 5: 60FPS AR HAND CURSOR & DWELL PROGRESS RING          */}
          {/* ============================================================ */}
          {isCameraEnabled && (
            <>
              <div
                ref={arCursorDomRef}
                style={{ opacity: 0, left: '50%', top: '50%' }}
                className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100"
              >
                <div className="relative w-12 h-12 flex items-center justify-center">
                  {/* Dwell touch circular progress ring */}
                  <div
                    ref={dwellRingDomRef}
                    className="absolute inset-0 rounded-full p-[3px]"
                  />
                  <div
                    className={`relative w-9 h-9 rounded-full border-3 flex items-center justify-center transition-transform duration-75 ${
                      cursorPinchingVisual
                        ? 'bg-amber-400/55 border-amber-200 scale-75 shadow-[0_0_16px_rgba(251,191,36,0.9)]'
                        : hoveredBubbleId
                        ? 'bg-emerald-400/40 border-emerald-300 scale-115 shadow-[0_0_18px_rgba(52,211,153,0.9)]'
                        : 'bg-sky-400/25 border-sky-300 scale-100 shadow-[0_0_12px_rgba(56,189,248,0.75)]'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        cursorPinchingVisual ? 'bg-amber-100' : 'bg-white'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Grabbed Floating Bubble Visual following AR hand */}
              <div
                ref={draggedCursorDomRef}
                style={{ opacity: 0, left: '50%', top: '50%' }}
                className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2"
              >
                {grabbedTile && (
                  <div className="min-w-[64px] min-h-[64px] px-4 py-2 rounded-full bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 border-3 border-white shadow-[0_0_28px_rgba(251,191,36,0.9)] flex flex-col items-center justify-center scale-110">
                    <span className="font-amiri text-2xl sm:text-3xl font-black leading-none">
                      {grabbedTile.text}
                    </span>
                    {grabbedTile.label && (
                      <span className="text-[10px] font-bold text-slate-900 mt-0.5 leading-none">
                        {translatePosLabel(grabbedTile.label)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox for Question Image */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[95] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
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
