import { ValidationError } from '../errors';

/**
 * Asserts that required fields are present and non-null.
 * @throws ValidationError if any field is missing
 */
export function assertRequired<T extends object>(
    obj: T,
    fields: (keyof T)[],
    context: string
): void {
    for (const field of fields) {
        if (obj[field] === undefined || obj[field] === null) {
            throw new ValidationError(
                `${context}: Missing required field "${String(field)}"`,
                String(field)
            );
        }
    }
}

/**
 * Asserts that a value is not empty (for arrays and strings).
 * @throws ValidationError if value is empty
 */
export function assertNotEmpty<T>(
    value: T[] | string,
    name: string,
    context: string
): void {
    if (value.length === 0) {
        throw new ValidationError(
            `${context}: ${name} cannot be empty`,
            name
        );
    }
}
