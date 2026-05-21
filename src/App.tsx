import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Billing from './pages/Billing';
import Todos from './pages/Todos';
import Brands from './pages/Brands';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Assets from './pages/Assets';
import Login from './pages/Login';
import { useStore } from './store/useStore';
import { ToastProvider } from './components/Toast';
import { useEffect, useState } from 'react';
import { apiFetch, authFetch, getServerBaseUrl, isNativeAppRuntime } from './lib/api';

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
  const { isAuthenticated, darkMode, fetchSettings, logout, setAuthenticated } = useStore();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const verifyToken = async () => {
      const showLoginWithoutClearingSession = () => {
        setAuthenticated(false);
      };

      try {
        const token = localStorage.getItem('token');
        if (!token || (isNativeAppRuntime() && !getServerBaseUrl())) {
          logout();
          setIsVerifying(false);
          return;
        }

        const res = await apiFetch('/api/auth/check-users');
        if (!res.ok) {
          console.warn('Token verification skipped:', await readErrorMessage(res));
          showLoginWithoutClearingSession();
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
          await fetchSettings();
        } else if (verifyRes.status === 401) {
          logout();
        } else {
          console.warn('Token verification skipped:', await readErrorMessage(verifyRes));
          showLoginWithoutClearingSession();
        }
      } catch (e) {
        console.error('Token verification failed:', e);
        showLoginWithoutClearingSession();
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [fetchSettings, logout, setAuthenticated]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
