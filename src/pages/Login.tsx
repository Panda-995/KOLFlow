import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { clsx } from 'clsx';
import { Server } from 'lucide-react';
import {
  apiFetch,
  getConnectionHelpMessage,
  getNativeServerUrlError,
  getSavedServerBaseUrl,
  isNativeAppRuntime,
  normalizeServerUrl,
  setServerBaseUrl,
} from '../lib/api';

type Mode = 'login' | 'register';

export default function Login() {
  const { login, register } = useStore();
  const showServerUrlField = isNativeAppRuntime();
  const [mode, setMode] = useState<Mode>('login');
  const [serverUrl, setServerUrl] = useState(() => getSavedServerBaseUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [hasAcceptedPrivacy, setHasAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [isCheckingUsers, setIsCheckingUsers] = useState(() => !isNativeAppRuntime() || !!getSavedServerBaseUrl());

  const checkUsers = async (nextServerUrl = serverUrl, silent = false): Promise<boolean> => {
    try {
      const nativeUrlError = getNativeServerUrlError(nextServerUrl);
      if (nativeUrlError) {
        setIsCheckingUsers(false);
        if (!silent) setError(nativeUrlError);
        return false;
      }

      const normalized = normalizeServerUrl(nextServerUrl);
      if (!normalized && isNativeAppRuntime()) {
        setIsCheckingUsers(false);
        return false;
      }

      setIsCheckingUsers(true);
      const res = await apiFetch(normalized ? `${normalized}/api/auth/check-users` : '/api/auth/check-users');
      if (!res.ok) {
        throw new Error('服务端状态检查失败');
      }
      const data = await res.json();
      if (normalized) {
        setServerBaseUrl(normalized);
        setServerUrl(normalized);
      }
      if (data.hasUsers === false) {
        setMode('register');
      }
      return true;
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : getConnectionHelpMessage(nextServerUrl));
      }
      return false;
    } finally {
      setIsCheckingUsers(false);
    }
  };

  useEffect(() => {
    const savedServerUrl = getSavedServerBaseUrl();
    if (showServerUrlField && !savedServerUrl) {
      setIsCheckingUsers(false);
      return;
    }
    void checkUsers(savedServerUrl, true);
    // 只在登录页首次加载时检查服务端状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!hasAcceptedPrivacy) {
      setError('请先阅读并同意《隐私政策》');
      return;
    }

    setIsLoading(true);

    try {
      const nativeUrlError = getNativeServerUrlError(serverUrl);
      if (nativeUrlError) {
        setError(nativeUrlError);
        return;
      }

      const normalized = normalizeServerUrl(serverUrl);
      if (isNativeAppRuntime()) {
        const healthRes = await apiFetch(`${normalized}/api/health`);
        if (!healthRes.ok) {
          setError(`服务端返回异常状态：${healthRes.status}`);
          return;
        }
      }
      setServerBaseUrl(normalized);

      if (mode === 'register') {
        const res = await register(email, password, inviteCode, hasAcceptedPrivacy);
        if (!res.success) {
          setError(res.error || '注册失败');
        }
      } else {
        const res = await login(email, password, hasAcceptedPrivacy);
        if (!res.success) {
          setError(res.error || '登录失败');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '服务端地址格式不正确');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setNotice('');
  };

  const handleTestServer = async () => {
    setError('');
    setNotice('');
    setIsTestingServer(true);
    try {
      const nativeUrlError = getNativeServerUrlError(serverUrl);
      if (nativeUrlError) {
        setError(nativeUrlError);
        return;
      }

      const normalized = normalizeServerUrl(serverUrl);
      const res = await apiFetch(`${normalized}/api/health`);
      if (!res.ok) {
        setError(`服务端返回异常状态：${res.status}`);
        return;
      }

      setServerBaseUrl(normalized);
      setServerUrl(normalized);
      setNotice('服务端连接成功，可以继续登录');
      await checkUsers(normalized, true);
    } catch {
      setError(getConnectionHelpMessage(serverUrl));
    } finally {
      setIsTestingServer(false);
    }
  };

  if (isCheckingUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/login-bg.png)' }
        }
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-transparent" />
        <div className="relative z-10 text-white/80">正在检查系统状态...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/login-bg.png)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-transparent" />
      
      <div className="card w-full max-w-md p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-panda-black mb-2 tracking-tight">
            <span className="text-panda-black">KOL</span>
            <span className="text-gray-400">Flow</span>
          </h1>
          <p className="text-gray-500 text-sm">
            达人商单流 · 轻松管理每一笔合作
          </p>
          <p className="text-gray-400 text-xs mt-1">
            {mode === 'login' ? '请输入您的账号信息登录' : '请填写信息完成注册'}
          </p>
        </div>

        {/* 模式切换 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={clsx(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all",
              mode === 'login' ? "bg-panda-black text-white shadow-sm" : "text-gray-500 hover:text-panda-black"
            )}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={clsx(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all",
              mode === 'register' ? "bg-panda-black text-white shadow-sm" : "text-gray-500 hover:text-panda-black"
            )}
          >
            注册
          </button>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="bg-danger/10 text-danger text-sm p-3 rounded-xl mb-6 text-center border border-danger/20"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className="bg-success/10 text-success text-sm p-3 rounded-xl mb-6 text-center border border-success/20"
          >
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {showServerUrlField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">服务端地址</label>
              <div className="relative">
                <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  onBlur={() => {
                    if (serverUrl.trim()) void checkUsers(serverUrl);
                  }}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-panda-black focus:bg-white rounded-xl outline-none transition-all text-sm"
                  placeholder="http://10.0.2.2:3000 或 http://192.168.x.x:3000"
                />
              </div>
              <button
                type="button"
                onClick={handleTestServer}
                disabled={isTestingServer}
                className="mt-2 w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-xl text-sm font-medium text-gray-700 transition-colors"
              >
                {isTestingServer ? '正在测试连接...' : '测试服务端连接'}
              </button>
              <p className="text-xs text-gray-400 mt-1">
                模拟器用 10.0.2.2，真机用电脑局域网 IP，不能填 localhost。
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">账号邮箱</label>
            <input
              required
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-panda-black focus:bg-white rounded-xl outline-none transition-all text-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
            <input
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-panda-black focus:bg-white rounded-xl outline-none transition-all text-sm"
              placeholder="请输入密码"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">邀请码</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-panda-black focus:bg-white rounded-xl outline-none transition-all text-sm"
                placeholder="请输入邀请码（必填）"
              />
              <p className="text-xs text-gray-400 mt-1">注册需要邀请码，请联系管理员获取</p>
            </div>
          )}

          <div className="flex items-start gap-3">
            <input
              id="privacy-consent"
              name="privacyConsent"
              type="checkbox"
              checked={hasAcceptedPrivacy}
              onChange={e => {
                setHasAcceptedPrivacy(e.target.checked);
                if (e.target.checked && error === '请先阅读并同意《隐私政策》') {
                  setError('');
                }
              }}
              aria-describedby="privacy-consent-description"
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 accent-panda-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black focus-visible:ring-offset-2"
            />
            <p id="privacy-consent-description" className="text-xs leading-5 text-gray-600">
              <label htmlFor="privacy-consent" className="cursor-pointer">
                我已阅读并同意
              </label>
              <a
                href="/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="阅读 KOLFlow 隐私政策（在新窗口打开）"
                className="mx-1 font-medium text-panda-black underline underline-offset-2 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black focus-visible:ring-offset-2"
              >
                《隐私政策》
              </a>
              ，了解个人信息的收集、使用与保护方式。
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || !hasAcceptedPrivacy}
            className="w-full bg-panda-black text-white py-3 mt-2 rounded-xl font-medium hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-panda-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading
              ? (mode === 'login' ? '登录中...' : '注册中...')
              : (mode === 'login' ? '登录' : '注册')
            }
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          {mode === 'login' ? (
            <p>
              还没有账号？
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-panda-black hover:underline ml-1 font-medium"
              >
                立即注册
              </button>
            </p>
          ) : (
            <p>
              已有账号？
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-panda-black hover:underline ml-1 font-medium"
              >
                立即登录
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
