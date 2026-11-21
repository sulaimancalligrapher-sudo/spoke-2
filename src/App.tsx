import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  WordItem,
  PronunciationEvaluation,
  PracticeHistoryItem,
  AudioSettings,
  GoogleSheetsConfig,
  StudentSubmissionRecord,
  EvaluationMode,
  StudentRegistrant,
  HomeBrandConfig,
  MatchingLessonSubject,
  MatchingHistoryItem,
  DictationLessonSubject,
  DictationHistoryItem,
  CatchLessonSubject,
  CatchHistoryItem,
  WritingHistoryItem,
} from './types';
import {
  ALL_CURRICULUM,
  INITIAL_CATEGORIES,
  INITIAL_LESSON_SUBJECTS,
} from './data/arabicCurriculum';
import { INITIAL_MATCHING_SUBJECTS } from './data/matchingCurriculum';
import { INITIAL_DICTATION_SUBJECTS } from './data/dictationCurriculum';
import { INITIAL_CATCH_SUBJECTS } from './data/catchCurriculum';
import { Navbar } from './components/Navbar';
import { PracticeCard } from './components/PracticeCard';
import { EvaluationCard } from './components/EvaluationCard';
import { WordMatchingArena } from './components/WordMatchingArena';
import { DictationArena } from './components/DictationArena';
import { CatchArena } from './components/CatchArena';
import { WritingArena } from './arWriting/components/WritingArena';
import { StatsModal } from './components/StatsModal';
import { SettingsModal } from './components/SettingsModal';
import { GuideModal } from './components/GuideModal';
import { AdminPanel } from './components/AdminPanel';
import { LessonsModal } from './components/LessonsModal';
import { MatchingLessonsModal } from './components/MatchingLessonsModal';
import { DictationLessonsModal } from './components/DictationLessonsModal';
import { CatchLessonsModal } from './components/CatchLessonsModal';
import { StudentLoginModal } from './components/StudentLoginModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { SocialIcon, getSocialBrandClasses } from './components/SocialIcon';
import { InteractiveVideoArena } from './video/components/InteractiveVideoArena';
import { VideoLessonsModal } from './video/components/VideoLessonsModal';
import { VideoCorrectionModal } from './video/components/VideoCorrectionModal';
import { CourseScheduleModal } from './components/CourseScheduleModal';
import {
  CourseScheduleData,
  ScheduleLessonRef,
  fetchCourseScheduleFromSheets,
  getLocalCourseSchedule,
  getTodayLocalISO,
  saveLocalCourseSchedule,
} from './utils/courseSchedule';
import {
  VideoLesson,
  VideoStudentProgress,
  fetchVideoLessonsFromSheets,
  fetchStudentVideoProgress,
  getLocalVideoLessons,
  getLocalVideoProgressMap,
  saveLocalVideoLessons,
} from './video/videoSheets';
import { sheetService as writingSheetService } from './arWriting/services/sheetService';
import { DrawingTemplate, BoardStyle, GuideColor } from './arWriting/types/drawing';
import {
  ARRewardTier,
  getStoredARRewards,
  saveStoredARRewards,
  getStoredARIntroReward,
  saveStoredARIntroReward,
} from './arWriting/services/arRewardsService';
import {
  getStoredCatchARRewards,
  saveStoredCatchARRewards,
  getStoredCatchARIntroReward,
  saveStoredCatchARIntroReward,
} from './utils/catchArRewards';
import {
  fetchCurriculumFromSheets,
  fetchHomeConfigFromSheets,
  fetchStudentSubmissionsFromSheet,
  fetchStudentMatchingHistory,
  fetchStudentDictationHistory,
  fetchStudentCatchHistory,
  fetchStudentWritingHistory,
  saveLocalWritingSubmission,
  fetchTranslationsFromSheets,
  saveTranslationsToSheets,
  fetchMatchingExercisesFromSheets,
  fetchDictationExercisesFromSheets,
  fetchCatchExercisesFromSheets,
  fetchCatchARRewardsFromSheet,
  verifyStudentLogin,
  fetchIDRegistrants,
  getOrCreateDeviceId,
  getFastOptionalGeolocation,
  normalizeDigits,
  STORAGE_KEY_MATCHING_CURRICULUM,
  STORAGE_KEY_DICTATION_CURRICULUM,
  STORAGE_KEY_CATCH_CURRICULUM,
  DEFAULT_WEBHOOK_URL,
  DEFAULT_DRIVE_AUDIO_FOLDER_ID,
  STUDENT_AUDIO_DRIVE_FOLDER_ID,
} from './utils/googleSheets';
import {
  SupportedLang,
  TranslationItem,
  getStoredLanguage,
  setStoredLanguage,
  getStoredTranslations,
  saveStoredTranslations,
  getTranslatedString,
  getTranslatedMatchingSubject,
  getTranslatedDictationSubject,
  getTranslatedCatchSubject,
} from './utils/translations';
import {
  formatStudentRetryBannerMessage,
  getRetryStatus,
  recordStudentRetryAttempt,
  syncStudentRetriesFromSheets,
} from './utils/retryLimit';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Sliders,
  BookOpen,
  Play,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Headphones,
  Zap,
  RotateCcw,
  Home,
  Layers,
  Award,
  ChevronDown,
  Link2,
  PenTool,
  Mic,
  List,
  Pencil,
  Target,
  Film,
  Calendar,
} from 'lucide-react';

const STORAGE_KEY_HISTORY = 'faseeh_pronunciation_history_v1';
const STORAGE_KEY_SCORES = 'faseeh_pronunciation_scores_v1';
const STORAGE_KEY_CUSTOM = 'faseeh_custom_words_v2';
const STORAGE_KEY_SETTINGS = 'faseeh_audio_settings_v1';
const STORAGE_KEY_SHEETS = 'faseeh_sheets_config_v1';
const STORAGE_KEY_SUBMISSIONS = 'faseeh_submissions_v1';
const STORAGE_KEY_CATEGORIES = 'faseeh_categories_v2';
const STORAGE_KEY_SUBJECTS = 'faseeh_subjects_v2';
const STORAGE_KEY_STUDENT = 'faseeh_active_student_v1';

const isMobileDevicePlatform = () => {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  );
};

export default function App() {
  const [curriculum, setCurriculum] = useState<WordItem[]>(ALL_CURRICULUM);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [subjects, setSubjects] = useState<string[]>(INITIAL_LESSON_SUBJECTS);
  const [selectedItem, setSelectedItem] = useState<WordItem>(ALL_CURRICULUM[0]);
  const [evaluation, setEvaluation] = useState<PronunciationEvaluation | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [streak, setStreak] = useState(0);

  // Separate Admin View routing (supports URL: #control / #admin)
  const [isAdminView, setIsAdminView] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('faseeh_admin_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);

  // Student View: Active Lesson Subject
  const [studentSubject, setStudentSubject] = useState<string>(
    ALL_CURRICULUM[0]?.lessonSubject || INITIAL_LESSON_SUBJECTS[0]
  );

  // Main UI Mode: 'landing' (الرئيسية التعريفية) or 'practice' (صفحة التدريب والتسجيل)
  const [currentView, setCurrentView] = useState<'landing' | 'practice'>('landing');

  // Exercise Mode: 'pronunciation', 'matching', 'dictation', 'writing', 'catch', or 'video'
  const [appMode, setAppMode] = useState<'pronunciation' | 'matching' | 'dictation' | 'writing' | 'catch' | 'video'>('pronunciation');
  const [adminInitialTab, setAdminInitialTab] = useState<
    'lessons' | 'matching' | 'dictation' | 'writing' | 'catch' | 'video' | 'schedule' | 'subscribers' | 'telegram' | 'submissions' | 'sheets' | 'translations' | 'translations2' | 'translations3' | 'translations4' | 'translations5'
  >('lessons');

  // Exercise 4: Arabic Writing & AR Whiteboard State
  const [writingTemplates, setWritingTemplates] = useState<DrawingTemplate[]>(() =>
    writingSheetService.getLocalTemplates()
  );
  const [selectedWritingTemplate, setSelectedWritingTemplate] = useState<DrawingTemplate | null>(null);
  const [writingBoardStyle, setWritingBoardStyle] = useState<BoardStyle>('white');
  const [writingGuideColor, setWritingGuideColor] = useState<GuideColor>('yellow');
  const [writingTemplateOpacity, setWritingTemplateOpacity] = useState<number>(0.35);
  const [writingSaveArCameraPhoto, setWritingSaveArCameraPhoto] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('arabic_calligraphy_save_ar_camera_v1');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });
  const [writingArRewards, setWritingArRewards] = useState<ARRewardTier[]>(() => getStoredARRewards());
  const [writingArIntroReward, setWritingArIntroReward] = useState<ARRewardTier>(() =>
    getStoredARIntroReward()
  );
  const [writingPreviewRewardRequest, setWritingPreviewRewardRequest] = useState<{
    tier: ARRewardTier;
    nonce: number;
  } | null>(null);

  // Matching Exercises Curriculum (Sheet: "وصل")
  const [matchingSubjects, setMatchingSubjects] = useState<MatchingLessonSubject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MATCHING_CURRICULUM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_MATCHING_SUBJECTS;
  });

  // Dictation Exercises Curriculum (Sheet: "كلمات")
  const [dictationSubjects, setDictationSubjects] = useState<DictationLessonSubject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DICTATION_CURRICULUM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_DICTATION_SUBJECTS;
  });

  // Exercise 5: AR Catch & Connect Curriculum (Sheet: "صيد") + Independent AR Rewards (Sheet: "مكافآت صيد AR")
  const [catchSubjects, setCatchSubjects] = useState<CatchLessonSubject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATCH_CURRICULUM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_CATCH_SUBJECTS;
  });
  const [catchArRewards, setCatchArRewards] = useState<ARRewardTier[]>(() => getStoredCatchARRewards());
  const [catchArIntroReward, setCatchArIntroReward] = useState<ARRewardTier>(() =>
    getStoredCatchARIntroReward()
  );
  const [catchPreviewRewardRequest, setCatchPreviewRewardRequest] = useState<{
    tier: ARRewardTier;
    nonce: number;
  } | null>(null);

  const [isLessonsModalOpen, setIsLessonsModalOpen] = useState(false);
  const [isMatchingLessonsModalOpen, setIsMatchingLessonsModalOpen] = useState(false);
  const [isDictationLessonsModalOpen, setIsDictationLessonsModalOpen] = useState(false);
  const [isCatchLessonsModalOpen, setIsCatchLessonsModalOpen] = useState(false);
  const [landingLessonsMenuOpen, setLandingLessonsMenuOpen] = useState(false);
  const landingLessonsMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeMatchingSubjectId, setActiveMatchingSubjectId] = useState<string>('');
  const [activeMatchingExerciseIdx, setActiveMatchingExerciseIdx] = useState<number>(0);
  const [activeDictationSubjectId, setActiveDictationSubjectId] = useState<string>('');
  const [activeDictationExerciseIdx, setActiveDictationExerciseIdx] = useState<number>(0);
  const [activeCatchSubjectId, setActiveCatchSubjectId] = useState<string>('');
  const [activeCatchExerciseIdx, setActiveCatchExerciseIdx] = useState<number>(0);

  // Standalone Interactive Video Module State (فيديو_الأسئلة / فيديو_الإجابات / فيديو_التصحيح)
  const [videoLessons, setVideoLessons] = useState<VideoLesson[]>(() => getLocalVideoLessons());
  const [activeVideoLessonId, setActiveVideoLessonId] = useState<string>(() => getLocalVideoLessons()[0]?.id || '');
  const [videoProgressMap, setVideoProgressMap] = useState<Record<string, VideoStudentProgress>>(() =>
    getLocalVideoProgressMap('')
  );
  const [isVideoResetMode, setIsVideoResetMode] = useState(false);
  const [isVideoLessonsModalOpen, setIsVideoLessonsModalOpen] = useState(false);
  const [isVideoCorrectionModalOpen, setIsVideoCorrectionModalOpen] = useState(false);

  // Course Groups & Daily Schedule State (مجموعات_الجدول / الجدول_اليومي)
  const [courseSchedule, setCourseSchedule] = useState<CourseScheduleData>(() =>
    getLocalCourseSchedule()
  );
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const hasTodayScheduleLesson = useMemo(() => {
    const tIso = getTodayLocalISO();
    return courseSchedule.days.some(
      (d) => d.date === tIso && ((d.groupIds && d.groupIds.length > 0) || Boolean(d.groupId))
    );
  }, [courseSchedule.days]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (landingLessonsMenuRef.current && !landingLessonsMenuRef.current.contains(e.target as Node)) {
        setLandingLessonsMenuOpen(false);
      }
    };
    if (landingLessonsMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [landingLessonsMenuOpen]);

  // Modals & Registration
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<StudentRegistrant | null>(null);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Home Page Branding & Dynamic Social Media Links (Sheet: "الرئيسية")
  const [homeConfig, setHomeConfig] = useState<HomeBrandConfig | null>(() => {
    try {
      const cached = localStorage.getItem('faseeh_cached_home_config');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Dedicated Student Evaluation History (from sheet "answers 1")
  const [studentHistory, setStudentHistory] = useState<PracticeHistoryItem[]>([]);
  const [isSyncingAnswers1, setIsSyncingAnswers1] = useState(false);

  // Student Matching Exercise History (from sheet "answers 2")
  const [matchingHistory, setMatchingHistory] = useState<MatchingHistoryItem[]>([]);
  const [isSyncingMatching, setIsSyncingMatching] = useState(false);

  // Student Dictation Exercise History (from sheet "answers 3")
  const [dictationHistory, setDictationHistory] = useState<DictationHistoryItem[]>([]);
  const [isSyncingDictation, setIsSyncingDictation] = useState(false);

  // Student AR Catch Exercise History (from sheet "اجابات صيد")
  const [catchHistory, setCatchHistory] = useState<CatchHistoryItem[]>([]);
  const [isSyncingCatch, setIsSyncingCatch] = useState(false);

  // Student Writing Exercise History (from sheet "answers 4")
  const [writingHistory, setWritingHistory] = useState<WritingHistoryItem[]>([]);

  // Scores map: wordId -> score
  const [scoresMap, setScoresMap] = useState<Record<string, number>>({});
  // Practice History
  const [history, setHistory] = useState<PracticeHistoryItem[]>([]);

  // Submission status for current exercise
  const [isCurrentAnswerSubmitted, setIsCurrentAnswerSubmitted] = useState(false);
  const [pronunciationRetryNonce, setPronunciationRetryNonce] = useState(0);
  const [matchingRetryNonce, setMatchingRetryNonce] = useState(0);
  const [dictationRetryNonce, setDictationRetryNonce] = useState(0);
  const [catchRetryNonce, setCatchRetryNonce] = useState(0);
  const [pronunciationRetryBanner, setPronunciationRetryBanner] = useState<{ nonce: number; message: string } | null>(null);
  const [matchingRetryBanner, setMatchingRetryBanner] = useState<{ nonce: number; message: string } | null>(null);
  const [dictationRetryBanner, setDictationRetryBanner] = useState<{ nonce: number; message: string } | null>(null);
  const [catchRetryBanner, setCatchRetryBanner] = useState<{ nonce: number; message: string } | null>(null);

  // Google Sheets Config (Defaulted to verified Webhook URL for seamless cross-device sync)
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>({
    enabled: true,
    webhookUrl: DEFAULT_WEBHOOK_URL,
    autoSync: true,
    syncCurriculumFromSheets: true,
    teacherDriveFolderId: DEFAULT_DRIVE_AUDIO_FOLDER_ID,
    studentDriveFolderId: STUDENT_AUDIO_DRIVE_FOLDER_ID,
    driveFolderId: DEFAULT_DRIVE_AUDIO_FOLDER_ID,
  });

  // Student Submissions Log
  const [submissions, setSubmissions] = useState<StudentSubmissionRecord[]>([]);

  // Translations & Language State (Supported: 'ar' | 'th' | 'en')
  const [currentLang, setCurrentLang] = useState<SupportedLang>(getStoredLanguage);
  const [translations, setTranslations] = useState<TranslationItem[]>(getStoredTranslations);

  const t = (id: string, fallbackAr?: string): string => {
    return getTranslatedString(id, currentLang, translations, fallbackAr);
  };

  const handleSelectLang = (lang: SupportedLang) => {
    setCurrentLang(lang);
    setStoredLanguage(lang);
  };

  const handleUpdateTranslations = async (items: TranslationItem[]) => {
    setTranslations(items);
    saveStoredTranslations(items);

    // Sync any sheet "الرئيسية" Arabic edits into homeConfig immediately (allowing clean empty strings)
    const titleItem = items.find((i) => i.id === 'nav_platform_title');
    const subtitleItem = items.find((i) => i.id === 'nav_platform_subtitle');
    const cardTitleItem = items.find((i) => i.id === 'home_card_title');
    const cardSubtitleItem = items.find((i) => i.id === 'home_card_subtitle');
    const extra1Item = items.find((i) => i.id === 'home_card_extra1');
    const extra2Item = items.find((i) => i.id === 'home_card_extra2');
    const extra3Item = items.find((i) => i.id === 'home_card_extra3');

    setHomeConfig((prev) => {
      const updated: HomeBrandConfig = {
        title: titleItem !== undefined ? titleItem.ar : (prev?.title || ''),
        subtitle: subtitleItem !== undefined ? subtitleItem.ar : (prev?.subtitle || ''),
        logoUrl: prev?.logoUrl || '',
        card: {
          cardLogoUrl: prev?.card?.cardLogoUrl || '',
          cardBgUrl: prev?.card?.cardBgUrl || '',
          cardTitle: cardTitleItem !== undefined ? cardTitleItem.ar : (prev?.card?.cardTitle || ''),
          cardSubtitle: cardSubtitleItem !== undefined ? cardSubtitleItem.ar : (prev?.card?.cardSubtitle || ''),
          extraText1: extra1Item !== undefined ? extra1Item.ar : prev?.card?.extraText1,
          extraText2: extra2Item !== undefined ? extra2Item.ar : prev?.card?.extraText2,
          extraText3: extra3Item !== undefined ? extra3Item.ar : prev?.card?.extraText3,
        },
        socialLinks: prev?.socialLinks || [],
        adminUsers: prev?.adminUsers || [],
      };
      try {
        localStorage.setItem('faseeh_cached_home_config', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Sync any curriculum meaning/makhraj updates (Columns 6 & 7)
    setCurriculum((prev) => {
      let changed = false;
      const next = prev.map((w) => {
        const meaningItem = items.find((i) => i.id === `lesson_${w.word}_meaning`);
        const makhrajItem = items.find((i) => i.id === `lesson_${w.word}_makhraj`);
        const newMeaning = meaningItem && meaningItem.ar !== undefined ? meaningItem.ar : w.meaning;
        const newMakhraj = makhrajItem && makhrajItem.ar !== undefined ? makhrajItem.ar : w.makhrajTip;
        if (newMeaning !== w.meaning || newMakhraj !== w.makhrajTip) {
          changed = true;
          return { ...w, meaning: newMeaning, makhrajTip: newMakhraj };
        }
        return w;
      });
      if (changed) {
        try {
          localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
        } catch {}
      }
      return changed ? next : prev;
    });

    if (sheetsConfig.webhookUrl) {
      try {
        await saveTranslationsToSheets(sheetsConfig.webhookUrl, items);
      } catch (err) {
        console.warn('Error saving translations to Google Sheets:', err);
      }
    }
  };

  const syncWritingARRewardsFromCloud = async (overrideUrl?: string) => {
    const activeUrl = overrideUrl || sheetsConfig.webhookUrl;
    if (activeUrl) writingSheetService.setOverrideUrl(activeUrl);
    try {
      const rewardRes = await writingSheetService.fetchARRewardsFromSheet();
      if (rewardRes.success) {
        if (rewardRes.rewards && rewardRes.rewards.length > 0) {
          setWritingArRewards(rewardRes.rewards);
          saveStoredARRewards(rewardRes.rewards);
        }
        if (rewardRes.introReward) {
          setWritingArIntroReward(rewardRes.introReward);
          saveStoredARIntroReward(rewardRes.introReward);
        }
      }
    } catch (err) {
      console.warn('AR rewards sync notice:', err);
    }
  };

  // Full Refresh / Pull all latest data from Google Sheets into the Platform
  const handleRefreshAllFromSheets = async (): Promise<void> => {
    const url = sheetsConfig.webhookUrl;
    if (!url) {
      alert('يرجى التأكد من إدخال رابط Google Sheets Webhook أولاً في الإعدادات.');
      return;
    }

    writingSheetService.setOverrideUrl(url);

    const [currRes, homeCfg, transRes, matchRes, dictRes, catchRes, catchRewardsRes, writingLessons, writingRewards, videoLessonsRes, scheduleRes] =
      await Promise.all([
        fetchCurriculumFromSheets(url),
        fetchHomeConfigFromSheets(url),
        fetchTranslationsFromSheets(url),
        fetchMatchingExercisesFromSheets(url),
        fetchDictationExercisesFromSheets(url),
        fetchCatchExercisesFromSheets(url),
        fetchCatchARRewardsFromSheet(url),
        writingSheetService.fetchLessonsFromSheet().catch(() => null),
        writingSheetService.fetchARRewardsFromSheet().catch(() => null),
        fetchVideoLessonsFromSheets(url).catch(() => null),
        fetchCourseScheduleFromSheets(url).catch(() => null),
      ]);

    // 1. Update curriculum from sheet "الدروس"
    if (currRes.success && currRes.curriculum && currRes.curriculum.length > 0) {
      setCurriculum(currRes.curriculum);
      if (currRes.subjects && currRes.subjects.length > 0) {
        setSubjects(currRes.subjects);
        localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(currRes.subjects));
      }
      if (currRes.categories && currRes.categories.length > 0) {
        setCategories(currRes.categories);
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(currRes.categories));
      }
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(currRes.curriculum));
    }

    // 2. Update homeConfig from sheet "الرئيسية"
    if (homeCfg) {
      setHomeConfig(homeCfg);
      localStorage.setItem('faseeh_cached_home_config', JSON.stringify(homeCfg));
    }

    // 3. Update translations from sheet "الترجمة"
    if (transRes && Array.isArray(transRes) && transRes.length > 0) {
      setTranslations((prev) => {
        const map = new Map<string, TranslationItem>();
        prev.forEach((p) => map.set(p.id, p));
        transRes.forEach((t: any) => {
          const ex = map.get(t.id);
          if (ex) {
            map.set(t.id, {
              ...ex,
              ar: t.ar !== undefined ? t.ar : ex.ar,
              th: t.th !== undefined ? t.th : ex.th,
              en: t.en !== undefined ? t.en : ex.en,
            });
          } else if (t.id) {
            map.set(t.id, t as TranslationItem);
          }
        });
        const merged = Array.from(map.values());
        saveStoredTranslations(merged);
        return merged;
      });
    }

    // 4. Update matching curriculum from sheet "وصل"
    if (matchRes && matchRes.success && matchRes.subjects && matchRes.subjects.length > 0) {
      setMatchingSubjects(matchRes.subjects);
      try {
        localStorage.setItem(STORAGE_KEY_MATCHING_CURRICULUM, JSON.stringify(matchRes.subjects));
      } catch {}
    }

    // 5. Update dictation curriculum from sheet "كلمات"
    if (dictRes && dictRes.success && dictRes.subjects && dictRes.subjects.length > 0) {
      setDictationSubjects(dictRes.subjects);
      try {
        localStorage.setItem(STORAGE_KEY_DICTATION_CURRICULUM, JSON.stringify(dictRes.subjects));
      } catch {}
    }

    // 5B. Update AR Catch curriculum from sheet "صيد" & rewards from "مكافآت صيد AR"
    if (catchRes && catchRes.success && catchRes.subjects && catchRes.subjects.length > 0) {
      setCatchSubjects(catchRes.subjects);
      try {
        localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(catchRes.subjects));
      } catch {}
    }
    if (catchRewardsRes && catchRewardsRes.success) {
      if (catchRewardsRes.rewards && catchRewardsRes.rewards.length > 0) {
        setCatchArRewards(catchRewardsRes.rewards);
        saveStoredCatchARRewards(catchRewardsRes.rewards);
      }
      if (catchRewardsRes.introReward) {
        setCatchArIntroReward(catchRewardsRes.introReward);
        saveStoredCatchARIntroReward(catchRewardsRes.introReward);
      }
    }

    // 6. Update writing lessons from sheet "ArabicLessons"
    if (writingLessons && writingLessons.success) {
      setWritingTemplates(writingLessons.lessons);
      writingSheetService.saveLocalTemplates(writingLessons.lessons);
      setSelectedWritingTemplate((prev) => {
        if (prev) {
          const updatedMatch = writingLessons.lessons.find((w) => w.id === prev.id);
          return updatedMatch || prev;
        }
        return null;
      });
    }

    // 7. Update AR rewards from sheet "AR Rewards"
    if (writingRewards && writingRewards.success) {
      if (writingRewards.rewards && writingRewards.rewards.length > 0) {
        setWritingArRewards(writingRewards.rewards);
        saveStoredARRewards(writingRewards.rewards);
      }
      if (writingRewards.introReward) {
        setWritingArIntroReward(writingRewards.introReward);
        saveStoredARIntroReward(writingRewards.introReward);
      }
    }

    // 8. Update interactive video lessons from sheet "فيديو_الأسئلة"
    if (videoLessonsRes && videoLessonsRes.length > 0) {
      setVideoLessons(videoLessonsRes);
      saveLocalVideoLessons(videoLessonsRes);
      setActiveVideoLessonId((prev) => prev || videoLessonsRes[0].id);
    }
    // 9. Update course groups & daily schedule from sheets "مجموعات_الجدول" & "الجدول_اليومي"
    if (scheduleRes) {
      setCourseSchedule(scheduleRes);
    }
    if (currentStudent && url) {
      fetchStudentVideoProgress(url, currentStudent.id, currentStudent.name)
        .then((vp) => {
          if (vp) setVideoProgressMap(vp);
        })
        .catch(() => {});
    }
  };

  // Settings: Defaults to 'whisper' (In-Browser WebAssembly Whisper) across all devices and browsers
  const [settings, setSettings] = useState<AudioSettings>({
    speed: 0.9,
    engine: 'browser',
    autoPlayTarget: false,
    repeatTargetTwice: false,
    preferredEvaluationMode: 'whisper',
    studentName: '',
  });

  // Check URL hash for admin routing and device sync on mount and hashchange
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      const path = window.location.pathname.toLowerCase();

      // Check for mobile/tablet sync payload (#sync=...)
      if (hash.startsWith('#sync=')) {
        try {
          const raw = decodeURIComponent(hash.substring(6));
          const parsed = JSON.parse(raw);

          // Format 1: Ultra-compact format ({ cw: [...], cs: [...], cc: [...] }) for instant QR & short link
          if (parsed && Array.isArray(parsed.cw)) {
            const restoredCustomWords: WordItem[] = parsed.cw.map((cwItem: any) => ({
              id: cwItem.id || `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              word: cwItem.w || '',
              plainWord: cwItem.p || cwItem.w || '',
              meaning: cwItem.m || '',
              category: cwItem.c || 'أخرى',
              lessonSubject: cwItem.s || 'دروس إضافية',
              audioUrl: cwItem.a || undefined,
              autoReadText: cwItem.t || undefined,
              imageUrl: cwItem.img || undefined,
              makhrajTip: cwItem.tip || undefined,
            }));

            // Merge with ALL_CURRICULUM
            const customIds = new Set(restoredCustomWords.map((w) => w.id));
            const mergedCurriculum = [
              ...ALL_CURRICULUM.filter((item) => !customIds.has(item.id)),
              ...restoredCustomWords,
            ];

            setCurriculum(mergedCurriculum);
            localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(mergedCurriculum));

            if (Array.isArray(parsed.cc) && parsed.cc.length > 0) {
              const mergedCats = Array.from(new Set([...INITIAL_CATEGORIES, ...parsed.cc]));
              setCategories(mergedCats);
              localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(mergedCats));
            }
            if (Array.isArray(parsed.cs) && parsed.cs.length > 0) {
              const mergedSubjs = Array.from(new Set([...INITIAL_LESSON_SUBJECTS, ...parsed.cs]));
              setSubjects(mergedSubjs);
              localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(mergedSubjs));
            }

            if (restoredCustomWords.length > 0) {
              setSelectedItem(restoredCustomWords[0]);
              setStudentSubject(restoredCustomWords[0].lessonSubject || '');
            } else if (mergedCurriculum.length > 0) {
              setSelectedItem(mergedCurriculum[0]);
              setStudentSubject(mergedCurriculum[0].lessonSubject || '');
            }

            setSyncNotice(`🎉 تمت مزامنة ${restoredCustomWords.length} درس وكلمة جديدة بنجاح إلى هذا الجهاز!`);
            window.history.replaceState(null, '', window.location.pathname);
            setTimeout(() => setSyncNotice(null), 6000);
            return;
          }

          // Format 2: Full curriculum array format
          if (parsed && Array.isArray(parsed.curriculum)) {
            setCurriculum(parsed.curriculum);
            localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(parsed.curriculum));

            if (Array.isArray(parsed.categories)) {
              setCategories(parsed.categories);
              localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(parsed.categories));
            }
            if (Array.isArray(parsed.subjects)) {
              setSubjects(parsed.subjects);
              localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(parsed.subjects));
            }
            if (parsed.curriculum.length > 0) {
              setSelectedItem(parsed.curriculum[0]);
              setStudentSubject(parsed.curriculum[0].lessonSubject || parsed.subjects?.[0] || '');
            }

            setSyncNotice(`🎉 تمت مزامنة ${parsed.curriculum.length} كلمة ودرس بنجاح إلى هذا الجهاز!`);
            window.history.replaceState(null, '', window.location.pathname);
            setTimeout(() => setSyncNotice(null), 6000);
            return;
          }
        } catch (e) {
          console.warn('Sync payload parse error:', e);
        }
      }

      const isControlRoute =
        hash.toLowerCase() === '#control' ||
        path === '/control' ||
        hash.toLowerCase() === '#admin' ||
        path === '/admin';

      if (isControlRoute) {
        const authed = sessionStorage.getItem('faseeh_admin_auth') === 'true';
        if (authed) {
          setIsAdminView(true);
        } else {
          setIsAdminView(false);
          setShowAdminLoginModal(true);
        }
      } else {
        setIsAdminView(false);
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Load from local storage
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (savedHistory) setHistory(JSON.parse(savedHistory));

      const savedScores = localStorage.getItem(STORAGE_KEY_SCORES);
      if (savedScores) setScoresMap(JSON.parse(savedScores));

      const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);
      if (savedCustom) {
        const customItems: WordItem[] = JSON.parse(savedCustom);
        setCurriculum(customItems);
        if (customItems.length > 0) {
          setSelectedItem(customItems[0]);
          setStudentSubject(customItems[0].lessonSubject || INITIAL_LESSON_SUBJECTS[0]);
        }
      }

      const savedCategories = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (savedCategories) setCategories(JSON.parse(savedCategories));

      const savedSubjects = localStorage.getItem(STORAGE_KEY_SUBJECTS);
      if (savedSubjects) setSubjects(JSON.parse(savedSubjects));

      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Strict isolation: default to 'whisper', reset legacy 'acoustic'/'ai' cached values
        const cleanMode: EvaluationMode =
          parsed.preferredEvaluationMode === 'local' ? 'local' : 'whisper';
        setSettings({
          ...parsed,
          preferredEvaluationMode: cleanMode,
        });
      }

      const savedSheets = localStorage.getItem(STORAGE_KEY_SHEETS);
      let activeConfig: GoogleSheetsConfig = {
        enabled: true,
        webhookUrl: DEFAULT_WEBHOOK_URL,
        autoSync: true,
        syncCurriculumFromSheets: true,
        teacherDriveFolderId: DEFAULT_DRIVE_AUDIO_FOLDER_ID,
        studentDriveFolderId: STUDENT_AUDIO_DRIVE_FOLDER_ID,
        driveFolderId: DEFAULT_DRIVE_AUDIO_FOLDER_ID,
      };

      if (savedSheets) {
        try {
          const parsedSheets: GoogleSheetsConfig = JSON.parse(savedSheets);
          const teacherId =
            parsedSheets.teacherDriveFolderId || parsedSheets.driveFolderId || DEFAULT_DRIVE_AUDIO_FOLDER_ID;
          const studentId = parsedSheets.studentDriveFolderId || STUDENT_AUDIO_DRIVE_FOLDER_ID;
          const sanitizedWebhook =
            !parsedSheets.webhookUrl ||
            parsedSheets.webhookUrl.includes('AKfycbyqkLw2qbPSAEzXgaq') ||
            parsedSheets.webhookUrl.includes('AKfycbxlYR9nhzBvTc63xCSsU')
              ? DEFAULT_WEBHOOK_URL
              : parsedSheets.webhookUrl;

          activeConfig = {
            ...activeConfig,
            ...parsedSheets,
            webhookUrl: sanitizedWebhook,
            teacherDriveFolderId: teacherId,
            studentDriveFolderId: studentId,
            driveFolderId: teacherId,
          };
        } catch (e) {
          console.warn('Error reading saved sheets config:', e);
        }
      }
      setSheetsConfig(activeConfig);

      // Auto-fetch lessons directly from sheet "الدروس" so mobile & tablet devices always get the latest curriculum
      if (activeConfig.webhookUrl && activeConfig.syncCurriculumFromSheets !== false) {
        fetchCurriculumFromSheets(activeConfig.webhookUrl)
          .then((res) => {
            if (res.success && res.curriculum && res.curriculum.length > 0) {
              setCurriculum(res.curriculum);
              if (res.subjects && res.subjects.length > 0) {
                setSubjects(res.subjects);
                localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(res.subjects));
              }
              if (res.categories && res.categories.length > 0) {
                setCategories(res.categories);
                localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(res.categories));
              }
              localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(res.curriculum));

              // If current item is not in fetched curriculum, update selected item
              setSelectedItem((prev) => {
                const found = res.curriculum!.find((item) => item.id === prev?.id || item.word === prev?.word);
                return found || res.curriculum![0];
              });
              if (res.curriculum[0]?.lessonSubject) {
                setStudentSubject((prev) => {
                  if (res.subjects?.includes(prev)) return prev;
                  return res.curriculum![0].lessonSubject || prev;
                });
              }

              // Silent sync: removed top toast as requested by the user
            }
          })
          .catch((err) => {
            console.warn('Auto-sync from Google Sheets on startup notice:', err);
          });
      }

      // Fetch Home tab configuration in parallel immediately (branding & dynamic social media channels)
      if (activeConfig.webhookUrl) {
        fetchHomeConfigFromSheets(activeConfig.webhookUrl)
          .then((cfg) => {
            if (cfg) {
              setHomeConfig(cfg);
              try {
                localStorage.setItem('faseeh_cached_home_config', JSON.stringify(cfg));
              } catch {}

              // Sync sheet "الرئيسية" Arabic source texts into translations dictionary
              setTranslations((prev) => {
                return prev.map((item) => {
                  if (item.id === 'nav_platform_title' && cfg.title !== undefined) {
                    return { ...item, ar: cfg.title };
                  }
                  if (item.id === 'nav_platform_subtitle' && cfg.subtitle !== undefined) {
                    return { ...item, ar: cfg.subtitle };
                  }
                  if (item.id === 'home_card_title' && cfg.card?.cardTitle !== undefined) {
                    return { ...item, ar: cfg.card.cardTitle };
                  }
                  if (item.id === 'home_card_subtitle' && cfg.card?.cardSubtitle !== undefined) {
                    return { ...item, ar: cfg.card.cardSubtitle };
                  }
                  if (item.id === 'home_card_extra1' && cfg.card?.extraText1 !== undefined) {
                    return { ...item, ar: cfg.card.extraText1 };
                  }
                  if (item.id === 'home_card_extra2' && cfg.card?.extraText2 !== undefined) {
                    return { ...item, ar: cfg.card.extraText2 };
                  }
                  if (item.id === 'home_card_extra3' && cfg.card?.extraText3 !== undefined) {
                    return { ...item, ar: cfg.card.extraText3 };
                  }
                  return item;
                });
              });

              if (sessionStorage.getItem('faseeh_admin_auth') === 'true') {
                const currentAdminName = sessionStorage.getItem('faseeh_admin_name') || '';
                if (cfg.adminUsers && cfg.adminUsers.length > 0) {
                  const blockedRecord = cfg.adminUsers.find(
                    (u) =>
                      (u.name.toLowerCase() === currentAdminName.toLowerCase() ||
                        currentAdminName.includes(u.name)) &&
                      u.blocked
                  );
                  if (blockedRecord) {
                    handleAdminLogout();
                    alert('يوجد خطا في التسجيل .. يرجى التواصل مع الادارة');
                  }
                }
              }
            }
          })
          .catch(() => {});
      }

      // Auto-fetch translations from sheet "الترجمة"
      if (activeConfig.webhookUrl) {
        fetchTranslationsFromSheets(activeConfig.webhookUrl)
          .then((fetched) => {
            if (fetched && Array.isArray(fetched) && fetched.length > 0) {
              setTranslations((prev) => {
                const map = new Map<string, TranslationItem>();
                prev.forEach((p) => map.set(p.id, p));
                fetched.forEach((t: any) => {
                  const ex = map.get(t.id);
                  if (ex) {
                    map.set(t.id, {
                      ...ex,
                      ar: t.ar !== undefined ? t.ar : ex.ar,
                      th: t.th !== undefined ? t.th : ex.th,
                      en: t.en !== undefined ? t.en : ex.en,
                    });
                  } else if (t.id) {
                    map.set(t.id, {
                      id: t.id,
                      category: t.category || 'home',
                      categoryLabel: t.categoryLabel || '',
                      ar: t.ar !== undefined ? t.ar : '',
                      th: t.th !== undefined ? t.th : '',
                      en: t.en !== undefined ? t.en : '',
                    });
                  }
                });
                const merged = Array.from(map.values());
                saveStoredTranslations(merged);
                return merged;
              });
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch translations notice:', err);
          });

        // Auto-fetch matching exercises from sheet "وصل"
        fetchMatchingExercisesFromSheets(activeConfig.webhookUrl)
          .then((mRes) => {
            if (mRes && mRes.success && mRes.subjects && mRes.subjects.length > 0) {
              setMatchingSubjects(mRes.subjects);
              try {
                localStorage.setItem(STORAGE_KEY_MATCHING_CURRICULUM, JSON.stringify(mRes.subjects));
              } catch {}
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch matching notice:', err);
          });

        // Auto-fetch dictation exercises from sheet "كلمات"
        fetchDictationExercisesFromSheets(activeConfig.webhookUrl)
          .then((dRes) => {
            if (dRes && dRes.success && dRes.subjects && dRes.subjects.length > 0) {
              setDictationSubjects(dRes.subjects);
              try {
                localStorage.setItem(STORAGE_KEY_DICTATION_CURRICULUM, JSON.stringify(dRes.subjects));
              } catch {}
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch dictation notice:', err);
          });

        // Auto-fetch AR Catch exercises from sheet "صيد" & rewards from "مكافآت صيد AR"
        fetchCatchExercisesFromSheets(activeConfig.webhookUrl)
          .then((cRes) => {
            if (cRes && cRes.success && cRes.subjects && cRes.subjects.length > 0) {
              setCatchSubjects(cRes.subjects);
              try {
                localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(cRes.subjects));
              } catch {}
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch catch notice:', err);
          });

        fetchCatchARRewardsFromSheet(activeConfig.webhookUrl)
          .then((crRes) => {
            if (crRes && crRes.success) {
              if (crRes.rewards && crRes.rewards.length > 0) {
                setCatchArRewards(crRes.rewards);
                saveStoredCatchARRewards(crRes.rewards);
              }
              if (crRes.introReward) {
                setCatchArIntroReward(crRes.introReward);
                saveStoredCatchARIntroReward(crRes.introReward);
              }
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch catch AR rewards notice:', err);
          });

        // Auto-fetch writing lessons ("ArabicLessons") and AR rewards ("AR Rewards")
        writingSheetService.setOverrideUrl(activeConfig.webhookUrl);
        writingSheetService
          .fetchLessonsFromSheet()
          .then((wRes) => {
            if (wRes && wRes.success) {
              setWritingTemplates(wRes.lessons);
              writingSheetService.saveLocalTemplates(wRes.lessons);
              setSelectedWritingTemplate((prev) => {
                if (prev) {
                  const found = wRes.lessons.find((w) => w.id === prev.id);
                  return found || prev;
                }
                return null;
              });
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch writing lessons notice:', err);
          });

        writingSheetService
          .fetchARRewardsFromSheet()
          .then((rRes) => {
            if (rRes && rRes.success) {
              if (rRes.rewards && rRes.rewards.length > 0) {
                setWritingArRewards(rRes.rewards);
                saveStoredARRewards(rRes.rewards);
              }
              if (rRes.introReward) {
                setWritingArIntroReward(rRes.introReward);
                saveStoredARIntroReward(rRes.introReward);
              }
            }
          })
          .catch((err) => {
            console.warn('Auto-fetch AR rewards notice:', err);
          });

        // Auto-fetch Interactive Video lessons ("فيديو_الأسئلة")
        fetchVideoLessonsFromSheets(activeConfig.webhookUrl)
          .then((vLessons) => {
            if (vLessons && vLessons.length > 0) {
              setVideoLessons(vLessons);
              setActiveVideoLessonId((prev) => prev || vLessons[0].id);
            }
          })
          .catch(() => {});

        // Auto-fetch Course Groups & Daily Schedule ("مجموعات_الجدول" / "الجدول_اليومي")
        fetchCourseScheduleFromSheets(activeConfig.webhookUrl)
          .then((sched) => {
            if (sched) setCourseSchedule(sched);
          })
          .catch(() => {});
      }

      const savedSubmissions = localStorage.getItem(STORAGE_KEY_SUBMISSIONS);
      if (savedSubmissions) setSubmissions(JSON.parse(savedSubmissions));

      const savedStudent = localStorage.getItem(STORAGE_KEY_STUDENT);
      if (savedStudent) {
        try {
          const parsed = JSON.parse(savedStudent);
          setCurrentStudent(parsed);
          if (parsed?.name) {
            setSettings((prev) => ({ ...prev, studentName: parsed.name }));
          }
          if (parsed?.id && parsed?.name && activeConfig.webhookUrl) {
            fetchStudentSubmissionsFromSheet(activeConfig.webhookUrl, parsed.id, parsed.name)
              .then((sh) => {
                if (sh && sh.length > 0) setStudentHistory(sh);
              })
              .catch(() => {});
            fetchStudentMatchingHistory(activeConfig.webhookUrl, parsed.id, parsed.name)
              .then((mh) => {
                if (mh && mh.length > 0) setMatchingHistory(mh);
              })
              .catch(() => {});
            fetchStudentDictationHistory(activeConfig.webhookUrl, parsed.id, parsed.name)
              .then((dh) => {
                if (dh && dh.length > 0) setDictationHistory(dh);
              })
              .catch(() => {});
            fetchStudentCatchHistory(activeConfig.webhookUrl, parsed.id, parsed.name)
              .then((ch) => {
                if (ch && ch.length > 0) setCatchHistory(ch);
              })
              .catch(() => {});
            fetchStudentWritingHistory(activeConfig.webhookUrl, parsed.id, parsed.name)
              .then((wh) => {
                if (wh && wh.length > 0) setWritingHistory(wh);
              })
              .catch(() => {});
            fetchStudentVideoProgress(activeConfig.webhookUrl, parsed.id, parsed.name)
              .then((vp) => {
                if (vp) setVideoProgressMap(vp);
              })
              .catch(() => {});
            syncStudentRetriesFromSheets(activeConfig.webhookUrl, parsed).catch(() => {});
          }
        } catch (e) {}
      } else {
        fetchStudentMatchingHistory('', '', '')
          .then((mh) => {
            if (mh && mh.length > 0) setMatchingHistory(mh);
          })
          .catch(() => {});
        fetchStudentDictationHistory('', '', '')
          .then((dh) => {
            if (dh && dh.length > 0) setDictationHistory(dh);
          })
          .catch(() => {});
        fetchStudentCatchHistory('', '', '')
          .then((ch) => {
            if (ch && ch.length > 0) setCatchHistory(ch);
          })
          .catch(() => {});
        fetchStudentWritingHistory('', '', '')
          .then((wh) => {
            if (wh && wh.length > 0) setWritingHistory(wh);
          })
          .catch(() => {});
        setVideoProgressMap(getLocalVideoProgressMap(''));
      }

      // URL Auto-Login (?student_id=...&student_name=... OR ?username=...&sheet_number=... OR ?name=...&id=...) & Optional ?mode=video
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const urlName = (
          searchParams.get('student_name') ||
          searchParams.get('subscriber_name') ||
          searchParams.get('username') ||
          searchParams.get('name') ||
          searchParams.get('student') ||
          ''
        ).trim();
        const urlId = normalizeDigits(
          searchParams.get('student_id') ||
            searchParams.get('subscriber_id') ||
            searchParams.get('sheet_number') ||
            searchParams.get('sheetNumber') ||
            searchParams.get('id') ||
            ''
        );
        const urlMode = (searchParams.get('mode') || '').trim().toLowerCase();

        if (urlMode === 'video') {
          setAppMode('video');
          setCurrentView('practice');
        }

        if (urlId || urlName) {
          // Clean credential parameters from address bar cleanly
          try {
            const cleanedUrl = new URL(window.location.href);
            [
              'student_id',
              'student_name',
              'subscriber_id',
              'subscriber_name',
              'username',
              'name',
              'student',
              'sheet_number',
              'sheetNumber',
              'id',
            ].forEach((k) => cleanedUrl.searchParams.delete(k));
            window.history.replaceState({}, document.title, cleanedUrl.pathname + cleanedUrl.search + cleanedUrl.hash);
          } catch {}

          (async () => {
            let finalName = urlName;
            if (urlId && !finalName) {
              const registrants = await fetchIDRegistrants(activeConfig.webhookUrl);
              const found = registrants.find((r) => normalizeDigits(r.id) === urlId);
              if (found) finalName = found.name;
            }
            if (finalName && urlId) {
              const deviceId = getOrCreateDeviceId();
              const geo = await getFastOptionalGeolocation(250);
              const check = await verifyStudentLogin(activeConfig.webhookUrl, finalName, urlId, {
                deviceId,
                lat: geo.lat,
                lng: geo.lng,
              });
              if (check.success && check.student) {
                setCurrentStudent(check.student);
                try {
                  localStorage.setItem(STORAGE_KEY_STUDENT, JSON.stringify(check.student));
                } catch {}
                setSettings((prev) => ({ ...prev, studentName: check.student!.name }));
                if (activeConfig.webhookUrl) {
                  fetchStudentVideoProgress(
                    activeConfig.webhookUrl,
                    check.student.id,
                    check.student.name
                  )
                    .then((vp) => {
                      if (vp) setVideoProgressMap(vp);
                    })
                    .catch(() => {});
                }
              } else if (check.error) {
                setSyncNotice(check.error);
              }
            }
          })();
        }
      } catch {}
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }
  }, []);

  // Save history and scores
  const saveHistoryItem = (item: PracticeHistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 50);
      try {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setScoresMap((prev) => {
      const next = { ...prev, [item.wordId]: item.score };
      try {
        localStorage.setItem(STORAGE_KEY_SCORES, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleUpdateSettings = (newSettings: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleLoginSuccess = (student: StudentRegistrant) => {
    setCurrentStudent(student);
    try {
      localStorage.setItem(STORAGE_KEY_STUDENT, JSON.stringify(student));
    } catch (e) {}
    setSettings((prev) => ({ ...prev, studentName: student.name }));
    if (student?.id && student?.name && sheetsConfig.webhookUrl) {
      setIsSyncingAnswers1(true);
      fetchStudentSubmissionsFromSheet(sheetsConfig.webhookUrl, student.id, student.name)
        .then((sh) => {
          if (sh && sh.length > 0) setStudentHistory(sh);
        })
        .catch(() => {})
        .finally(() => setIsSyncingAnswers1(false));

      setIsSyncingMatching(true);
      fetchStudentMatchingHistory(sheetsConfig.webhookUrl, student.id, student.name)
        .then((mh) => {
          if (mh) setMatchingHistory(mh);
        })
        .catch(() => {})
        .finally(() => setIsSyncingMatching(false));

      setIsSyncingDictation(true);
      fetchStudentDictationHistory(sheetsConfig.webhookUrl, student.id, student.name)
        .then((dh) => {
          if (dh) setDictationHistory(dh);
        })
        .catch(() => {})
        .finally(() => setIsSyncingDictation(false));

      setIsSyncingCatch(true);
      fetchStudentCatchHistory(sheetsConfig.webhookUrl, student.id, student.name)
        .then((ch) => {
          if (ch) setCatchHistory(ch);
        })
        .catch(() => {})
        .finally(() => setIsSyncingCatch(false));

      fetchStudentWritingHistory(sheetsConfig.webhookUrl, student.id, student.name)
        .then((wh) => {
          if (wh) setWritingHistory(wh);
        })
        .catch(() => {});

      setVideoProgressMap(getLocalVideoProgressMap(student.id));
      fetchStudentVideoProgress(sheetsConfig.webhookUrl, student.id, student.name)
        .then((vp) => {
          if (vp) setVideoProgressMap(vp);
        })
        .catch(() => {});

      syncStudentRetriesFromSheets(sheetsConfig.webhookUrl, student).catch(() => {});
    }
  };

  const handleLogout = () => {
    setCurrentStudent(null);
    setStudentHistory([]);
    setMatchingHistory([]);
    setDictationHistory([]);
    setCatchHistory([]);
    setWritingHistory([]);
    setVideoProgressMap(getLocalVideoProgressMap(''));
    try {
      localStorage.removeItem(STORAGE_KEY_STUDENT);
    } catch (e) {}
  };

  const handleUpdateSheetsConfig = (newConfig: Partial<GoogleSheetsConfig>) => {
    setSheetsConfig((prev) => {
      const next = { ...prev, ...newConfig };
      if (next.webhookUrl) {
        writingSheetService.setOverrideUrl(next.webhookUrl);
      }
      try {
        localStorage.setItem(STORAGE_KEY_SHEETS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Category Management
  const handleAddCategory = (newCategory: string) => {
    setCategories((prev) => {
      if (prev.includes(newCategory)) return prev;
      const next = [...prev, newCategory];
      try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleRenameCategory = (oldCat: string, newCat: string) => {
    setCategories((prev) => {
      const next = prev.map((c) => (c === oldCat ? newCat : c));
      try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setCurriculum((prev) => {
      const next = prev.map((item) =>
        item.category === oldCat ? { ...item, category: newCat } : item
      );
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleDeleteCategory = (catToDelete: string) => {
    setCategories((prev) => {
      const next = prev.filter((c) => c !== catToDelete);
      try {
        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    const fallbackCat = categories.find((c) => c !== catToDelete) || 'الكلمة';
    setCurriculum((prev) => {
      const next = prev.map((item) =>
        item.category === catToDelete ? { ...item, category: fallbackCat } : item
      );
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Subject Management
  const handleAddSubject = (newSubject: string) => {
    setSubjects((prev) => {
      if (prev.includes(newSubject)) return prev;
      const next = [...prev, newSubject];
      try {
        localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleRenameSubject = (oldSubj: string, newSubj: string) => {
    setSubjects((prev) => {
      const next = prev.map((s) => (s === oldSubj ? newSubj : s));
      try {
        localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setCurriculum((prev) => {
      const next = prev.map((item) =>
        item.lessonSubject === oldSubj ? { ...item, lessonSubject: newSubj } : item
      );
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (studentSubject === oldSubj) {
      setStudentSubject(newSubj);
    }
  };

  const handleDeleteSubject = (subjToDelete: string) => {
    setSubjects((prev) => {
      const next = prev.filter((s) => s !== subjToDelete);
      try {
        localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setCurriculum((prev) => {
      const next = prev.filter((item) => item.lessonSubject !== subjToDelete);
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    const remainingSubjects = subjects.filter((s) => s !== subjToDelete);
    if (remainingSubjects.length > 0) {
      setStudentSubject(remainingSubjects[0]);
    }
  };

  // Add word
  const handleAddWord = (newWord: WordItem) => {
    setCurriculum((prev) => {
      const next = [newWord, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setSelectedItem(newWord);
    setStudentSubject(newWord.lessonSubject);
    handleAddSubject(newWord.lessonSubject);
  };

  // Update existing word
  const handleUpdateWord = (updatedWord: WordItem) => {
    setCurriculum((prev) => {
      const next = prev.map((item) => (item.id === updatedWord.id ? updatedWord : item));
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    if (selectedItem.id === updatedWord.id) {
      setSelectedItem(updatedWord);
    }
    handleAddSubject(updatedWord.lessonSubject);
  };

  // Delete word
  const handleDeleteWord = (id: string) => {
    setCurriculum((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    if (selectedItem.id === id) {
      const remaining = curriculum.filter((item) => item.id !== id);
      if (remaining.length > 0) setSelectedItem(remaining[0]);
    }
  };

  // Reset curriculum to default
  const handleResetCurriculum = () => {
    if (confirm('هل أنت متأكد من استعادة المنهج الافتراضي؟')) {
      setCurriculum(ALL_CURRICULUM);
      setCategories(INITIAL_CATEGORIES);
      setSubjects(INITIAL_LESSON_SUBJECTS);
      setSelectedItem(ALL_CURRICULUM[0]);
      setStudentSubject(ALL_CURRICULUM[0].lessonSubject);
      try {
        localStorage.removeItem(STORAGE_KEY_CUSTOM);
        localStorage.removeItem(STORAGE_KEY_CATEGORIES);
        localStorage.removeItem(STORAGE_KEY_SUBJECTS);
      } catch (e) {}
    }
  };

  // Evaluation completed
  const handleEvaluationComplete = async (
    evalResult: PronunciationEvaluation,
    audioUrl?: string,
    studentName?: string
  ) => {
    setEvaluation(evalResult);
    if (audioUrl) setRecordedAudioUrl(audioUrl);

    // Update streak
    if (evalResult.score >= 70) {
      setStreak((prev) => prev + 1);
    } else {
      setStreak(0);
    }

    const currentStudentName = currentStudent?.name || studentName || settings.studentName || 'طالب';

    // Save to history
    saveHistoryItem({
      id: `history-${Date.now()}`,
      wordId: selectedItem.id,
      word: selectedItem.word,
      score: evalResult.score,
      grade: evalResult.grade,
      timestamp: Date.now(),
      spokenText: evalResult.detectedWord,
      recordedAudioUrl: audioUrl,
      studentName: currentStudentName,
      engineUsed: evalResult.engineUsed,
    });

    // Create Submission Record for Admin & Google Sheets
    const submissionRecord: StudentSubmissionRecord = {
      id: `sub-${Date.now()}`,
      studentName: currentStudentName,
      word: selectedItem.word,
      score: evalResult.score,
      grade: evalResult.grade,
      detectedWord: evalResult.detectedWord,
      feedback: evalResult.feedback,
      engineUsed: evalResult.engineUsed,
      timestamp: Date.now(),
      syncedToSheets: false,
    };

    setSubmissions((prev) => {
      const next = [submissionRecord, ...prev].slice(0, 200);
      try {
        localStorage.setItem(STORAGE_KEY_SUBMISSIONS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Official exercise submissions are now stored exclusively in "answers 1"
    // via submitStudentAnswerToSheet when the student or teacher approves the answer.
  };

  // Scores map strictly derived from the current logged-in student's records in "answers 1"
  const studentScoresMap = useMemo(() => {
    if (!currentStudent) return {};
    const map: Record<string, number> = {};
    studentHistory.forEach((h) => {
      if (typeof h.score === 'number' && !isNaN(h.score)) {
        if (h.wordId) map[h.wordId] = h.score;
        if (h.word) {
          map[h.word] = h.score;
          const clean = h.word.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').trim();
          map[clean] = h.score;
        }
      }
    });
    return map;
  }, [currentStudent, studentHistory]);

  // Distinct subjects
  const allSubjects = Array.from(
    new Set([
      ...subjects,
      ...curriculum.map((c) => c.lessonSubject || 'دروس عامة'),
    ])
  );

  // Words currently available under the student's selected subject
  const currentSubjectWords = curriculum.filter(
    (item) => !studentSubject || item.lessonSubject === studentSubject
  );
  const activeSubjectWords = currentSubjectWords.length > 0 ? currentSubjectWords : curriculum;

  const currentIndex = activeSubjectWords.findIndex((item) => item.id === selectedItem.id);

  const handleSelectWord = (item: WordItem, isRetry = false) => {
    setSelectedItem(item);
    if (item.lessonSubject) {
      setStudentSubject(item.lessonSubject);
    }
    setEvaluation(null);
    setRecordedAudioUrl(null);
    setIsCurrentAnswerSubmitted(false);
    if (isRetry) {
      const wordKey = `${(item.lessonSubject || studentSubject || '').trim()}::${item.word.trim()}`;
      const status = getRetryStatus('pronunciation', currentStudent, wordKey, item);
      if (status.canRetry) {
        const outcome = recordStudentRetryAttempt(
          'pronunciation',
          currentStudent,
          wordKey,
          item,
          sheetsConfig.webhookUrl
        );
        const nextNonce = pronunciationRetryNonce + 1;
        setPronunciationRetryNonce(nextNonce);
        setPronunciationRetryBanner({
          nonce: nextNonce,
          message: formatStudentRetryBannerMessage(outcome, currentStudent, t),
        });
      }
    } else {
      setPronunciationRetryBanner(null);
    }
    setAppMode('pronunciation');
    setCurrentView('practice');
    closeAllLessonModals();
  };

  const closeAllLessonModals = () => {
    setIsLessonsModalOpen(false);
    setIsMatchingLessonsModalOpen(false);
    setIsDictationLessonsModalOpen(false);
    setIsCatchLessonsModalOpen(false);
    setIsVideoLessonsModalOpen(false);
    setIsVideoCorrectionModalOpen(false);
    setIsScheduleModalOpen(false);
    setLandingLessonsMenuOpen(false);
  };

  const handleOpenScheduledLesson = (ref: ScheduleLessonRef) => {
    closeAllLessonModals();
    const cleanTopic = (ref.topicName || '').trim();

    if (ref.exerciseType === 'pronunciation') {
      const targetWord =
        curriculum.find((w) => (w.lessonSubject || '').trim() === cleanTopic) ||
        curriculum[0];
      if (targetWord) {
        setStudentSubject(cleanTopic || targetWord.lessonSubject || '');
        handleSelectWord(targetWord, false);
        return;
      }
      openPronunciationLessonsModal();
      return;
    }

    if (ref.exerciseType === 'matching') {
      const subj =
        matchingSubjects.find((s) => (s.subjectName || '').trim() === cleanTopic) ||
        matchingSubjects[0];
      if (subj) {
        setActiveMatchingSubjectId(subj.id);
        setActiveMatchingExerciseIdx(0);
      }
      setAppMode('matching');
      setCurrentView('practice');
      return;
    }

    if (ref.exerciseType === 'dictation') {
      const subj =
        dictationSubjects.find((s) => (s.subjectName || '').trim() === cleanTopic) ||
        dictationSubjects[0];
      if (subj) {
        setActiveDictationSubjectId(subj.id);
        setActiveDictationExerciseIdx(0);
      }
      setAppMode('dictation');
      setCurrentView('practice');
      return;
    }

    if (ref.exerciseType === 'writing') {
      const tpl =
        writingTemplates.find(
          (t) => (t.topic || 'خط النسخ (الأساسيات)').trim() === cleanTopic
        ) || writingTemplates[0] || null;
      setSelectedWritingTemplate(tpl);
      setAppMode('writing');
      setCurrentView('practice');
      return;
    }

    if (ref.exerciseType === 'catch') {
      const subj =
        catchSubjects.find((s) => (s.subjectName || '').trim() === cleanTopic) ||
        catchSubjects[0];
      if (subj) {
        setActiveCatchSubjectId(subj.id);
        setActiveCatchExerciseIdx(0);
      }
      setAppMode('catch');
      setCurrentView('practice');
      return;
    }

    if (ref.exerciseType === 'video') {
      const vLesson =
        (ref.lessonId && videoLessons.find((v) => v.id === ref.lessonId)) ||
        videoLessons.find(
          (v) =>
            (v.title || '').trim() === cleanTopic ||
            (v.topic || '').trim() === cleanTopic
        ) ||
        videoLessons[0];
      if (vLesson) {
        setActiveVideoLessonId(vLesson.id);
        setIsVideoResetMode(false);
      }
      setAppMode('video');
      setCurrentView('practice');
    }
  };

  const openPronunciationLessonsModal = () => {
    closeAllLessonModals();
    setIsLessonsModalOpen(true);
  };

  const openMatchingLessonsModal = () => {
    closeAllLessonModals();
    if (currentStudent && sheetsConfig.webhookUrl) {
      fetchStudentMatchingHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
        .then((mh) => {
          if (mh) setMatchingHistory(mh);
        })
        .catch(() => {});
    } else {
      fetchStudentMatchingHistory('', '', '')
        .then((mh) => {
          if (mh) setMatchingHistory(mh);
        })
        .catch(() => {});
    }
    setIsMatchingLessonsModalOpen(true);
  };

  const openDictationLessonsModal = () => {
    closeAllLessonModals();
    if (currentStudent && sheetsConfig.webhookUrl) {
      fetchStudentDictationHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
        .then((dh) => {
          if (dh) setDictationHistory(dh);
        })
        .catch(() => {});
    } else {
      fetchStudentDictationHistory('', '', '')
        .then((dh) => {
          if (dh) setDictationHistory(dh);
        })
        .catch(() => {});
    }
    setIsDictationLessonsModalOpen(true);
  };

  const openCatchLessonsModal = () => {
    closeAllLessonModals();
    if (currentStudent && sheetsConfig.webhookUrl) {
      fetchStudentCatchHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
        .then((ch) => {
          if (ch) setCatchHistory(ch);
        })
        .catch(() => {});
    } else {
      fetchStudentCatchHistory('', '', '')
        .then((ch) => {
          if (ch) setCatchHistory(ch);
        })
        .catch(() => {});
    }
    setIsCatchLessonsModalOpen(true);
  };

  const openWritingExercise = () => {
    closeAllLessonModals();
    setSelectedWritingTemplate(null);
    if (currentStudent && sheetsConfig.webhookUrl) {
      fetchStudentWritingHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
        .then((wh) => {
          if (wh) setWritingHistory(wh);
        })
        .catch(() => {});
    } else {
      fetchStudentWritingHistory('', '', '')
        .then((wh) => {
          if (wh) setWritingHistory(wh);
        })
        .catch(() => {});
    }
    setAppMode('writing');
    setCurrentView('practice');
  };

  const refreshVideoLessons = async () => {
    const list = await fetchVideoLessonsFromSheets(sheetsConfig.webhookUrl);
    if (list && list.length > 0) {
      setVideoLessons(list);
      setActiveVideoLessonId((prev) => prev || list[0].id);
    }
  };

  const refreshAllVideoData = async () => {
    await refreshVideoLessons();
    if (currentStudent && sheetsConfig.webhookUrl) {
      const vp = await fetchStudentVideoProgress(
        sheetsConfig.webhookUrl,
        currentStudent.id,
        currentStudent.name
      );
      if (vp) setVideoProgressMap(vp);
    }
  };

  useEffect(() => {
    if (appMode === 'video') {
      refreshAllVideoData().catch(() => {});
    }
  }, [appMode, currentStudent?.id, sheetsConfig.webhookUrl]);

  const openVideoLessonsModal = () => {
    closeAllLessonModals();
    refreshAllVideoData().catch(() => {});
    setIsVideoLessonsModalOpen(true);
  };

  const handleNextWord = () => {
    const nextIdx = (currentIndex + 1) % activeSubjectWords.length;
    setSelectedItem(activeSubjectWords[nextIdx]);
    setEvaluation(null);
    setRecordedAudioUrl(null);
    setIsCurrentAnswerSubmitted(false);
  };

  const handlePrevWord = () => {
    const prevIdx = (currentIndex - 1 + activeSubjectWords.length) % activeSubjectWords.length;
    setSelectedItem(activeSubjectWords[prevIdx]);
    setEvaluation(null);
    setRecordedAudioUrl(null);
    setIsCurrentAnswerSubmitted(false);
  };

  const handleClearHistory = () => {
    if (confirm('هل أنت متأكد من مسح سجل التدريب والتقييمات؟')) {
      setHistory([]);
      setScoresMap({});
      setStreak(0);
      try {
        localStorage.removeItem(STORAGE_KEY_HISTORY);
        localStorage.removeItem(STORAGE_KEY_SCORES);
      } catch (e) {}
    }
  };

  const handleClearSubmissions = () => {
    if (confirm('هل أنت متأكد من مسح جميع استجابات ودرجات الطلاب المسجلة؟')) {
      setSubmissions([]);
      try {
        localStorage.removeItem(STORAGE_KEY_SUBMISSIONS);
      } catch (e) {}
    }
  };

  const handleImportCurriculum = (imported: WordItem[]) => {
    setCurriculum(imported);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(imported));
    } catch (e) {}
    if (imported.length > 0) {
      setSelectedItem(imported[0]);
    }
  };

  // Route to Admin or Student View with Authentication
  const handleOpenAdmin = (
    targetTab: 'lessons' | 'matching' | 'dictation' | 'writing' | 'catch' | 'video' | 'schedule' | 'subscribers' | 'telegram' | 'submissions' | 'sheets' | 'translations' | 'translations2' | 'translations3' | 'translations4' | 'translations5' = 'lessons'
  ) => {
    setAdminInitialTab(targetTab);
    if (isAdminAuthenticated) {
      window.location.hash = 'control';
      setIsAdminView(true);
    } else {
      setShowAdminLoginModal(true);
    }
  };

  const handleAdminLoginSuccess = () => {
    setIsAdminAuthenticated(true);
    try {
      sessionStorage.setItem('faseeh_admin_auth', 'true');
    } catch {}
    setShowAdminLoginModal(false);
    window.location.hash = 'control';
    setIsAdminView(true);
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    try {
      sessionStorage.removeItem('faseeh_admin_auth');
    } catch {}
    setIsAdminView(false);
    window.location.hash = '';
  };

  const handleBackToStudent = () => {
    window.location.hash = '';
    setIsAdminView(false);
  };

  // IF ADMIN VIEW IS ACTIVE: Render Revamped Admin Section
  if (isAdminView) {
    return (
      <>
        <AdminPanel
          curriculum={curriculum}
          onAddWord={handleAddWord}
          onUpdateWord={handleUpdateWord}
          onDeleteWord={handleDeleteWord}
          sheetsConfig={sheetsConfig}
          onUpdateSheetsConfig={handleUpdateSheetsConfig}
          submissions={submissions}
          onClearSubmissions={handleClearSubmissions}
          onBackToApp={handleBackToStudent}
          defaultEvalMode={settings.preferredEvaluationMode}
          onUpdateDefaultEvalMode={(mode: EvaluationMode) =>
            handleUpdateSettings({ preferredEvaluationMode: mode })
          }
          categories={categories}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          subjects={allSubjects}
          onAddSubject={handleAddSubject}
          onRenameSubject={handleRenameSubject}
          onDeleteSubject={handleDeleteSubject}
          onResetCurriculum={handleResetCurriculum}
          onImportCurriculum={handleImportCurriculum}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenGuide={() => setIsGuideOpen(true)}
          onLogout={handleAdminLogout}
          translations={translations}
          onUpdateTranslations={handleUpdateTranslations}
          geminiApiKey={settings.geminiApiKey}
          onRefreshFromSheets={handleRefreshAllFromSheets}
          matchingSubjects={matchingSubjects}
          onUpdateMatchingSubjects={setMatchingSubjects}
          dictationSubjects={dictationSubjects}
          onUpdateDictationSubjects={(next) => {
            setDictationSubjects(next);
            try {
              localStorage.setItem(STORAGE_KEY_DICTATION_CURRICULUM, JSON.stringify(next));
            } catch {}
          }}
          initialTab={adminInitialTab}
          writingTemplates={writingTemplates}
          onUpdateWritingTemplates={(updated) => {
            setWritingTemplates(updated);
            writingSheetService.saveLocalTemplates(updated);
            if (selectedWritingTemplate) {
              const refreshed = updated.find((t) => t.id === selectedWritingTemplate.id);
              if (refreshed) {
                setSelectedWritingTemplate(refreshed);
              }
            } else if (updated.length > 0) {
              setSelectedWritingTemplate(updated[0]);
            }
          }}
          writingBoardStyle={writingBoardStyle}
          onSelectWritingBoardStyle={setWritingBoardStyle}
          writingGuideColor={writingGuideColor}
          onSelectWritingGuideColor={setWritingGuideColor}
          writingTemplateOpacity={writingTemplateOpacity}
          onChangeWritingTemplateOpacity={setWritingTemplateOpacity}
          writingSaveArCameraPhoto={writingSaveArCameraPhoto}
          onToggleWritingSaveArCameraPhoto={(val) => {
            setWritingSaveArCameraPhoto(val);
            try {
              localStorage.setItem('arabic_calligraphy_save_ar_camera_v1', String(val));
            } catch {}
          }}
          writingArRewards={writingArRewards}
          onUpdateWritingArRewards={(tiers) => {
            setWritingArRewards(tiers);
            return saveStoredARRewards(tiers);
          }}
          writingArIntroReward={writingArIntroReward}
          onUpdateWritingArIntroReward={(intro) => {
            setWritingArIntroReward(intro);
            return saveStoredARIntroReward(intro);
          }}
          onPreviewWritingArReward={(tier) => {
            setWritingPreviewRewardRequest({ tier, nonce: Date.now() });
            setWritingBoardStyle('ar_camera');
            setAppMode('writing');
            setCurrentView('practice');
            handleBackToStudent();
          }}
          onOpenWritingMode={() => {
            setAppMode('writing');
            setCurrentView('practice');
            handleBackToStudent();
          }}
          catchSubjects={catchSubjects}
          onUpdateCatchSubjects={(next) => {
            setCatchSubjects(next);
            try {
              localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(next));
            } catch {}
          }}
          catchArRewards={catchArRewards}
          onUpdateCatchArRewards={(tiers) => {
            setCatchArRewards(tiers);
            return saveStoredCatchARRewards(tiers);
          }}
          catchArIntroReward={catchArIntroReward}
          onUpdateCatchArIntroReward={(intro) => {
            setCatchArIntroReward(intro);
            return saveStoredCatchARIntroReward(intro);
          }}
          onPreviewCatchArReward={(tier) => {
            setCatchPreviewRewardRequest({ tier, nonce: Date.now() });
            setAppMode('catch');
            setCurrentView('practice');
            handleBackToStudent();
          }}
          videoLessons={videoLessons}
          onUpdateVideoLessons={(updated) => {
            setVideoLessons(updated);
            saveLocalVideoLessons(updated);
            if (updated.length > 0 && !updated.some((l) => l.id === activeVideoLessonId)) {
              setActiveVideoLessonId(updated[0].id);
            }
          }}
          courseSchedule={courseSchedule}
          onUpdateCourseSchedule={(next) => {
            setCourseSchedule(next);
            saveLocalCourseSchedule(next);
          }}
          onOpenSchedulePreview={() => {
            handleBackToStudent();
            setIsScheduleModalOpen(true);
          }}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />

        <GuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          defaultEvalMode={settings.preferredEvaluationMode}
          onUpdateDefaultEvalMode={(mode) => handleUpdateSettings({ preferredEvaluationMode: mode })}
        />
      </>
    );
  }

  // STANDARD STUDENT PRACTICE VIEW
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-cairo text-slate-800 relative">
      {/* Device Sync Celebratory Notification */}
      {syncNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400 flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300">
          <Sparkles className="w-5 h-5 text-emerald-200 shrink-0" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* Navbar */}
      <Navbar
        streak={streak}
        totalPracticed={currentStudent ? studentHistory.length : 0}
        onOpenStats={() => {
          if (currentStudent && sheetsConfig.webhookUrl) {
            setIsSyncingAnswers1(true);
            fetchStudentSubmissionsFromSheet(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
              .then((sh) => {
                if (sh && sh.length > 0) setStudentHistory(sh);
              })
              .catch(() => {})
              .finally(() => setIsSyncingAnswers1(false));

            setIsSyncingMatching(true);
            fetchStudentMatchingHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
              .then((mh) => {
                if (mh) setMatchingHistory(mh);
              })
              .catch(() => {})
              .finally(() => setIsSyncingMatching(false));

            setIsSyncingDictation(true);
            fetchStudentDictationHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
              .then((dh) => {
                if (dh) setDictationHistory(dh);
              })
              .catch(() => {})
              .finally(() => setIsSyncingDictation(false));

            setIsSyncingCatch(true);
            fetchStudentCatchHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
              .then((ch) => {
                if (ch) setCatchHistory(ch);
              })
              .catch(() => {})
              .finally(() => setIsSyncingCatch(false));
          } else {
            fetchStudentMatchingHistory('', '', '')
              .then((mh) => {
                if (mh) setMatchingHistory(mh);
              })
              .catch(() => {});
            fetchStudentDictationHistory('', '', '')
              .then((dh) => {
                if (dh) setDictationHistory(dh);
              })
              .catch(() => {});
            fetchStudentCatchHistory('', '', '')
              .then((ch) => {
                if (ch) setCatchHistory(ch);
              })
              .catch(() => {});
          }
          setIsStatsOpen(true);
        }}
        onOpenCustom={() => handleOpenAdmin('lessons')}
        onOpenAdmin={() => handleOpenAdmin('lessons')}
        isAdminAuthenticated={isAdminAuthenticated}
        onAdminLogout={handleAdminLogout}
        isSheetsActive={sheetsConfig.enabled && !!sheetsConfig.webhookUrl}
        onOpenLessons={openPronunciationLessonsModal}
        onGoHome={() => {
          closeAllLessonModals();
          setCurrentView('landing');
        }}
        currentView={currentView}
        currentStudent={currentStudent}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        customLogoUrl={homeConfig?.logoUrl || ''}
        customTitle={homeConfig ? (currentLang === 'ar' ? homeConfig.title : t('nav_platform_title', homeConfig.title)) : ''}
        customSubtitle={homeConfig ? (currentLang === 'ar' ? homeConfig.subtitle : t('nav_platform_subtitle', homeConfig.subtitle)) : ''}
        currentLang={currentLang}
        onSelectLang={handleSelectLang}
        t={t}
        onOpenMatchingLessons={openMatchingLessonsModal}
        onOpenDictationLessons={openDictationLessonsModal}
        onOpenWriting={openWritingExercise}
        onOpenCatchLessons={openCatchLessonsModal}
        onOpenVideoLessons={openVideoLessonsModal}
        onOpenCourseSchedule={() => {
          closeAllLessonModals();
          setIsScheduleModalOpen(true);
        }}
        hasCourseSchedule={courseSchedule.days.length > 0}
        hasTodayScheduleLesson={hasTodayScheduleLesson}
        currentMode={appMode}
        onSelectMode={(mode) => {
          closeAllLessonModals();
          if (mode === 'writing') {
            openWritingExercise();
            return;
          }
          setAppMode(mode);
          if (currentView === 'landing') {
            setCurrentView('practice');
          }
        }}
      />

      {/* Main Content Area */}
      <main
        className={
          currentView === 'practice' && (appMode === 'writing' || appMode === 'catch')
            ? 'flex-1 w-full p-0 m-0 flex flex-col'
            : 'flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col'
        }
      >
        {currentView === 'landing' ? (
          /* ========================================================
             1. INTRODUCTORY LANDING PAGE (الصفحة الرئيسية التعريفية)
             ======================================================== */
          <div className="flex flex-col items-center justify-center animate-in fade-in duration-300 py-2 sm:py-6">
            {/* Main Hero Card - Controlled exclusively by sheet 'الرئيسية' B21:B27 */}
            <div
              className="relative overflow-visible rounded-3xl text-white shadow-2xl border border-slate-800/80 max-w-4xl w-full mx-auto"
              style={
                homeConfig?.card?.cardBgUrl
                  ? {
                      backgroundImage: `url(${homeConfig.card.cardBgUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              {/* Clipped backdrop layer so dropdown can extend smoothly outside if needed */}
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-linear-to-b from-slate-950/90 via-slate-950/85 to-slate-950/92 backdrop-blur-xs" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />
              </div>

              <div className="relative z-10 flex flex-col items-center text-center p-7 sm:p-14 max-w-3xl mx-auto">
                {/* 1. B21: Card Logo (Centered) */}
                {homeConfig?.card?.cardLogoUrl && (
                  <div className="mb-6 flex justify-center">
                    <img
                      src={homeConfig.card.cardLogoUrl}
                      alt="شعار البطاقة"
                      className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl object-contain shadow-2xl border-2 border-white/20 bg-white/10 p-2 backdrop-blur-xs"
                      onError={(e) => {
                        (e.target as any).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* 2. B23: Card Main Title */}
                {(() => {
                  const rawFallback = homeConfig?.card?.cardTitle !== undefined ? homeConfig.card.cardTitle : (homeConfig?.title !== undefined ? homeConfig.title : '');
                  const cardTitleVal = t('home_card_title', rawFallback);
                  return cardTitleVal ? (
                    <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight font-amiri leading-tight sm:leading-snug mb-4 text-white">
                      {cardTitleVal}
                    </h1>
                  ) : null;
                })()}

                {/* 3. B24: Card Subtitle / Description */}
                {(() => {
                  const rawSubFallback = homeConfig?.card?.cardSubtitle !== undefined ? homeConfig.card.cardSubtitle : (homeConfig?.subtitle !== undefined ? homeConfig.subtitle : '');
                  const cardSubVal = t('home_card_subtitle', rawSubFallback);
                  return cardSubVal ? (
                    <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-2xl mx-auto mb-6">
                      {cardSubVal}
                    </p>
                  ) : null;
                })()}

                {/* 4. B25:B27: Optional Extra Texts */}
                {(() => {
                  const ex1 = t('home_card_extra1', homeConfig?.card?.extraText1 || '');
                  const ex2 = t('home_card_extra2', homeConfig?.card?.extraText2 || '');
                  const ex3 = t('home_card_extra3', homeConfig?.card?.extraText3 || '');
                  if (!ex1 && !ex2 && !ex3) return null;
                  return (
                    <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto mb-8">
                      {Boolean(ex1) && (
                        <span className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 backdrop-blur-xs">
                          {ex1}
                        </span>
                      )}
                      {Boolean(ex2) && (
                        <span className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/30 backdrop-blur-xs">
                          {ex2}
                        </span>
                      )}
                      {Boolean(ex3) && (
                        <span className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 backdrop-blur-xs">
                          {ex3}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* 5. Unified Lessons Dropdown Button (دروس) + Standalone Interactive Video Button (فيديو) */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <div ref={landingLessonsMenuRef} className="relative flex justify-center">
                    <button
                      type="button"
                      onClick={() => setLandingLessonsMenuOpen((prev) => !prev)}
                      className="flex items-center justify-center gap-2.5 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-2xl text-base sm:text-lg transition-all shadow-xl shadow-emerald-500/30 cursor-pointer hover:scale-105 active:scale-95"
                      aria-expanded={landingLessonsMenuOpen}
                      aria-haspopup="menu"
                    >
                      <BookOpen className="w-5 h-5" />
                      <span>{t('nav_lessons_menu', 'دروس')}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          landingLessonsMenuOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                  {landingLessonsMenuOpen && (
                    <div
                      role="menu"
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 w-60 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-30 text-slate-800 animate-in fade-in slide-in-from-top-2 duration-150"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={openPronunciationLessonsModal}
                        className="w-full px-4 py-3 text-right flex items-center gap-3 text-sm font-bold text-slate-800 hover:bg-indigo-50 hover:text-indigo-900 transition-colors cursor-pointer"
                      >
                        <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <Mic className="w-4 h-4" />
                        </span>
                        <span className="flex-1">{t('nav_pronunciation_training', 'تدريب النطق')}</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={openMatchingLessonsModal}
                        className="w-full px-4 py-3 text-right flex items-center gap-3 text-sm font-bold text-slate-800 hover:bg-purple-50 hover:text-purple-900 transition-colors cursor-pointer"
                      >
                        <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <Link2 className="w-4 h-4" />
                        </span>
                        <span className="flex-1">{t('nav_matching_exercises', 'تمارين الوصل')}</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={openDictationLessonsModal}
                        className="w-full px-4 py-3 text-right flex items-center gap-3 text-sm font-bold text-slate-800 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer"
                      >
                        <span className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                          <PenTool className="w-4 h-4" />
                        </span>
                        <span className="flex-1">{t('nav_dictation_exercise', 'تمرين الإملاء')}</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={openWritingExercise}
                        className="w-full px-4 py-3 text-right flex items-center gap-3 text-sm font-bold text-slate-800 hover:bg-amber-50 hover:text-amber-900 transition-colors cursor-pointer"
                      >
                        <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Pencil className="w-4 h-4" />
                        </span>
                        <span className="flex-1">{t('nav_writing_exercise', 'تمرين الكتابة')}</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={openCatchLessonsModal}
                        className="w-full px-4 py-3 text-right flex items-center gap-3 text-sm font-bold text-slate-800 hover:bg-sky-50 hover:text-sky-900 transition-colors cursor-pointer"
                      >
                        <span className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                          <Target className="w-4 h-4" />
                        </span>
                        <span className="flex-1">{t('nav_catch_exercise', 'تحدي الصيد (AR)')}</span>
                      </button>
                    </div>
                  )}
                  </div>

                  <button
                    type="button"
                    onClick={openVideoLessonsModal}
                    className="flex items-center justify-center gap-2.5 px-7 py-4 bg-slate-900/90 hover:bg-slate-800 text-white border border-white/25 font-extrabold rounded-2xl text-base sm:text-lg transition-all shadow-xl cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <Film className="w-5 h-5 text-emerald-400" />
                    <span>{t('nav_video_btn', 'فيديو')}</span>
                  </button>

                  {courseSchedule.days.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        closeAllLessonModals();
                        setIsScheduleModalOpen(true);
                      }}
                      className="relative flex items-center justify-center gap-2.5 px-7 py-4 bg-teal-600/95 hover:bg-teal-500 text-white border border-teal-300/35 font-extrabold rounded-2xl text-base sm:text-lg transition-all shadow-xl cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Calendar className="w-5 h-5 text-teal-100" />
                      <span>{t('nav_schedule_btn', 'جدول الدروس')}</span>
                      {hasTodayScheduleLesson && (
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : appMode === 'matching' ? (
          /* ========================================================
             3. WORD MATCHING ARENA (تمرين وصل الكلمات)
             ======================================================== */
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            {(() => {
              const resolvedSubject =
                matchingSubjects.find((s) => s.id === activeMatchingSubjectId) ||
                matchingSubjects[0] ||
                null;
              const resolvedSubjectId = resolvedSubject?.id || '';
              const totalExercises = resolvedSubject?.exercises.length || 0;
              const safeExIdx =
                totalExercises > 0
                  ? Math.min(Math.max(0, activeMatchingExerciseIdx), totalExercises - 1)
                  : 0;
              const activeExNumber =
                resolvedSubject?.exercises[safeExIdx]?.exerciseNumber || safeExIdx + 1;

              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                  {/* Start Side: Home + Back to Pronunciation + Matching Lessons Modal */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setCurrentView('landing')}
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                      title={currentLang === 'ar' ? 'الصفحة الرئيسية' : currentLang === 'th' ? 'หน้าหลัก' : 'Home'}
                    >
                      <Home className="w-4 h-4 text-slate-700" />
                    </button>

                    <button
                      onClick={() => setAppMode('pronunciation')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      title={t('matching_back_pronunciation', 'العودة إلى تمرين نطق الكلمات')}
                    >
                      <span>🎙️</span>
                      <span>{t('matching_back_pronunciation', 'العودة لتمرين النطق')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={openMatchingLessonsModal}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      title={t('matching_lessons_list_btn', 'قائمة الدروس 📑')}
                    >
                      <span>{t('matching_lessons_list_btn', 'قائمة الدروس 📑')}</span>
                    </button>
                  </div>

                  {/* End Side: Subject Selector + Exercise Counter / Pagination */}
                  {resolvedSubject && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
                      <div className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-900 font-bold border border-purple-200/80 flex items-center gap-1.5">
                        <span className="text-purple-700 font-normal">
                          {t('matching_subject_label', 'الموضوع:')}
                        </span>
                        <select
                          value={resolvedSubjectId}
                          onChange={(e) => {
                            setActiveMatchingSubjectId(e.target.value);
                            setActiveMatchingExerciseIdx(0);
                          }}
                          className="bg-transparent font-bold text-purple-950 focus:outline-hidden cursor-pointer max-w-[170px] truncate"
                        >
                          {matchingSubjects.map((subj) => (
                            <option key={subj.id} value={subj.id}>
                              {getTranslatedMatchingSubject(subj.subjectName, currentLang, translations)} ({subj.exercises.length})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (safeExIdx > 0) {
                              setActiveMatchingSubjectId(resolvedSubjectId);
                              setActiveMatchingExerciseIdx(safeExIdx - 1);
                            }
                          }}
                          disabled={safeExIdx === 0}
                          className="p-0.5 rounded-lg hover:bg-white disabled:opacity-35 text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-all"
                          title={currentLang === 'ar' ? 'التمرين السابق' : 'Previous'}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        <span className="px-1.5 text-slate-800 font-bold whitespace-nowrap">
                          {t('matching_exercise_label', 'التمرين')} {activeExNumber} {t('matching_of_label', 'من')} {totalExercises}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            if (safeExIdx < totalExercises - 1) {
                              setActiveMatchingSubjectId(resolvedSubjectId);
                              setActiveMatchingExerciseIdx(safeExIdx + 1);
                            }
                          }}
                          disabled={safeExIdx >= totalExercises - 1}
                          className="p-0.5 rounded-lg hover:bg-white disabled:opacity-35 text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-all"
                          title={currentLang === 'ar' ? 'التمرين التالي' : 'Next'}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <WordMatchingArena
              subjects={matchingSubjects}
              currentStudent={currentStudent}
              webhookUrl={sheetsConfig.webhookUrl}
              currentLang={currentLang}
              translations={translations}
              t={t}
              activeSubjectId={activeMatchingSubjectId || matchingSubjects[0]?.id}
              activeExerciseIndex={activeMatchingExerciseIdx}
              onSelectSubjectExercise={(sId, exIdx) => {
                setActiveMatchingSubjectId(sId);
                setActiveMatchingExerciseIdx(exIdx);
              }}
              onOpenMatchingLessonsModal={openMatchingLessonsModal}
              onBackToPronunciation={() => setAppMode('pronunciation')}
              onRequestLogin={() => setIsLoginModalOpen(true)}
              matchingHistory={matchingHistory}
              retryNonce={matchingRetryNonce}
              retryBanner={matchingRetryBanner}
              onMatchingSubmitted={(submitted) => {
                if (!submitted) return;
                const ts = new Date().toLocaleString('ar-SA');
                setMatchingHistory((prev) => {
                  const cleanSubj = submitted.subjectName.trim();
                  const existingIdx = prev.findIndex((item) => (item.lessonSubject || '').trim() === cleanSubj);
                  const newEntry = {
                    exerciseNumber: submitted.exerciseNumber,
                    formulaString: submitted.formulaString,
                    percentage: submitted.percentage,
                  };
                  if (existingIdx >= 0) {
                    const next = [...prev];
                    const existing = next[existingIdx];
                    const filteredEx = (existing.exercises || []).filter(
                      (e) => e.exerciseNumber !== submitted.exerciseNumber
                    );
                    filteredEx.push(newEntry);
                    filteredEx.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
                    next[existingIdx] = {
                      ...existing,
                      timestamp: ts,
                      completionStatus: submitted.completionStatus,
                      exercises: filteredEx,
                    };
                    return next;
                  }
                  return [
                    {
                      id: `local-ans2-${Date.now()}`,
                      timestamp: ts,
                      studentId: currentStudent?.id || '',
                      studentName: currentStudent?.name || '',
                      lessonSubject: cleanSubj,
                      completionStatus: submitted.completionStatus,
                      exercises: [newEntry],
                    },
                    ...prev,
                  ];
                });
              }}
            />
          </div>
        ) : appMode === 'dictation' ? (
          /* ========================================================
             4. DICTATION & WORD BUILDING ARENA (تمرين الإملاء - كلمات)
             ======================================================== */
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            {(() => {
              const resolvedSubject =
                dictationSubjects.find((s) => s.id === activeDictationSubjectId) ||
                dictationSubjects[0] ||
                null;
              const resolvedSubjectId = resolvedSubject?.id || '';
              const totalExercises = resolvedSubject?.exercises.length || 0;
              const safeExIdx =
                totalExercises > 0
                  ? Math.min(Math.max(0, activeDictationExerciseIdx), totalExercises - 1)
                  : 0;
              const activeExNumber =
                resolvedSubject?.exercises[safeExIdx]?.exerciseNumber || safeExIdx + 1;

              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setCurrentView('landing')}
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                      title={currentLang === 'ar' ? 'الصفحة الرئيسية' : currentLang === 'th' ? 'หน้าหลัก' : 'Home'}
                    >
                      <Home className="w-4 h-4 text-slate-700" />
                    </button>

                    <button
                      type="button"
                      onClick={openDictationLessonsModal}
                      className="p-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/80 rounded-xl transition-all cursor-pointer shadow-2xs"
                      title={t('dictation_lessons_list_btn', 'قائمة الدروس')}
                      aria-label={t('dictation_lessons_list_btn', 'قائمة الدروس')}
                    >
                      <List className="w-4 h-4 text-teal-700" />
                    </button>
                  </div>

                  {resolvedSubject && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
                      <div className="px-2.5 py-1 rounded-xl bg-teal-50 text-teal-900 font-bold border border-teal-200/80 flex items-center">
                        <select
                          value={resolvedSubjectId}
                          onChange={(e) => {
                            setActiveDictationSubjectId(e.target.value);
                            setActiveDictationExerciseIdx(0);
                          }}
                          className="bg-transparent font-bold text-teal-950 focus:outline-hidden cursor-pointer max-w-[190px] truncate"
                        >
                          {dictationSubjects.map((subj) => (
                            <option key={subj.id} value={subj.id}>
                              {getTranslatedDictationSubject(subj.subjectName, currentLang, translations)} ({subj.exercises.length})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (safeExIdx > 0) {
                              setActiveDictationSubjectId(resolvedSubjectId);
                              setActiveDictationExerciseIdx(safeExIdx - 1);
                            }
                          }}
                          disabled={safeExIdx === 0}
                          className="p-0.5 rounded-lg hover:bg-white disabled:opacity-35 text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-all"
                          title={currentLang === 'ar' ? 'التمرين السابق' : 'Previous'}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        <span className="px-1.5 text-slate-800 font-bold whitespace-nowrap">
                          {t('matching_exercise_label', 'التمرين')} {activeExNumber} {t('matching_of_label', 'من')} {totalExercises}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            if (safeExIdx < totalExercises - 1) {
                              setActiveDictationSubjectId(resolvedSubjectId);
                              setActiveDictationExerciseIdx(safeExIdx + 1);
                            }
                          }}
                          disabled={safeExIdx >= totalExercises - 1}
                          className="p-0.5 rounded-lg hover:bg-white disabled:opacity-35 text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-all"
                          title={currentLang === 'ar' ? 'التمرين التالي' : 'Next'}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <DictationArena
              subjects={dictationSubjects}
              currentStudent={currentStudent}
              webhookUrl={sheetsConfig.webhookUrl}
              currentLang={currentLang}
              translations={translations}
              t={t}
              activeSubjectId={activeDictationSubjectId || dictationSubjects[0]?.id}
              activeExerciseIndex={activeDictationExerciseIdx}
              onSelectSubjectExercise={(sId, exIdx) => {
                setActiveDictationSubjectId(sId);
                setActiveDictationExerciseIdx(exIdx);
              }}
              onBackToPronunciation={() => setAppMode('pronunciation')}
              onRequestLogin={() => setIsLoginModalOpen(true)}
              dictationHistory={dictationHistory}
              retryNonce={dictationRetryNonce}
              retryBanner={dictationRetryBanner}
              onDictationSubmitted={(submitted) => {
                if (!submitted) return;
                const ts = new Date().toLocaleString('ar-SA');
                setDictationHistory((prev) => {
                  const cleanSubj = submitted.subjectName.trim();
                  const existingIdx = prev.findIndex((item) => (item.lessonSubject || '').trim() === cleanSubj);
                  const newEntry = {
                    exerciseNumber: submitted.exerciseNumber,
                    formulaString: submitted.formulaString,
                    percentage: submitted.percentage,
                  };
                  if (existingIdx >= 0) {
                    const next = [...prev];
                    const existing = next[existingIdx];
                    const filteredEx = (existing.exercises || []).filter(
                      (e) => e.exerciseNumber !== submitted.exerciseNumber
                    );
                    filteredEx.push(newEntry);
                    filteredEx.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
                    next[existingIdx] = {
                      ...existing,
                      timestamp: ts,
                      completionStatus: submitted.completionStatus,
                      exercises: filteredEx,
                    };
                    return next;
                  }
                  return [
                    {
                      id: `local-ans3-${Date.now()}`,
                      timestamp: ts,
                      studentId: currentStudent?.id || '',
                      studentName: currentStudent?.name || '',
                      lessonSubject: cleanSubj,
                      completionStatus: submitted.completionStatus,
                      exercises: [newEntry],
                    },
                    ...prev,
                  ];
                });
              }}
            />
          </div>
        ) : appMode === 'writing' ? (
          /* ========================================================
             5. WRITING & AR WHITEBOARD ARENA (تمرين الكتابة)
             ======================================================== */
          <div className="w-full animate-in fade-in duration-300">
            <WritingArena
              allTemplates={writingTemplates}
              onUpdateTemplates={(updated) => {
                setWritingTemplates(updated);
                writingSheetService.saveLocalTemplates(updated);
              }}
              selectedTemplate={selectedWritingTemplate}
              onSelectTemplate={setSelectedWritingTemplate}
              boardStyle={writingBoardStyle}
              onSelectBoardStyle={setWritingBoardStyle}
              guideColor={writingGuideColor}
              onSelectGuideColor={setWritingGuideColor}
              templateOpacity={writingTemplateOpacity}
              onChangeTemplateOpacity={setWritingTemplateOpacity}
              saveArCameraPhoto={writingSaveArCameraPhoto}
              arRewards={writingArRewards}
              arIntroReward={writingArIntroReward}
              onSyncARRewardsFromCloud={() => syncWritingARRewardsFromCloud()}
              previewRewardRequest={writingPreviewRewardRequest}
              currentStudent={currentStudent}
              onOpenStudentLogin={() => setIsLoginModalOpen(true)}
              onStudentLogout={handleLogout}
              isAdminAuthenticated={isAdminAuthenticated}
              onOpenAdminWriting={() => handleOpenAdmin('writing')}
              onBackToPronunciation={() => setAppMode('pronunciation')}
              webhookUrl={sheetsConfig.webhookUrl}
              writingHistory={writingHistory}
              currentLang={currentLang}
              translations={translations}
              onRefreshWritingHistory={() => {
                if (currentStudent && sheetsConfig.webhookUrl) {
                  fetchStudentWritingHistory(sheetsConfig.webhookUrl, currentStudent.id, currentStudent.name)
                    .then((wh) => {
                      if (wh) setWritingHistory(wh);
                    })
                    .catch(() => {});
                } else {
                  fetchStudentWritingHistory('', '', '')
                    .then((wh) => {
                      if (wh) setWritingHistory(wh);
                    })
                    .catch(() => {});
                }
              }}
              onWritingSubmitted={(submitted) => {
                if (!submitted) return;
                const newEntry = {
                  slotIndex: submitted.slotIndex,
                  category: submitted.category,
                  title: submitted.title,
                  imageUrl: submitted.imageUrl || '',
                  score: submitted.score,
                  details: submitted.details,
                };
                saveLocalWritingSubmission(
                  currentStudent?.id || '',
                  currentStudent?.name || '',
                  submitted.topic,
                  newEntry,
                  submitted.completionStatus
                );
                const ts = new Date().toLocaleString('ar-SA');
                setWritingHistory((prev) => {
                  const cleanTopic = submitted.topic.trim();
                  const existingIdx = prev.findIndex((item) => (item.topic || '').trim() === cleanTopic);
                  if (existingIdx >= 0) {
                    const next = [...prev];
                    const existing = next[existingIdx];
                    const filteredEx = (existing.exercises || []).filter(
                      (e) =>
                        !(
                          e.slotIndex === submitted.slotIndex &&
                          (e.title || '').trim() === submitted.title.trim()
                        ) && (e.title || '').trim() !== submitted.title.trim()
                    );
                    filteredEx.push(newEntry);
                    filteredEx.sort((a, b) => a.slotIndex - b.slotIndex);
                    next[existingIdx] = {
                      ...existing,
                      timestamp: ts,
                      completionStatus: submitted.completionStatus || existing.completionStatus,
                      exercises: filteredEx,
                    };
                    return next;
                  }
                  return [
                    {
                      id: `local-ans4-${Date.now()}`,
                      timestamp: ts,
                      studentId: currentStudent?.id || '',
                      studentName: currentStudent?.name || '',
                      topic: cleanTopic,
                      completionStatus: submitted.completionStatus || '',
                      exercises: [newEntry],
                    },
                    ...prev,
                  ];
                });
              }}
            />
          </div>
        ) : appMode === 'catch' ? (
          /* ========================================================
             6. AR CATCH & CONNECT ARENA (تحدي اصطياد وتوصيل الحروف - صيد)
             ======================================================== */
          <div className="w-full animate-in fade-in duration-300">
            <CatchArena
              subjects={catchSubjects}
              currentStudent={currentStudent}
              webhookUrl={sheetsConfig.webhookUrl}
              currentLang={currentLang}
              translations={translations}
              t={t}
              activeSubjectId={activeCatchSubjectId || catchSubjects[0]?.id}
              activeExerciseIndex={activeCatchExerciseIdx}
              onSelectSubjectExercise={(sId, exIdx) => {
                setActiveCatchSubjectId(sId);
                setActiveCatchExerciseIdx(exIdx);
              }}
              onBackToPronunciation={() => setAppMode('pronunciation')}
              onOpenLessons={openCatchLessonsModal}
              onGoHome={() => setCurrentView('landing')}
              isAdminAuthenticated={isAdminAuthenticated}
              onOpenAdminCatch={() => handleOpenAdmin('catch')}
              onRequestLogin={() => setIsLoginModalOpen(true)}
              catchHistory={catchHistory}
              retryNonce={catchRetryNonce}
              retryBanner={catchRetryBanner}
              arRewards={catchArRewards}
              arIntroReward={catchArIntroReward}
              previewRewardRequest={catchPreviewRewardRequest}
              onCatchSubmitted={(submitted) => {
                if (!submitted) return;
                const ts = new Date().toLocaleString('ar-SA');
                setCatchHistory((prev) => {
                  const cleanSubj = submitted.subjectName.trim();
                  const existingIdx = prev.findIndex((item) => (item.lessonSubject || '').trim() === cleanSubj);
                  const newEntry = {
                    exerciseNumber: submitted.exerciseNumber,
                    formulaString: submitted.formulaString,
                    percentage: submitted.percentage,
                  };
                  if (existingIdx >= 0) {
                    const next = [...prev];
                    const existing = next[existingIdx];
                    const filteredEx = (existing.exercises || []).filter(
                      (e) => e.exerciseNumber !== submitted.exerciseNumber
                    );
                    filteredEx.push(newEntry);
                    filteredEx.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
                    next[existingIdx] = {
                      ...existing,
                      timestamp: ts,
                      completionStatus: submitted.completionStatus,
                      exercises: filteredEx,
                    };
                    return next;
                  }
                  return [
                    {
                      id: `local-catch-${Date.now()}`,
                      timestamp: ts,
                      studentId: currentStudent?.id || '',
                      studentName: currentStudent?.name || '',
                      lessonSubject: cleanSubj,
                      completionStatus: submitted.completionStatus,
                      exercises: [newEntry],
                    },
                    ...prev,
                  ];
                });
              }}
            />
          </div>
        ) : appMode === 'video' ? (
          /* ========================================================
             7. STANDALONE INTERACTIVE VIDEO MODULE (فيديو_الأسئلة)
             ======================================================== */
          <div className="w-full animate-in fade-in duration-300">
            <InteractiveVideoArena
              lessons={videoLessons}
              activeLessonId={activeVideoLessonId || videoLessons[0]?.id || ''}
              progressMap={videoProgressMap}
              isResetMode={isVideoResetMode}
              currentStudent={currentStudent}
              webhookUrl={sheetsConfig.webhookUrl}
              currentLang={currentLang}
              t={t}
              onSelectLessonId={(id) => {
                setActiveVideoLessonId(id);
                setIsVideoResetMode(false);
              }}
              onOpenLessonsModal={openVideoLessonsModal}
              onOpenCorrectionsModal={() => setIsVideoCorrectionModalOpen(true)}
              onRequestLogin={() => setIsLoginModalOpen(true)}
              onGoHome={() => setCurrentView('landing')}
              onUpdateProgress={(lessonId, nextProg) => {
                setVideoProgressMap((prev) => ({ ...prev, [lessonId]: nextProg }));
              }}
              onRefreshVideo={refreshAllVideoData}
            />
          </div>
        ) : (
          /* ========================================================
             2. PRACTICE & RECORDING ARENA (صفحة الدرس والتسجيل)
             ======================================================== */
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            {/* Top Navigation & Fast Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentView('landing')}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                  title={currentLang === 'ar' ? 'الصفحة الرئيسية' : currentLang === 'th' ? 'หน้าหลัก' : 'Home'}
                >
                  <Home className="w-4 h-4 text-slate-700" />
                </button>

                <button
                  onClick={openPronunciationLessonsModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  title={t('eval_open_lessons_btn', 'فتح الدروس')}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>({t('eval_open_lessons_btn', 'فتح الدروس')})</span>
                </button>
              </div>

              {/* Lesson Metadata Badge: الموضوع | الفئة | عدد الدروس في الموضوع */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-900 font-bold border border-emerald-200/80 flex items-center gap-1">
                  <span className="text-emerald-700 font-normal">
                    {currentLang === 'ar' ? 'الموضوع:' : currentLang === 'th' ? 'หัวข้อ:' : 'Subject:'}
                  </span>
                  <span>{selectedItem.lessonSubject || studentSubject}</span>
                </span>
                {selectedItem.category && (
                  <span className="px-2.5 py-1 rounded-xl bg-sky-50 text-sky-900 font-bold border border-sky-200/80 flex items-center gap-1">
                    <span className="text-sky-700 font-normal">
                      {currentLang === 'ar' ? 'الفئة:' : currentLang === 'th' ? 'หมวดหมู่:' : 'Category:'}
                    </span>
                    <span>
                      {selectedItem.category === 'الحرف'
                        ? t('category_letter', 'الحرف')
                        : selectedItem.category === 'الكلمة'
                        ? t('category_word', 'الكلمة')
                        : selectedItem.category === 'الجملة'
                        ? t('category_sentence', 'الجملة')
                        : selectedItem.category}
                    </span>
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold border border-slate-200 flex items-center gap-1">
                  <span>
                    {currentLang === 'ar'
                      ? `التمرين ${currentIndex + 1} من ${activeSubjectWords.length}`
                      : currentLang === 'th'
                      ? `แบบฝึกหัดที่ ${currentIndex + 1} จาก ${activeSubjectWords.length}`
                      : `Exercise ${currentIndex + 1} of ${activeSubjectWords.length}`}
                  </span>
                </span>
              </div>
            </div>

            {/* Main Practice Arena - Centered Clean Layout */}
            <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
              {/* Practice Card */}
              <PracticeCard
                wordItem={selectedItem}
                settings={settings}
                currentStudent={currentStudent}
                onEvaluationComplete={handleEvaluationComplete}
                isEvaluating={isEvaluating}
                setIsEvaluating={setIsEvaluating}
                currentIndex={currentIndex}
                totalCount={activeSubjectWords.length}
                onUpdateSettings={handleUpdateSettings}
                onOpenLessons={openPronunciationLessonsModal}
                isSubmitted={isCurrentAnswerSubmitted}
                onReRecord={() => {
                  setIsCurrentAnswerSubmitted(false);
                  setEvaluation(null);
                  setRecordedAudioUrl(null);
                }}
                retryNonce={pronunciationRetryNonce}
                retryBanner={pronunciationRetryBanner}
                webhookUrl={sheetsConfig.webhookUrl}
                recordedHistoryItem={(() => {
                  if (!currentStudent || !studentHistory.length) return null;
                  const cleanSel = selectedItem.word.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').trim();
                  return (
                    studentHistory.find((h) => {
                      if (h.wordId && h.wordId === selectedItem.id) return true;
                      const hClean = (h.word || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').trim();
                      return h.word === selectedItem.word || hClean === cleanSel;
                    }) || null
                  );
                })()}
                currentLang={currentLang}
                translations={translations}
                t={t}
              />

              {/* Evaluation Results Card */}
              {evaluation && (
                <EvaluationCard
                  evaluation={evaluation}
                  targetWordItem={selectedItem}
                  recordedAudioUrl={recordedAudioUrl}
                  onRetry={() => {
                    if (isCurrentAnswerSubmitted) {
                      const wordKey = `${(selectedItem.lessonSubject || studentSubject || '').trim()}::${selectedItem.word.trim()}`;
                      const status = getRetryStatus('pronunciation', currentStudent, wordKey, selectedItem);
                      if (!status.canRetry) return;
                      const outcome = recordStudentRetryAttempt(
                        'pronunciation',
                        currentStudent,
                        wordKey,
                        selectedItem,
                        sheetsConfig.webhookUrl
                      );
                      const nextNonce = pronunciationRetryNonce + 1;
                      setPronunciationRetryNonce(nextNonce);
                      setPronunciationRetryBanner({
                        nonce: nextNonce,
                        message: formatStudentRetryBannerMessage(outcome, currentStudent, t),
                      });
                    } else {
                      setPronunciationRetryBanner(null);
                    }
                    setIsCurrentAnswerSubmitted(false);
                    setEvaluation(null);
                    setRecordedAudioUrl(null);
                  }}
                  onNext={handleNextWord}
                  onOpenLessons={openPronunciationLessonsModal}
                  audioEngine={settings.engine}
                  currentStudent={currentStudent}
                  webhookUrl={sheetsConfig.webhookUrl}
                  driveFolderId={sheetsConfig.teacherDriveFolderId || sheetsConfig.driveFolderId}
                  studentDriveFolderId={sheetsConfig.studentDriveFolderId || STUDENT_AUDIO_DRIVE_FOLDER_ID}
                  lessonSubject={selectedItem.lessonSubject || studentSubject}
                  wordIndex={currentIndex}
                  onRequestLogin={() => setIsLoginModalOpen(true)}
                  onSubmissionSuccess={(submitted) => {
                    setIsCurrentAnswerSubmitted(true);
                    if (submitted) {
                      const cleanSubmittedWord = submitted.word.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').trim();
                      setStudentHistory((prev) => {
                        const filtered = prev.filter((item) => {
                          const itemClean = (item.word || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').trim();
                          return item.wordId !== submitted.wordId && item.word !== submitted.word && itemClean !== cleanSubmittedWord;
                        });
                        return [
                          {
                            id: `sub-${Date.now()}`,
                            wordId: submitted.wordId,
                            word: submitted.word,
                            score: submitted.score,
                            grade: submitted.grade,
                            timestamp: Date.now(),
                            spokenText: submitted.spokenText,
                            recordedAudioUrl: submitted.audioUrl,
                            studentName: currentStudent?.name,
                          },
                          ...filtered,
                        ];
                      });
                    }
                  }}
                  currentLang={currentLang}
                  translations={translations}
                  t={t}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer: Dynamic Social Media Channels from sheet "الرئيسية" with NO text */}
      <footer
        className={`border-t border-slate-200/80 bg-white py-6 ${
          currentView === 'practice' && (appMode === 'writing' || appMode === 'catch') ? 'mt-0' : 'mt-12'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-center gap-3">
          {homeConfig?.socialLinks && homeConfig.socialLinks.length > 0 ? (
            homeConfig.socialLinks
              .filter((link) => link.url && link.iconKey)
              .map((link, idx) => {
                const brand = getSocialBrandClasses(link.iconKey);
                return (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-all duration-200 shadow-2xs hover:scale-110 active:scale-95 cursor-pointer ${brand.bg} ${brand.text} ${brand.border} ${brand.hover}`}
                    title={link.iconKey}
                  >
                    <SocialIcon iconKey={link.iconKey} className="w-5 h-5" />
                  </a>
                );
              })
          ) : (
            /* Sample Social Icons ready for user links (Line, Facebook, Instagram, YouTube) */
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { key: 'line', label: 'Line' },
                { key: 'facebook', label: 'Facebook' },
                { key: 'instagram', label: 'Instagram' },
                { key: 'youtube', label: 'YouTube' },
              ].map((item) => {
                const brand = getSocialBrandClasses(item.key);
                return (
                  <div
                    key={item.key}
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center border opacity-60 ${brand.bg} ${brand.text} ${brand.border}`}
                    title={`${item.label} (في انتظار إدخال الرابط في ورقة الرئيسية)`}
                  >
                    <SocialIcon iconKey={item.key} className="w-5 h-5" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </footer>

      {/* Modals */}
      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        history={currentStudent ? studentHistory : history}
        matchingHistory={matchingHistory}
        dictationHistory={dictationHistory}
        catchHistory={catchHistory}
        onClearHistory={handleClearHistory}
        currentStudent={currentStudent}
        isSyncingFromSheets={isSyncingAnswers1}
        isSyncingMatching={isSyncingMatching}
        isSyncingDictation={isSyncingDictation}
        isSyncingCatch={isSyncingCatch}
        defaultTab={
          appMode === 'catch'
            ? 'catch'
            : appMode === 'dictation'
            ? 'dictation'
            : appMode === 'matching'
            ? 'matching'
            : 'pronunciation'
        }
        currentLang={currentLang}
        translations={translations}
        t={t}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <GuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        defaultEvalMode={settings.preferredEvaluationMode}
        onUpdateDefaultEvalMode={(mode) => handleUpdateSettings({ preferredEvaluationMode: mode })}
      />

      {/* Lessons Selector Modal */}
      <LessonsModal
        isOpen={isLessonsModalOpen}
        onClose={() => setIsLessonsModalOpen(false)}
        curriculum={curriculum}
        selectedItem={selectedItem}
        onSelectItem={handleSelectWord}
        subjectsList={allSubjects}
        selectedSubject={studentSubject}
        onSelectSubject={setStudentSubject}
        scoresMap={studentScoresMap}
        currentStudent={currentStudent}
        t={t}
      />

      {/* Matching Lessons Selector Modal (ورقة وصل) */}
      <MatchingLessonsModal
        isOpen={isMatchingLessonsModalOpen}
        onClose={() => setIsMatchingLessonsModalOpen(false)}
        subjects={matchingSubjects}
        activeSubjectId={activeMatchingSubjectId || matchingSubjects[0]?.id}
        activeExerciseIndex={activeMatchingExerciseIdx}
        onSelectSubjectExercise={(subjId, exIdx, isRetry) => {
          setActiveMatchingSubjectId(subjId);
          setActiveMatchingExerciseIdx(exIdx);
          if (isRetry) {
            const subj = matchingSubjects.find((s) => s.id === subjId);
            const ex = subj?.exercises[exIdx];
            if (subj && ex) {
              const rKey = `${subj.subjectName.trim()}::ex-${ex.exerciseNumber}`;
              const status = getRetryStatus('matching', currentStudent, rKey, ex);
              if (status.canRetry) {
                const outcome = recordStudentRetryAttempt(
                  'matching',
                  currentStudent,
                  rKey,
                  ex,
                  sheetsConfig.webhookUrl
                );
                const nextNonce = matchingRetryNonce + 1;
                setMatchingRetryNonce(nextNonce);
                setMatchingRetryBanner({
                  nonce: nextNonce,
                  message: formatStudentRetryBannerMessage(outcome, currentStudent, t),
                });
              }
            }
          } else {
            setMatchingRetryBanner(null);
          }
          closeAllLessonModals();
          setAppMode('matching');
          setCurrentView('practice');
        }}
        onOpenAdminMatching={() => {
          closeAllLessonModals();
          handleOpenAdmin();
        }}
        matchingHistory={matchingHistory}
        currentStudent={currentStudent}
        currentLang={currentLang}
        translations={translations}
        t={t}
      />

      {/* Dictation Lessons Selector Modal (ورقة كلمات) */}
      <DictationLessonsModal
        isOpen={isDictationLessonsModalOpen}
        onClose={() => setIsDictationLessonsModalOpen(false)}
        subjects={dictationSubjects}
        activeSubjectId={activeDictationSubjectId || dictationSubjects[0]?.id}
        activeExerciseIndex={activeDictationExerciseIdx}
        onSelectSubjectExercise={(subjId, exIdx, isRetry) => {
          setActiveDictationSubjectId(subjId);
          setActiveDictationExerciseIdx(exIdx);
          if (isRetry) {
            const subj = dictationSubjects.find((s) => s.id === subjId);
            const ex = subj?.exercises[exIdx];
            if (subj && ex) {
              const rKey = `${subj.subjectName.trim()}::ex-${ex.exerciseNumber}`;
              const status = getRetryStatus('dictation', currentStudent, rKey, ex);
              if (status.canRetry) {
                const outcome = recordStudentRetryAttempt(
                  'dictation',
                  currentStudent,
                  rKey,
                  ex,
                  sheetsConfig.webhookUrl
                );
                const nextNonce = dictationRetryNonce + 1;
                setDictationRetryNonce(nextNonce);
                setDictationRetryBanner({
                  nonce: nextNonce,
                  message: formatStudentRetryBannerMessage(outcome, currentStudent, t),
                });
              }
            }
          } else {
            setDictationRetryBanner(null);
          }
          closeAllLessonModals();
          setAppMode('dictation');
          setCurrentView('practice');
        }}
        onOpenAdminDictation={() => {
          closeAllLessonModals();
          handleOpenAdmin();
        }}
        dictationHistory={dictationHistory}
        currentStudent={currentStudent}
        currentLang={currentLang}
        translations={translations}
        t={t}
      />

      {/* AR Catch Lessons Selector Modal (ورقة صيد) */}
      <CatchLessonsModal
        isOpen={isCatchLessonsModalOpen}
        onClose={() => setIsCatchLessonsModalOpen(false)}
        subjects={catchSubjects}
        activeSubjectId={activeCatchSubjectId || catchSubjects[0]?.id}
        activeExerciseIndex={activeCatchExerciseIdx}
        onSelectSubjectExercise={(subjId, exIdx, isRetry) => {
          setActiveCatchSubjectId(subjId);
          setActiveCatchExerciseIdx(exIdx);
          if (isRetry) {
            const subj = catchSubjects.find((s) => s.id === subjId);
            const ex = subj?.exercises[exIdx];
            if (subj && ex) {
              const rKey = `${subj.subjectName.trim()}::ex-${ex.exerciseNumber}`;
              const status = getRetryStatus('catch', currentStudent, rKey, ex);
              if (status.canRetry) {
                const outcome = recordStudentRetryAttempt(
                  'catch',
                  currentStudent,
                  rKey,
                  ex,
                  sheetsConfig.webhookUrl
                );
                const nextNonce = catchRetryNonce + 1;
                setCatchRetryNonce(nextNonce);
                setCatchRetryBanner({
                  nonce: nextNonce,
                  message: formatStudentRetryBannerMessage(outcome, currentStudent, t),
                });
              }
            }
          } else {
            setCatchRetryBanner(null);
          }
          closeAllLessonModals();
          setAppMode('catch');
          setCurrentView('practice');
        }}
        onOpenAdminCatch={() => {
          closeAllLessonModals();
          handleOpenAdmin('catch');
        }}
        catchHistory={catchHistory}
        currentStudent={currentStudent}
        currentLang={currentLang}
        translations={translations}
        t={t}
      />

      {/* Interactive Video Lessons & Corrections Modals */}
      <VideoLessonsModal
        isOpen={isVideoLessonsModalOpen}
        onClose={() => setIsVideoLessonsModalOpen(false)}
        lessons={videoLessons}
        activeLessonId={activeVideoLessonId || videoLessons[0]?.id || ''}
        progressMap={videoProgressMap}
        currentStudent={currentStudent}
        webhookUrl={sheetsConfig.webhookUrl}
        onSelectLesson={(lessonId, isRetry) => {
          setActiveVideoLessonId(lessonId);
          setIsVideoResetMode(Boolean(isRetry));
          closeAllLessonModals();
          setAppMode('video');
          setCurrentView('practice');
        }}
        onOpenCorrections={() => {
          setIsVideoLessonsModalOpen(false);
          setIsVideoCorrectionModalOpen(true);
        }}
        onRefreshLessons={refreshAllVideoData}
        onUpdateProgress={(lessonId, nextProg) => {
          setVideoProgressMap((prev) => ({ ...prev, [lessonId]: nextProg }));
        }}
        t={t}
        currentLang={currentLang}
      />

      <VideoCorrectionModal
        isOpen={isVideoCorrectionModalOpen}
        onClose={() => setIsVideoCorrectionModalOpen(false)}
        webhookUrl={sheetsConfig.webhookUrl}
        studentId={currentStudent?.id || ''}
        studentName={currentStudent?.name || ''}
        lessons={videoLessons}
        progressMap={videoProgressMap}
        selectedLessonTitle={
          appMode === 'video'
            ? videoLessons.find((l) => l.id === activeVideoLessonId)?.title
            : undefined
        }
        onRefreshProgress={refreshAllVideoData}
        t={t}
      />

      <CourseScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        schedule={courseSchedule}
        currentStudent={currentStudent}
        currentLang={currentLang}
        translations={translations}
        t={t}
        curriculum={curriculum}
        studentHistory={studentHistory}
        matchingSubjects={matchingSubjects}
        matchingHistory={matchingHistory}
        dictationSubjects={dictationSubjects}
        dictationHistory={dictationHistory}
        writingTemplates={writingTemplates}
        writingHistory={writingHistory}
        catchSubjects={catchSubjects}
        catchHistory={catchHistory}
        videoLessons={videoLessons}
        videoProgressMap={videoProgressMap}
        onOpenScheduledLesson={handleOpenScheduledLesson}
      />

      {/* Student Login & Registration Verification Modal */}
      <StudentLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        webhookUrl={sheetsConfig.webhookUrl}
        t={t}
      />

      {/* Admin Login Verification Modal */}
      <AdminLoginModal
        isOpen={showAdminLoginModal}
        onClose={() => setShowAdminLoginModal(false)}
        onLoginSuccess={handleAdminLoginSuccess}
        adminUsers={homeConfig?.adminUsers}
      />
    </div>
  );
}
