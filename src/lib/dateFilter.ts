export const ALL_YEARS = 'all';
export const ALL_MONTHS = 'all';

export const formatLocalDate = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
      ? parsed
      : null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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

  const date = parseLocalDate(value);
  if (!date) return null;

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
