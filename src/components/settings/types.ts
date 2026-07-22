import type { Settings } from '../../types';
import type { RefObject } from 'react';
import type { WebdavConfig } from '../../lib/webdav';

// 主题色配置
export const THEME_COLORS = [
  { id: 'panda', name: '熊猫黑', primary: '#1a1a1a', accent: '#ff6b6b', description: '经典熊猫配色' },
  { id: 'ocean', name: '深海蓝', primary: '#0d47a1', accent: '#00bcd4', description: '沉稳专业风格' },
  { id: 'forest', name: '森林绿', primary: '#2e7d32', accent: '#81c784', description: '清新自然风格' },
  { id: 'sunset', name: '落日橙', primary: '#e65100', accent: '#ffb74d', description: '温暖活力风格' },
  { id: 'lavender', name: '薰衣紫', primary: '#7b1fa2', accent: '#ce93d8', description: '优雅浪漫风格' },
];

// 表单数据类型
export interface FormData {
  displayName: string;
  email: string;
  bio: string;
  orderReminder: boolean;
  weeklyReport: boolean;
  avatar: string;
}

// 安全设置数据类型
export interface SecurityFormData {
  email: string;
  password: string;
  oldPassword: string;
}

// WebDAV配置类型
export type { WebdavConfig } from '../../lib/webdav';

// ProfileTab Props
export interface ProfileTabProps {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// NotificationsTab Props
export interface NotificationsTabProps {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  reportFrequency: 'weekly' | 'monthly';
  setReportFrequency: React.Dispatch<React.SetStateAction<'weekly' | 'monthly'>>;
}

// SecurityTab Props
export interface SecurityTabProps {
  securityData: SecurityFormData;
  setSecurityData: React.Dispatch<React.SetStateAction<SecurityFormData>>;
  isSaving: boolean;
  handleSecuritySave: () => void;
  deletionPassword: string;
  setDeletionPassword: React.Dispatch<React.SetStateAction<string>>;
  isDeletingAccount: boolean;
  requestAccountDeletion: () => void;
}

// BackupTab Props
export interface BackupTabProps {
  handleExportData: () => void;
  handleImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importInputRef: RefObject<HTMLInputElement | null>;
  setClearDataConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

// ApiTab Props
export interface ApiTabProps {
  settings: Settings | null;
  isTestingApi: boolean;
  testApiConnection: () => void;
  handleGenerateApiKey: () => void;
  apiKeyConfirm: boolean;
  setApiKeyConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  confirmGenerateApiKey: () => void;
  copyCurlExample: (endpoint: string) => void;
  copyFullConfig: () => void;
  copyToClipboard: (text: string) => void;
}

// ThemeTab Props
export interface ThemeTabProps {
  currentTheme: string;
  setCurrentTheme: React.Dispatch<React.SetStateAction<string>>;
  applyTheme: (themeId: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

// SyncTab Props
export interface SyncTabProps {
  webdavConfig: WebdavConfig;
  setWebdavConfig: React.Dispatch<React.SetStateAction<WebdavConfig>>;
  lastSyncTime: string | null;
  isSyncing: boolean;
  handleSaveWebdavConfig: () => void;
  handleWebdavSync: (direction: 'upload' | 'download') => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

// AboutTab Props
export interface AboutTabProps {
  previewImage: string | null;
  setPreviewImage: React.Dispatch<React.SetStateAction<string | null>>;
}
