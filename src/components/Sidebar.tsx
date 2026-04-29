import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Receipt, CheckSquare, Users, BarChart3, Settings, FileText, X, PanelLeftClose, PanelLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';

const navItems = [
  { name: '仪表盘', path: '/', icon: LayoutDashboard },
  { name: '商单', path: '/orders', icon: Package, shortcut: 'Ctrl+Alt+N' },
  { name: '账单', path: '/billing', icon: Receipt },
  { name: 'Todo', path: '/todos', icon: CheckSquare, shortcut: 'Ctrl+Alt+T' },
  { name: '品牌', path: '/brands', icon: Users, shortcut: 'Ctrl+Alt+B' },
  { name: '统计', path: '/analytics', icon: BarChart3 },
  { name: '日志', path: '/logs', icon: FileText },
  { name: '设置', path: '/settings', icon: Settings, shortcut: 'Ctrl+Alt+S' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { settings } = useStore();

  return (
    <>
      {/* Mobile sidebar */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 w-[280px] bg-panda-black text-panda-white flex flex-col transform transition-transform duration-300 ease-in-out md:hidden",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-14 flex items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2">
            <div className="font-bold text-xl tracking-tight">
              <span className="text-white">KOL</span>
              <span className="text-white/60">Flow</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-white text-panda-black shadow-md"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon size={22} />
                <span className="font-medium flex-1 text-[15px]">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-white text-panda-black flex items-center justify-center text-sm font-bold overflow-hidden">
              {settings?.avatar ? (
                <img src={settings.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                settings?.displayName?.charAt(0) || '博'
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{settings?.displayName || '博主账号'}</span>
              <span className="text-xs text-gray-500">达人商单流</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside 
        className={clsx(
          "hidden md:flex h-screen bg-panda-black text-panda-white flex-col fixed left-0 top-0 z-20",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "w-[72px]" : "w-[240px]"
        )}
      >
        <div className={clsx(
          "h-20 flex items-center border-b border-white/10 overflow-hidden",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "justify-center px-2" : "justify-between px-4"
        )}>
          <div className={clsx(
            "flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            collapsed ? "opacity-0 scale-75 absolute" : "opacity-100 scale-100"
          )}>
            <div className="font-bold text-xl tracking-tight">
              <span className="text-white">KOL</span>
              <span className="text-white/60">Flow</span>
            </div>
            <div className="text-[10px] text-white/40 tracking-wide mt-0.5">
              达人商单流
            </div>
          </div>
          <div className={clsx(
            "font-bold text-lg tracking-tight text-white transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            collapsed ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute"
          )}>
            KOL
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center rounded-xl overflow-hidden",
                  "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-white text-panda-black shadow-md"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                )}
                title={collapsed ? item.name : undefined}
              >
                <Icon size={20} className="flex-shrink-0" />
                <div className={clsx(
                  "flex items-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapsed ? "w-0 opacity-0" : "flex-1 opacity-100"
                )}>
                  <span className="font-medium flex-1 whitespace-nowrap">{item.name}</span>
                  {item.shortcut && (
                    <span className={clsx(
                      "text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap",
                      isActive
                        ? "text-panda-black/60 bg-white/80"
                        : "text-gray-500 bg-white/10"
                    )}>{item.shortcut}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10">
          {/* Collapse toggle button */}
          <div className={clsx(
            "px-3 py-3 border-b border-white/10",
            collapsed && "flex justify-center"
          )}>
            <button
              onClick={onToggleCollapse}
              className={clsx(
                "w-full p-2 rounded-lg flex items-center gap-2",
                "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white",
                "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                collapsed && "justify-center w-auto"
              )}
              title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            >
              {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
              {!collapsed && <span className="text-xs">收起侧栏</span>}
            </button>
          </div>

          <div className="p-3">
            <div className={clsx(
              "flex items-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              collapsed ? "justify-center" : "gap-3 px-1"
            )}>
              <div 
                className="w-8 h-8 rounded-full bg-white text-panda-black flex items-center justify-center text-sm font-bold overflow-hidden border border-white/20 flex-shrink-0"
                title={collapsed ? settings?.displayName || '博主账号' : undefined}
              >
                {settings?.avatar ? (
                  <img src={settings.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  settings?.displayName?.charAt(0) || '博'
                )}
              </div>
              <div className={clsx(
                "flex flex-col min-w-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                collapsed ? "w-0 opacity-0" : "opacity-100"
              )}>
                <span className="text-sm font-medium truncate">{settings?.displayName || '博主账号'}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}