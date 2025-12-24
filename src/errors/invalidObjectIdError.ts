import { ValidationError } from './validationError';

export class InvalidObjectIdError extends ValidationError {
    public readonly code = 'INVALID_OBJECT_ID' as const;

    constructor(public readonly value: string) {
        super(`Invalid ObjectId format: "${value}"`, '_id');
        this.name = 'InvalidObjectIdError';
        Object.defineProperty(this, 'code', {
            value: 'INVALID_OBJECT_ID',
            writable: false,
            enumerable: true,
            configurable: false
        });
    }
}
