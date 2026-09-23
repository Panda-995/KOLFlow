import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Receipt, CheckSquare, Users, BarChart3, Settings, FileText, X, PanelLeftClose, PanelLeft, Archive } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';

const navItems = [
  { name: '仪表盘', path: '/', icon: LayoutDashboard },
  { name: '商单', path: '/orders', icon: Package, shortcut: 'Ctrl+Alt+N' },
  { name: '账单', path: '/billing', icon: Receipt },
  { name: 'Todo', path: '/todos', icon: CheckSquare, shortcut: 'Ctrl+Alt+T' },
  { name: '品牌', path: '/brands', icon: Users, shortcut: 'Ctrl+Alt+B' },
  { name: '资产库', path: '/assets', icon: Archive },
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
      <aside
        inert={!isOpen}
        aria-hidden={!isOpen}
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-[280px] bg-[#1a1a1a] text-[#f5f5f5] flex flex-col transform transition-transform duration-300 ease-in-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 flex items-center justify-between border-b border-[#f5f5f5]/10 px-4">
          <div className="flex items-center gap-2">
            <img src="/app-icon.png" alt="" width={28} height={28} className="rounded-md" />
            <div className="font-bold text-xl tracking-tight">
              <span className="text-[#f5f5f5]">KOL</span>
              <span className="text-[#f5f5f5]/60">Flow</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭侧边栏" className="p-2 text-[#f5f5f5]/60 hover:text-[#f5f5f5] rounded-lg hover:bg-[#f5f5f5]/10 transition-colors">
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
                    ? "bg-[#f5f5f5] text-[#1a1a1a]"
                    : "text-[#f5f5f5]/60 hover:bg-[#f5f5f5]/10 hover:text-[#f5f5f5]"
                )}
              >
                <Icon size={22} />
                <span className="font-medium flex-1 text-[15px]">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#f5f5f5]/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-sm font-bold overflow-hidden">
              {settings?.avatar ? (
                <img src={settings.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                settings?.displayName?.charAt(0) || '博'
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{settings?.displayName || '博主账号'}</span>
              <span className="text-xs text-[#f5f5f5]/60">达人商单流</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside 
        className={clsx(
          "hidden md:flex h-screen bg-[#1a1a1a] text-[#f5f5f5] flex-col fixed left-0 top-0 z-20",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "w-[72px]" : "w-[240px]"
        )}
      >
        <div className={clsx(
          "h-20 flex items-center border-b border-[#f5f5f5]/10 overflow-hidden",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "justify-center px-2" : "justify-between px-4"
        )}>
          <div className={clsx(
            "flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            collapsed ? "opacity-0 scale-75 absolute" : "opacity-100 scale-100"
          )}>
            <div className="font-bold text-xl tracking-tight flex items-center gap-1">
              <img src="/app-icon.png" alt="" width={28} height={28} className="rounded-md mr-1" />
              <span className="text-[#f5f5f5]">KOL</span>
              <span className="text-[#f5f5f5]/60">Flow</span>
            </div>
            <div className="text-[10px] text-[#f5f5f5]/40 tracking-wide mt-0.5">
              达人商单流
            </div>
          </div>
          <div className={clsx(
            "font-bold text-lg tracking-tight text-[#f5f5f5] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            collapsed ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute"
          )}>
            <img src="/app-icon.png" alt="KOLFlow" width={32} height={32} className="rounded-lg" />
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
                    ? "bg-[#f5f5f5] text-[#1a1a1a]"
                    : "text-[#f5f5f5]/60 hover:bg-[#f5f5f5]/10 hover:text-[#f5f5f5]"
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
                        ? "text-[#1a1a1a]/70 bg-[#f5f5f5]/80"
                        : "text-[#f5f5f5]/60 bg-[#f5f5f5]/10"
                    )}>{item.shortcut}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#f5f5f5]/10">
          {/* Collapse toggle button */}
          <div className={clsx(
            "px-3 py-3 border-b border-[#f5f5f5]/10",
            collapsed && "flex justify-center"
          )}>
            <button
              onClick={onToggleCollapse}
              className={clsx(
                "w-full p-2 rounded-lg flex items-center gap-2",
                "bg-[#f5f5f5]/10 hover:bg-[#f5f5f5]/20 text-[#f5f5f5]/70 hover:text-[#f5f5f5]",
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
                className="w-8 h-8 rounded-full bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-sm font-bold overflow-hidden border border-[#f5f5f5]/20 flex-shrink-0"
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
