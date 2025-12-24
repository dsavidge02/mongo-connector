export class MongoConnectorError extends Error {
    public readonly code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = 'MongoConnectorError';
        this.code = code;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
