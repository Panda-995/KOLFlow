import { useState, useEffect, useRef } from 'react';
import { Save, User, Bell, Shield, Database, Upload, Key, Copy, RefreshCw, LogOut, Download, AlertTriangle, Palette, Check, Cloud, RefreshCw as Sync, Settings2, Info, Heart, ExternalLink, X, ZoomIn } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { clsx } from 'clsx';
import { MAX_AVATAR_SIZE } from '../constants';
import { getApiUrl, getBaseUrl } from '../lib/mobileApi';

// 主题色配置
const THEME_COLORS = [
  { id: 'panda', name: '熊猫黑', primary: '#1a1a1a', accent: '#ff6b6b', description: '经典熊猫配色' },
  { id: 'ocean', name: '深海蓝', primary: '#0d47a1', accent: '#00bcd4', description: '沉稳专业风格' },
  { id: 'forest', name: '森林绿', primary: '#2e7d32', accent: '#81c784', description: '清新自然风格' },
  { id: 'sunset', name: '落日橙', primary: '#e65100', accent: '#ffb74d', description: '温暖活力风格' },
  { id: 'lavender', name: '薰衣紫', primary: '#7b1fa2', accent: '#ce93d8', description: '优雅浪漫风格' },
];

export default function Settings() {
  const { settings, updateSettings, updateSecurity, orders, brands, payments, todos, clearData, logout, setAllData } = useStore();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'panda';
  });
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    bio: '',
    orderReminder: true,
    weeklyReport: false,
    avatar: ''
  });
  const [reportFrequency, setReportFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [securityData, setSecurityData] = useState({
    email: '',
    password: '',
    oldPassword: ''
  });
  const [webdavConfig, setWebdavConfig] = useState({
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // 确认弹窗状态
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [webdavRestoreConfirm, setWebdavRestoreConfirm] = useState(false);
  const [apiKeyConfirm, setApiKeyConfirm] = useState(false);

  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
      const res = await fetch(getApiUrl('/api/data/export'), {
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
        const exportRes = await fetch(getApiUrl('/api/data/export'), {
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
  const [isTestingApi, setIsTestingApi] = useState(false);
  const testApiConnection = async () => {
    if (!settings?.apiKey) {
      showToast('请先生成 API Key', 'warning');
      return;
    }
    setIsTestingApi(true);
    try {
      const baseUrl = getBaseUrl();
      const apiUrl = baseUrl ? `${baseUrl}/api/external/statistics?token=${settings.apiKey}` : `${window.location.origin}/api/external/statistics?token=${settings.apiKey}`;
      const response = await fetch(apiUrl);
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
      // 优先使用现代API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 备用方案：创建临时textarea
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast('已复制到剪贴板');
    } catch (error) {
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

        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6">个人资料</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-2xl font-bold text-white overflow-hidden border border-border">
                    {formData.avatar ? (
                      <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      formData.displayName.charAt(0) || '博'
                    )}
                  </div>
                  <div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleAvatarChange} 
                    />
                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                      <Upload size={16} />
                      更换头像
                    </button>
                    <p className="text-xs text-gray-400 mt-2">支持 JPG, PNG 格式，建议尺寸 200x200</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-600">显示名称</label>
                    <input 
                      type="text" 
                      value={formData.displayName} 
                      onChange={e => setFormData({...formData, displayName: e.target.value})}
                      className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-600">邮箱地址</label>
                    <input 
                      type="email" 
                      value={formData.email} 
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-gray-600">个人简介</label>
                    <textarea 
                      rows={3} 
                      value={formData.bio} 
                      onChange={e => setFormData({...formData, bio: e.target.value})}
                      className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm resize-none"
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="card-sketch p-6 bg-white">
                <h2 className="text-lg font-bold mb-6">通知设置</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
                    <div>
                      <div className="font-medium text-panda-black">商单即将到期提醒</div>
                      <div className="text-sm text-gray-500">在商单截止日期前3天发送通知</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.orderReminder}
                        onChange={e => setFormData({...formData, orderReminder: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
                    <div>
                      <div className="font-medium text-panda-black">每周数据汇总</div>
                      <div className="text-sm text-gray-500">每周一早上发送上周的收入与商单数据</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.weeklyReport}
                        onChange={e => setFormData({...formData, weeklyReport: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="card-sketch p-6 bg-white">
                <h2 className="text-lg font-bold mb-4">报告设置</h2>
                <div className="space-y-4">
                  <div className="p-4 bg-bg-tertiary rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-panda-black">自动报告频率</div>
                        <div className="text-sm text-gray-500">设置自动生成报告的周期</div>
                      </div>
                      <select
                        value={reportFrequency}
                        onChange={e => setReportFrequency(e.target.value as 'weekly' | 'monthly')}
                        className="px-4 py-2 bg-white border border-border rounded-xl text-sm outline-none focus:border-accent"
                      >
                        <option value="weekly">每周</option>
                        <option value="monthly">每月</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6">账号安全</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-600">登录账号 (邮箱)</label>
                  <input
                    type="email"
                    value={securityData.email}
                    onChange={e => setSecurityData({...securityData, email: e.target.value})}
                    className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-600">原密码</label>
                  <input
                    type="password"
                    value={securityData.oldPassword || ''}
                    onChange={e => setSecurityData({...securityData, oldPassword: e.target.value})}
                    className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                    placeholder="请输入原密码以验证身份"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-600">新密码</label>
                  <input
                    type="password"
                    value={securityData.password}
                    onChange={e => setSecurityData({...securityData, password: e.target.value})}
                    className="w-full px-4 py-2 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                    placeholder="至少6位，包含字母和数字"
                  />
                  <p className="text-xs text-gray-400">密码需至少6位，且包含字母和数字</p>
                </div>
                <div className="pt-2">
                  <button onClick={handleSecuritySave} disabled={isSaving} className="btn-sketch py-2 px-6 disabled:opacity-50">
                    {isSaving ? '保存中...' : '更新账号与密码'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6">数据管理</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button 
                    onClick={handleExportData}
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl hover:border-panda-black hover:bg-gray-50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-panda-black/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Download className="text-panda-black" size={24} />
                    </div>
                    <span className="font-bold text-panda-black">导出备份</span>
                    <span className="text-xs text-gray-500 mt-1">下载所有数据的 JSON 备份</span>
                  </button>

                  <button 
                    onClick={() => importInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl hover:border-accent hover:bg-accent/5 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Upload className="text-accent" size={24} />
                    </div>
                    <span className="font-bold text-panda-black">导入数据</span>
                    <span className="text-xs text-gray-500 mt-1">从备份文件恢复数据</span>
                    <input 
                      type="file" 
                      ref={importInputRef} 
                      onChange={handleImportData} 
                      accept=".json" 
                      className="hidden" 
                    />
                  </button>
                </div>

                <div className="p-4 bg-danger/5 border border-danger/10 rounded-xl flex gap-3">
                  <AlertTriangle className="text-danger shrink-0" size={20} />
                  <div>
                    <h4 className="font-bold text-danger text-sm">危险操作</h4>
                    <p className="text-xs text-danger/80 mt-1">
                      导入数据将完全覆盖您当前的所有商单、品牌、账单和待办事项。此操作不可逆，请在操作前确保已做好备份。
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-border/50">
                  <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
                    <div>
                      <div className="font-medium text-panda-black">清空所有数据</div>
                      <div className="text-sm text-danger">警告：此操作不可逆，将删除所有数据</div>
                    </div>
                    <button onClick={() => setClearDataConfirm(true)} className="px-4 py-2 border border-danger text-danger rounded-xl text-sm font-medium hover:bg-danger/10 transition-colors">
                      清空
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'api' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6">API 设置</h2>
              <div className="space-y-6">
                {/* API Key 管理 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">API Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={settings.apiKey || '尚未生成'}
                      className="flex-1 px-4 py-2 bg-bg-tertiary border border-border rounded-xl outline-none text-sm font-mono text-gray-600"
                    />
                    {settings.apiKey && (
                      <button onClick={() => copyToClipboard(settings.apiKey!)} className="p-2 border border-border rounded-xl text-gray-500 hover:bg-gray-50 transition-colors" title="复制">
                        <Copy size={18} />
                      </button>
                    )}
                    <button
                      onClick={testApiConnection}
                      disabled={isTestingApi || !settings.apiKey}
                      className="px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                      title="测试连接"
                    >
                      {isTestingApi ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                      测试
                    </button>
                    <button onClick={handleGenerateApiKey} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                      <RefreshCw size={16} />
                      {settings.apiKey ? '重新生成' : '生成 Key'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">8字符短Token，用于外部API认证</p>
                </div>

                {/* 服务器地址 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">服务器地址</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={window.location.origin}
                      className="flex-1 px-4 py-2 bg-bg-tertiary border border-border rounded-xl outline-none text-sm font-mono text-gray-600"
                    />
                    <button onClick={() => copyToClipboard(window.location.origin)} className="p-2 border border-border rounded-xl text-gray-500 hover:bg-gray-50 transition-colors" title="复制">
                      <Copy size={18} />
                    </button>
                  </div>
                </div>

                {/* 认证方式说明 */}
                <div className="p-4 bg-accent/5 border border-accent/20 rounded-xl">
                  <h3 className="text-sm font-bold text-panda-black mb-3">认证方式</h3>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium shrink-0">推荐</span>
                      <code className="bg-white px-2 py-1 rounded border">?token=YOUR_KEY</code>
                      <span className="text-gray-400">URL参数，简单快捷</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium shrink-0">Header</span>
                      <code className="bg-white px-2 py-1 rounded border">Authorization: Bearer YOUR_KEY</code>
                    </div>
                  </div>
                </div>

                {/* 快速复制 */}
                <div className="p-4 bg-gray-50 border border-border rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">快速复制配置</span>
                    <button
                      onClick={copyFullConfig}
                      className="px-3 py-1.5 bg-panda-black text-white rounded-lg text-xs font-medium hover:bg-panda-black/90 transition-colors flex items-center gap-1"
                    >
                      <Copy size={14} />
                      复制全部
                    </button>
                  </div>
                  <pre className="text-xs text-gray-500 bg-white p-3 rounded-lg border border-border overflow-x-auto">
{`服务器地址: ${typeof window !== 'undefined' ? window.location.origin : ''}
API Key: ${settings?.apiKey || '尚未生成'}

# 快速测试
curl "${typeof window !== 'undefined' ? window.location.origin : ''}/api/external/statistics?token=${settings?.apiKey || 'YOUR_KEY'}"`}
                  </pre>
                </div>

                {/* curl 示例 */}
                <div className="p-4 bg-gray-50 border border-border rounded-xl">
                  <h3 className="text-sm font-bold text-panda-black mb-3">常用 curl 示例</h3>
                  <div className="space-y-2">
                    {[
                      { name: '获取商单列表', endpoint: '/api/external/orders' },
                      { name: '创建商单', endpoint: '/api/external/orders', method: 'POST' },
                      { name: '获取统计数据', endpoint: '/api/external/statistics' },
                      { name: '导出全部数据', endpoint: '/api/external/export' },
                    ].map((item) => (
                      <div key={item.endpoint} className="flex items-center justify-between p-2 bg-white rounded-lg border border-border">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${item.method === 'POST' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {item.method || 'GET'}
                          </span>
                          <span className="text-xs text-gray-600">{item.name}</span>
                        </div>
                        <button
                          onClick={() => copyCurlExample(item.endpoint)}
                          className="text-xs text-accent hover:underline"
                        >
                          复制命令
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 外部API文档 */}
                <div className="p-4 bg-info/10 border border-info/20 rounded-xl">
                  <h3 className="text-sm font-bold text-info-dark mb-3">外部API接口 <code className="text-xs bg-info/20 px-1.5 py-0.5 rounded">/api/external/*</code></h3>
                  <p className="text-xs text-info-dark/70 mb-4">
                    使用 API Key 认证，支持 URL 参数或 Header 方式
                  </p>

                  <div className="space-y-4">
                    {/* 商单 */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">商单 Orders</h4>
                      <div className="grid gap-1.5">
                        {[
                          ['GET', '/orders', '获取列表'],
                          ['POST', '/orders', '创建商单'],
                          ['PUT', '/orders/:id', '更新商单'],
                          ['DEL', '/orders/:id', '删除商单'],
                        ].map(([method, path, desc]) => (
                          <div key={path} className="flex items-center gap-2 p-1.5 bg-white/50 rounded text-xs">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${method === 'GET' ? 'bg-blue-100 text-blue-700' : method === 'POST' ? 'bg-green-100 text-green-700' : method === 'PUT' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{method}</span>
                            <code className="flex-1">{path}</code>
                            <span className="text-gray-400">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 待办 */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">待办 Todos</h4>
                      <div className="grid gap-1.5">
                        {[
                          ['GET', '/todos', '获取列表'],
                          ['POST', '/todos', '创建待办'],
                          ['PUT', '/todos/:id', '更新待办'],
                        ].map(([method, path, desc]) => (
                          <div key={path} className="flex items-center gap-2 p-1.5 bg-white/50 rounded text-xs">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${method === 'GET' ? 'bg-blue-100 text-blue-700' : method === 'POST' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{method}</span>
                            <code className="flex-1">{path}</code>
                            <span className="text-gray-400">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 品牌 */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">品牌 Brands</h4>
                      <div className="grid gap-1.5">
                        {[
                          ['GET', '/brands', '获取列表'],
                          ['POST', '/brands', '创建品牌'],
                          ['PUT', '/brands/:id', '更新品牌'],
                          ['DEL', '/brands/:id', '删除品牌'],
                        ].map(([method, path, desc]) => (
                          <div key={path} className="flex items-center gap-2 p-1.5 bg-white/50 rounded text-xs">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${method === 'GET' ? 'bg-blue-100 text-blue-700' : method === 'POST' ? 'bg-green-100 text-green-700' : method === 'PUT' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{method}</span>
                            <code className="flex-1">{path}</code>
                            <span className="text-gray-400">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 财务 */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">财务 Payments</h4>
                      <div className="grid gap-1.5">
                        {[
                          ['GET', '/payments', '获取列表'],
                          ['POST', '/payments', '创建账单'],
                          ['PUT', '/payments/:id', '更新账单'],
                          ['DEL', '/payments/:id', '删除账单'],
                        ].map(([method, path, desc]) => (
                          <div key={path} className="flex items-center gap-2 p-1.5 bg-white/50 rounded text-xs">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${method === 'GET' ? 'bg-blue-100 text-blue-700' : method === 'POST' ? 'bg-green-100 text-green-700' : method === 'PUT' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{method}</span>
                            <code className="flex-1">{path}</code>
                            <span className="text-gray-400">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 其他 */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">其他 Others</h4>
                      <div className="grid gap-1.5">
                        {[
                          ['GET', '/statistics', '统计数据'],
                          ['GET', '/settings', '用户设置'],
                          ['GET', '/logs', '操作日志'],
                          ['GET', '/export', '导出数据'],
                        ].map(([method, path, desc]) => (
                          <div key={path} className="flex items-center gap-2 p-1.5 bg-white/50 rounded text-xs">
                            <span className="px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">{method}</span>
                            <code className="flex-1">{path}</code>
                            <span className="text-gray-400">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'theme' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6">主题外观</h2>
              <div className="space-y-6">
                <p className="text-sm text-gray-500">选择您喜欢的主题配色，让系统更符合您的个性风格。</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {THEME_COLORS.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => applyTheme(theme.id)}
                      className={clsx(
                        "relative p-4 rounded-2xl border-2 transition-all hover:scale-[1.02] text-left",
                        currentTheme === theme.id
                          ? "border-accent shadow-lg"
                          : "border-border/50 hover:border-gray-300"
                      )}
                    >
                      {currentTheme === theme.id && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                      )}

                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: theme.primary }}
                        >
                          K
                        </div>
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                          style={{ backgroundColor: theme.accent }}
                        >
                          +
                        </div>
                      </div>

                      <h3 className="font-bold text-panda-black">{theme.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">{theme.description}</p>

                      <div className="flex items-center gap-2 mt-3">
                        <div
                          className="flex-1 h-2 rounded-full"
                          style={{ backgroundColor: theme.primary }}
                        />
                        <div
                          className="flex-1 h-2 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500">
                    💡 提示：主题设置保存在浏览器本地，切换设备后需要重新设置。
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'sync' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6">云端同步</h2>
              <div className="space-y-6">
                <div className="p-4 bg-info/5 border border-info/20 rounded-xl">
                  <div className="flex items-center gap-2 text-info mb-2">
                    <Cloud size={18} />
                    <span className="font-bold">WebDAV 同步</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    通过 WebDAV 协议将数据同步到坚果云、NextCloud 等云存储服务，实现多设备数据同步。
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">WebDAV 服务器地址</label>
                    <input
                      type="url"
                      value={webdavConfig.url}
                      onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
                      className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                      placeholder="https://dav.jianguoyun.com/dav/"
                    />
                    <p className="text-xs text-gray-400">例如：坚果云 https://dav.jianguoyun.com/dav/</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">用户名</label>
                      <input
                        type="text"
                        value={webdavConfig.username}
                        onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                        className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                        placeholder="WebDAV 用户名"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">密码/应用密码</label>
                      <input
                        type="password"
                        value={webdavConfig.password}
                        onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                        className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                        placeholder="WebDAV 密码"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">自动同步周期</label>
                    <select
                      value={webdavConfig.syncInterval}
                      onChange={(e) => setWebdavConfig({ ...webdavConfig, syncInterval: e.target.value })}
                      className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                    >
                      <option value="0">手动同步</option>
                      <option value="1">每小时</option>
                      <option value="24">每天</option>
                      <option value="168">每周</option>
                    </select>
                  </div>

                  {lastSyncTime && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Sync size={14} />
                      上次同步：{new Date(lastSyncTime).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
                  <button
                    onClick={handleSaveWebdavConfig}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Settings2 size={16} />
                    保存配置
                  </button>
                  <button
                    onClick={() => handleWebdavSync('upload')}
                    disabled={isSyncing || !webdavConfig.url}
                    className="btn-sketch flex items-center gap-2 disabled:opacity-50"
                  >
                    <Upload size={16} />
                    {isSyncing ? '同步中...' : '上传备份'}
                  </button>
                  <button
                    onClick={() => handleWebdavSync('download')}
                    disabled={isSyncing || !webdavConfig.url}
                    className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                  >
                    <Download size={16} />
                    恢复数据
                  </button>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl space-y-2">
                  <h4 className="text-sm font-bold text-gray-700">常见 WebDAV 服务配置</h4>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p><strong>坚果云：</strong>https://dav.jianguoyun.com/dav/（需在坚果云设置中创建应用密码）</p>
                    <p><strong>NextCloud：</strong>https://your-domain/remote.php/dav/files/用户名/</p>
                    <p><strong>群晖 NAS：</strong>https://your-nas:5006/（需启用 WebDAV 服务）</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'about' && (
            <div className="card-sketch p-6 bg-white">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Heart size={20} className="text-accent" />
                关于 KOLFlow
              </h2>
              <div className="space-y-6">
                {/* 项目介绍 */}
                <div className="p-6 bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-border/30">
                  <h3 className="text-xl font-bold text-panda-black mb-4 flex items-center gap-2">
                    🐼 KOLFlow
                    <span className="text-sm font-normal text-gray-400">达人商单流管理系统</span>
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    KOLFlow 是一款专为 KOL/达人设计的商单管理系统，帮助您轻松管理每一笔商业合作。
                    从商单创建、进度跟踪到财务结算，让繁琐的商单管理变得简单高效。
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { icon: '📊', title: '仪表盘', desc: '收入统计、月度目标' },
                      { icon: '📦', title: '商单管理', desc: '创建、编辑、状态跟踪' },
                      { icon: '✅', title: '待办日历', desc: '任务管理、日历视图' },
                      { icon: '💰', title: '账单管理', desc: '收支统计、结算状态' },
                    ].map((feature) => (
                      <div key={feature.title} className="p-3 bg-white rounded-xl border border-border/20 text-center">
                        <div className="text-2xl mb-1">{feature.icon}</div>
                        <div className="text-xs font-bold text-panda-black">{feature.title}</div>
                        <div className="text-[10px] text-gray-400">{feature.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-gray-100 rounded-lg">React 19</span>
                    <span className="px-2 py-1 bg-gray-100 rounded-lg">TypeScript</span>
                    <span className="px-2 py-1 bg-gray-100 rounded-lg">Tailwind CSS</span>
                    <span className="px-2 py-1 bg-gray-100 rounded-lg">SQLite</span>
                  </div>
                </div>

                {/* 二维码区域 */}
                <div className="space-y-4">
                  {/* 上方两个方图：小程序和赞赏码 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 bg-white rounded-2xl border-2 border-panda-black/10 hover:border-panda-black/30 transition-colors">
                      <div className="text-center">
                        <div className="inline-block p-3 bg-gray-50 rounded-xl mb-3 relative group cursor-pointer" onClick={() => setPreviewImage('/小程序.jpg')}>
                          <img
                            src="/小程序.jpg"
                            alt="小程序二维码"
                            className="w-32 h-32 object-contain rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <ZoomIn className="text-white" size={24} />
                          </div>
                        </div>
                        <h4 className="font-bold text-panda-black text-sm">微信小程序</h4>
                        <p className="text-xs text-gray-400 mt-1">扫码体验小程序版本</p>
                      </div>
                    </div>
                    <div className="p-5 bg-white rounded-2xl border-2 border-panda-black/10 hover:border-panda-black/30 transition-colors">
                      <div className="text-center">
                        <div className="inline-block p-3 bg-gray-50 rounded-xl mb-3 relative group cursor-pointer" onClick={() => setPreviewImage('/赞赏码.png')}>
                          <img
                            src="/赞赏码.png"
                            alt="赞赏码"
                            className="w-32 h-32 object-contain rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <ZoomIn className="text-white" size={24} />
                          </div>
                        </div>
                        <h4 className="font-bold text-panda-black text-sm">赞赏码</h4>
                        <p className="text-xs text-gray-400 mt-1">感谢您的支持</p>
                      </div>
                    </div>
                  </div>

                  {/* 下方横图：公众号 */}
                  <div className="p-5 bg-white rounded-2xl border-2 border-panda-black/10 hover:border-panda-black/30 transition-colors">
                    <div className="text-center">
                      <div className="inline-block p-3 bg-gray-50 rounded-xl mb-3 relative group cursor-pointer" onClick={() => setPreviewImage('/公众号.png')}>
                        <img
                          src="/公众号.png"
                          alt="微信公众号"
                          className="w-full max-w-md object-contain rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <ZoomIn className="text-white" size={24} />
                        </div>
                      </div>
                      <h4 className="font-bold text-panda-black text-sm">微信公众号</h4>
                      <p className="text-xs text-gray-400 mt-1">关注获取最新动态和教程</p>
                    </div>
                  </div>
                </div>

                {/* 版权信息 */}
                <div className="pt-4 border-t border-border/30 text-center">
                  <p className="text-xs text-gray-400">
                    Made with ❤️ by 熊猫不是猫 QAQ
                  </p>
                  <p className="text-[10px] text-gray-300 mt-1">
                    © 2024 KOLFlow. 本项目仅供个人学习和研究使用。
                  </p>
                </div>
              </div>
            </div>
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

      <ConfirmDialog
        isOpen={apiKeyConfirm}
        onClose={() => setApiKeyConfirm(false)}
        onConfirm={confirmGenerateApiKey}
        title="确认生成新 API Key"
        message="生成新的 API Key 将导致旧的 API Key 失效。确定要继续吗？"
        confirmText="确认生成"
        type="warning"
      />

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            onClick={() => setPreviewImage(null)}
          >
            <X size={24} />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
