import { DuplicateKeyError } from './duplicateKeyError';

/**
 * Parses MongoDB duplicate key error to extract field and value.
 *
 * @param err - The error object from MongoDB
 * @param collectionName - The name of the collection where the error occurred
 * @returns DuplicateKeyError if the error is a duplicate key error (code 11000), null otherwise
 */
export function parseDuplicateKeyError(
    err: unknown,
    collectionName: string
): DuplicateKeyError | null {
    if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
    ) {
        // MongoDB duplicate key error format:
        // "E11000 duplicate key error collection: db.collection index: field_1 dup key: { field: "value" }"
        const message = 'message' in err && typeof err.message === 'string' ? err.message : '';
        const fieldMatch = message.match(/index: (\w+)_/);
        const valueMatch = message.match(/dup key: \{ (\w+): (.+) \}/);

        const field = fieldMatch?.[1] || valueMatch?.[1] || 'unknown';
        const value = valueMatch?.[2] || 'unknown';

        return new DuplicateKeyError(collectionName, field, value);
    }
    return null;
}

/**
 * Extracts field name and value from a MongoDB WriteError for duplicate key errors.
 *
 * MongoDB provides duplicate key information in two ways:
 * 1. Via errInfo.keyPattern and errInfo.keyValue (MongoDB server ≥4.0, driver ≥4.1.2)
 * 2. Via errmsg parsing (fallback for older versions or edge cases)
 *
 * @param writeError - The WriteError object from MongoDB bulk write operation
 * @returns Object containing extracted field name and value
 */
export function extractDuplicateKeyFieldInfo(writeError: {
    errInfo?: unknown;
    errmsg?: string;
}): { fieldName: string; fieldValue: string } {
    let fieldName = 'unknown';
    let fieldValue = 'unknown';

    // Try to extract field info from errInfo (modern MongoDB servers)
    if (writeError?.errInfo) {
        const errInfo = writeError.errInfo;

        // Extract field name from keyPattern
        if (
            typeof errInfo === 'object' &&
            errInfo !== null &&
            'keyPattern' in errInfo &&
            typeof errInfo.keyPattern === 'object' &&
            errInfo.keyPattern !== null
        ) {
            fieldName = Object.keys(errInfo.keyPattern)[0] || 'unknown';
        }

        // Extract field value from keyValue
        if (
            typeof errInfo === 'object' &&
            errInfo !== null &&
            'keyValue' in errInfo &&
            typeof errInfo.keyValue === 'object' &&
            errInfo.keyValue !== null &&
            fieldName in errInfo.keyValue
        ) {
            const value = (errInfo.keyValue as Record<string, unknown>)[fieldName];
            fieldValue = value !== undefined ? String(value) : 'unknown';
        }
    }

    // Fallback: parse from error message if errInfo doesn't have the info
    if (fieldName === 'unknown' && writeError?.errmsg) {
        const match = writeError.errmsg.match(/index: (\w+)_/);
        if (match) {
            fieldName = match[1];
        }
    }

    return { fieldName, fieldValue };
}
