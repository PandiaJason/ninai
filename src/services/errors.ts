export type AppErrorCode =
    | 'VALIDATION'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'AUTH'
    | 'UNKNOWN';

export class AppError extends Error {
    code: AppErrorCode;

    constructor(code: AppErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'AppError';
    }
}

export function toErrorMessage(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Something went wrong. Please try again.';
}
