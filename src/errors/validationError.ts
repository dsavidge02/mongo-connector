import { MongoConnectorError } from './base';

export class ValidationError extends MongoConnectorError {
    constructor(message: string, public readonly field?: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}
