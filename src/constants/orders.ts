export const ORDER_STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  in_progress: { label: '进行中', color: 'status-in_progress', icon: '🟡' },
  completed: { label: '已完成', color: 'status-completed', icon: '🟢' },
  cancelled: { label: '已取消', color: 'status-cancelled', icon: '🔴' },
};

export const ORDER_TYPE_MAP = {
  paid: { label: '付费', icon: '💵' },
  product_exchange: { label: '置换', icon: '🎁' },
  direct: { label: '直发', icon: '🚀' },
};

export const PLATFORM_ICONS: Record<string, string> = {
  '小红书': '📕',
  '值得买': '🛒',
  '公众号': '💬',
  '小黑盒': '🎮',
  '百家号': '📰',
  '微博': '📝',
  '少数派': '💎',
  '头条': '📱',
  '知乎': '💡',
  'B站': '📺',
  'B 站': '📺',
  '搜狐': '🌐',
  '大鱼号': '🐟',
  'CSDN': '💻',
  '51CTO': '🔧',
  'UC': '🔶',
  '腾讯': '🐧',
  '抖音': '🎵',
  '快手': '⚡',
  '微信公众号': '💬',
  '大众点评': '⭐',
  '淘宝': '🛍️',
  '京东': '📦',
  '拼多多': '🍊',
  '其他': '🔗'
};

export const getPlatformIcon = (platform: string): string => {
  return PLATFORM_ICONS[platform] || '🔗';
};

export const TODO_PRIORITY_CONFIG = {
  high: { bg: 'bg-danger/5', text: 'text-danger', border: 'border-danger', label: '高' },
  medium: { bg: 'bg-warning/5', text: 'text-warning', border: 'border-warning', label: '中' },
  low: { bg: 'bg-info/5', text: 'text-info', border: 'border-info', label: '低' },
};