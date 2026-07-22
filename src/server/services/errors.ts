export class ApiError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'ApiError';
  }
}

export const getApiErrorStatus = (error: unknown): number => error instanceof ApiError ? error.status : 500;

export const getApiErrorMessage = (error: unknown, fallback: string): string => (
  error instanceof ApiError ? error.message : fallback
);
