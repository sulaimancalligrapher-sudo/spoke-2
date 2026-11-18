import React, { useState, useEffect, useRef } from 'react';
import { BoardStyle, PenType, GuideColor, DrawingTemplate, HandTrackingDisplayMode } from '../types/drawing';
import { CALLIGRAPHY_COLORS } from '../data/drawingTemplates';
import {
  SupportedLang,
  TranslationItem,
  DEFAULT_TRANSLATIONS,
  getTranslatedString,
  getTranslatedWritingLessonTitle,
} from '../../utils/translations';
import {
  PenTool,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Camera,
  Volume2,
  FolderOpen,
  Hand,
  Crown,
  FlipHorizontal,
  RefreshCw,
  MousePointer,
  SlidersHorizontal,
  X,
  Compass,
  Check,
  Menu,
  ChevronDown,
  Settings,
  Lock,
  Unlock
} from 'lucide-react';

interface WhiteboardToolbarProps {
  boardStyle: BoardStyle;
  onSelectBoardStyle: (style: BoardStyle) => void;
  penType: PenType;
  onSelectPenType: (type: PenType) => void;
  penColor: string;
  onSelectPenColor: (color: string) => void;
  penSize: number;
  onChangePenSize: (size: number) => void;
  calligraphyAngle: number;
  onChangeCalligraphyAngle: (angle: number) => void;
  template: DrawingTemplate | null;
  templateOpacity: number;
  onChangeTemplateOpacity: (val: number) => void;
  guideColor: GuideColor;
  onSelectGuideColor: (color: GuideColor) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
  onOpenLibrary: () => void;
  onPronounce: () => void;
  accuracy: number;
  onOpenSettings?: () => void;

  // AR Tracking & Camera Controls
  trackingMode: HandTrackingDisplayMode;
  onSelectTrackingMode: (mode: HandTrackingDisplayMode) => void;
  showCrown: boolean;
  onToggleCrown: () => void;
  facingMode: 'user' | 'environment';
  onToggleFacingMode: () => void;
  isMirrored: boolean;
  onToggleMirror: () => void;
  arDetectionStatus?: {
    handsCount: number;
    isPinching: boolean;
    faceDetected: boolean;
    fps: number;
  };
  isAirPenLocked?: boolean;
  onToggleAirPenLock?: () => void;
  activeRewardTitle?: string;
  isMobileLandscape?: boolean;
  currentLang?: SupportedLang;
  translations?: TranslationItem[];
}

type ActivePopover = 'drawing_tools' | 'ar_settings' | null;

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = React.memo(({
  boardStyle,
  onSelectBoardStyle,
  penType,
  onSelectPenType,
  penColor,
  onSelectPenColor,
  penSize,
  onChangePenSize,
  calligraphyAngle,
  onChangeCalligraphyAngle,
  template,
  templateOpacity,
  onChangeTemplateOpacity,
  guideColor,
  onSelectGuideColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onExport,
  onOpenLibrary,
  onPronounce,
  accuracy,
  onOpenSettings,
  trackingMode,
  onSelectTrackingMode,
  showCrown,
  onToggleCrown,
  facingMode,
  onToggleFacingMode,
  isMirrored,
  onToggleMirror,
  arDetectionStatus,
  isAirPenLocked = false,
  onToggleAirPenLock,
  activeRewardTitle,
  isMobileLandscape = false,
  currentLang = 'ar',
  translations = DEFAULT_TRANSLATIONS,
}) => {
  const tr = (id: string, fallback: string) =>
    getTranslatedString(id, currentLang, translations, fallback);
  const displayTemplateTitle = template
    ? getTranslatedWritingLessonTitle(
        template.topic || 'خط النسخ',
        template.title,
        template.slotIndex,
        currentLang,
        translations,
        template.titleEn
      )
    : '';
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [lastStandardBoard, setLastStandardBoard] = useState<BoardStyle>('grid');
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Keep track of the last used standard board style before entering AR
  useEffect(() => {
    if (boardStyle !== 'ar_camera') {
      setLastStandardBoard(boardStyle);
    }
  }, [boardStyle]);

  // Close popovers and mobile menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null);
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const togglePopover = (popover: ActivePopover) => {
    setIsMobileMenuOpen(false);
    setActivePopover(prev => (prev === popover ? null : popover));
  };

  // Toggle AR mode vs standard board
  const handleToggleAR = () => {
    setIsMobileMenuOpen(false);
    if (boardStyle === 'ar_camera') {
      onSelectBoardStyle(lastStandardBoard || 'grid');
      setActivePopover(null);
    } else {
      onSelectBoardStyle('ar_camera');
      setActivePopover('ar_settings'); // Automatically open AR options for convenience
    }
  };

  // Switch to Mouse / Finger touch drawing
  const handleSelectMouseMode = () => {
    setIsMobileMenuOpen(false);
    if (boardStyle === 'ar_camera') {
      onSelectBoardStyle(lastStandardBoard || 'grid');
    }
    setActivePopover(null);
  };

  return (
    <header
      ref={toolbarRef}
      className="relative w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 z-50 select-none shadow-md"
    >
      {/* ======================================================== */}
      {/* DESKTOP & LANDSCAPE TOOLBAR (الشاشات الكبيرة والأفقية)   */}
      {/* ======================================================== */}
      <div className={`hidden sm:flex max-w-7xl mx-auto px-2 sm:px-4 items-center justify-between gap-1.5 sm:gap-3 overflow-x-auto scrollbar-none ${
        isMobileLandscape ? 'py-1' : 'py-2'
      }`}>
        
        {/* Right Section: Lesson Folder & Tool Windows (RTL layout) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

          {/* 1. Lesson / Template Library Icon */}
          <button
            onClick={onOpenLibrary}
            title={
              template
                ? `${tr('writing_toolbar_current_lesson', 'الدرس الحالي:')} ${displayTemplateTitle} (${tr('writing_toolbar_open_file_click_hint', 'اضغط لفتح ملف / اختيار الدرس')})`
                : tr('writing_toolbar_open_file_tooltip', 'فتح ملف / اختيار الدرس')
            }
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-all active:scale-95 cursor-pointer relative"
            aria-label={tr('writing_toolbar_open_file_tooltip', 'فتح ملف / اختيار الدرس')}
          >
            <FolderOpen className="w-5 h-5 text-amber-400" />
            {template && (
              <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900" />
            )}
          </button>

          <div className="h-5 w-px bg-slate-800 mx-0.5" />

          {/* 2. Drawing Tools Button */}
          <button
            onClick={() => togglePopover('drawing_tools')}
            title={tr('writing_toolbar_drawing_tools_tooltip', 'أدوات الرسم (الأقلام، الألوان، السُمك، وزاوية الخط)')}
            className={`p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer relative flex items-center justify-center ${
              activePopover === 'drawing_tools'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            aria-label={tr('writing_toolbar_drawing_tools_title', 'أدوات الرسم والخط')}
          >
            {penType === 'calligraphy' && <PenTool className="w-5 h-5" />}
            {penType === 'marker' && <span className="w-4 h-4 rounded-full bg-current" />}
            {penType === 'eraser' && <Eraser className="w-5 h-5" />}
            
            {/* Color Dot Indicator */}
            <span
              className="absolute bottom-1 left-1 w-2.5 h-2.5 rounded-full border border-slate-900 shadow-xs"
              style={{ backgroundColor: penColor }}
            />
          </button>

          <div className="h-5 w-px bg-slate-800 mx-0.5" />

          {/* 4. Mouse / Touch Drawing Button */}
          <button
            onClick={handleSelectMouseMode}
            title={tr('writing_toolbar_mouse_mode_tooltip', 'الرسم بالفأرة أو باللمس المباشر على الشاشة')}
            className={`p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer ${
              boardStyle !== 'ar_camera'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            aria-label={tr('writing_toolbar_mouse_mode_label', 'فأرة / لمس')}
          >
            <MousePointer className="w-5 h-5" />
          </button>

          {/* 5. AR Camera Button */}
          <button
            onClick={handleToggleAR}
            title={
              boardStyle === 'ar_camera'
                ? tr('writing_toolbar_ar_off_tooltip', 'إيقاف واقع المعزز AR والعودة للسبورة')
                : tr('writing_toolbar_ar_on_tooltip', 'تشغيل كاميرا الواقع المعزز AR وتتبع اليد بالهواء')
            }
            className={`p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer relative ${
              boardStyle === 'ar_camera'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.5)]'
                : 'bg-slate-800/90 hover:bg-slate-700 text-amber-400 border-slate-700'
            }`}
            aria-label={tr('writing_toolbar_ar_label', 'واقع معزز')}
          >
            <Camera className="w-5 h-5" />
            {boardStyle === 'ar_camera' && (
              <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          {/* 6. AR Tracking Options Popover Button */}
          {boardStyle === 'ar_camera' && (
            <button
              onClick={() => togglePopover('ar_settings')}
              title={tr('writing_toolbar_ar_options_tooltip', 'إعدادات وخيارات تتبع اليدين والتاج الملكي والكاميرا')}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer relative ${
                activePopover === 'ar_settings'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-slate-800/90 hover:bg-slate-750 text-amber-300 border-amber-500/40'
              }`}
              aria-label={tr('writing_toolbar_ar_options', 'خيارات الواقع المعزز')}
            >
              <SlidersHorizontal className="w-5 h-5" />
              {/* Little indicator of active tracking mode */}
              <span className="absolute -top-1 -right-1 text-[11px] leading-none">
                {trackingMode === 'off' ? '⚡' : trackingMode === 'finger_only' ? '☝️' : trackingMode === 'two_hands' ? '🖐️🖐️' : '🖐️'}
              </span>
            </button>
          )}

        </div>

        {/* Left Section: Voice, Undo, Redo, Clear, Save (Icons Only) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Voice Speaker (Icon only) */}
          {template?.arabicAudioText && (
            <button
              onClick={onPronounce}
              title={`${tr('writing_toolbar_listen_to', 'استمع لنطق:')} ${template.arabicAudioText}`}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-all active:scale-95 cursor-pointer shrink-0"
              aria-label={tr('writing_toolbar_pronounce_letter', 'نطق الحرف')}
            >
              <Volume2 className="w-5 h-5" />
            </button>
          )}

          <div className="h-5 w-px bg-slate-800 mx-0.5" />

          {/* Undo / Redo (Icons only) */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title={`${tr('writing_toolbar_undo', 'تراجع')} (Ctrl+Z)`}
              className="p-1.5 sm:p-2 rounded-lg text-slate-300 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all active:scale-90 cursor-pointer"
              aria-label={tr('writing_toolbar_undo', 'تراجع')}
            >
              <Undo2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title={`${tr('writing_toolbar_redo', 'إعادة')} (Ctrl+Y)`}
              className="p-1.5 sm:p-2 rounded-lg text-slate-300 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all active:scale-90 cursor-pointer"
              aria-label={tr('writing_toolbar_redo', 'إعادة')}
            >
              <Redo2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </div>

          {/* Clear Canvas / Trash Can (Icon only) */}
          <button
            onClick={onClear}
            title={tr('writing_toolbar_clear_board', 'مسح السبورة بالكامل')}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/90 hover:bg-red-950/50 hover:text-red-400 text-slate-400 border border-slate-700/80 transition-all active:scale-95 cursor-pointer shrink-0"
            aria-label={tr('writing_toolbar_clear_board', 'مسح السبورة')}
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {/* Export / Download Image (Icon only) */}
          <button
            onClick={onExport}
            title={tr('writing_toolbar_save_image_tooltip', 'حفظ وتنزيل اللوحة كصورة عالية الدقة PNG')}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/90 hover:bg-emerald-950/50 hover:text-emerald-400 text-emerald-400 border border-slate-700/80 transition-all active:scale-95 cursor-pointer shrink-0"
            aria-label={tr('writing_toolbar_save_image', 'حفظ كصورة')}
          >
            <Download className="w-5 h-5" />
          </button>

          {/* Settings Studio & Cloud Sync Button */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title={tr('writing_toolbar_settings_studio', 'استوديو الإعدادات وإدارة الدروس والربط بـ Google Sheets')}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800/90 hover:bg-amber-500/20 hover:text-amber-400 text-slate-300 border border-slate-700/80 transition-all active:scale-95 cursor-pointer shrink-0"
              aria-label={tr('writing_toolbar_settings_studio', 'استوديو الإعدادات')}
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

        </div>

      </div>

      {/* ======================================================== */}
      {/* MOBILE TOOLBAR (الشاشات الصغيرة / الجوال)                 */}
      {/* ======================================================== */}
      <div className="flex sm:hidden max-w-full px-2.5 py-2 items-center justify-between gap-2">
        
        {/* Active Lesson Status Badge */}
        <div className="flex items-center gap-2 min-w-0">
          {template ? (
            <span className="text-xs font-bold text-amber-300 truncate max-w-[160px]">
              {displayTemplateTitle}
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-300">
              {tr('writing_toolbar_interactive_board', 'السبورة التفاعلية')}
            </span>
          )}

          {boardStyle === 'ar_camera' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              AR
            </span>
          )}
        </div>

        {/* Left Side: Quick Undo + Mobile Dropdown Trigger */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Undo on mobile */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title={tr('writing_toolbar_undo', 'تراجع')}
            className="p-2 rounded-xl bg-slate-800/90 text-slate-300 border border-slate-700 disabled:opacity-20 disabled:pointer-events-none active:scale-90 transition-all cursor-pointer"
            aria-label={tr('writing_toolbar_undo', 'تراجع')}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* The Single Master Dropdown Button */}
          <button
            onClick={() => {
              setIsMobileMenuOpen(prev => !prev);
              setActivePopover(null);
            }}
            title={tr('writing_toolbar_mobile_menu_tooltip', 'قائمة الأدوات والخيارات')}
            className={`px-2.5 py-2 rounded-xl border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
              isMobileMenuOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                : 'bg-slate-800/90 text-amber-400 border-slate-700 hover:bg-slate-750'
            }`}
            aria-label={tr('writing_toolbar_mobile_menu_tooltip', 'قائمة أدوات الرسم والخيارات')}
          >
            <Menu className="w-4.5 h-4.5" />
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

      </div>

      {/* ======================================================== */}
      {/* MOBILE DROPDOWN PANEL (القائمة المنسدلة لأدوات الجوال)    */}
      {/* ======================================================== */}
      {isMobileMenuOpen && (
        <div
          className="sm:hidden absolute top-full inset-x-2 mt-1 z-50 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-3 text-slate-100 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span>{tr('writing_toolbar_mobile_menu_title', 'أدوات وخيارات السبورة')}</span>
            </span>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label={tr('writing_toolbar_close', 'إغلاق')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid of Main Icons */}
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {/* 1. الدروس */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenLibrary();
              }}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-amber-400 active:scale-95 transition-all cursor-pointer"
            >
              <FolderOpen className="w-5 h-5 mb-1 text-amber-400" />
              <span className="text-[11px] font-bold">{tr('writing_toolbar_lessons_short', 'الدروس')}</span>
            </button>

            {/* 2. أدوات الرسم */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setActivePopover('drawing_tools');
              }}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl border active:scale-95 transition-all cursor-pointer ${
                activePopover === 'drawing_tools'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800/90 hover:bg-slate-750 text-slate-200 border-slate-700'
              }`}
            >
              <div className="relative mb-1">
                {penType === 'calligraphy' && <PenTool className="w-5 h-5" />}
                {penType === 'marker' && <span className="w-4 h-4 rounded-full bg-current block" />}
                {penType === 'eraser' && <Eraser className="w-5 h-5" />}
                <span
                  className="absolute -bottom-0.5 -left-1 w-2.5 h-2.5 rounded-full border border-slate-900"
                  style={{ backgroundColor: penColor }}
                />
              </div>
              <span className="text-[11px] font-bold">{tr('writing_toolbar_drawing_tools', 'أدوات الرسم')}</span>
            </button>

            {/* 4. وضع الفأرة واللمس */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleSelectMouseMode();
              }}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl border active:scale-95 transition-all cursor-pointer ${
                boardStyle !== 'ar_camera'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800/90 hover:bg-slate-750 text-slate-300 border-slate-700'
              }`}
            >
              <MousePointer className="w-5 h-5 mb-1" />
              <span className="text-[11px] font-bold">{tr('writing_toolbar_mouse_mode_label', 'فأرة / لمس')}</span>
            </button>

            {/* 5. الواقع المعزز AR */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleToggleAR();
              }}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl border active:scale-95 transition-all cursor-pointer relative ${
                boardStyle === 'ar_camera'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800/90 hover:bg-slate-750 text-amber-400 border-slate-700'
              }`}
            >
              <Camera className="w-5 h-5 mb-1" />
              <span className="text-[11px] font-bold">{tr('writing_toolbar_ar_label', 'واقع معزز')}</span>
              {boardStyle === 'ar_camera' && (
                <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>

            {/* 6. خيارات الواقع المعزز أو نطق الحرف */}
            {boardStyle === 'ar_camera' ? (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setActivePopover('ar_settings');
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border active:scale-95 transition-all cursor-pointer ${
                  activePopover === 'ar_settings'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-800/90 hover:bg-slate-750 text-amber-300 border-amber-500/40'
                }`}
              >
                <SlidersHorizontal className="w-5 h-5 mb-1" />
                <span className="text-[11px] font-bold">{tr('writing_toolbar_ar_options', 'خيارات AR')}</span>
              </button>
            ) : (
              template?.arabicAudioText ? (
                <button
                  onClick={() => onPronounce()}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-amber-400 active:scale-95 transition-all cursor-pointer"
                >
                  <Volume2 className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-bold">{tr('writing_toolbar_pronounce_letter', 'نطق الحرف')}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onExport();
                  }}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700 text-emerald-400 active:scale-95 transition-all cursor-pointer"
                >
                  <Download className="w-5 h-5 mb-1" />
                  <span className="text-[11px] font-bold">{tr('writing_toolbar_save_image', 'حفظ كصورة')}</span>
                </button>
              )
            )}
          </div>

          {/* Quick Actions Footer */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
            {template?.arabicAudioText && boardStyle === 'ar_camera' && (
              <button
                onClick={onPronounce}
                title={tr('writing_toolbar_pronounce_letter', 'استمع للنطق')}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 active:scale-95 transition-all cursor-pointer"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={onRedo}
              disabled={!canRedo}
              title={tr('writing_toolbar_redo', 'إعادة')}
              className="flex-1 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            >
              <Redo2 className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onClear();
              }}
              title={tr('writing_toolbar_clear_board', 'مسح السبورة')}
              className="flex-1 p-2.5 rounded-xl bg-slate-800 hover:bg-red-950/50 hover:text-red-400 text-slate-400 border border-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onExport();
              }}
              title={tr('writing_toolbar_save_image', 'حفظ اللوحة كصورة')}
              className="flex-1 p-2.5 rounded-xl bg-slate-800 hover:bg-emerald-950/50 hover:text-emerald-400 text-emerald-400 border border-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>

          {/* Settings Studio & Cloud Link Button */}
          {onOpenSettings && (
            <div className="mt-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>{tr('writing_toolbar_settings_studio', 'استوديو الإعدادات والربط بالشيت')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Backdrop overlay */}
      {(activePopover || isMobileMenuOpen) && (
        <div
          onClick={() => {
            setActivePopover(null);
            setIsMobileMenuOpen(false);
          }}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-40 transition-opacity"
        />
      )}

      {/* ======================================================== */}
      {/* 1. DRAWING TOOLS POPOVER (زر أدوات الرسم)                 */}
      {/* ======================================================== */}
      {activePopover === 'drawing_tools' && (
        <div
          className="fixed inset-x-3 top-16 sm:absolute sm:top-full sm:right-6 sm:left-auto max-w-sm sm:w-96 w-auto mx-auto sm:mx-0 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[80vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3.5">
            <div className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-sm text-amber-300">{tr('writing_toolbar_drawing_tools_title', 'أدوات الرسم والخط')}</h2>
            </div>
            <button
              onClick={() => setActivePopover(null)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label={tr('writing_toolbar_close', 'إغلاق')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Pen Types */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {tr('writing_toolbar_pen_type_label', 'نوع القلم والأداة:')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                
                {/* 1. قلم الخط المشطوف */}
                <button
                  onClick={() => onSelectPenType('calligraphy')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    penType === 'calligraphy'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-800/80 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <PenTool className="w-4 h-4 shrink-0" />
                  <span>{tr('writing_toolbar_pen_calligraphy', 'قلم الخط')}</span>
                </button>

                {/* 2. حبر ناعم مستدير */}
                <button
                  onClick={() => onSelectPenType('marker')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    penType === 'marker'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-800/80 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-current shrink-0" />
                  <span>{tr('writing_toolbar_pen_marker', 'حبر ناعم')}</span>
                </button>

                {/* 3. ممحاة */}
                <button
                  onClick={() => onSelectPenType('eraser')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    penType === 'eraser'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-800/80 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <Eraser className="w-4 h-4 shrink-0" />
                  <span>{tr('writing_toolbar_pen_eraser', 'ممحاة')}</span>
                </button>

              </div>
            </div>

            {/* Calligraphy Pen Angle */}
            <div className={`p-3 rounded-xl border transition-all ${
              penType === 'calligraphy'
                ? 'bg-slate-950/60 border-amber-500/30'
                : 'bg-slate-950/30 border-slate-800 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-slate-200">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>{tr('writing_toolbar_pen_angle', 'زاوية قلم الخط:')}</span>
                </span>
                <span className="font-mono font-bold text-amber-400 text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {calligraphyAngle}°
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="180"
                step="5"
                value={calligraphyAngle}
                onChange={(e) => onChangeCalligraphyAngle(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Pen Size Slider */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-200">
                  {tr('writing_toolbar_pen_size', 'سُمك القلم:')}
                </span>
                <span className="font-mono font-bold text-amber-400 text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {penSize}px
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="4"
                  max="48"
                  value={penSize}
                  onChange={(e) => onChangePenSize(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div
                  className="rounded-full shrink-0 border border-slate-600 transition-all"
                  style={{
                    width: `${Math.min(32, Math.max(8, penSize))}px`,
                    height: `${Math.min(32, Math.max(8, penSize))}px`,
                    backgroundColor: penColor
                  }}
                />
              </div>
            </div>

            {/* Ink Colors Palette */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {tr('writing_toolbar_ink_colors', 'ألوان الحبر والرسم:')}
              </label>
              <div className="grid grid-cols-5 gap-2.5">
                {CALLIGRAPHY_COLORS.map(c => (
                  <button
                    key={c.hex}
                    onClick={() => onSelectPenColor(c.hex)}
                    title={c.name}
                    className={`h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                      penColor === c.hex
                        ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 scale-105 shadow-md'
                        : 'hover:scale-105 opacity-90'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {penColor === c.hex && (
                      <Check className={`w-4 h-4 ${c.hex === '#ffffff' ? 'text-slate-950' : 'text-white'}`} />
                    )}
                  </button>
                ))}

                {/* Custom Color Picker */}
                <label
                  className="h-9 rounded-xl border border-dashed border-slate-600 hover:border-amber-400 flex items-center justify-center cursor-pointer transition-transform hover:scale-105 relative bg-slate-800"
                  title={tr('writing_toolbar_custom_color', 'لون مخصص')}
                >
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => onSelectPenColor(e.target.value)}
                    className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                  />
                  <span className="text-xs font-bold text-amber-400">+</span>
                </label>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* 3. AR TRACKING OPTIONS POPOVER (خيارات الواقع المعزز AR)   */}
      {/* ======================================================== */}
      {activePopover === 'ar_settings' && boardStyle === 'ar_camera' && (
        <div
          className="fixed inset-x-3 top-16 sm:absolute sm:top-full sm:right-52 sm:left-auto max-w-sm sm:w-96 w-auto mx-auto sm:mx-0 z-50 bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[80vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3.5">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-sm text-amber-300">
                {tr('writing_toolbar_ar_options_title', 'خيارات الواقع المعزز AR')}
              </h2>
            </div>
            <button
              onClick={() => setActivePopover(null)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label={tr('writing_toolbar_close', 'إغلاق')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            
            {/* Tracking Mode Options */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {tr('writing_toolbar_ar_tracking_mode', 'وضع تتبع اليد في الهواء:')}
              </label>
              <div className="space-y-2">
                
                {/* 1. تتبع إصبع واحد */}
                <button
                  onClick={() => onSelectTrackingMode('finger_only')}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    trackingMode === 'finger_only'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">☝️</span>
                    <div className="text-right">
                      <div>{tr('writing_toolbar_ar_finger_title', 'تتبع إصبع السبابة فقط')}</div>
                      <div className="text-[10px] opacity-80 font-normal">
                        {tr('writing_toolbar_ar_finger_desc', 'رسم مباشر بدقة عالية عند رأس الإصبع')}
                      </div>
                    </div>
                  </div>
                  {trackingMode === 'finger_only' && <Check className="w-4 h-4 shrink-0" />}
                </button>

                {/* 2. هيكل يد واحدة كامل */}
                <button
                  onClick={() => onSelectTrackingMode('one_hand')}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    trackingMode === 'one_hand'
                      ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Hand className="w-4 h-4 shrink-0 text-amber-300" />
                    <div className="text-right">
                      <div>{tr('writing_toolbar_ar_one_hand_title', 'هيكل يد واحدة كامل (21 مفصلاً)')}</div>
                      <div className="text-[10px] opacity-80 font-normal">
                        {tr('writing_toolbar_ar_one_hand_desc', 'تتبع حركي كامل للمفاصل والرسم بالقرص')}
                      </div>
                    </div>
                  </div>
                  {trackingMode === 'one_hand' && <Check className="w-4 h-4 shrink-0" />}
                </button>

                {/* 3. هيكل يدين اثنتين */}
                <button
                  onClick={() => onSelectTrackingMode('two_hands')}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    trackingMode === 'two_hands'
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🖐️🖐️</span>
                    <div className="text-right">
                      <div>{tr('writing_toolbar_ar_two_hands_title', 'هيكل يدين معاً (اليمنى واليسرى)')}</div>
                      <div className="text-[10px] opacity-80 font-normal">
                        {tr('writing_toolbar_ar_two_hands_desc', 'للألعاب والتفاعل الحركي باليدين')}
                      </div>
                    </div>
                  </div>
                  {trackingMode === 'two_hands' && <Check className="w-4 h-4 shrink-0" />}
                </button>

                {/* 4. وضع اللمس السريع */}
                <button
                  onClick={() => onSelectTrackingMode('off')}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    trackingMode === 'off'
                      ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <div className="text-right">
                      <div>{tr('writing_toolbar_ar_off_title', 'إيقاف تتبع اليد (رسم باللمس فقط)')}</div>
                      <div className="text-[10px] opacity-80 font-normal">
                        {tr('writing_toolbar_ar_off_desc', 'أسرع أداء على الجوال والتابلت مع بقاء التاج')}
                      </div>
                    </div>
                  </div>
                  {trackingMode === 'off' && <Check className="w-4 h-4 shrink-0" />}
                </button>

              </div>
            </div>

            {/* Royal Crown Feature */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-300">
                    {activeRewardTitle || tr('writing_toolbar_crown_default_title', 'مكافأة التاج الملكي 👑')}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {tr('writing_toolbar_crown_desc', 'يتوج رأس الطالب بالمكافأة المحددة عند إتقان الرسم بنجاح')}
                  </div>
                </div>
              </div>

              <button
                onClick={onToggleCrown}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  showCrown
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {showCrown
                  ? tr('writing_toolbar_crown_preview_on', 'معاينة المكافأة 👑')
                  : tr('writing_toolbar_crown_preview_off', 'تفعيل المعاينة')}
              </button>
            </div>

            {/* Air Pen Lock / Unlock */}
            {onToggleAirPenLock && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    isAirPenLocked
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {isAirPenLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      {isAirPenLocked
                        ? tr('writing_toolbar_airpen_locked_title', 'القلم الهوائي مقفل 🔒')
                        : tr('writing_toolbar_airpen_unlocked_title', 'القلم الهوائي مفعّل ✍️')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {tr('writing_toolbar_airpen_desc', 'تأمين القلم لمنع الرسم العشوائي أثناء تعديل جلستك أو الكاميرا')}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleAirPenLock}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isAirPenLocked
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-emerald-600 text-white shadow-sm'
                  }`}
                >
                  {isAirPenLocked
                    ? tr('writing_toolbar_airpen_unlock_btn', 'فتح القلم')
                    : tr('writing_toolbar_airpen_lock_btn', 'قفل القلم')}
                </button>
              </div>
            )}

            {/* Camera Flipping & Mirroring */}
            <div className="grid grid-cols-2 gap-2">
              
              {/* Mirror Toggle */}
              <button
                onClick={onToggleMirror}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isMirrored
                    ? 'bg-slate-800 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700'
                }`}
              >
                <FlipHorizontal className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {isMirrored
                    ? tr('writing_toolbar_mirror_on', 'مرآة: مفعّلة')
                    : tr('writing_toolbar_mirror_off', 'مرآة: معطّلة')}
                </span>
              </button>

              {/* Camera Switch (Front / Back) */}
              <button
                onClick={onToggleFacingMode}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {facingMode === 'user'
                    ? tr('writing_toolbar_cam_front', 'كاميرا أمامية')
                    : tr('writing_toolbar_cam_back', 'كاميرا خلفية')}
                </span>
              </button>

            </div>

            {/* Live Detection Status Indicator */}
            {arDetectionStatus && (
              <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center gap-2 text-[11px] text-slate-300">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  trackingMode === 'off'
                    ? 'bg-amber-400'
                    : arDetectionStatus.handsCount > 0
                    ? arDetectionStatus.isPinching
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                }`} />
                <span className="truncate">
                  {trackingMode === 'off'
                    ? tr('writing_toolbar_status_touch', '⚡ الرسم باللمس السريع (تتبع اليد متوقف)')
                    : arDetectionStatus.handsCount > 0
                    ? arDetectionStatus.isPinching
                      ? tr('writing_toolbar_status_drawing', '✍️ يرسم الآن في الهواء')
                      : trackingMode === 'finger_only'
                      ? tr('writing_toolbar_status_finger_ready', '☝️ السبابة متصلة • قرّب الإبهام للرسم')
                      : trackingMode === 'two_hands' && arDetectionStatus.handsCount >= 2
                      ? tr('writing_toolbar_status_two_hands_ready', '🖐️🖐️ تم اكتشاف اليدين معاً')
                      : tr('writing_toolbar_status_one_hand_ready', '🖐️ هيكل اليد متصل ومطابق')
                    : tr('writing_toolbar_status_point_hand', 'وجّه يدك نحو الكاميرا للبدء')}
                  {arDetectionStatus.faceDetected &&
                    showCrown &&
                    tr('writing_toolbar_status_crown_locked', ' • 👑 التاج مثبت')}
                </span>
              </div>
            )}

          </div>
        </div>
      )}

    </header>
  );
});

WhiteboardToolbar.displayName = 'WhiteboardToolbar';
