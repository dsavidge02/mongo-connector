import { MongoConnectorError } from './base';

export class DocumentNotFoundError extends MongoConnectorError {
    constructor(
        public readonly collection: string,
        public readonly id: string
    ) {
        super(
            `Document not found in collection "${collection}" with _id: ${id}`,
            'DOCUMENT_NOT_FOUND'
        );
        this.name = 'DocumentNotFoundError';
    }
}
