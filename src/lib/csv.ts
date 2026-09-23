// CSV 单元格转义：值中的双引号需写成两个双引号，整格用引号包裹，
// 否则含引号/逗号/换行的字段会破坏导出文件的结构。
export const csvCell = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  // Spreadsheet programs may evaluate formulas even when the CSV field is quoted.
  // Prefix text formulas with a tab inside the quoted field. Numeric values stay numeric.
  const safe = typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/u.test(str) ? `\t${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
};
