import { useCallback, useState, useEffect, useRef } from 'react';
import { Save, User, Bell, Shield, Database, Key, Palette, Cloud, Info, LogOut, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { MAX_AVATAR_SIZE } from '../constants';
import { apiFetch, authFetch, getActiveServerUrl } from '../lib/api';
import { formatLocalDate } from '../lib/dateFilter';
import {
  loadWebdavLastSync,
  loadWebdavConfig,
  saveWebdavLastSync,
  saveWebdavConfig,
  uploadWebdavBackup,
  webdavFetch,
} from '../lib/webdav';

// 导入拆分的 Tab 组件
import {
  ProfileTab,
  NotificationsTab,
  SecurityTab,
  BackupTab,
  ApiTab,
  ThemeTab,
  SyncTab,
  AboutTab,
  THEME_COLORS,
  type FormData,
  type SecurityFormData,
  type WebdavConfig,
} from '../components/settings';

type ImportPreview = {
  backupVersion: number | null;
  legacy: boolean;
  counts: Record<string, number>;
  conflicts: { ids: number; orderNos: number; apiKey: number };
  warnings: string[];
};

const IMPORT_COUNT_LABELS: Record<string, string> = {
  orders: '商单',
  brands: '品牌',
  payments: '账单',
  todos: '待办',
  assets: '素材',
  publishLinks: '发布链接',
  paidPromotions: '投放记录',
  comments: '评论',
};

export default function Settings() {
  const { settings, updateSettings, updateSecurity, clearData, logout, setAllData, fetchSettings } = useStore();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [settingsLoading, setSettingsLoading] = useState(!settings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'panda';
  });
  const [formData, setFormData] = useState<FormData>({
    displayName: '',
    email: '',
    bio: '',
    orderReminder: true,
    weeklyReport: false,
    avatar: ''
  });
  const [reportFrequency, setReportFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [securityData, setSecurityData] = useState<SecurityFormData>({
    email: '',
    password: '',
    oldPassword: ''
  });
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>(() => loadWebdavConfig());
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return loadWebdavLastSync();
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const webdavSyncInProgressRef = useRef(false);

  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [apiKeyConfirm, setApiKeyConfirm] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingImportData, setPendingImportData] = useState<Record<string, unknown> | null>(null);
  const [importSource, setImportSource] = useState<'file' | 'webdav'>('file');

  // 测试API连接状态
  const [isTestingApi, setIsTestingApi] = useState(false);

  useEffect(() => {
    if (settings) {
      setSettingsLoading(false);
      setSettingsError(null);
      setFormData({
        displayName: settings.displayName || '',
        email: settings.email || '',
        bio: settings.bio || '',
        orderReminder: settings.orderReminder,
        weeklyReport: settings.weeklyReport,
        avatar: settings.avatar || ''
      });
      setReportFrequency((settings.reportFrequency as 'weekly' | 'monthly') || 'weekly');
      setSecurityData(prev => ({ ...prev, email: settings.email || '' }));
    }
  }, [settings]);

  useEffect(() => {
    if (settings) return;
    let cancelled = false;
    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      try {
        await fetchSettings();
      } catch (error) {
        if (!cancelled) {
          setSettingsError(error instanceof Error ? error.message : '设置加载失败');
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [fetchSettings, settings]);

  const handleRetryLoadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      await fetchSettings();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : '设置加载失败');
      showToast('设置加载失败，请稍后重试', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({ ...formData, reportFrequency });
      showToast('保存成功');
    } catch (error) {
      showToast('保存失败，图片可能过大或网络异常', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSecuritySave = async () => {
    if (!securityData.email) {
      showToast('邮箱不能为空', 'warning');
      return;
    }
    if (securityData.password && !securityData.oldPassword) {
      showToast('修改密码需要输入原密码', 'warning');
      return;
    }
    setIsSaving(true);
    const res = await updateSecurity(securityData.email, securityData.password, securityData.oldPassword);
    setIsSaving(false);
    if (res.success) {
      showToast('安全设置已更新');
      setSecurityData(prev => ({ ...prev, password: '', oldPassword: '' }));
    } else {
      showToast(res.error || '更新失败', 'error');
    }
  };

  const requestAccountDeletion = () => {
    if (!deletionPassword) {
      showToast('请输入当前密码以确认本人操作', 'warning');
      return;
    }
    setDeleteAccountConfirm(true);
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const res = await authFetch('/api/settings/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletionPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '账号注销失败');
      }

      setDeletionPassword('');
      showToast('账号及关联数据已永久删除', 'success');
      logout();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '账号注销失败，请稍后重试', 'error');
      throw error;
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_AVATAR_SIZE) {
        showToast('图片大小不能超过 5MB', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({ ...prev, avatar: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await authFetch('/api/data/export');
      if (!res.ok) {
        showToast('导出失败', 'error');
        return;
      }
      const data = await res.json();
      data.timestamp = new Date().toISOString();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `panda_backup_${formatLocalDate()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('数据导出成功');
    } catch (e) {
      showToast('导出失败', 'error');
    }
  };

  const prepareImportData = useCallback(async (
    data: Record<string, unknown>,
    source: 'file' | 'webdav',
  ) => {
    const response = await authFetch('/api/data/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const preview = await response.json();
    if (!response.ok) {
      throw new Error(preview.error || '导入预检失败');
    }
    setPendingImportData(data);
    setImportPreview(preview as ImportPreview);
    setImportSource(source);
  }, []);

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      await prepareImportData(data, 'file');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入失败：文件格式错误', 'error');
    }
  };

  const closeImportPreview = () => {
    setImportPreview(null);
    setPendingImportData(null);
  };

  const confirmImportData = async () => {
    if (!pendingImportData) return;
    try {
      await setAllData(pendingImportData);
      if (importSource === 'webdav') {
        const now = new Date().toISOString();
        saveWebdavLastSync(now);
        setLastSyncTime(now);
        showToast('数据已从 WebDAV 恢复');
      } else {
        showToast('数据导入成功');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入数据失败', 'error');
      throw error;
    }
  };

  const handleClearData = async () => {
    try {
      await clearData();
      showToast('数据已清空');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空数据失败', 'error');
      throw error;
    }
  };

  // WebDAV 同步功能
  const handleSaveWebdavConfig = () => {
    if (webdavConfig.url && (!webdavConfig.username || !webdavConfig.password)) {
      showToast('请填写完整的 WebDAV 认证信息', 'warning');
      return;
    }
    saveWebdavConfig(webdavConfig);
    showToast('WebDAV 配置已保存');
  };

  const handleWebdavSync = useCallback(async (
    direction: 'upload' | 'download',
    options: { silent?: boolean } = {},
  ): Promise<boolean> => {
    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      if (!options.silent) {
        showToast('请先配置 WebDAV 连接信息', 'warning');
      }
      return false;
    }

    if (webdavSyncInProgressRef.current) {
      return false;
    }

    webdavSyncInProgressRef.current = true;
    setIsSyncing(true);
    try {
      if (direction === 'upload') {
        const syncedAt = await uploadWebdavBackup(webdavConfig);
        setLastSyncTime(syncedAt);
        if (!options.silent) {
          showToast('数据已同步到 WebDAV');
        }
        return true;
      } else {
        // 从 WebDAV 下载
        const response = await webdavFetch(webdavConfig, { method: 'GET' });

        if (response.ok) {
          const remoteData = await response.json();
          await prepareImportData(remoteData, 'webdav');
          return true;
        } else if (response.status === 404) {
          showToast('WebDAV 上暂无备份文件', 'warning');
          return false;
        } else {
          throw new Error(`下载失败: ${response.status}`);
        }
      }
    } catch (error: any) {
      console.error('WebDAV sync error:', error);
      if (!options.silent) {
        showToast(`同步失败: ${error.message || '网络错误'}`, 'error');
      }
      return false;
    } finally {
      webdavSyncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [prepareImportData, showToast, webdavConfig.password, webdavConfig.url, webdavConfig.username]);

  const handleGenerateApiKey = async () => {
    setApiKeyConfirm(true);
  };

  const confirmGenerateApiKey = async () => {
    try {
      const newKey = await useStore.getState().generateApiKey();
      if (newKey) {
        showToast('API Key 已生成');
      } else {
        showToast('API Key 生成失败，请稍后重试', 'error');
      }
    } catch (error) {
      showToast('API Key 生成过程中发生错误', 'error');
    }
  };

  // 测试API连接
  const testApiConnection = async () => {
    if (!settings?.apiKey) {
      showToast('请先生成 API Key', 'warning');
      return;
    }
    setIsTestingApi(true);
    try {
      const response = await apiFetch(`/api/external/statistics?token=${settings.apiKey}`);
      if (response.ok) {
        const data = await response.json();
        showToast(`连接成功！共 ${data.orders?.total || 0} 个商单`, 'success');
      } else {
        showToast('API Key 无效或已过期', 'error');
      }
    } catch (error) {
      showToast('连接失败，请检查网络', 'error');
    } finally {
      setIsTestingApi(false);
    }
  };

  // 复制curl示例
  const copyCurlExample = (endpoint: string) => {
    const baseUrl = getActiveServerUrl();
    const key = settings?.apiKey || 'YOUR_API_KEY';
    const curl = `curl "${baseUrl}${endpoint}?token=${key}"`;
    copyToClipboard(curl);
    showToast('已复制 curl 命令');
  };

  // 复制完整配置
  const copyFullConfig = () => {
    const serverUrl = getActiveServerUrl();
    const config = `服务器地址: ${serverUrl}
API Key: ${settings?.apiKey || '尚未生成'}

# 使用示例
curl "${serverUrl}/api/external/orders?token=${settings?.apiKey || 'YOUR_KEY'}"`;
    copyToClipboard(config);
    showToast('已复制配置信息');
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      showToast('已复制到剪贴板');
    } catch (error) {
      console.error('Copy error:', error);
      showToast('复制失败，请手动复制', 'error');
    }
  };

  // 应用主题色
  const applyTheme = (themeId: string) => {
    const theme = THEME_COLORS.find(t => t.id === themeId);
    if (!theme) return;

    // 更新 CSS 变量
    document.documentElement.style.setProperty('--color-panda-black', theme.primary);
    document.documentElement.style.setProperty('--color-accent', theme.accent);

    // 保存到 localStorage
    localStorage.setItem('theme', themeId);
    setCurrentTheme(themeId);
    showToast(`已应用「${theme.name}」主题`);
  };

  // 初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'panda';
    const theme = THEME_COLORS.find(t => t.id === savedTheme);
    if (theme) {
      document.documentElement.style.setProperty('--color-panda-black', theme.primary);
      document.documentElement.style.setProperty('--color-accent', theme.accent);
    }
  }, []);

  if (!settings) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-panda-black">系统设置</h1>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 text-danger hover:bg-danger/10 px-4 py-2 rounded-xl transition-colors font-medium"
          >
            <LogOut size={18} />
            退出
          </button>
        </div>
        <div className="card-pixel p-8 flex flex-col items-center justify-center text-center min-h-[260px]">
          {settingsLoading ? (
            <>
              <div className="w-10 h-10 border-2 border-panda-black border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-500">正在加载设置...</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
                <Info size={22} />
              </div>
              <p className="font-medium text-panda-black mb-2">设置加载失败</p>
              <p className="text-sm text-gray-500 mb-4">{settingsError || '请检查服务端连接或重新登录。'}</p>
              <button
                onClick={handleRetryLoadSettings}
                className="btn-sketch flex items-center gap-2"
              >
                <RefreshCw size={16} />
                重新加载
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-panda-black">系统设置</h1>
        <div className="flex items-center gap-3">
          {activeTab !== 'backup' && activeTab !== 'security' && activeTab !== 'api' && activeTab !== 'about' && (
            <button onClick={handleSave} disabled={isSaving} className="btn-sketch flex items-center gap-2 disabled:opacity-50">
              <Save size={18} />
              <span>{isSaving ? '保存中...' : '保存更改'}</span>
            </button>
          )}
          <button 
            onClick={() => logout()}
            className="flex items-center gap-2 text-danger hover:bg-danger/10 px-4 py-2 rounded-xl transition-colors font-medium"
          >
            <LogOut size={18} />
            退出
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* 左侧导航 */}
        <div className="w-full md:w-64 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'profile' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <User size={18} />
            个人资料
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'notifications' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Bell size={18} />
            通知设置
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'security' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Shield size={18} />
            账号安全
          </button>
          <button 
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'backup' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Database size={18} />
            数据管理
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'api' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Key size={18} />
            API 设置
          </button>
          <button
            onClick={() => setActiveTab('theme')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'theme' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Palette size={18} />
            主题外观
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'sync' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Cloud size={18} />
            云端同步
          </button>
          <button 
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'about' ? 'bg-white shadow-sm border border-border/50 text-panda-black font-medium' : 'text-gray-500 hover:bg-white hover:text-panda-black'}`}
          >
            <Info size={18} />
            关于项目
          </button>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <ProfileTab 
              formData={formData}
              setFormData={setFormData}
              fileInputRef={fileInputRef}
              handleAvatarChange={handleAvatarChange}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab
              formData={formData}
              setFormData={setFormData}
              reportFrequency={reportFrequency}
              setReportFrequency={setReportFrequency}
            />
          )}

          {activeTab === 'security' && (
            <SecurityTab
              securityData={securityData}
              setSecurityData={setSecurityData}
              isSaving={isSaving}
              handleSecuritySave={handleSecuritySave}
              deletionPassword={deletionPassword}
              setDeletionPassword={setDeletionPassword}
              isDeletingAccount={isDeletingAccount}
              requestAccountDeletion={requestAccountDeletion}
            />
          )}

          {activeTab === 'backup' && (
            <BackupTab
              handleExportData={handleExportData}
              handleImportData={handleImportData}
              importInputRef={importInputRef}
              setClearDataConfirm={setClearDataConfirm}
            />
          )}

          {activeTab === 'api' && (
            <ApiTab
              settings={settings}
              isTestingApi={isTestingApi}
              testApiConnection={testApiConnection}
              handleGenerateApiKey={handleGenerateApiKey}
              apiKeyConfirm={apiKeyConfirm}
              setApiKeyConfirm={setApiKeyConfirm}
              confirmGenerateApiKey={confirmGenerateApiKey}
              copyCurlExample={copyCurlExample}
              copyFullConfig={copyFullConfig}
              copyToClipboard={copyToClipboard}
            />
          )}

          {activeTab === 'theme' && (
            <ThemeTab
              currentTheme={currentTheme}
              setCurrentTheme={setCurrentTheme}
              applyTheme={applyTheme}
              showToast={showToast}
            />
          )}

          {activeTab === 'sync' && (
            <SyncTab
              webdavConfig={webdavConfig}
              setWebdavConfig={setWebdavConfig}
              lastSyncTime={lastSyncTime}
              isSyncing={isSyncing}
              handleSaveWebdavConfig={handleSaveWebdavConfig}
              handleWebdavSync={handleWebdavSync}
              showToast={showToast}
            />
          )}

          {activeTab === 'about' && (
            <AboutTab
              previewImage={previewImage}
              setPreviewImage={setPreviewImage}
            />
          )}
        </div>
      </div>

      {/* 确认弹窗 */}
      <ConfirmDialog
        isOpen={clearDataConfirm}
        onClose={() => setClearDataConfirm(false)}
        onConfirm={handleClearData}
        title="确认清空所有数据"
        message="此操作不可逆，将删除所有商单、品牌、财务和待办数据。确定要清空吗？"
        confirmText="确认清空"
        type="danger"
      />

      <ConfirmDialog
        isOpen={Boolean(importPreview && pendingImportData)}
        onClose={closeImportPreview}
        onConfirm={confirmImportData}
        title={importSource === 'webdav' ? '确认恢复数据' : '确认导入数据'}
        message={importPreview ? [
          '此操作将覆盖当前数据。',
          `预检结果：${Object.entries(importPreview.counts)
            .filter(([, count]) => count > 0)
            .map(([name, count]) => `${IMPORT_COUNT_LABELS[name] || name} ${count} 条`)
            .join('、') || '无业务记录'}。`,
          importPreview.warnings.join('；'),
        ].filter(Boolean).join(' ') : ''}
        confirmText={importSource === 'webdav' ? '确认恢复' : '确认导入'}
        type="warning"
      />

      <ConfirmDialog
        isOpen={deleteAccountConfirm}
        onClose={() => setDeleteAccountConfirm(false)}
        onConfirm={handleDeleteAccount}
        title="确认永久注销账号"
        message="此操作不可撤销。当前账号及其商单、品牌、账单、待办、素材、日志和设置等全部关联数据都将永久删除。"
        confirmText="永久注销"
        type="danger"
      />
    </div>
  );
}
