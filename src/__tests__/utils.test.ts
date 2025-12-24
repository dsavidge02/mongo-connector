import { ObjectId } from 'mongodb';
import { toObjectId, isValidObjectId, assertRequired, assertNotEmpty, withRetry } from '../utils';
import { InvalidObjectIdError, ValidationError } from '../errors';

describe('toObjectId', () => {
    it('should convert valid 24-char hex string to ObjectId', () => {
        const hexString = '507f1f77bcf86cd799439011';
        const result = toObjectId(hexString);
        expect(result).toBeInstanceOf(ObjectId);
        expect(result.toHexString()).toBe(hexString);
    });

    it('should return same ObjectId if already ObjectId instance', () => {
        const objectId = new ObjectId();
        const result = toObjectId(objectId);
        expect(result).toBe(objectId);
    });

    it('should throw InvalidObjectIdError for 23-char string', () => {
        const shortString = '507f1f77bcf86cd79943901';
        expect(() => toObjectId(shortString)).toThrow(InvalidObjectIdError);
        expect(() => toObjectId(shortString)).toThrow(`Invalid ObjectId format: "${shortString}"`);
    });

    it('should throw InvalidObjectIdError for 25-char string', () => {
        const longString = '507f1f77bcf86cd7994390111';
        expect(() => toObjectId(longString)).toThrow(InvalidObjectIdError);
        expect(() => toObjectId(longString)).toThrow(`Invalid ObjectId format: "${longString}"`);
    });

    it('should throw InvalidObjectIdError for non-hex characters', () => {
        const invalidString = '507f1f77bcf86cd799439xyz';
        expect(() => toObjectId(invalidString)).toThrow(InvalidObjectIdError);
        expect(() => toObjectId(invalidString)).toThrow(`Invalid ObjectId format: "${invalidString}"`);
    });

    it('should throw InvalidObjectIdError for empty string', () => {
        const emptyString = '';
        expect(() => toObjectId(emptyString)).toThrow(InvalidObjectIdError);
        expect(() => toObjectId(emptyString)).toThrow(`Invalid ObjectId format: "${emptyString}"`);
    });

    it('should include the invalid value in error message', () => {
        const invalidValue = 'bad-id';
        try {
            toObjectId(invalidValue);
            fail('Should have thrown InvalidObjectIdError');
        } catch (error) {
            expect(error).toBeInstanceOf(InvalidObjectIdError);
            const err = error as InvalidObjectIdError;
            expect(err.message).toContain(invalidValue);
            expect(err.value).toBe(invalidValue);
        }
    });
});

describe('isValidObjectId', () => {
    it('should return true for valid ObjectId instance', () => {
        const objectId = new ObjectId();
        expect(isValidObjectId(objectId)).toBe(true);
    });

    it('should return true for valid 24-char hex string', () => {
        const hexString = '507f1f77bcf86cd799439011';
        expect(isValidObjectId(hexString)).toBe(true);
    });

    it('should return false for invalid string', () => {
        expect(isValidObjectId('invalid')).toBe(false);
        expect(isValidObjectId('507f1f77bcf86cd799439xyz')).toBe(false);
        expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false);
    });

    it('should return false for non-string values', () => {
        expect(isValidObjectId(123)).toBe(false);
        expect(isValidObjectId(null)).toBe(false);
        expect(isValidObjectId(undefined)).toBe(false);
        expect(isValidObjectId({})).toBe(false);
        expect(isValidObjectId([])).toBe(false);
    });
});

describe('assertRequired', () => {
    interface TestObject {
        name: string;
        age: number;
        email?: string;
    }

    it('should not throw when all fields are present', () => {
        const obj: TestObject = { name: 'John', age: 30, email: 'john@example.com' };
        expect(() => assertRequired(obj, ['name', 'age'], 'Test')).not.toThrow();
    });

    it('should throw ValidationError when field is undefined', () => {
        const obj: Partial<TestObject> = { name: 'John' };
        expect(() => assertRequired(obj as TestObject, ['name', 'age'], 'Test')).toThrow(ValidationError);
        expect(() => assertRequired(obj as TestObject, ['name', 'age'], 'Test'))
            .toThrow('Test: Missing required field "age"');
    });

    it('should throw ValidationError when field is null', () => {
        const obj = { name: 'John', age: null };
        expect(() => assertRequired(obj as any, ['name', 'age'], 'Test')).toThrow(ValidationError);
        expect(() => assertRequired(obj as any, ['name', 'age'], 'Test'))
            .toThrow('Test: Missing required field "age"');
    });

    it('should include field name and context in error message', () => {
        const obj: Partial<TestObject> = { name: 'John' };
        try {
            assertRequired(obj as TestObject, ['age'], 'createUser');
            fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            const err = error as ValidationError;
            expect(err.message).toContain('createUser');
            expect(err.message).toContain('age');
            expect(err.field).toBe('age');
        }
    });
});

describe('assertNotEmpty', () => {
    it('should not throw for non-empty array', () => {
        const arr = [1, 2, 3];
        expect(() => assertNotEmpty(arr, 'items', 'Test')).not.toThrow();
    });

    it('should throw ValidationError for empty array', () => {
        const arr: number[] = [];
        expect(() => assertNotEmpty(arr, 'items', 'Test')).toThrow(ValidationError);
        expect(() => assertNotEmpty(arr, 'items', 'Test'))
            .toThrow('Test: items cannot be empty');
    });

    it('should not throw for non-empty string', () => {
        const str = 'hello';
        expect(() => assertNotEmpty(str, 'name', 'Test')).not.toThrow();
    });

    it('should throw ValidationError for empty string', () => {
        const str = '';
        expect(() => assertNotEmpty(str, 'name', 'Test')).toThrow(ValidationError);
        expect(() => assertNotEmpty(str, 'name', 'Test'))
            .toThrow('Test: name cannot be empty');
    });
});

describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
        const mockFn = jest.fn().mockResolvedValue('success');
        const result = await withRetry(mockFn);

        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should succeed on second attempt after first failure', async () => {
        const mockFn = jest.fn()
            .mockRejectedValueOnce(new Error('First attempt failed'))
            .mockResolvedValueOnce('success');

        const result = await withRetry(mockFn);

        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw after maxAttempts failures', async () => {
        const error = new Error('Persistent failure');
        const mockFn = jest.fn().mockRejectedValue(error);

        await expect(withRetry(mockFn, { maxAttempts: 3 })).rejects.toThrow('Persistent failure');
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff (100ms, 200ms, 400ms)', async () => {
        const mockFn = jest.fn()
            .mockRejectedValueOnce(new Error('Attempt 1'))
            .mockRejectedValueOnce(new Error('Attempt 2'))
            .mockRejectedValueOnce(new Error('Attempt 3'));

        const startTime = Date.now();

        try {
            await withRetry(mockFn, { maxAttempts: 3, baseDelayMs: 100 });
        } catch (error) {
            // Expected to fail
        }

        const elapsedTime = Date.now() - startTime;

        // Should have delays of 100ms + 200ms = 300ms minimum
        // Allow some margin for test execution
        expect(elapsedTime).toBeGreaterThanOrEqual(250);
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelayMs cap', async () => {
        const mockFn = jest.fn()
            .mockRejectedValueOnce(new Error('Attempt 1'))
            .mockRejectedValueOnce(new Error('Attempt 2'))
            .mockRejectedValueOnce(new Error('Attempt 3'));

        const startTime = Date.now();

        try {
            await withRetry(mockFn, {
                maxAttempts: 3,
                baseDelayMs: 1000,
                maxDelayMs: 100
            });
        } catch (error) {
            // Expected to fail
        }

        const elapsedTime = Date.now() - startTime;

        // Should cap each delay at 100ms, so total delay should be ~200ms (100ms + 100ms)
        // Allow margin for test execution
        expect(elapsedTime).toBeLessThan(500);
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should use default options when not provided', async () => {
        const mockFn = jest.fn()
            .mockRejectedValueOnce(new Error('Attempt 1'))
            .mockRejectedValueOnce(new Error('Attempt 2'))
            .mockRejectedValueOnce(new Error('Attempt 3'));

        await expect(withRetry(mockFn)).rejects.toThrow();

        // Default maxAttempts is 3
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should work with async operations that return objects', async () => {
        const mockData = { id: 1, name: 'Test' };
        const mockFn = jest.fn()
            .mockRejectedValueOnce(new Error('First attempt failed'))
            .mockResolvedValueOnce(mockData);

        const result = await withRetry(mockFn);

        expect(result).toEqual(mockData);
        expect(mockFn).toHaveBeenCalledTimes(2);
    });
});
