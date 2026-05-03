import { create } from 'zustand';

type Language = 'zh' | 'en';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<string, string> = {
  '新建商单': 'New Order',
  '退出登录': 'Logout',
  '通知中心': 'Notifications',
  '暂无新通知': 'No new notifications',
  '商单已逾期': 'Order Overdue',
  '商单即将到期': 'Order Due Soon',
  '账单逾期未收': 'Bill Overdue',
  '所有消息都已查看': 'All messages read',
  '忽略此通知': 'Dismiss',
  '条未读': 'unread',
  '设置': 'Settings',
  '仪表盘': 'Dashboard',
  '商单': 'Orders',
  '账单': 'Billing',
  '待办': 'Todos',
  '品牌': 'Brands',
  '数据': 'Analytics',
  '日志': 'Logs',
  '保存': 'Save',
  '取消': 'Cancel',
  '删除': 'Delete',
  '编辑': 'Edit',
  '添加': 'Add',
  '搜索': 'Search',
  '加载中...': 'Loading...',
};

export const useLanguage = create<LanguageState>((set, get) => ({
  language: (localStorage.getItem('language') as Language) || 'zh',
  
  setLanguage: (lang) => {
    localStorage.setItem('language', lang);
    set({ language: lang });
  },
  
  t: (key: string) => {
    const { language } = get();
    if (language === 'en' && translations[key]) {
      return translations[key];
    }
    return key;
  },
}));