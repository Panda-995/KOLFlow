import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import { useStore } from './store/useStore';
import { ToastProvider } from './components/Toast';
import { useEffect, useState } from 'react';
import { apiFetch, authFetch, getServerBaseUrl, isNativeAppRuntime } from './lib/api';

// 路由级代码分割：登录页保持静态导入，业务页面按需加载，
// 避免首屏下载图表库等大依赖（recharts 仅在统计/仪表盘打开时加载）。
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const Billing = lazy(() => import('./pages/Billing'));
const Todos = lazy(() => import('./pages/Todos'));
const Brands = lazy(() => import('./pages/Brands'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const Logs = lazy(() => import('./pages/Logs'));
const Assets = lazy(() => import('./pages/Assets'));

type CheckUsersResponse = {
  hasUsers?: boolean;
};

const readJsonResponse = async <T,>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(text || `请求失败 (${response.status})`);
  }

  return response.json() as Promise<T>;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json() as { error?: string };
      return data.error || `请求失败 (${response.status})`;
    }

    const text = await response.text();
    return text || `请求失败 (${response.status})`;
  } catch {
    return `请求失败 (${response.status})`;
  }
};

export default function App() {
  const { isAuthenticated, logout, setAuthenticated } = useStore();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token || (isNativeAppRuntime() && !getServerBaseUrl())) {
          logout();
          setIsVerifying(false);
          return;
        }

        const res = await apiFetch('/api/auth/check-users');
        if (!res.ok) {
          // 限流或服务暂时故障时保持当前登录状态，避免把在线用户误退回登录页
          console.warn('Token verification skipped:', await readErrorMessage(res));
          setAuthenticated(true);
          return;
        }

        const data = await readJsonResponse<CheckUsersResponse>(res);
        if (data.hasUsers === false) {
          logout();
          setIsVerifying(false);
          return;
        }

        const verifyRes = await authFetch('/api/auth/verify', { method: 'POST' });

        if (verifyRes.ok) {
          setAuthenticated(true);
        } else if (verifyRes.status === 401) {
          logout();
        } else {
          console.warn('Token verification skipped:', await readErrorMessage(verifyRes));
          setAuthenticated(true);
        }
      } catch (e) {
        // 网络异常同理：token 未失效就不清除会话
        console.error('Token verification failed:', e);
        setAuthenticated(true);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [logout, setAuthenticated]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-bg-secondary flex items-center justify-center">
        <div className="text-gray-500">正在加载...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ToastProvider>
      <Router>
        <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<Orders />} />
              <Route path="billing" element={<Billing />} />
              <Route path="todos" element={<Todos />} />
              <Route path="brands" element={<Brands />} />
              <Route path="assets" element={<Assets />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="logs" element={<Logs />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
      </Router>
    </ToastProvider>
  );
}
