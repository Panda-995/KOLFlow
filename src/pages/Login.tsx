import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { clsx } from 'clsx';
import { getApiUrl } from '../lib/mobileApi';

type Mode = 'login' | 'register';

export default function Login() {
  const { login, register } = useStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUsers, setIsCheckingUsers] = useState(true);

  useEffect(() => {
    const checkUsers = async () => {
      try {
        const res = await fetch(getApiUrl('/api/auth/check-users'));
        const data = await res.json();
        if (data.hasUsers === false) {
          setMode('register');
        }
      } catch (e) {
        // 忽略错误，保持默认登录界面
      } finally {
        setIsCheckingUsers(false);
      }
    };
    checkUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (mode === 'register') {
      const res = await register(email, password, inviteCode);
      if (!res.success) {
        setError(res.error || '注册失败');
      }
    } else {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || '登录失败');
      }
    }

    setIsLoading(false);
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
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
          <div className="bg-danger/10 text-danger text-sm p-3 rounded-xl mb-6 text-center border border-danger/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-panda-black text-white py-3 mt-2 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
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