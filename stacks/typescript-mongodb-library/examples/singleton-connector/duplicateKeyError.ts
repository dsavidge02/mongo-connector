import { MongoConnectorError } from './base';

export class DuplicateKeyError extends MongoConnectorError {
    constructor(
        public readonly collection: string,
        public readonly field: string,
        public readonly value: unknown
    ) {
        super(
            `Duplicate value for unique field "${field}" in collection "${collection}": ${JSON.stringify(value)}`,
            'DUPLICATE_KEY'
        );
        this.name = 'DuplicateKeyError';
    }
}
