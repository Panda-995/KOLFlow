export const ALL_YEARS = 'all';
export const ALL_MONTHS = 'all';

export const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, '0');
  return { value, label: `${index + 1}月` };
});

export const getDateParts = (value?: string | null): { year: string; month: string } | null => {
  if (!value) return null;

  const match = value.match(/^(\d{4})[-/](\d{1,2})/);
  if (match) {
    return {
      year: match[1],
      month: match[2].padStart(2, '0'),
    };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
  };
};

export const matchesYearMonth = (
  value: string | null | undefined,
  year: string,
  month: string,
): boolean => {
  if (year === ALL_YEARS && month === ALL_MONTHS) return true;

  const parts = getDateParts(value);
  if (!parts) return false;

  return (year === ALL_YEARS || parts.year === year) && (month === ALL_MONTHS || parts.month === month);
};

export const getAvailableYears = (dates: Array<string | null | undefined>): string[] => {
  const years = dates
    .map(date => getDateParts(date)?.year)
    .filter((year): year is string => Boolean(year));

  return Array.from(new Set(years)).sort((a, b) => Number(b) - Number(a));
};
