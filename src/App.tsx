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
import Login from './pages/Login';
import ServerConnect from './pages/ServerConnect';
import { useStore } from './store/useStore';
import { ToastProvider } from './components/Toast';
import { useEffect, useState } from 'react';
import { getBaseUrl } from './lib/mobileApi';

export default function App() {
  const { isAuthenticated, darkMode, fetchSettings, setAuthenticated } = useStore();
  const [isVerifying, setIsVerifying] = useState(true);
  const [showServerConnect, setShowServerConnect] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [capacitorReady, setCapacitorReady] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const checkCapacitor = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (typeof window !== 'undefined' && window.Capacitor) {
        setIsNative(window.Capacitor.isNativePlatform());
        
        const serverUrl = localStorage.getItem('kolflow_server_url');
        if (!serverUrl) {
          setShowServerConnect(true);
          setIsVerifying(false);
          setCapacitorReady(true);
          return;
        }
      }
      setCapacitorReady(true);
    };
    
    checkCapacitor();
  }, []);

  useEffect(() => {
    if (!capacitorReady || showServerConnect) return;

    const verifyToken = async () => {
      const baseUrl = getBaseUrl();
      
      try {
        const checkUrl = baseUrl ? `${baseUrl}/api/auth/check-users` : '/api/auth/check-users';
        const res = await fetch(checkUrl);
        const data = await res.json();
        
        const token = localStorage.getItem('token');
        if (data.hasUsers === false || !token) {
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('userId');
          localStorage.removeItem('token');
          setAuthenticated(false);
          setIsVerifying(false);
          return;
        }

        const verifyUrl = baseUrl ? `${baseUrl}/api/auth/verify` : '/api/auth/verify';
        const verifyRes = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (verifyRes.ok) {
          await fetchSettings();
        } else {
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('userId');
          localStorage.removeItem('token');
          setAuthenticated(false);
        }
      } catch (e) {
        console.error('Token verification failed:', e);
        if (isNative) {
          setShowServerConnect(true);
        } else {
          setAuthenticated(false);
        }
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [capacitorReady, showServerConnect, fetchSettings, setAuthenticated, isNative]);

  if (!capacitorReady || isVerifying) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">正在加载...</div>
      </div>
    );
  }

  if (showServerConnect) {
    return <ServerConnect />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/server-connect" element={<ServerConnect />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="billing" element={<Billing />} />
            <Route path="todos" element={<Todos />} />
            <Route path="brands" element={<Brands />} />
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