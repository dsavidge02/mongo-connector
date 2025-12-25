export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000
};

/**
 * Executes an async function with exponential backoff retry.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (attempt === opts.maxAttempts) {
                break;
            }

            const delay = Math.min(
                opts.baseDelayMs * Math.pow(2, attempt - 1),
                opts.maxDelayMs
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}
