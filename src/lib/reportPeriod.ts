import { formatLocalDate, parseLocalDate } from './dateFilter';

export type ReportFrequency = 'weekly' | 'monthly';

export type ReportPeriod = {
  type: ReportFrequency;
  start: string;
  end: string;
};

const getDateOnly = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const leadingDate = value.match(/^(\d{4}-\d{2}-\d{2})/i)?.[1];
  if (leadingDate && parseLocalDate(leadingDate)) return leadingDate;

  const parsed = parseLocalDate(value);
  return parsed ? formatLocalDate(parsed) : null;
};

export const parseReportPeriod = (
  input: string | URLSearchParams,
): ReportPeriod | null => {
  const params = typeof input === 'string'
    ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
    : input;
  const type = params.get('period');
  const start = getDateOnly(params.get('start'));
  const end = getDateOnly(params.get('end'));

  if ((type !== 'weekly' && type !== 'monthly') || !start || !end || start > end) {
    return null;
  }

  return { type, start, end };
};

export const buildReportAnalyticsLink = (period: ReportPeriod): string => {
  const params = new URLSearchParams({
    period: period.type,
    start: period.start,
    end: period.end,
  });
  return `/analytics?${params.toString()}`;
};

export const isDateInReportPeriod = (
  value: string | null | undefined,
  period: ReportPeriod | null,
): boolean => {
  if (!period) return false;
  const date = getDateOnly(value);
  return Boolean(date && date >= period.start && date <= period.end);
};
