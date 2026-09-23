import { Suspense, useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useStore } from '../store/useStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { clsx } from 'clsx';
import { useWebdavAutoSync } from '../hooks/useWebdavAutoSync';

export default function Layout() {
  useWebdavAutoSync();
  // 业务列表由对应页面按需加载，首屏只取设置和仪表盘汇总。
  const { fetchSettings } = useStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState(false);

  const loadInitialData = async () => {
    setInitialLoadError(false);
    try {
      await fetchSettings();
    } catch {
      // 部分 action 会弹具体错误提示；这里统一标记首屏加载失败供重试
      setInitialLoadError(true);
    }
  };

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 键盘快捷键（三组合键，避免冲突）
  // 快捷键直达对应页面的新建表单（目标页监听 ?new=1 参数）
  useKeyboardShortcuts([
    { key: 'n', ctrlKey: true, altKey: true, action: () => navigate('/orders?new=1'), description: '新建商单' },
    { key: 'b', ctrlKey: true, altKey: true, action: () => navigate('/brands?new=1'), description: '新建品牌' },
    { key: 't', ctrlKey: true, altKey: true, action: () => navigate('/todos?new=1'), description: '新建待办' },
    { key: 's', ctrlKey: true, altKey: true, action: () => navigate('/settings'), description: '设置' },
  ]);

  return (
    <div className="min-h-screen flex relative">
      {/* Background Image */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat -z-10"
        style={{ backgroundImage: 'url(/kolflow_dashboard_bg_v4.webp)' }}
      />
      <div className="fixed inset-0 bg-panda-white/80 -z-10" />
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/45 z-30 md:hidden"
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
        "flex-1 min-w-0 flex flex-col min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "ml-0",
        sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[240px]"
      )}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        {initialLoadError && (
          <div className="mx-3 md:mx-8 mt-3 flex items-center justify-between gap-3 border-2 border-danger/30 bg-danger/10 px-4 py-2.5" role="alert">
            <span className="text-xs md:text-sm text-danger font-medium">部分数据加载失败，当前显示可能不完整。</span>
            <button
              type="button"
              onClick={loadInitialData}
              className="flex-shrink-0 px-3 py-1.5 text-xs md:text-sm font-medium text-danger border border-danger/40 hover:bg-danger/10 transition-colors"
            >
              重新加载
            </button>
          </div>
        )}
        <main className="flex-1 min-w-0 p-3 md:p-8 overflow-auto safe-area-top">
          {/* 路由级懒加载：切页时仅替换内容区，保留侧栏/头部/背景 */}
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );
}
