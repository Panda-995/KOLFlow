// File size limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Cache settings
export const CACHE_TTL = 30 * 1000; // 30 seconds

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Date formats
export const DATE_FORMAT = 'yyyy-MM-dd';
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm';

// Notification settings
export const ORDER_DEADLINE_WARNING_DAYS = 3;

// Chart colors
export const CHART_COLORS = ['#09090b', '#27272a', '#52525b', '#a1a1aa', '#d4d4d8', '#71717a'];

// Status colors
export const STATUS_COLORS = {
  completed: '#22c55e',
  in_progress: '#f59e0b',
  cancelled: '#ef4444'
};

// Supported file types
export const SUPPORTED_IMPORT_TYPES = ['.xlsx', '.csv'];
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
