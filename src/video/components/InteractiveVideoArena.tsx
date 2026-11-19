import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Home,
  Film,
  Award,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Lock,
  Image as ImageIcon,
  Mic,
  Square,
  Upload,
  Camera,
  SwitchCamera,
  Send,
  Loader2,
  HelpCircle,
  BookOpen,
  ZoomIn,
  X,
  AlertCircle,
  UserCheck,
  ExternalLink,
} from 'lucide-react';
import { StudentRegistrant } from '../../types';
import { SupportedLang } from '../../utils/translations';
import {
  VideoLesson,
  VideoStudentProgress,
  VideoTimestampQuestion,
} from '../types';
import {
  completeVideoLesson,
  getPlayableVideoInfo,
  resolveVideoAudioAlternatives,
  resolveVideoQuestionImage,
  saveVideoHomeworkMedia,
  saveVideoQuestionAnswer,
} from '../videoSheets';
import { VideoQuestionModal } from './VideoQuestionModal';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface InteractiveVideoArenaProps {
  lessons: VideoLesson[];
  activeLessonId: string;
  progressMap: Record<string, VideoStudentProgress>;
  isResetMode: boolean;
  currentStudent?: StudentRegistrant | null;
  webhookUrl: string;
  currentLang?: SupportedLang;
  t?: (id: string, fallback?: string) => string;
  onSelectLessonId: (lessonId: string) => void;
  onOpenLessonsModal: () => void;
  onOpenCorrectionsModal: () => void;
  onRequestLogin: () => void;
  onGoHome: () => void;
  onUpdateProgress: (lessonId: string, nextProgress: VideoStudentProgress) => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const InteractiveVideoArena: React.FC<InteractiveVideoArenaProps> = ({
  lessons,
  activeLessonId,
  progressMap,
  isResetMode,
  currentStudent,
  webhookUrl,
  currentLang = 'ar',
  t,
  onOpenLessonsModal,
  onOpenCorrectionsModal,
  onRequestLogin,
  onGoHome,
  onUpdateProgress,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);

  const lesson = useMemo(() => {
    return lessons.find((l) => l.id === activeLessonId) || lessons[0];
  }, [lessons, activeLessonId]);

  const progress: VideoStudentProgress = useMemo(() => {
    if (!lesson) {
      return {
        lessonId: '',
        topic: '',
        title: '',
        completed: '',
        videoScore: 0,
        explainAudioScore: 0,
        answeredQuestions: {},
        retryResetCount: 0,
      };
    }
    return (
      progressMap[lesson.id] || {
        lessonId: lesson.id,
        topic: lesson.topic,
        title: lesson.title,
        completed: '',
        videoScore: 0,
        explainAudioScore: 0,
        answeredQuestions: {},
        retryResetCount: lesson.retryCount,
      }
    );
  }, [lesson, progressMap]);

  // Companion tab
  const [activeTab, setActiveTab] = useState<'study' | 'image' | 'audio'>('study');

  // Video playback state
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const ytMountRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const explainAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [maxWatchedTime, setMaxWatchedTime] = useState(0);
  const [volume, setVolume] = useState(90);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [useDriveEmbedFallback, setUseDriveEmbedFallback] = useState(false);
  const [seekNotice, setSeekNotice] = useState<string | null>(null);
  const [ytReady, setYtReady] = useState(false);

  // Active Timestamp Question Modal
  const [activeModalQuestion, setActiveModalQuestion] = useState<{
    question: VideoTimestampQuestion;
    type: 'video' | 'audio';
    key: string;
  } | null>(null);
  const triggeredKeysSessionRef = useRef<Set<string>>(new Set());

  // Explain Audio candidates
  const explainAudioCandidates = useMemo(
    () => resolveVideoAudioAlternatives(lesson?.explainSound),
    [lesson?.explainSound]
  );
  const [explainAudioIdx, setExplainAudioIdx] = useState(0);

  // Image Helper Zoom
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  // Photo Homework State
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [capturedImageData, setCapturedImageData] = useState<string | null>(null);
  const [capturedImageMime, setCapturedImageMime] = useState<string>('image/jpeg');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFeedback, setImageFeedback] = useState<string | null>(null);

  // Audio Homework Recorder State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordedAudioBlobUrl, setRecordedAudioBlobUrl] = useState<string | null>(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordedAudioMime, setRecordedAudioMime] = useState<string>('audio/webm');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState<string | null>(null);

  // Complete lesson status
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  const playable = useMemo(() => getPlayableVideoInfo(lesson?.videoUrl), [lesson?.videoUrl]);
  const isCompleted = progress.completed === 'تم';
  const allVideoQsAnswered = useMemo(() => {
    if (!lesson || lesson.questions.length === 0) return true;
    return lesson.questions.every((q, idx) => Boolean(progress.answeredQuestions[`vq_${idx}`]));
  }, [lesson, progress.answeredQuestions]);

  const isSeekLocked = !allVideoQsAnswered && (!isCompleted || isResetMode);

  // Reset per lesson switch
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setMaxWatchedTime(0);
    setUseDriveEmbedFallback(false);
    setActiveModalQuestion(null);
    setSeekNotice(null);
    setExplainAudioIdx(0);
    setCapturedImageData(null);
    setImageFeedback(null);
    setRecordedAudioBlobUrl(null);
    setRecordedAudioBase64(null);
    setAudioFeedback(null);
    setCompletionMessage(null);
    setActiveTab('study');
    triggeredKeysSessionRef.current = new Set();
    stopCamera();
    stopRecording();
  }, [lesson?.id, isResetMode]);

  // Listen to fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      stopCamera();
      stopRecording();
    };
  }, []);

  // Initialize YouTube IFrame API when lesson uses YouTube
  useEffect(() => {
    if (playable.kind !== 'youtube' || !playable.youtubeId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
      setYtReady(false);
      return;
    }

    let cancelled = false;
    setYtReady(false);

    const mountPlayer = () => {
      if (cancelled || !ytMountRef.current || !window.YT?.Player) return;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }

      ytMountRef.current.innerHTML = '';
      const playerHost = document.createElement('div');
      ytMountRef.current.appendChild(playerHost);

      ytPlayerRef.current = new window.YT.Player(playerHost, {
        videoId: playable.youtubeId,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (ev: any) => {
            if (cancelled) return;
            setYtReady(true);
            const dur = Number(ev.target.getDuration?.() || 0);
            if (dur > 0) setDuration(dur);
            try {
              ev.target.setVolume(isMuted ? 0 : volume);
            } catch {}
          },
          onStateChange: (ev: any) => {
            if (cancelled) return;
            const YTState = window.YT?.PlayerState;
            if (YTState && ev.data === YTState.PLAYING) {
              setIsPlaying(true);
              const dur = Number(ev.target.getDuration?.() || 0);
              if (dur > 0) setDuration(dur);
            } else if (YTState && (ev.data === YTState.PAUSED || ev.data === YTState.ENDED)) {
              setIsPlaying(false);
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      mountPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        mountPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
    }

    return () => {
      cancelled = true;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [playable.kind, playable.youtubeId]);

  // 500ms Time polling & Timestamped Question Trigger
  useEffect(() => {
    if (!lesson) return;

    const timer = window.setInterval(() => {
      // 1. Check Video Playback Time
      let vidTime = 0;
      let vidDur = 0;
      let playingNow = false;

      if (playable.kind === 'youtube' && ytPlayerRef.current && ytReady) {
        try {
          vidTime = Number(ytPlayerRef.current.getCurrentTime?.() || 0);
          vidDur = Number(ytPlayerRef.current.getDuration?.() || 0);
          const state = ytPlayerRef.current.getPlayerState?.();
          playingNow = state === window.YT?.PlayerState?.PLAYING;
        } catch {}
      } else if (playable.kind === 'html5' && htmlVideoRef.current && !useDriveEmbedFallback) {
        vidTime = htmlVideoRef.current.currentTime || 0;
        vidDur = htmlVideoRef.current.duration || 0;
        playingNow = !htmlVideoRef.current.paused;
      }

      if (vidDur > 0 && isFinite(vidDur)) setDuration(vidDur);
      setCurrentTime(vidTime);

      if (vidTime > maxWatchedTime) {
        if (isSeekLocked && vidTime - maxWatchedTime > 2.5) {
          // User managed to skip ahead beyond lock threshold -> snap back
          seekVideoTo(maxWatchedTime);
        } else {
          setMaxWatchedTime(vidTime);
        }
      }

      // Trigger unanswered video timestamp question
      if (playingNow && !activeModalQuestion) {
        for (let i = 0; i < lesson.questions.length; i++) {
          const q = lesson.questions[i];
          const key = `vq_${i}`;
          if (
            !progress.answeredQuestions[key] &&
            !triggeredKeysSessionRef.current.has(key) &&
            vidTime >= q.time
          ) {
            triggeredKeysSessionRef.current.add(key);
            pauseVideo();
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            }
            setActiveModalQuestion({ question: q, type: 'video', key });
            break;
          }
        }
      }

      // 2. Check Explain Audio Timestamp Questions
      if (explainAudioRef.current && !explainAudioRef.current.paused && !activeModalQuestion) {
        const audTime = explainAudioRef.current.currentTime || 0;
        for (let i = 0; i < lesson.audioQuestions.length; i++) {
          const aq = lesson.audioQuestions[i];
          const key = `aq_${i}`;
          if (
            !progress.answeredQuestions[key] &&
            !triggeredKeysSessionRef.current.has(key) &&
            audTime >= aq.time
          ) {
            triggeredKeysSessionRef.current.add(key);
            explainAudioRef.current.pause();
            setActiveModalQuestion({ question: aq, type: 'audio', key });
            break;
          }
        }
      }
    }, 450);

    return () => window.clearInterval(timer);
  }, [
    lesson,
    playable.kind,
    ytReady,
    useDriveEmbedFallback,
    maxWatchedTime,
    isSeekLocked,
    activeModalQuestion,
    progress.answeredQuestions,
  ]);

  const playVideo = () => {
    if (playable.kind === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.playVideo?.();
      setIsPlaying(true);
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const pauseVideo = () => {
    if (playable.kind === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.pauseVideo?.();
      setIsPlaying(false);
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) pauseVideo();
    else playVideo();
  };

  const seekVideoTo = (targetSec: number) => {
    const clamped = Math.max(0, Math.min(duration || targetSec, targetSec));
    if (isSeekLocked && clamped > maxWatchedTime + 0.5) {
      setSeekNotice(
        tr(
          'video_seek_locked_notice',
          'لا يمكن تقديم الفيديو في المشاهدة الأولى قبل الإجابة على الأسئلة الزمنية.'
        )
      );
      window.setTimeout(() => setSeekNotice(null), 3500);
      return;
    }

    if (playable.kind === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo?.(clamped, true);
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setIsMuted(val === 0);
    if (playable.kind === 'youtube' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume(val);
      } catch {}
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.volume = val / 100;
      htmlVideoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (playable.kind === 'youtube' && ytPlayerRef.current) {
      try {
        if (nextMuted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
      } catch {}
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.muted = nextMuted;
    }
  };

  const toggleFullscreen = () => {
    if (!stageWrapperRef.current) return;
    if (!document.fullscreenElement) {
      stageWrapperRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Answer handler
  const handleQuestionAnswerSubmit = async (selectedAnswer: string, isCorrect: boolean | null) => {
    if (!lesson || !activeModalQuestion) return;
    const res = await saveVideoQuestionAnswer(webhookUrl, {
      studentId: currentStudent?.id || '',
      studentName: currentStudent?.name || '',
      lesson,
      entry: {
        questionKey: activeModalQuestion.key,
        question: activeModalQuestion.question.question,
        selectedAnswer,
        isCorrect,
        type: activeModalQuestion.type,
        answeredAt: new Date().toISOString(),
      },
      currentProgress: progress,
    });
    onUpdateProgress(lesson.id, res.updatedProgress);
  };

  const handleCloseQuestionModal = () => {
    const modalType = activeModalQuestion?.type;
    setActiveModalQuestion(null);
    if (modalType === 'video') playVideo();
    else if (modalType === 'audio') explainAudioRef.current?.play().catch(() => {});
  };

  const handleRewatchBeforeQuestion = () => {
    if (!activeModalQuestion) return;
    const keyToReset = activeModalQuestion.key;
    const type = activeModalQuestion.type;
    const target = Math.max(0, activeModalQuestion.question.time - 10);
    triggeredKeysSessionRef.current.delete(keyToReset);
    setActiveModalQuestion(null);
    if (type === 'video') {
      seekVideoTo(target);
      playVideo();
    } else if (explainAudioRef.current) {
      explainAudioRef.current.currentTime = target;
      explainAudioRef.current.play().catch(() => {});
    }
  };

  // Camera logic for Image Homework
  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCamera();
    setImageFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
      window.setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setImageFeedback('تعذر تشغيل الكاميرا. يمكنك رفع الصورة من جهازك بدلاً من ذلك.');
    }
  };

  const captureCameraSnapshot = () => {
    const videoEl = cameraVideoRef.current;
    if (!videoEl) return;
    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedImageData(dataUrl);
    setCapturedImageMime('image/jpeg');
    stopCamera();
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCapturedImageData(reader.result);
        setCapturedImageMime(file.type || 'image/jpeg');
        setImageFeedback(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadImageHomework = async () => {
    if (!lesson || !capturedImageData) return;
    setUploadingImage(true);
    setImageFeedback(null);
    try {
      const res = await saveVideoHomeworkMedia(webhookUrl, {
        studentId: currentStudent?.id || '',
        studentName: currentStudent?.name || '',
        lesson,
        mediaType: 'image',
        base64Data: capturedImageData,
        mimeType: capturedImageMime,
        currentProgress: progress,
      });
      onUpdateProgress(lesson.id, res.updatedProgress);
      setCapturedImageData(null);
      setImageFeedback(
        res.cloudSaved
          ? 'تم رفع صورة الواجب وحفظها في Google Sheets و Drive بنجاح!'
          : 'تم حفظ صورة الواجب محلياً بنجاح (سجل دخولك للمزامنة مع الشيت).'
      );
    } finally {
      setUploadingImage(false);
    }
  };

  // Audio recorder logic for Audio Homework
  const stopRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    setAudioFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setRecordElapsed(0);
      setRecordedAudioBlobUrl(null);
      setRecordedAudioBase64(null);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setRecordedAudioBlobUrl(url);
        setRecordedAudioMime(mime);
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') setRecordedAudioBase64(reader.result);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecording(true);
      const maxSec = lesson?.maxRecordingTime || 60;
      recordTimerRef.current = window.setInterval(() => {
        setRecordElapsed((prev) => {
          const next = prev + 1;
          if (maxSec > 0 && next >= maxSec) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch {
      setAudioFeedback('تعذر الوصول إلى الميكروفون. يمكنك رفع ملف صوتي من جهازك.');
    }
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    setRecordedAudioBlobUrl(blobUrl);
    setRecordedAudioMime(file.type || 'audio/mp3');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRecordedAudioBase64(reader.result);
        setAudioFeedback(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadAudioHomework = async () => {
    if (!lesson || !recordedAudioBase64) return;
    setUploadingAudio(true);
    setAudioFeedback(null);
    try {
      const res = await saveVideoHomeworkMedia(webhookUrl, {
        studentId: currentStudent?.id || '',
        studentName: currentStudent?.name || '',
        lesson,
        mediaType: 'audio',
        base64Data: recordedAudioBase64,
        mimeType: recordedAudioMime,
        currentProgress: progress,
      });
      onUpdateProgress(lesson.id, res.updatedProgress);
      setAudioFeedback(
        res.cloudSaved
          ? 'تم إرسال التسجيل الصوتي وحفظه بنجاح!'
          : 'تم حفظ التسجيل الصوتي محلياً بنجاح (سجل دخولك للمزامنة مع الشيت).'
      );
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleFinishLesson = async () => {
    if (!lesson) return;
    if (!allVideoQsAnswered) {
      setCompletionMessage('يرجى مشاهدة الفيديو والإجابة على جميع الأسئلة الزمنية أولاً قبل توثيق الدرس.');
      return;
    }
    setCompleting(true);
    setCompletionMessage(null);
    try {
      const res = await completeVideoLesson(webhookUrl, {
        studentId: currentStudent?.id || '',
        studentName: currentStudent?.name || '',
        lesson,
        currentProgress: progress,
      });
      onUpdateProgress(lesson.id, res.updatedProgress);
      setCompletionMessage(
        res.cloudSaved
          ? 'تم إنهاء الدرس وتوثيق الدرجة في سجل الشيت بنجاح!'
          : 'تم توثيق إتمام الدرس محلياً بنجاح!'
      );
    } finally {
      setCompleting(false);
    }
  };

  if (!lesson) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
        <Film className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="text-lg font-extrabold text-slate-800">لا توجد دروس فيديو متاحة حالياً</h3>
        <button
          type="button"
          onClick={onOpenLessonsModal}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer"
        >
          تحديث الدروس
        </button>
      </div>
    );
  }

  const totalQsCount = lesson.questions.length + lesson.audioQuestions.length;
  const answeredCount = Object.keys(progress.answeredQuestions || {}).length;
  const helperImgUrl = resolveVideoQuestionImage(lesson.image);
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 font-cairo" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="الرئيسية"
          >
            <Home className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenLessonsModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Film className="w-3.5 h-3.5" />
            <span>{tr('video_lessons_btn', 'دروس الفيديو')}</span>
          </button>

          <div className="hidden sm:flex flex-col min-w-0 pr-1">
            <span className="text-[11px] font-bold text-indigo-600 truncate">
              {tr(`video_topic_${lesson.topic}`, lesson.topic)}
            </span>
            <h2 className="text-sm font-extrabold text-slate-900 truncate max-w-md">
              {tr(`video_title_${lesson.id}`, lesson.title)}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!currentStudent && (
            <button
              type="button"
              onClick={onRequestLogin}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>تسجيل لحفظ التقدم</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCorrectionsModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-extrabold cursor-pointer whitespace-nowrap"
          >
            <Award className="w-3.5 h-3.5 text-amber-600" />
            <span>{tr('video_teacher_corrections_btn', 'تصحيح المعلم')}</span>
          </button>

          {totalQsCount > 0 && (
            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 whitespace-nowrap">
              الأسئلة: {answeredCount}/{totalQsCount} • {progress.videoScore}%
            </div>
          )}
        </div>
      </div>

      {/* Mobile Lesson Title */}
      <div className="sm:hidden px-1 space-y-0.5">
        <span className="text-xs font-bold text-indigo-600">
          {tr(`video_topic_${lesson.topic}`, lesson.topic)}
        </span>
        <h2 className="text-base font-extrabold text-slate-900">
          {tr(`video_title_${lesson.id}`, lesson.title)}
        </h2>
      </div>

      {/* Main Video Stage */}
      <div
        ref={stageWrapperRef}
        className="bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-xl flex flex-col"
      >
        {/* Viewport */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          {playable.kind === 'youtube' ? (
            <>
              <div ref={ytMountRef} className="w-full h-full pointer-events-none" />
              {/* Transparent click layer to toggle play/pause cleanly without exposing YouTube overlay */}
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل الفيديو'}
                className="absolute inset-0 w-full h-full bg-transparent flex items-center justify-center cursor-pointer group"
              >
                {!isPlaying && (
                  <span className="w-16 h-16 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                    <Play className="w-7 h-7 fill-white" />
                  </span>
                )}
              </button>
            </>
          ) : playable.kind === 'html5' && playable.src && !useDriveEmbedFallback ? (
            <video
              ref={htmlVideoRef}
              src={playable.src}
              playsInline
              onClick={togglePlayPause}
              onLoadedMetadata={() => {
                if (htmlVideoRef.current) setDuration(htmlVideoRef.current.duration || 0);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => {
                if (playable.embedUrl) setUseDriveEmbedFallback(true);
              }}
              className="w-full h-full object-contain cursor-pointer"
            />
          ) : useDriveEmbedFallback && playable.embedUrl ? (
            <iframe
              src={playable.embedUrl}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
              title={lesson.title}
            />
          ) : (
            <div className="text-slate-400 text-sm font-bold p-6 text-center">
              لا يوجد رابط فيديو صالح لهذا الدرس حالياً.
            </div>
          )}

          {seekNotice && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold shadow-lg flex items-center gap-1.5 max-w-[92%]">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{seekNotice}</span>
            </div>
          )}
        </div>

        {/* Custom Controls Bar (for YouTube & HTML5 video) */}
        {!useDriveEmbedFallback && playable.kind !== 'none' && (
          <div className="bg-slate-900 text-white px-3.5 sm:px-4 py-3 space-y-2.5 border-t border-slate-800">
            {/* Timeline + Timestamp Markers */}
            <div dir="ltr" className="relative h-6 flex items-center">
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-indigo-500 transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Timed Question Pins */}
              {duration > 0 &&
                lesson.questions.map((q, idx) => {
                  const pct = Math.min(99, Math.max(1, (q.time / duration) * 100));
                  const answered = Boolean(progress.answeredQuestions[`vq_${idx}`]);
                  return (
                    <span
                      key={q.id || idx}
                      title={`${q.question} (${formatTime(q.time)})`}
                      style={{ left: `${pct}%` }}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-slate-900 pointer-events-none ${
                        answered ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                  );
                })}

              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                value={Math.floor(currentTime)}
                onChange={(e) => seekVideoTo(Number(e.target.value))}
                aria-label="شريط تقدم الفيديو"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            {/* Control Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors cursor-pointer"
                  title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                </button>

                <button
                  type="button"
                  onClick={() => seekVideoTo(currentTime - 10)}
                  className="px-2.5 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="ترجيع 10 ثوانٍ"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>-10ث</span>
                </button>

                <span className="text-xs font-mono text-slate-300 px-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {isSeekLocked && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-300 font-bold"
                    title="التقديم مقفل حتى إتمام الأسئلة الزمنية"
                  >
                    <Lock className="w-3 h-3" />
                    <span>مقفل للمشاهدة الأولى</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {playable.embedUrl && (
                  <button
                    type="button"
                    onClick={() => setUseDriveEmbedFallback(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>مشغل Drive</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  aria-label="مستوى الصوت"
                  className="w-16 sm:w-20 accent-indigo-500 cursor-pointer"
                />

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  title="ملء الشاشة"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3 Companion Tabs */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-3 gap-1 p-1.5 bg-slate-100 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('study')}
            className={`py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'study'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="truncate">{tr('video_tab_study', 'الدرس والأسئلة')}</span>
          </button>

          {lesson.allowUpload !== 'لا' && (
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'image'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tr('video_tab_image_hw', 'واجب الصورة')}</span>
              {progress.imageLink && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            </button>
          )}

          {lesson.allowRecording !== 'لا' && (
            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`py-2.5 px-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'audio'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span className="truncate">{tr('video_tab_audio_hw', 'الواجب الصوتي')}</span>
              {progress.recordingLink && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            </button>
          )}
        </div>

        {/* Tab Panel */}
        <div className="p-4 sm:p-6 space-y-5">
          {activeTab === 'study' ? (
            <div className="space-y-5">
              {lesson.instruction && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed font-medium">
                  {lesson.instruction}
                </div>
              )}

              {/* Helper Image */}
              {helperImgUrl && (
                <div className="space-y-2">
                  <div className="text-xs font-extrabold text-slate-600">صورة توضيحية للدرس:</div>
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 max-w-md">
                    <img
                      src={helperImgUrl}
                      alt={lesson.title}
                      onClick={() => setZoomedImg(helperImgUrl)}
                      className="w-full max-h-60 object-contain cursor-zoom-in"
                    />
                    <button
                      type="button"
                      onClick={() => setZoomedImg(helperImgUrl)}
                      className="absolute bottom-2 left-2 p-2 rounded-xl bg-slate-900/75 text-white cursor-pointer"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Optional Explanation Audio */}
              {explainAudioCandidates.length > 0 && (
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                  <div className="text-xs font-extrabold text-indigo-900 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-indigo-600" />
                    <span>تسجيل شرح المعلم المرفق بالدرس</span>
                  </div>
                  <audio
                    ref={explainAudioRef}
                    controls
                    src={explainAudioCandidates[explainAudioIdx] || lesson.explainSound}
                    onError={() => {
                      if (explainAudioIdx + 1 < explainAudioCandidates.length) {
                        setExplainAudioIdx((prev) => prev + 1);
                      }
                    }}
                    className="w-full h-10"
                  />
                </div>
              )}

              {/* Timed Questions Summary List */}
              {lesson.questions.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
                    <span>الأسئلة التفاعلية داخل الفيديو ({lesson.questions.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {lesson.questions.map((q, idx) => {
                      const key = `vq_${idx}`;
                      const ans = progress.answeredQuestions[key];
                      const canJump = Boolean(ans) || !isSeekLocked;
                      return (
                        <button
                          key={q.id || idx}
                          type="button"
                          disabled={!canJump}
                          onClick={() => {
                            if (canJump) seekVideoTo(Math.max(0, q.time - 2));
                          }}
                          className={`p-3 rounded-2xl border text-right flex items-center justify-between gap-2 transition-all ${
                            ans
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-white border-slate-200 text-slate-700'
                          } ${canJump ? 'cursor-pointer hover:border-indigo-300' : 'cursor-default opacity-80'}`}
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono font-bold text-indigo-600">
                              {formatTime(q.time)}
                            </div>
                            <div className="text-xs font-bold truncate">{q.question}</div>
                          </div>
                          {ans ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'image' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {lesson.uploadTitle || tr('video_tab_image_hw', 'تسليم واجب الصورة')}
                  </h4>
                  <p className="text-xs text-slate-500">
                    التقط صورة واضحة لواجبك عبر الكاميرا أو اختر صورة من جهازك.
                  </p>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                {!isCameraOpen ? (
                  <button
                    type="button"
                    onClick={() => startCamera(cameraFacing)}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    <Camera className="w-4 h-4" />
                    <span>فتح الكاميرا</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    <X className="w-4 h-4" />
                    <span>إغلاق الكاميرا</span>
                  </button>
                )}

                <label className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer min-h-[42px]">
                  <Upload className="w-4 h-4" />
                  <span>اختيار صورة من الجهاز</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Camera Live Viewport */}
              {isCameraOpen && (
                <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 max-w-lg">
                  <video
                    ref={cameraVideoRef}
                    playsInline
                    muted
                    className="w-full max-h-80 object-contain"
                  />
                  <div className="p-3 bg-slate-900 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const next = cameraFacing === 'environment' ? 'user' : 'environment';
                        setCameraFacing(next);
                        startCamera(next);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <SwitchCamera className="w-4 h-4" />
                      <span>تبديل الكاميرا</span>
                    </button>
                    <button
                      type="button"
                      onClick={captureCameraSnapshot}
                      className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>التقاط الصورة</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Pending Image */}
              {capturedImageData && (
                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-3 max-w-lg">
                  <img
                    src={capturedImageData}
                    alt="معاينة الواجب"
                    className="w-full max-h-64 object-contain rounded-xl bg-white border border-slate-200"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCapturedImageData(null)}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={handleUploadImageHomework}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-70"
                    >
                      {uploadingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{uploadingImage ? 'جاري الرفع...' : 'حفظ وإرسال الصورة'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Previously Uploaded Image */}
              {progress.imageLink && !capturedImageData && (
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 max-w-lg">
                  <div className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تم تسليم صورة الواجب لهذا الدرس</span>
                  </div>
                  <img
                    src={resolveVideoQuestionImage(progress.imageLink) || progress.imageLink}
                    alt="الواجب المسلم"
                    onClick={() =>
                      setZoomedImg(resolveVideoQuestionImage(progress.imageLink) || progress.imageLink!)
                    }
                    className="w-full max-h-56 object-contain rounded-xl bg-white border border-emerald-200 cursor-zoom-in"
                  />
                </div>
              )}

              {imageFeedback && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-900">
                  {imageFeedback}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {tr('video_tab_audio_hw', 'تسجيل الواجب الصوتي')}
                </h4>
                <p className="text-xs text-slate-500">
                  الحد الأقصى للتسجيل: {lesson.maxRecordingTime || 60} ثانية.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    <Mic className="w-4 h-4" />
                    <span>بدء التسجيل الصوتي</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    <Square className="w-4 h-4 fill-rose-500 text-rose-500" />
                    <span>
                      إيقاف التسجيل ({formatTime(recordElapsed)} /{' '}
                      {formatTime(lesson.maxRecordingTime || 60)})
                    </span>
                  </button>
                )}

                <label className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer min-h-[42px]">
                  <Upload className="w-4 h-4" />
                  <span>رفع ملف صوتي</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {recordedAudioBlobUrl && (
                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-3 max-w-lg">
                  <audio controls src={recordedAudioBlobUrl} className="w-full h-10" />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={uploadingAudio || !recordedAudioBase64}
                      onClick={handleUploadAudioHomework}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-70"
                    >
                      {uploadingAudio ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{uploadingAudio ? 'جاري الإرسال...' : 'حفظ وإرسال التسجيل'}</span>
                    </button>
                  </div>
                </div>
              )}

              {progress.recordingLink && !recordedAudioBlobUrl && (
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 max-w-lg">
                  <div className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تم تسليم التسجيل الصوتي لهذا الدرس</span>
                  </div>
                  <audio
                    controls
                    src={
                      resolveVideoAudioAlternatives(progress.recordingLink)[0] || progress.recordingLink
                    }
                    className="w-full h-10"
                  />
                </div>
              )}

              {audioFeedback && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-900">
                  {audioFeedback}
                </div>
              )}
            </div>
          )}

          {/* Bottom Lesson Completion Footer */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-semibold flex items-center gap-2">
              {isCompleted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-800 font-extrabold">
                    تم إتمام هذا الدرس مسبقاً ({progress.videoScore}%)
                  </span>
                </>
              ) : !allVideoQsAnswered ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>أجب عن جميع أسئلة الفيديو الزمنية لتفعيل توثيق الدرس</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>جاهز لإنهاء وتوثيق الدرس في سجلك</span>
                </>
              )}
            </div>

            <button
              type="button"
              disabled={completing}
              onClick={handleFinishLesson}
              className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer min-h-[44px]"
            >
              {completing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{tr('video_complete_btn', 'إنهاء وتوثيق الدرس')}</span>
            </button>
          </div>

          {completionMessage && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm font-bold text-emerald-900">
              {completionMessage}
            </div>
          )}
        </div>
      </div>

      {/* Question Modal Overlay */}
      {activeModalQuestion && (
        <VideoQuestionModal
          question={activeModalQuestion.question}
          showResult={lesson.showResult}
          onSubmit={handleQuestionAnswerSubmit}
          onRewatch={handleRewatchBeforeQuestion}
          onClose={handleCloseQuestionModal}
          t={t}
          currentLang={currentLang}
        />
      )}

      {/* Image Zoom Lightbox */}
      {zoomedImg && (
        <div
          onClick={() => setZoomedImg(null)}
          className="fixed inset-0 z-[120] bg-slate-950/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomedImg}
            alt="صورة مكبرة"
            className="max-w-full max-h-[90dvh] rounded-2xl object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setZoomedImg(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
