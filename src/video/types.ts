export interface VideoTimestampQuestion {
  id: string;
  slotIndex: number;
  time: number; // Seconds from start of video or audio
  question: string;
  image?: string;
  audio?: string;
  options: string[];
  correctAnswer: string;
}

export interface VideoLesson {
  id: string;
  rowIndex?: number;
  topic: string; // موضوع الدرس
  title: string; // عنوان الدرس
  instruction?: string;
  videoUrl: string; // YouTube or Google Drive or direct MP4 URL
  explainSound?: string; // Optional explanation audio link
  image?: string; // Optional lesson helper image
  showResult: 'نعم' | 'لا';
  allowRecording: 'نعم' | 'لا';
  maxRecordingTime: number; // Seconds (0 = unlimited / default 60s)
  allowUpload: 'نعم' | 'لا';
  uploadTitle?: string;
  retryCount: number; // Allowed retries (0 = locked after completion)
  startDate?: string;
  endDate?: string;
  expireAfterDays?: number | string;
  questions: VideoTimestampQuestion[];
  audioQuestions: VideoTimestampQuestion[];
}

export interface VideoAnsweredQuestionEntry {
  questionKey: string;
  question: string;
  selectedAnswer: string;
  isCorrect: boolean | null;
  type: 'video' | 'audio';
  answeredAt: string;
}

export interface VideoStudentProgress {
  lessonId: string;
  topic: string;
  title: string;
  completed: 'تم' | 'إعادة' | '';
  videoScore: number;
  explainAudioScore: number;
  answeredQuestions: Record<string, VideoAnsweredQuestionEntry>;
  retryResetCount: number; // Remaining retries
  imageLink?: string;
  recordingLink?: string;
  updatedAt?: string;
}

export interface VideoCorrectionEntry {
  lessonTitle: string;
  studentName: string;
  studentId: string;
  imageStatus: string;
  imageScore: string;
  correctedImage: string;
  additionalImages: string[];
  imageDate?: string;
  imageNotes?: string;
  audioStatus: string;
  audioScore: string;
  teacherAudios: string[];
  teacherVideos: string[];
  audioDate?: string;
  audioNotes?: string;
}

export interface VideoStudentSubmissionRow {
  rowIndex?: number;
  studentId: string;
  studentName: string;
  lessonId: string;
  topic: string;
  title: string;
  completed: 'تم' | 'إعادة' | '';
  videoScore: number;
  explainAudioScore: number;
  answeredQuestions: Record<string, VideoAnsweredQuestionEntry>;
  retryResetCount: number;
  imageLink?: string;
  recordingLink?: string;
  updatedAt?: string;
  correction?: VideoCorrectionEntry;
}

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  enabled: boolean;
  welcomeMessage?: string;
  webhookUrl?: string;
}

export interface TelegramStudentLink {
  studentId: string;
  studentName: string;
  chatId: string;
  telegramUsername?: string;
  linkedAt?: string;
  notificationsEnabled: boolean;
}

