import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BoardStyle,
  PenType,
  GuideColor,
  DrawingTemplate,
  HandTrackingDisplayMode,
} from '../types/drawing';
import { WhiteboardCanvas, WhiteboardCanvasRef } from './WhiteboardCanvas';
import { ARCameraOverlay } from './ARCameraOverlay';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import { TemplateLibraryModal } from './TemplateLibraryModal';
import { sheetService, getStepAudioPrompt, RegistrantUser } from '../services/sheetService';
import { audioService } from '../services/audioService';
import { arTrackingService } from '../services/arTrackingService';
import { handTrackingService } from '../services/handTrackingService';
import { isMobileOrTabletDevice, isTouchLandscapeViewport } from '../utils/devicePerformance';
import {
  ARRewardTier,
  AR_INTRO_ID,
  findARRewardForScore,
} from '../services/arRewardsService';
import { StudentRegistrant } from '../../types';
import {
  Award,
  X,
  Lightbulb,
} from 'lucide-react';

interface WritingArenaProps {
  allTemplates: DrawingTemplate[];
  onUpdateTemplates: (updated: DrawingTemplate[]) => void;
  selectedTemplate: DrawingTemplate | null;
  onSelectTemplate: (tpl: DrawingTemplate | null) => void;
  boardStyle: BoardStyle;
  onSelectBoardStyle: (style: BoardStyle) => void;
  guideColor: GuideColor;
  onSelectGuideColor: (color: GuideColor) => void;
  templateOpacity: number;
  onChangeTemplateOpacity: (opacity: number) => void;
  saveArCameraPhoto: boolean;
  arRewards: ARRewardTier[];
  arIntroReward: ARRewardTier;
  onSyncARRewardsFromCloud?: () => void;
  previewRewardRequest?: { tier: ARRewardTier; nonce: number } | null;
  currentStudent: StudentRegistrant | null;
  onOpenStudentLogin?: () => void;
  onStudentLogout?: () => void;
  isAdminAuthenticated?: boolean;
  onOpenAdminWriting?: () => void;
  onBackToPronunciation?: () => void;
  webhookUrl?: string;
}

export const WritingArena: React.FC<WritingArenaProps> = ({
  allTemplates,
  onUpdateTemplates,
  selectedTemplate,
  onSelectTemplate,
  boardStyle,
  onSelectBoardStyle,
  guideColor,
  onSelectGuideColor,
  templateOpacity,
  onChangeTemplateOpacity,
  saveArCameraPhoto,
  arRewards,
  arIntroReward,
  onSyncARRewardsFromCloud,
  previewRewardRequest,
  currentStudent,
  isAdminAuthenticated,
  onOpenAdminWriting,
  webhookUrl,
}) => {
  const canvasRef = useRef<WhiteboardCanvasRef>(null);

  useEffect(() => {
    if (webhookUrl) {
      sheetService.setOverrideUrl(webhookUrl);
    }
  }, [webhookUrl]);

  // Cleanly stop camera & AR tracking when exiting Writing Arena
  useEffect(() => {
    return () => {
      try {
        arTrackingService.stop();
      } catch {}
      try {
        handTrackingService.stop();
      } catch {}
    };
  }, []);

  const currentUser: RegistrantUser | null = currentStudent
    ? { id: currentStudent.id, name: currentStudent.name }
    : null;

  const [penType, setPenType] = useState<PenType>('marker');
  const [penColor, setPenColor] = useState<string>('#2563eb');
  const [penSize, setPenSize] = useState<number>(18);
  const [calligraphyAngle, setCalligraphyAngle] = useState<number>(120);
  const [accuracy, setAccuracy] = useState<number>(0);

  // AR Video & Crown Refs (virtual cursor updates bypass React state for 60fps smoothness)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [crownCanvas, setCrownCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isAirPenLocked, setIsAirPenLocked] = useState<boolean>(false);

  const [trackingMode, setTrackingMode] = useState<HandTrackingDisplayMode>(() =>
    isMobileOrTabletDevice() ? 'finger_only' : 'one_hand'
  );
  const [showCrown, setShowCrown] = useState<boolean>(false);
  const [lastArScore, setLastArScore] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [arDetectionStatus, setArDetectionStatus] = useState<{
    handsCount: number;
    isPinching: boolean;
    faceDetected: boolean;
    fps: number;
  }>({ handsCount: 0, isPinching: false, faceDetected: false, fps: 0 });

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() => isTouchLandscapeViewport());
  const [showToolbarInLandscape, setShowToolbarInLandscape] = useState(false);
  const prevMobileLandscapeRef = useRef(isMobileLandscape);

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
    };
  }, []);

  const [historyCanUndo, setHistoryCanUndo] = useState(false);
  const [historyCanRedo, setHistoryCanRedo] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const [currentRepetition, setCurrentRepetition] = useState<number>(1);

  // Sync pen color for contrast when switching board style
  useEffect(() => {
    if (boardStyle === 'dark' || boardStyle === 'green' || boardStyle === 'ar_camera') {
      if (penColor === '#0f172a') {
        setPenColor('#f59e0b');
      }
    } else if (boardStyle === 'white' || boardStyle === 'grid') {
      if (penColor === '#f59e0b') {
        setPenColor('#2563eb');
      }
    }
  }, [boardStyle, penColor]);

  // Apply preview reward request triggered from Admin Settings
  useEffect(() => {
    if (!previewRewardRequest) return;
    const { tier } = previewRewardRequest;
    if (tier.id === AR_INTRO_ID) {
      setLastArScore(null);
      setShowCrown(true);
      onSelectBoardStyle('ar_camera');
      return;
    }
    const low = Math.min(tier.minScore, tier.maxScore);
    const high = Math.max(tier.minScore, tier.maxScore);
    setLastArScore(Math.round((low + high) / 2));
    setShowCrown(true);
    onSelectBoardStyle('ar_camera');
  }, [previewRewardRequest, onSelectBoardStyle]);

  // Refresh AR rewards when entering AR camera mode
  useEffect(() => {
    if (boardStyle === 'ar_camera') {
      if (lastArScore === null) {
        setShowCrown(arIntroReward.enabled);
      }
      onSyncARRewardsFromCloud?.();
    } else {
      arTrackingService.stop();
    }
  }, [boardStyle]);

  const syncHistoryState = useCallback(() => {
    if (canvasRef.current) {
      setHistoryCanUndo(canvasRef.current.canUndo);
      setHistoryCanRedo(canvasRef.current.canRedo);
    }
  }, []);

  const handleClearSideEffects = useCallback(() => {
    setAccuracy(0);
    setCelebrationMessage(null);
    setLastArScore(null);
    setShowCrown(boardStyle === 'ar_camera' && arIntroReward.enabled);
    setCurrentRepetition(1);
    syncHistoryState();
    setTimeout(syncHistoryState, 0);
  }, [syncHistoryState, boardStyle, arIntroReward.enabled]);

  const handleClear = useCallback(() => {
    canvasRef.current?.clearCanvas();
    handleClearSideEffects();
  }, [handleClearSideEffects]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          canvasRef.current?.redo();
        } else {
          canvasRef.current?.undo();
        }
        syncHistoryState();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        canvasRef.current?.redo();
        syncHistoryState();
      } else if (e.key.toLowerCase() === 'b') {
        setPenType('calligraphy');
      } else if (e.key.toLowerCase() === 'e') {
        setPenType('eraser');
      } else if (e.key.toLowerCase() === 'c') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [syncHistoryState, handleClear]);

  const handleCursorUpdate = useCallback((cursor: { x: number; y: number } | null, isPinching: boolean) => {
    canvasRef.current?.updateAirCursor(cursor, isPinching);
  }, []);

  const handleToggleAirPenLock = useCallback(() => {
    setIsAirPenLocked((prev) => !prev);
  }, []);

  const handleUndo = () => {
    canvasRef.current?.undo();
    syncHistoryState();
    setTimeout(syncHistoryState, 0);
  };

  const handleRedo = () => {
    canvasRef.current?.redo();
    syncHistoryState();
    setTimeout(syncHistoryState, 0);
  };

  const activeReward = showCrown
    ? lastArScore !== null
      ? findARRewardForScore(lastArScore, arRewards)
      : arIntroReward.enabled
      ? arIntroReward
      : findARRewardForScore(null, arRewards)
    : null;
  const activeRewardTitle = (activeReward || findARRewardForScore(null, arRewards))?.title;

  const handleExport = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.exportImage(true);
    const link = document.createElement('a');
    link.download = `لوحة_خط_عربي_${selectedTemplate?.title || 'رسمة'}_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    audioService.speakArabic('تم حفظ لوحتك بنجاح!');
  };

  const handlePronounce = () => {
    if (!selectedTemplate) return;
    const mainTitle = selectedTemplate.arabicAudioText || selectedTemplate.title;
    audioService.speakArabic(mainTitle);

    if (selectedTemplate.steps && selectedTemplate.steps.length > 0) {
      const stepsList = selectedTemplate.steps;
      let idx = 0;
      const playNextStep = () => {
        if (idx < stepsList.length) {
          const s = stepsList[idx];
          const text = getStepAudioPrompt(s);
          audioService.speakArabic(text);
          idx++;
          setTimeout(playNextStep, 2400);
        }
      };
      setTimeout(playNextStep, 1600);
    }
  };

  const handleSelectTrackingMode = (mode: HandTrackingDisplayMode) => {
    setTrackingMode(mode);
    if (mode === 'off') {
      audioService.speakArabic('تم إيقاف تتبع اليد للرسم باللمس السريع');
    } else if (mode === 'finger_only') {
      audioService.speakArabic('تتبع إصبع السبابة');
    } else if (mode === 'one_hand') {
      audioService.speakArabic('تتبع هيكل اليد');
    } else if (mode === 'two_hands') {
      audioService.speakArabic('تتبع هيكل اليدين معاً');
    }
  };

  const handleToggleCrown = () => {
    const next = !showCrown;
    if (next) {
      setLastArScore(null);
      const target = arIntroReward.enabled ? arIntroReward : findARRewardForScore(null, arRewards);
      audioService.speakArabic(target ? `تم تفعيل ${target.title}` : 'تم تثبيت صورة الرأس');
    }
    setShowCrown(next);
  };

  const handleToggleFacingMode = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    setIsMirrored(next === 'user');
  };

  const handleToggleMirror = () => {
    setIsMirrored((prev) => !prev);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen()
          .then(() => setIsFullscreen(true))
          .catch(() => {
            if (isMobileLandscape) {
              setShowToolbarInLandscape(false);
            }
          });
      } else if (isMobileLandscape) {
        setShowToolbarInLandscape((prev) => !prev);
      }
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const handleGoalAchieved = (acc: number) => {
    if (boardStyle === 'ar_camera') {
      const matched = findARRewardForScore(acc, arRewards);
      setLastArScore(acc);
      if (matched) {
        setShowCrown(true);
        setCelebrationMessage(`${matched.title} — درجة الإتقان ${acc}%!`);
      } else {
        setShowCrown(false);
        setCelebrationMessage(null);
      }
    } else {
      setLastArScore(null);
      setShowCrown(false);
      if (acc >= 85) {
        setCelebrationMessage(`🌟 إبداع رائع! أتقنت كتابة الحرف بدرجة ${acc}%`);
      } else if (acc >= 70) {
        setCelebrationMessage(`👏 أحسنت! أتممت التمرين بنجاح بدرجة ${acc}%`);
      } else {
        setCelebrationMessage(null);
      }
    }

    setTimeout(() => {
      setCelebrationMessage(null);
    }, 7000);
  };

  return (
    <div
      className={
        isMobileLandscape || isFullscreen
          ? 'fixed inset-0 z-[80] flex flex-col h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 font-cairo'
          : 'flex flex-col w-full h-[calc(100dvh-96px)] sm:h-[calc(100dvh-65px)] min-h-[540px] shrink-0 overflow-hidden bg-slate-950 text-slate-100 font-cairo'
      }
    >
      {/* Top Whiteboard Toolbar */}
      {(!isMobileLandscape || showToolbarInLandscape) && (
        <WhiteboardToolbar
          boardStyle={boardStyle}
          onSelectBoardStyle={(style) => {
            onSelectBoardStyle(style);
            if (style === 'ar_camera') {
              setLastArScore(null);
              setShowCrown(arIntroReward.enabled);
              audioService.speakArabic('تم تفعيل وضع الواقع المعزز AR');
            } else {
              setShowCrown(false);
            }
          }}
          penType={penType}
          onSelectPenType={setPenType}
          penColor={penColor}
          onSelectPenColor={setPenColor}
          penSize={penSize}
          onChangePenSize={setPenSize}
          calligraphyAngle={calligraphyAngle}
          onChangeCalligraphyAngle={setCalligraphyAngle}
          template={selectedTemplate}
          templateOpacity={templateOpacity}
          onChangeTemplateOpacity={onChangeTemplateOpacity}
          guideColor={guideColor}
          onSelectGuideColor={onSelectGuideColor}
          canUndo={historyCanUndo}
          canRedo={historyCanRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          onExport={handleExport}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          onOpenSettings={isAdminAuthenticated ? onOpenAdminWriting : undefined}
          onPronounce={handlePronounce}
          accuracy={accuracy}
          trackingMode={trackingMode}
          onSelectTrackingMode={handleSelectTrackingMode}
          showCrown={showCrown}
          onToggleCrown={handleToggleCrown}
          facingMode={facingMode}
          onToggleFacingMode={handleToggleFacingMode}
          isMirrored={isMirrored}
          onToggleMirror={handleToggleMirror}
          arDetectionStatus={arDetectionStatus}
          isAirPenLocked={isAirPenLocked}
          onToggleAirPenLock={handleToggleAirPenLock}
          activeRewardTitle={activeRewardTitle}
          isMobileLandscape={isMobileLandscape}
        />
      )}

      {/* Main Workspace / Stage */}
      <div
        className={`relative flex-1 min-h-0 w-full overflow-hidden flex flex-col items-center justify-center ${
          isMobileLandscape ? 'p-0' : 'p-1.5 sm:p-3'
        }`}
      >
        <div
          className={`relative flex-1 w-full h-full min-h-0 overflow-hidden shadow-2xl flex flex-col items-stretch justify-center ${
            isMobileLandscape ? 'max-w-none rounded-none' : 'max-w-6xl rounded-2xl'
          }`}
        >
          <ARCameraOverlay
            isARMode={boardStyle === 'ar_camera'}
            trackingMode={trackingMode}
            showCrown={showCrown}
            activeReward={activeReward}
            facingMode={facingMode}
            isMirrored={isMirrored}
            onCursorUpdate={handleCursorUpdate}
            onVideoElementReady={setVideoElement}
            onCrownCanvasReady={setCrownCanvas}
            onDetectionUpdate={setArDetectionStatus}
          />

          <WhiteboardCanvas
            ref={canvasRef}
            boardStyle={boardStyle}
            penType={penType}
            penColor={penColor}
            penSize={penSize}
            calligraphyAngle={calligraphyAngle}
            template={selectedTemplate}
            templateOpacity={templateOpacity}
            guideColor={guideColor}
            isARMode={boardStyle === 'ar_camera'}
            videoElement={videoElement}
            crownCanvas={crownCanvas}
            isMirrored={isMirrored}
            saveArCameraPhoto={saveArCameraPhoto}
            isAirPenLocked={isAirPenLocked}
            onToggleAirPenLock={handleToggleAirPenLock}
            currentRepetition={currentRepetition}
            isFullscreen={isFullscreen}
            isMobileLandscape={isMobileLandscape}
            isLandscapeToolbarOpen={showToolbarInLandscape}
            onToggleLandscapeToolbar={() => setShowToolbarInLandscape((prev) => !prev)}
            onToggleFullscreen={toggleFullscreen}
            onOpenHelp={() => setIsHelpOpen(true)}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onClearSideEffects={handleClearSideEffects}
            onNextRepetition={() => {
              const totalReps = Number(selectedTemplate?.repeatCount) || 1;
              if (currentRepetition < totalReps) {
                setCurrentRepetition((prev) => prev + 1);
              }
            }}
            onResetRepetition={() => setCurrentRepetition(1)}
            onAccuracyUpdate={(acc) => {
              setAccuracy(acc);
              syncHistoryState();
            }}
            onGoalAchieved={handleGoalAchieved}
            currentUser={currentUser}
            totalLessonsInTopic={
              allTemplates.filter(
                (t) =>
                  (t.topic || 'خط النسخ').trim() ===
                  (selectedTemplate?.topic || 'خط النسخ').trim()
              ).length
            }
          />

          {celebrationMessage && (
            <div className="absolute top-16 inset-x-4 max-w-md mx-auto z-40 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-bold p-3 sm:p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-bounce">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-950 text-amber-400 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <span className="text-sm font-ruqaa text-base">{celebrationMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setCelebrationMessage(null)}
                className="p-1 rounded-lg hover:bg-slate-950/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {penType === 'calligraphy' && (
            <div className="hidden sm:flex absolute bottom-3 right-3 z-20 items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/80 backdrop-blur-md text-[11px] text-slate-300 pointer-events-none">
              <span>شطفة قلم القصبة:</span>
              <div
                className="w-4 h-1.5 rounded-[1px] shadow-sm transition-transform"
                style={{ backgroundColor: penColor, transform: `rotate(-${calligraphyAngle}deg)` }}
              />
              <span className="font-mono text-amber-400">{calligraphyAngle}°</span>
            </div>
          )}
        </div>

        {/* Help Modal */}
        {isHelpOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Lightbulb className="w-5 h-5" />
                  <span className="text-base font-ruqaa">دليل السبورة والواقع المعزز AR</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(false)}
                  className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3.5 mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ١
                  </span>
                  <div>
                    <strong className="text-white">السبورة التفاعلية:</strong> استخدم إصبعك أو قلم الشاشة أو الماوس للرسم. يمكنك التحكم بزاوية وسُمك القلم والألوان من زر أدوات الرسم.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ٢
                  </span>
                  <div>
                    <strong className="text-white">خيارات التتبع المجمعة:</strong> عند تشغيل الواقع المعزز AR، اضغط زر خيارات التتبع للتبديل بين تتبع السبابة ☝️، أو هيكل يد واحدة 🖐️، أو هيكل يدين 🖐️🖐️، وتفعيل التاج الملكي 👑.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ٣
                  </span>
                  <div>
                    <strong className="text-white">الرسم الدقيق في الهواء:</strong> تطابق نقطة الرسم طرف إصبع السبابة تماماً. عند تقريب الإبهام والسبابة (Pinch) يبدأ القلم بالرسم من طرف إصبعك مباشرة.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                    ٤
                  </span>
                  <div>
                    <strong className="text-white">رفع نماذج مخصصة:</strong> من خلال مكتبة الدروس، يمكنك اختيار أي حرف عربي أو رفع أي صورة من جهازك لتحويلها لنموذج شفاف قابل للشف والتلوين.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="mt-6 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                فهمت، لنبدأ الرسم!
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Template Library Modal */}
      <TemplateLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        selectedTemplate={selectedTemplate}
        templates={allTemplates}
        onSelectTemplate={(tpl) => {
          onSelectTemplate(tpl);
          setCurrentRepetition(1);
          setCelebrationMessage(null);
          setLastArScore(null);
          setShowCrown(boardStyle === 'ar_camera' && arIntroReward.enabled);
          canvasRef.current?.clearCanvas();
          syncHistoryState();
        }}
        onAddCustomTemplate={(customTpl) => {
          const updated = [customTpl, ...allTemplates];
          onUpdateTemplates(updated);
          sheetService.saveLocalTemplates(updated);
        }}
      />
    </div>
  );
};
