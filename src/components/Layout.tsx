import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useStore } from '../store/useStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { clsx } from 'clsx';

export default function Layout() {
  const { fetchOrders, fetchTodos, fetchBrands, fetchPayments, fetchSettings } = useStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchTodos();
    fetchBrands();
    fetchPayments();
    fetchSettings();
  }, [fetchOrders, fetchTodos, fetchBrands, fetchPayments, fetchSettings]);

  // 键盘快捷键（三组合键，避免冲突）
  useKeyboardShortcuts([
    { key: 'n', ctrlKey: true, altKey: true, action: () => navigate('/orders'), description: '新建商单' },
    { key: 'b', ctrlKey: true, altKey: true, action: () => navigate('/brands'), description: '新建品牌' },
    { key: 't', ctrlKey: true, altKey: true, action: () => navigate('/todos'), description: '新建待办' },
    { key: 's', ctrlKey: true, altKey: true, action: () => navigate('/settings'), description: '设置' },
  ]);

  return (
    <div className="min-h-screen flex relative">
      {/* Background Image */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat -z-10"
        style={{ backgroundImage: 'url(/kolflow_dashboard_bg_v4.png)' }}
      />
      <div className="fixed inset-0 bg-white/80 -z-10" />
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className={clsx(
        "flex-1 flex flex-col min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "ml-0",
        sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[240px]"
      )}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-3 md:p-8 overflow-auto safe-area-top">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
