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

export default function App() {
  const { isAuthenticated, darkMode, fetchSettings, logout } = useStore();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

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
        const data = await res.json();
        if (data.hasUsers === false) {
          logout();
          setIsVerifying(false);
          return;
        }

        const verifyRes = await authFetch('/api/auth/verify', { method: 'POST' });
        
        if (verifyRes.ok) {
          await fetchSettings();
        } else {
          logout();
        }
      } catch (e) {
        console.error('Token verification failed:', e);
        logout();
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [fetchSettings, logout]);

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
