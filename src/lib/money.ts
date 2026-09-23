// 金额工具：把金额按"分"归一后运算，避免浮点累加漂移
// （例：0.1 + 0.2 = 0.30000000000000004）。

export const toCents = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
};

export const fromCents = (cents: number): number => cents / 100;

/** 单值归一：结果最多两位小数 */
export const roundMoney = (value: unknown): number => fromCents(toCents(value));

/** 求和：逐项转分相加，结果转回元 */
export const sumMoney = <T>(items: readonly T[], getValue: (item: T) => unknown): number => {
  let cents = 0;
  for (const item of items) cents += toCents(getValue(item));
  return fromCents(cents);
};

/** 金额格式化为两位小数字符串（用于导出与需要精确展示的位置） */
export const formatMoney = (value: unknown): string => (toCents(value) / 100).toFixed(2);
