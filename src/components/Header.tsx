import { Bell, LogOut, X, Menu, Plus, AlertTriangle, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { clsx } from 'clsx';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const { logout, orders, payments, dismissedNotifications, dismissNotification } = useStore();
  const navigate = useNavigate();

  const notifications = useMemo(() => {
    const notifs: { id: string; title: string; message: string; type: 'warning' | 'danger'; link: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    orders.forEach(order => {
      if (order.status !== 'completed' && order.status !== 'cancelled' && order.submitDate) {
        const deadlineDate = new Date(order.submitDate);
        if (deadlineDate < today) {
          notifs.push({
            id: `order-overdue-${order.id}`,
            title: '商单已逾期',
            message: `商单 "${order.title}" 已超过交稿日期 (${order.submitDate})`,
            type: 'danger',
            link: '/orders'
          });
        } else if (deadlineDate <= threeDaysFromNow) {
          notifs.push({
            id: `order-warning-${order.id}`,
            title: '商单即将到期',
            message: `商单 "${order.title}" 将于 ${order.submitDate} 交稿`,
            type: 'warning',
            link: '/orders'
          });
        }
      }
    });

    payments.forEach(payment => {
      if (payment.type === 'pending' && payment.date) {
        const paymentDate = new Date(payment.date);
        if (paymentDate < today) {
          notifs.push({
            id: `payment-overdue-${payment.id}`,
            title: '账单逾期未收',
            message: `品牌 "${payment.brand}" 的账单 (¥${payment.amount}) 已逾期`,
            type: 'danger',
            link: '/billing'
          });
        }
      }
    });

    return notifs.filter(n => !dismissedNotifications.includes(n.id));
  }, [orders, payments, dismissedNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotificationClick = (link: string) => {
    setShowNotifications(false);
    navigate(link);
  };

  return (
    <header className="h-14 md:h-16 bg-bg-primary border-b border-border/50 flex items-center justify-between px-3 md:px-8 sticky top-0 z-10">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="p-1.5 md:p-2 text-gray-500 hover:text-panda-black transition-colors rounded-lg hover:bg-bg-tertiary md:hidden"
        >
          <Menu size={20} />
        </button>
        
        {/* Mobile brand */}
        <div className="font-bold text-base tracking-tight md:hidden">
          <span className="text-panda-black">KOL</span>
          <span className="text-gray-400">Flow</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-4">
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-500 hover:text-panda-black transition-colors rounded-full hover:bg-bg-tertiary"
          >
            <Bell size={20} />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {/* Desktop dropdown */}
          <div className="hidden md:block">
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-border/50 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2">
                <div className="p-3 border-b border-border/50 bg-gray-50/50 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-panda-black">通知中心</h3>
                  <span className="text-xs text-gray-500">{notifications.length} 条未读</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center">
                      <div className="text-4xl mb-2 opacity-50">🎉</div>
                      暂无新通知
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {notifications.map(notif => (
                        <div key={notif.id} className="p-4 hover:bg-gray-50 transition-colors relative group">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(notif.id);
                            }}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={14} />
                          </button>
                          <div
                            className="cursor-pointer pr-6"
                            onClick={() => handleNotificationClick(notif.link)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={clsx(
                                "w-2 h-2 rounded-full",
                                notif.type === 'danger' ? "bg-danger" : "bg-warning"
                              )}></span>
                              <h4 className="text-sm font-medium text-panda-black">{notif.title}</h4>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed pl-4">
                              {notif.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: just show + button, Desktop: show full button */}
        <Link to="/orders" className="btn-primary py-2 px-3 md:px-4 text-sm flex items-center gap-1 md:gap-2">
          <Plus size={16} />
          <span className="hidden md:inline">新建商单</span>
        </Link>

        <button
          onClick={() => logout()}
          className="p-2 text-gray-400 hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
          title="退出登录"
        >
          <LogOut size={20} />
        </button>
      </div>

      {/* Mobile notification panel - fullscreen overlay */}
      {showNotifications && (
        <div className="md:hidden fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setShowNotifications(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
            </div>

            {/* Header */}
            <div className="px-4 pb-3 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={20} className="text-panda-black" />
                <h3 className="text-base font-bold text-panda-black">通知中心</h3>
              </div>
              <button 
                onClick={() => setShowNotifications(false)}
                className="p-2 text-gray-400 hover:text-panda-black hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[60vh] pb-6">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500 flex flex-col items-center">
                  <div className="text-5xl mb-3 opacity-50">🎉</div>
                  <p className="font-medium">暂无新通知</p>
                  <p className="text-xs text-gray-400 mt-1">所有消息都已查看</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className="p-4 active:bg-gray-50 transition-colors"
                    >
                      <div
                        className="cursor-pointer"
                        onClick={() => handleNotificationClick(notif.link)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                            notif.type === 'danger' ? "bg-danger/10" : "bg-warning/10"
                          )}>
                            {notif.type === 'danger' ? (
                              <AlertTriangle size={20} className="text-danger" />
                            ) : (
                              <Clock size={20} className="text-warning" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pr-8">
                            <h4 className="text-sm font-bold text-panda-black mb-1">{notif.title}</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                              {notif.message}
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(notif.id);
                        }}
                        className="mt-3 ml-13 pl-[52px] text-xs text-gray-400 hover:text-danger transition-colors flex items-center gap-1"
                      >
                        <X size={12} />
                        忽略此通知
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
