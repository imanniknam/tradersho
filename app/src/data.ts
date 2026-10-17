export type ToolId = 'chart' | 'calculator' | 'calendar' | 'journal' | 'expert'
export type CourseId = 'basics' | 'risk' | 'psychology'
export type IconName = 'chart' | 'calculator' | 'calendar' | 'journal' | 'expert'
export interface Tool { id: ToolId; title: string; description: string; category: string; icon: IconName; eyebrow: string }
export const tools: Tool[] = [
  { id: 'chart', title: 'چارت و مرور بازار', description: 'محیط کندلی، تحلیل و Replay؛ با دادهٔ دموی مشخص یا فایل OHLC شخصی.', category: 'تحلیل بازار', icon: 'chart', eyebrow: 'کندل و Replay · نسخهٔ آزمایشی' },
  { id: 'calculator', title: 'ماشین‌حساب ریسک', description: 'برآورد اندازهٔ موقعیت بر اساس سرمایه، حد ضرر و ریسک انتخابی.', category: 'مدیریت ریسک', icon: 'calculator', eyebrow: 'محاسبهٔ شخصی' },
  { id: 'calendar', title: 'تقویم اقتصادی', description: 'رویدادهای کلیدی اقتصاد را در یک نمای مرتب دنبال کنید.', category: 'تحلیل بازار', icon: 'calendar', eyebrow: 'در حال آماده‌سازی' },
  { id: 'journal', title: 'ژورنال معاملاتی', description: 'معامله‌ها، تصمیم‌ها و الگوهای رفتاری خود را مرور کنید.', category: 'مدیریت عملکرد', icon: 'journal', eyebrow: 'در حال آماده‌سازی' },
  { id: 'expert', title: 'اکسپرت مدیریت سرمایه', description: 'ابزار پیشرفتهٔ کمک به نظم و مدیریت سرمایهٔ معاملاتی.', category: 'مدیریت ریسک', icon: 'expert', eyebrow: 'در حال آماده‌سازی' },
]
export const courses: { id: CourseId; title: string; subtitle: string; lessons: number; level: string; tone: string }[] = [
  { id: 'basics', title: 'مبانی بازار فارکس', subtitle: 'از مفاهیم پایه تا خواندن ساختار بازار', lessons: 8, level: 'شروع مسیر', tone: 'indigo' },
  { id: 'risk', title: 'مدیریت سرمایه و ریسک', subtitle: 'پیش از هر معامله، ریسک را بشناسید', lessons: 6, level: 'کاربردی', tone: 'violet' },
  { id: 'psychology', title: 'روان‌شناسی معامله‌گری', subtitle: 'تصمیم‌های آرام‌تر و منظم‌تر', lessons: 5, level: 'پیشرفته', tone: 'orange' },
]
