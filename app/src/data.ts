export type ToolId = 'chart' | 'calculator' | 'calendar' | 'journal' | 'expert'
export type CourseId = 'basics' | 'risk' | 'psychology'
export type IconName = 'chart' | 'calculator' | 'calendar' | 'journal' | 'expert'
export interface Tool { id: ToolId; title: string; description: string; category: string; icon: IconName; eyebrow: string }
export const tools: Tool[] = [
  { id: 'chart', title: 'نمودار TradingView', description: 'تحلیل بازار با نمودار و ابزارهای TradingView و داده‌های قابل‌نمایش آن.', category: 'تحلیل بازار', icon: 'chart', eyebrow: 'نمودار تحلیل بازار' },
  { id: 'calculator', title: 'ماشین‌حساب ریسک', description: 'برآورد اندازهٔ موقعیت بر اساس سرمایه، حد ضرر و ریسک انتخابی.', category: 'مدیریت ریسک', icon: 'calculator', eyebrow: 'محاسبهٔ شخصی' },
  { id: 'calendar', title: 'تقویم اقتصادی', description: 'رویدادهای کلیدی اقتصاد را در یک نمای مرتب دنبال کنید.', category: 'تحلیل بازار', icon: 'calendar', eyebrow: 'در حال آماده‌سازی' },
  { id: 'journal', title: 'ژورنال معاملاتی', description: 'معامله‌ها، تصمیم‌ها و الگوهای رفتاری خود را مرور کنید.', category: 'مدیریت عملکرد', icon: 'journal', eyebrow: 'در حال آماده‌سازی' },
  { id: 'expert', title: 'اکسپرت مدیریت سرمایه', description: 'ابزار پیشرفتهٔ کمک به نظم و مدیریت سرمایهٔ معاملاتی.', category: 'مدیریت ریسک', icon: 'expert', eyebrow: 'در حال آماده‌سازی' },
]
