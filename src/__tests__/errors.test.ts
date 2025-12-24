import {
    MongoConnectorError,
    ConnectionError,
    ValidationError,
    InvalidObjectIdError,
    DuplicateKeyError,
    DocumentNotFoundError
} from '../errors';

describe('Error Classes', () => {
    describe('MongoConnectorError', () => {
        it('should have correct name and code', () => {
            const error = new MongoConnectorError('Test error', 'TEST_CODE');
            expect(error.name).toBe('MongoConnectorError');
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test error');
        });

        it('should be instanceof Error', () => {
            const error = new MongoConnectorError('Test error', 'TEST_CODE');
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(MongoConnectorError);
        });
    });

    describe('ConnectionError', () => {
        it('should extend MongoConnectorError', () => {
            const error = new ConnectionError('Connection failed');
            expect(error).toBeInstanceOf(MongoConnectorError);
            expect(error).toBeInstanceOf(ConnectionError);
            expect(error).toBeInstanceOf(Error);
        });

        it('should have code CONNECTION_ERROR', () => {
            const error = new ConnectionError('Connection failed');
            expect(error.code).toBe('CONNECTION_ERROR');
            expect(error.name).toBe('ConnectionError');
        });

        it('should store uri property', () => {
            const uri = 'mongodb://localhost:27017';
            const error = new ConnectionError('Connection failed', uri);
            expect(error.uri).toBe(uri);
            expect(error.message).toBe('Connection failed');
        });

        it('should work without uri', () => {
            const error = new ConnectionError('Connection failed');
            expect(error.uri).toBeUndefined();
        });
    });

    describe('ValidationError', () => {
        it('should have code VALIDATION_ERROR', () => {
            const error = new ValidationError('Invalid input');
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.name).toBe('ValidationError');
        });

        it('should store field property', () => {
            const error = new ValidationError('Field is required', 'username');
            expect(error.field).toBe('username');
            expect(error.message).toBe('Field is required');
        });

        it('should work without field', () => {
            const error = new ValidationError('Invalid input');
            expect(error.field).toBeUndefined();
        });
    });

    describe('InvalidObjectIdError', () => {
        it('should extend ValidationError', () => {
            const error = new InvalidObjectIdError('abc123');
            expect(error).toBeInstanceOf(ValidationError);
            expect(error).toBeInstanceOf(MongoConnectorError);
            expect(error).toBeInstanceOf(Error);
        });

        it('should have code INVALID_OBJECT_ID', () => {
            const error = new InvalidObjectIdError('abc123');
            expect(error.code).toBe('INVALID_OBJECT_ID');
            expect(error.name).toBe('InvalidObjectIdError');
        });

        it('should include the invalid value in message', () => {
            const invalidValue = 'not-a-valid-id';
            const error = new InvalidObjectIdError(invalidValue);
            expect(error.message).toContain(invalidValue);
            expect(error.message).toBe('Invalid ObjectId format: "not-a-valid-id"');
            expect(error.value).toBe(invalidValue);
        });

        it('should set field to _id', () => {
            const error = new InvalidObjectIdError('abc123');
            expect(error.field).toBe('_id');
        });
    });

    describe('DuplicateKeyError', () => {
        it('should include collection, field, and value in message', () => {
            const error = new DuplicateKeyError('users', 'email', 'test@example.com');
            expect(error.message).toContain('users');
            expect(error.message).toContain('email');
            expect(error.message).toContain('test@example.com');
            expect(error.message).toBe(
                'Duplicate value for unique field "email" in collection "users": "test@example.com"'
            );
        });

        it('should store collection, field, and value properties', () => {
            const error = new DuplicateKeyError('users', 'email', 'test@example.com');
            expect(error.collection).toBe('users');
            expect(error.field).toBe('email');
            expect(error.value).toBe('test@example.com');
        });

        it('should have code DUPLICATE_KEY', () => {
            const error = new DuplicateKeyError('users', 'email', 'test@example.com');
            expect(error.code).toBe('DUPLICATE_KEY');
            expect(error.name).toBe('DuplicateKeyError');
        });

        it('should handle non-string values', () => {
            const error = new DuplicateKeyError('products', 'sku', 12345);
            expect(error.value).toBe(12345);
            expect(error.message).toContain('12345');
        });
    });

    describe('DocumentNotFoundError', () => {
        it('should include collection and id in message', () => {
            const id = '507f1f77bcf86cd799439011';
            const error = new DocumentNotFoundError('users', id);
            expect(error.message).toContain('users');
            expect(error.message).toContain(id);
            expect(error.message).toBe(
                `Document not found in collection "users" with _id: ${id}`
            );
        });

        it('should store collection and id properties', () => {
            const id = '507f1f77bcf86cd799439011';
            const error = new DocumentNotFoundError('users', id);
            expect(error.collection).toBe('users');
            expect(error.id).toBe(id);
        });

        it('should have code DOCUMENT_NOT_FOUND', () => {
            const error = new DocumentNotFoundError('users', '507f1f77bcf86cd799439011');
            expect(error.code).toBe('DOCUMENT_NOT_FOUND');
            expect(error.name).toBe('DocumentNotFoundError');
        });
    });
});
