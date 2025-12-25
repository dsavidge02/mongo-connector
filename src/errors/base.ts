export class MongoConnectorError extends Error {
    public readonly code: string;
    public readonly originalError?: Error;

    constructor(message: string, code: string, originalError?: Error) {
        super(message);
        this.name = 'MongoConnectorError';
        this.code = code;
        this.originalError = originalError;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
