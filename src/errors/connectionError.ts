import { MongoConnectorError } from './base';

export class ConnectionError extends MongoConnectorError {
    constructor(message: string, public readonly uri?: string) {
        super(message, 'CONNECTION_ERROR');
        this.name = 'ConnectionError';
    }
}
