import { MongoConnectorError } from './base';

export class OperationFailedError extends MongoConnectorError {
    constructor(
        public readonly operation: string,
        public readonly collection: string,
        originalError?: Error
    ) {
        const message = originalError
            ? `Operation '${operation}' failed on collection '${collection}': ${originalError.message}`
            : `Operation '${operation}' failed on collection '${collection}'`;

        super(message, 'OPERATION_FAILED', originalError);
        this.name = 'OperationFailedError';
    }
}
