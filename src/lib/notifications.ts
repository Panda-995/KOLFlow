import type { Order, Payment, Settings } from '../types';
import { formatLocalDate, parseLocalDate } from './dateFilter';
import { buildReportAnalyticsLink, parseReportPeriod, type ReportPeriod } from './reportPeriod';

export type BusinessNotification = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger';
  link: string;
  action?: 'retry-report';
};

export type ReportSummary = {
  totalOrders: number;
  completedOrders: number;
  totalIncome: number;
  pendingIncome: number;
  paidPromotionTotal?: number;
};

export type ReportPayload = {
  summary: ReportSummary;
  period?: ReportPeriod;
};

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

export const parseReportPayload = (value: unknown): ReportPayload | null => {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (!payload.summary || typeof payload.summary !== 'object') return null;
  const summary = payload.summary as Record<string, unknown>;
  if (
    !isFiniteNumber(summary.totalOrders)
    || !isFiniteNumber(summary.completedOrders)
    || !isFiniteNumber(summary.totalIncome)
    || !isFiniteNumber(summary.pendingIncome)
  ) {
    return null;
  }

  const normalizedSummary: ReportSummary = {
    totalOrders: summary.totalOrders,
    completedOrders: summary.completedOrders,
    totalIncome: summary.totalIncome,
    pendingIncome: summary.pendingIncome,
  };
  if (isFiniteNumber(summary.paidPromotionTotal)) {
    normalizedSummary.paidPromotionTotal = summary.paidPromotionTotal;
  }

  let period: ReportPeriod | undefined;
  if (payload.period && typeof payload.period === 'object') {
    const rawPeriod = payload.period as Record<string, unknown>;
    const params = new URLSearchParams();
    if (typeof rawPeriod.type === 'string') params.set('period', rawPeriod.type);
    if (typeof rawPeriod.start === 'string') params.set('start', rawPeriod.start);
    if (typeof rawPeriod.end === 'string') params.set('end', rawPeriod.end);
    period = parseReportPeriod(params) || undefined;
  }

  return { summary: normalizedSummary, period };
};

const getReportPeriodKey = (frequency: 'weekly' | 'monthly', now: Date): string => {
  if (frequency === 'monthly') return formatLocalDate(now).slice(0, 7);
  const monday = new Date(now);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return formatLocalDate(monday);
};

export const buildBusinessNotifications = ({
  now,
  orders,
  payments,
  settings,
  dismissedIds,
  reportSummary,
  reportPeriod,
  reportError = false,
}: {
  now: Date;
  orders: Order[];
  payments: Payment[];
  settings: Settings | null;
  dismissedIds: string[];
  reportSummary?: ReportSummary | null;
  reportPeriod?: ReportPeriod;
  reportError?: boolean;
}): BusinessNotification[] => {
  const notifications: BusinessNotification[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  threeDaysFromNow.setHours(23, 59, 59, 999);

  if (settings?.orderReminder !== false) {
    orders.forEach(order => {
      if (order.status === 'completed' || order.status === 'cancelled' || !order.submitDate) return;
      const deadlineDate = parseLocalDate(order.submitDate);
      if (!deadlineDate) return;
      if (deadlineDate < today) {
        notifications.push({
          id: `order-overdue-${order.id}`,
          title: '商单已逾期',
          message: `商单 "${order.title}" 已超过交稿日期 (${order.submitDate})`,
          type: 'danger',
          link: '/orders',
        });
      } else if (deadlineDate <= threeDaysFromNow) {
        notifications.push({
          id: `order-warning-${order.id}`,
          title: '商单即将到期',
          message: `商单 "${order.title}" 将于 ${order.submitDate} 交稿`,
          type: 'warning',
          link: '/orders',
        });
      }
    });
  }

  payments.forEach(payment => {
    const dueDateValue = payment.dueDate || (payment.type === 'pending' ? payment.date : '');
    if (payment.type !== 'pending' || !dueDateValue) return;
    const dueDate = parseLocalDate(dueDateValue);
    if (!dueDate || dueDate >= today) return;
    notifications.push({
      id: `payment-overdue-${payment.id}`,
      title: '账单逾期未收',
      message: `品牌 "${payment.brand}" 的账单 (¥${payment.amount}) 已超过预计收款日期`,
      type: 'danger',
      link: '/billing',
    });
  });

  if (settings?.weeklyReport && reportSummary) {
    const frequency = settings.reportFrequency === 'monthly' ? 'monthly' : 'weekly';
    const periodKey = getReportPeriodKey(frequency, now);
    const promotionMessage = typeof reportSummary.paidPromotionTotal === 'number'
      ? `，推广费 ¥${reportSummary.paidPromotionTotal.toLocaleString()}`
      : '';
    const periodMessage = reportPeriod ? `${reportPeriod.start} 至 ${reportPeriod.end}：` : '';
    notifications.push({
      id: `report-${frequency}-${periodKey}-${settings.id || 'current'}`,
      title: frequency === 'weekly' ? '本周数据汇总已生成' : '本月数据汇总已生成',
      message: `${periodMessage}${reportSummary.completedOrders}/${reportSummary.totalOrders} 个商单已完成，已结算收入 ¥${reportSummary.totalIncome.toLocaleString()}，待收 ¥${reportSummary.pendingIncome.toLocaleString()}${promotionMessage}`,
      type: 'info',
      link: reportPeriod ? buildReportAnalyticsLink(reportPeriod) : '/analytics',
    });
  } else if (settings?.weeklyReport && reportError) {
    const frequency = settings.reportFrequency === 'monthly' ? 'monthly' : 'weekly';
    const periodKey = getReportPeriodKey(frequency, now);
    notifications.push({
      id: `report-error-${frequency}-${periodKey}-${settings.id || 'current'}`,
      title: frequency === 'weekly' ? '本周数据汇总加载失败' : '本月数据汇总加载失败',
      message: '暂时无法获取周期数据，请点击重试',
      type: 'warning',
      link: '/analytics',
      action: 'retry-report',
    });
  }

  return notifications.filter(notification => !dismissedIds.includes(notification.id));
};
