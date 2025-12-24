import { ObjectId } from 'mongodb';
import { InvalidObjectIdError } from '../errors';

/**
 * Validates and converts a string or ObjectId to ObjectId.
 * @throws InvalidObjectIdError if string is not valid 24-char hex
 */
export function toObjectId(value: string | ObjectId): ObjectId {
    if (value instanceof ObjectId) {
        return value;
    }

    if (typeof value !== 'string') {
        throw new InvalidObjectIdError(String(value));
    }

    // ObjectId is 24 hex characters
    if (!/^[a-fA-F0-9]{24}$/.test(value)) {
        throw new InvalidObjectIdError(value);
    }

    return new ObjectId(value);
}

/**
 * Checks if a value is a valid ObjectId or ObjectId string.
 */
export function isValidObjectId(value: unknown): boolean {
    if (value instanceof ObjectId) return true;
    if (typeof value !== 'string') return false;
    return /^[a-fA-F0-9]{24}$/.test(value);
}
