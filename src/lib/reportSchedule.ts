// 报告统一按北京时间切换周期，避免浏览器与 NAS/容器时区不同。
export const getCompletedReportPeriod = (type: 'weekly' | 'monthly', now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => Number(parts.find(item => item.type === name)!.value);
  // UTC 仅用于日历运算，不将业务日期再次转换为机器本地时间。
  const boundary = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  if (type === 'weekly') {
    boundary.setUTCDate(boundary.getUTCDate() - (boundary.getUTCDay() || 7) + 1);
  } else {
    boundary.setUTCDate(1);
  }
  const end = new Date(boundary);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(boundary);
  if (type === 'weekly') start.setUTCDate(start.getUTCDate() - 7);
  else start.setUTCMonth(start.getUTCMonth() - 1);
  return { type, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};
