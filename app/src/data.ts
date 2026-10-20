export type ToolId = 'chart' | 'expert'
export type CourseId = 'basics' | 'risk' | 'psychology'
export type IconName = 'chart' | 'expert'
export interface Tool { id: ToolId; title: string; description: string; category: string; icon: IconName; eyebrow: string }
export const tools: Tool[] = [
  { id: 'chart', title: 'نمودار TradingView', description: 'تحلیل بازار با نمودار و ابزارهای TradingView و داده‌های قابل‌نمایش آن.', category: 'تحلیل بازار', icon: 'chart', eyebrow: 'نمودار تحلیل بازار' },
  { id: 'expert', title: 'اکسپرت مدیریت سرمایه', description: 'ابزار پیشرفتهٔ کمک به نظم و مدیریت سرمایهٔ معاملاتی.', category: 'مدیریت ریسک', icon: 'expert', eyebrow: 'در حال آماده‌سازی' },
]
