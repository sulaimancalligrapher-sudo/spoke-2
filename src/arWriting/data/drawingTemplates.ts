import { DrawingTemplate, GuideColor } from '../types/drawing';

export const DRAWING_TEMPLATES: DrawingTemplate[] = [];

export const CALLIGRAPHY_COLORS = [
  { name: 'حبر أسود فحمي', hex: '#0f172a', class: 'bg-slate-900' },
  { name: 'ذهب عيار 24', hex: '#f59e0b', class: 'bg-amber-500' },
  { name: 'أزرق ملكي', hex: '#2563eb', class: 'bg-blue-600' },
  { name: 'أخضر زمردي', hex: '#059669', class: 'bg-emerald-600' },
  { name: 'أحمر قاني', hex: '#dc2626', class: 'bg-red-600' },
  { name: 'بنفسجي أندلسي', hex: '#7c3aed', class: 'bg-purple-600' },
  { name: 'أبيض طباشيري', hex: '#ffffff', class: 'bg-white' },
  { name: 'سماوي نيون', hex: '#06b6d4', class: 'bg-cyan-500' }
];

export const GUIDE_COLORS: { id: GuideColor; name: string; hex: string }[] = [
  { id: 'yellow', name: 'أصفر متوهج', hex: '#facc15' },
  { id: 'green', name: 'أخضر فسفوري', hex: '#4ade80' },
  { id: 'white', name: 'أبيض ناصع', hex: '#ffffff' },
  { id: 'cyan', name: 'سماوي مشرق', hex: '#38bdf8' },
  { id: 'black', name: 'أسود كلاسيكي', hex: '#0f172a' }
];
