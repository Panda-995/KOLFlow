import { useState, useEffect, useRef } from 'react';
import { Save, User, Bell, Shield, Database, Key, Palette, Cloud, Info, LogOut } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { MAX_AVATAR_SIZE } from '../constants';

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

export default function Settings() {
  const { settings, updateSettings, updateSecurity, clearData, logout, setAllData } = useStore();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');
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
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>({
    url: '',
    username: '',
    password: '',
    syncInterval: '0' // 0=手动, 1=每小时, 24=每天, 168=每周
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('lastWebdavSync');
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [webdavRestoreConfirm, setWebdavRestoreConfirm] = useState(false);
  const [apiKeyConfirm, setApiKeyConfirm] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 测试API连接状态
  const [isTestingApi, setIsTestingApi] = useState(false);

  // 加载 WebDAV 配置
  useEffect(() => {
    const savedConfig = localStorage.getItem('webdavConfig');
    if (savedConfig) {
      setWebdavConfig(JSON.parse(savedConfig));
    }
  }, []);

  useEffect(() => {
    if (settings) {
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(formData);
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
      const token = localStorage.getItem('token');
      const res = await fetch('/api/data/export', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
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
      link.setAttribute('download', `panda_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('数据导出成功');
    } catch (e) {
      showToast('导出失败', 'error');
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (window.confirm('导入数据将覆盖当前所有数据，确定继续吗？')) {
          try {
            await setAllData(data);
            showToast('数据导入成功');
            window.location.reload();
          } catch (importError) {
            showToast(importError instanceof Error ? importError.message : '导入数据失败', 'error');
          }
        }
      } catch (error) {
        showToast('导入失败：文件格式错误', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleClearData = async () => {
    try {
      await clearData();
      showToast('数据已清空');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空数据失败', 'error');
    }
  };

  // WebDAV 同步功能
  const handleSaveWebdavConfig = () => {
    if (webdavConfig.url && (!webdavConfig.username || !webdavConfig.password)) {
      showToast('请填写完整的 WebDAV 认证信息', 'warning');
      return;
    }
    localStorage.setItem('webdavConfig', JSON.stringify(webdavConfig));
    showToast('WebDAV 配置已保存');
  };

  const handleWebdavSync = async (direction: 'upload' | 'download') => {
    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      showToast('请先配置 WebDAV 连接信息', 'warning');
      return;
    }

    setIsSyncing(true);
    try {
      const auth = btoa(`${webdavConfig.username}:${webdavConfig.password}`);
      const fileName = 'kolflow_backup.json';
      const webdavUrl = webdavConfig.url.endsWith('/') ? webdavConfig.url : `${webdavConfig.url}/`;
      const fileUrl = `${webdavUrl}${fileName}`;

      if (direction === 'upload') {
        // 从 API 获取完整数据（包括发布链接）
        const token = localStorage.getItem('token');
        const exportRes = await fetch('/api/data/export', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!exportRes.ok) {
          throw new Error('获取导出数据失败');
        }
        const data = await exportRes.json();
        data.timestamp = new Date().toISOString();

        // 上传到 WebDAV
        const response = await fetch(fileUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data, null, 2)
        });

        if (response.ok || response.status === 201 || response.status === 204) {
          const now = new Date().toISOString();
          localStorage.setItem('lastWebdavSync', now);
          setLastSyncTime(now);
          showToast('数据已同步到 WebDAV');
        } else {
          throw new Error(`上传失败: ${response.status}`);
        }
      } else {
        // 从 WebDAV 下载
        const response = await fetch(fileUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`
          }
        });

        if (response.ok) {
          const remoteData = await response.json();
          // 存储 remoteData 以便后续确认
          (window as any)._webdavRestoreData = remoteData;
          setWebdavRestoreConfirm(true);
        } else if (response.status === 404) {
          showToast('WebDAV 上暂无备份文件', 'warning');
        } else {
          throw new Error(`下载失败: ${response.status}`);
        }
      }
    } catch (error: any) {
      console.error('WebDAV sync error:', error);
      showToast(`同步失败: ${error.message || '网络错误'}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

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
      const response = await fetch(`/api/external/statistics?token=${settings.apiKey}`);
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
    const baseUrl = window.location.origin;
    const key = settings?.apiKey || 'YOUR_API_KEY';
    const curl = `curl "${baseUrl}${endpoint}?token=${key}"`;
    copyToClipboard(curl);
    showToast('已复制 curl 命令');
  };

  // 复制完整配置
  const copyFullConfig = () => {
    const config = `服务器地址: ${window.location.origin}
API Key: ${settings?.apiKey || '尚未生成'}

# 使用示例
curl "${window.location.origin}/api/external/orders?token=${settings?.apiKey || 'YOUR_KEY'}"`;
    copyToClipboard(config);
    showToast('已复制配置信息');
  };

  const confirmWebdavRestore = async () => {
    const remoteData = (window as any)._webdavRestoreData;
    if (remoteData) {
      try {
        await setAllData(remoteData);
        const now = new Date().toISOString();
        localStorage.setItem('lastWebdavSync', now);
        setLastSyncTime(now);
        showToast('数据已从 WebDAV 恢复');
        window.location.reload();
      } catch (error) {
        showToast(error instanceof Error ? error.message : '恢复数据失败', 'error');
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, 99999);
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        showToast('已复制到剪贴板');
      } else {
        showToast('复制失败，请手动复制', 'error');
      }
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

  if (!settings) return null;

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
              showToast={showToast}
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
              setWebdavRestoreConfirm={setWebdavRestoreConfirm}
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
        isOpen={webdavRestoreConfirm}
        onClose={() => setWebdavRestoreConfirm(false)}
        onConfirm={confirmWebdavRestore}
        title="确认恢复数据"
        message="从 WebDAV 恢复数据将覆盖当前所有数据，确定继续吗？"
        confirmText="确认恢复"
        type="warning"
      />
    </div>
  );
}