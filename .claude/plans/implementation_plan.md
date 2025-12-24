# MongoDB Connector TypeScript Library - Implementation Plan

**Version**: 2.0.0 (Breaking Changes)  
**Created**: 2024-12-24  
**Status**: Ready for Implementation

---

## Quick Reference

### Commands
```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
npm run build           # Compile TypeScript
```

### File Structure (Target)
```
src/
├── index.ts                    # Public exports
├── mongoConnector.ts           # Main singleton class
├── errors/
│   ├── index.ts               # Export all errors
│   ├── base.ts                # MongoConnectorError base class
│   ├── connectionError.ts     # Connection failures
│   ├── validationError.ts     # Input validation failures
│   ├── invalidObjectIdError.ts # Bad ObjectId format
│   ├── duplicateKeyError.ts   # Unique constraint violation
│   └── documentNotFoundError.ts # Update/delete target missing
├── utils/
│   ├── index.ts               # Export all utilities
│   ├── objectId.ts            # ObjectId validation/conversion
│   └── retry.ts               # Retry logic with backoff
├── types/
│   └── index.ts               # Shared TypeScript interfaces
└── __tests__/
    ├── mongoConnector.test.ts # Main integration tests
    ├── errors.test.ts         # Error class tests
    └── utils.test.ts          # Utility function tests
```

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pattern | Singleton | Single cluster, efficiency priority |
| Return Types | Hybrid | Queries return null, single mutations throw |
| Uniqueness | DB Indexes | Consumer calls `ensureUniqueIndex()` explicitly |
| Logging | Silent | Remove all console.log/error |
| Breaking Changes | Allowed | Version 2.0.0 |
| Transactions | Last Priority | Requires replica set |

---

## Phase Summary

| Phase | Name | Priority | Est. Tests | Status |
|-------|------|----------|------------|--------|
| 1 | Custom Errors | 1 | 12 | ✅ DONE (20 tests) |
| 2 | Input Validation | 2 | 10 | ✅ DONE (25 tests) |
| 3 | Connection Management | 3 | 14 | ✅ DONE (13 tests) |
| 4 | Index Management | 4 | 8 | ✅ DONE (16 tests) |
| 5 | Remove Logging | 5 | 4 | ✅ DONE (6 tests) |
| 6 | Refactor createOne | 6 | 6 | ✅ DONE (5 tests) |
| 7 | Query Enhancements | 7 | 16 | ✅ DONE (17 tests) |
| 8 | Bulk Operations | 8 | 18 | ✅ DONE (20 tests) |
| 9 | Aggregation | 9 | 6 | 🔮 FUTURE |
| 10 | Transactions | 10 | 8 | 🔮 FUTURE |
| 11 | Testing Utilities | 11 | 4 | ✅ DONE (6 tests) |

**Total Estimated Tests for v2.0.0**: ~92
**Actual Tests Completed**: ~138
**Deferred to Future Releases**: ~14

---

## Phase 1: Custom Errors

**Goal**: Create typed error hierarchy for explicit error handling.

### Files to Create

#### `src/errors/base.ts`
```typescript
export class MongoConnectorError extends Error {
    public readonly code: string;
    
    constructor(message: string, code: string) {
        super(message);
        this.name = 'MongoConnectorError';
        this.code = code;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
```

#### `src/errors/connectionError.ts`
```typescript
import { MongoConnectorError } from './base';

export class ConnectionError extends MongoConnectorError {
    constructor(message: string, public readonly uri?: string) {
        super(message, 'CONNECTION_ERROR');
        this.name = 'ConnectionError';
    }
}
```

#### `src/errors/validationError.ts`
```typescript
import { MongoConnectorError } from './base';

export class ValidationError extends MongoConnectorError {
    constructor(message: string, public readonly field?: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}
```

#### `src/errors/invalidObjectIdError.ts`
```typescript
import { ValidationError } from './validationError';

export class InvalidObjectIdError extends ValidationError {
    constructor(public readonly value: string) {
        super(`Invalid ObjectId format: "${value}"`, '_id');
        this.name = 'InvalidObjectIdError';
        this.code = 'INVALID_OBJECT_ID';
    }
}
```

#### `src/errors/duplicateKeyError.ts`
```typescript
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
```

#### `src/errors/documentNotFoundError.ts`
```typescript
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
```

#### `src/errors/index.ts`
```typescript
export { MongoConnectorError } from './base';
export { ConnectionError } from './connectionError';
export { ValidationError } from './validationError';
export { InvalidObjectIdError } from './invalidObjectIdError';
export { DuplicateKeyError } from './duplicateKeyError';
export { DocumentNotFoundError } from './documentNotFoundError';
```

### Tests to Write

#### `src/__tests__/errors.test.ts`
```typescript
// Test checklist:
// ✅ MongoConnectorError has correct name and code
// ✅ MongoConnectorError is instanceof Error
// ✅ ConnectionError extends MongoConnectorError
// ✅ ConnectionError has code 'CONNECTION_ERROR'
// ✅ ConnectionError stores uri property
// ✅ ValidationError has code 'VALIDATION_ERROR'
// ✅ ValidationError stores field property
// ✅ InvalidObjectIdError extends ValidationError
// ✅ InvalidObjectIdError has code 'INVALID_OBJECT_ID'
// ✅ InvalidObjectIdError message includes the invalid value
// ✅ DuplicateKeyError includes collection, field, value in message
// ✅ DocumentNotFoundError includes collection and id in message
```

### Completion Criteria
- [x] All 6 error files created
- [x] Index file exports all errors
- [x] 20 tests written and passing (exceeded requirement of 12)
- [x] Errors can be caught with `instanceof`

---

## Phase 2: Input Validation

**Goal**: Validate inputs before database operations, fail fast with clear errors.

### Files to Create

#### `src/utils/objectId.ts`
```typescript
import { ObjectId } from 'mongodb';
import { InvalidObjectIdError } from '../errors';

/**
 * Validates and converts a string or ObjectId to ObjectId.
 * @throws InvalidObjectIdError if string is not valid 24-char hex
 */
export function toObjectId(value: string | ObjectId): ObjectId {
    if (value instanceof ObjectId) {
        return value;
    }
    
    if (typeof value !== 'string') {
        throw new InvalidObjectIdError(String(value));
    }
    
    // ObjectId is 24 hex characters
    if (!/^[a-fA-F0-9]{24}$/.test(value)) {
        throw new InvalidObjectIdError(value);
    }
    
    return new ObjectId(value);
}

/**
 * Checks if a value is a valid ObjectId or ObjectId string.
 */
export function isValidObjectId(value: unknown): boolean {
    if (value instanceof ObjectId) return true;
    if (typeof value !== 'string') return false;
    return /^[a-fA-F0-9]{24}$/.test(value);
}
```

#### `src/utils/validation.ts`
```typescript
import { ValidationError } from '../errors';

/**
 * Asserts that required fields are present and non-null.
 * @throws ValidationError if any field is missing
 */
export function assertRequired<T extends object>(
    obj: T,
    fields: (keyof T)[],
    context: string
): void {
    for (const field of fields) {
        if (obj[field] === undefined || obj[field] === null) {
            throw new ValidationError(
                `${context}: Missing required field "${String(field)}"`,
                String(field)
            );
        }
    }
}

/**
 * Asserts that a value is not empty (for arrays and strings).
 * @throws ValidationError if value is empty
 */
export function assertNotEmpty<T>(
    value: T[] | string,
    name: string,
    context: string
): void {
    if (value.length === 0) {
        throw new ValidationError(
            `${context}: ${name} cannot be empty`,
            name
        );
    }
}
```

#### `src/utils/index.ts`
```typescript
export { toObjectId, isValidObjectId } from './objectId';
export { assertRequired, assertNotEmpty } from './validation';
```

### Tests to Write

#### `src/__tests__/utils.test.ts`
```typescript
// toObjectId tests:
// ✅ Converts valid 24-char hex string to ObjectId
// ✅ Returns same ObjectId if already ObjectId instance
// ✅ Throws InvalidObjectIdError for 23-char string
// ✅ Throws InvalidObjectIdError for 25-char string
// ✅ Throws InvalidObjectIdError for non-hex characters
// ✅ Throws InvalidObjectIdError for empty string
// ✅ Error message includes the invalid value

// isValidObjectId tests:
// ✅ Returns true for valid ObjectId instance
// ✅ Returns true for valid 24-char hex string
// ✅ Returns false for invalid string
// ✅ Returns false for non-string values

// assertRequired tests:
// ✅ Does not throw when all fields present
// ✅ Throws ValidationError when field is undefined
// ✅ Throws ValidationError when field is null
// ✅ Error message includes field name and context

// assertNotEmpty tests:
// ✅ Does not throw for non-empty array
// ✅ Throws ValidationError for empty array
// ✅ Does not throw for non-empty string
// ✅ Throws ValidationError for empty string
```

### Completion Criteria
- [x] `objectId.ts` and `validation.ts` created
- [x] Index file exports all utilities
- [x] 19 tests written and passing (exceeded requirement of 18)
- [x] Utilities are pure functions (no side effects)

---

## Phase 3: Connection Management

**Goal**: Robust connection handling with state tracking and retry logic.

### Files to Create

#### `src/utils/retry.ts`
```typescript
export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000
};

/**
 * Executes an async function with exponential backoff retry.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            
            if (attempt === opts.maxAttempts) {
                break;
            }
            
            const delay = Math.min(
                opts.baseDelayMs * Math.pow(2, attempt - 1),
                opts.maxDelayMs
            );
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}
```

### Modifications to `src/mongoConnector.ts`

```typescript
// Add imports
import { ConnectionError } from './errors';
import { withRetry, RetryOptions } from './utils/retry';

// Add interface for connect options
export interface ConnectOptions {
    retry?: Partial<RetryOptions>;
    // MongoClientOptions can be added here
}

// Add to class
private connected: boolean = false;

// New method
isConnected(): boolean {
    return this.connected && this.client !== null;
}

// Modify connect method
async connect(
    mongoUri: string, 
    dbName?: string, 
    options: ConnectOptions = {}
): Promise<void> {
    await this.close();
    
    try {
        await withRetry(async () => {
            this.client = new MongoClient(mongoUri);
            await this.client.connect();
        }, options.retry);
        
        this.connected = true;
        
        if (dbName) {
            this.setDB(dbName);
        }
    } catch (err) {
        this.client = null;
        this.connected = false;
        throw new ConnectionError(
            `Failed to connect to MongoDB after retries: ${(err as Error).message}`,
            mongoUri
        );
    }
}

// Modify close method
async close(): Promise<void> {
    if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.connected = false;
    }
}

// Add private helper
private assertConnected(): void {
    if (!this.isConnected()) {
        throw new ConnectionError('MongoClient is not connected. Call connect() first.');
    }
}

// Update setDB to use assertConnected
setDB(dbName: string): void {
    this.assertConnected();
    this.db = this.client!.db(dbName);
}
```

### Tests to Write

```typescript
// Connection state tests:
// ✅ isConnected() returns false before connect
// ✅ isConnected() returns true after successful connect
// ✅ isConnected() returns false after close
// ✅ isConnected() returns false after failed connect

// Retry logic tests:
// ✅ withRetry succeeds on first attempt
// ✅ withRetry succeeds on second attempt after first failure
// ✅ withRetry throws after maxAttempts failures
// ✅ withRetry uses exponential backoff (100ms, 200ms, 400ms)
// ✅ withRetry respects maxDelayMs cap

// Connection error tests:
// ✅ connect throws ConnectionError on failure
// ✅ ConnectionError includes URI (sanitized)
// ✅ ConnectionError includes original error message

// assertConnected tests:
// ✅ setDB throws ConnectionError when not connected
// ✅ getDB throws when database not selected
// ✅ getCollection throws when database not selected
```

### Completion Criteria
- [x] `retry.ts` utility created
- [x] `isConnected()` method added
- [x] `assertConnected()` private helper added
- [x] `connect()` uses retry logic
- [x] 13 tests written and passing

---

## Phase 4: Index Management

**Goal**: Provide explicit methods for consumers to create indexes during initialization.

### Additions to `src/mongoConnector.ts`

```typescript
import { IndexDescription, CreateIndexesOptions } from 'mongodb';

/**
 * Creates an index on a collection field.
 */
async ensureIndex<T extends Document>(
    collectionName: string,
    field: keyof T & string,
    options: CreateIndexesOptions = {}
): Promise<string> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    const indexSpec: IndexDescription = { key: { [field]: 1 } };
    return this.db.collection(collectionName).createIndex(
        { [field]: 1 },
        options
    );
}

/**
 * Creates a unique index on a collection field.
 */
async ensureUniqueIndex<T extends Document>(
    collectionName: string,
    field: keyof T & string
): Promise<string> {
    return this.ensureIndex<T>(collectionName, field, { unique: true });
}

/**
 * Creates a compound index on multiple fields.
 */
async ensureCompoundIndex<T extends Document>(
    collectionName: string,
    fields: (keyof T & string)[],
    options: CreateIndexesOptions = {}
): Promise<string> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    const indexSpec = fields.reduce((acc, field) => {
        acc[field] = 1;
        return acc;
    }, {} as Record<string, 1>);
    
    return this.db.collection(collectionName).createIndex(indexSpec, options);
}

/**
 * Lists all indexes on a collection.
 */
async listIndexes(collectionName: string): Promise<Document[]> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    return this.db.collection(collectionName).listIndexes().toArray();
}

/**
 * Drops an index from a collection.
 */
async dropIndex(collectionName: string, indexName: string): Promise<void> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    await this.db.collection(collectionName).dropIndex(indexName);
}
```

### Tests to Write

```typescript
// ensureIndex tests:
// ✅ Creates index on specified field
// ✅ Returns index name
// ✅ Throws ConnectionError when not connected

// ensureUniqueIndex tests:
// ✅ Creates unique index on specified field
// ✅ Insert duplicate value throws error (MongoDB level)

// ensureCompoundIndex tests:
// ✅ Creates compound index on multiple fields
// ✅ Index appears in listIndexes

// listIndexes tests:
// ✅ Returns array of index documents
// ✅ Includes _id index by default

// dropIndex tests:
// ✅ Removes specified index
// ✅ Throws error for non-existent index
```

### Completion Criteria
- [x] 5 index management methods added
- [ ] 10 tests written and passing (TODO: need to add comprehensive tests)
- [x] Methods use `assertConnected()`

---

## Phase 5: Remove Logging

**Goal**: Library should be silent; prepare for future logger injection.

### Modifications to `src/mongoConnector.ts`

Remove all instances of:
- `console.log('MongoDB connected.');`
- `console.log('MongoDB connection closed.');`
- `console.log(\`MongoDB using database: ${dbName}\`);`
- `console.log('Document successfully created.');`
- `console.log(\`Successfully deleted document with ${_id}\`);`
- `console.error(...)` calls

Replace with nothing - errors should be thrown, not logged.

### Tests to Write

```typescript
// Silence tests (mock console):
// ✅ connect() does not call console.log
// ✅ close() does not call console.log
// ✅ setDB() does not call console.log
// ✅ CRUD operations do not call console.log or console.error
```

### Completion Criteria
- [x] All `console.log` removed
- [x] All `console.error` removed
- [x] 6 tests verifying silence

---

## Phase 6: Refactor createOne

**Goal**: Remove `uniqueFields` parameter, rely on database indexes.

### Breaking Change

**Before (v1.x)**:
```typescript
createOne<T>(collection: string, doc: T, uniqueFields: (keyof T)[]): Promise<WithId<T> | null>
```

**After (v2.0)**:
```typescript
createOne<T>(collection: string, doc: T): Promise<WithId<T>>
```

### Modifications to `src/mongoConnector.ts`

```typescript
import { DuplicateKeyError } from './errors';

/**
 * Parses MongoDB duplicate key error to extract field and value.
 */
private parseDuplicateKeyError(
    err: unknown,
    collectionName: string
): DuplicateKeyError | null {
    if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
    ) {
        // MongoDB duplicate key error format:
        // "E11000 duplicate key error collection: db.collection index: field_1 dup key: { field: "value" }"
        const message = (err as Error).message || '';
        const fieldMatch = message.match(/index: (\w+)_/);
        const valueMatch = message.match(/dup key: \{ (\w+): (.+) \}/);
        
        const field = fieldMatch?.[1] || valueMatch?.[1] || 'unknown';
        const value = valueMatch?.[2] || 'unknown';
        
        return new DuplicateKeyError(collectionName, field, value);
    }
    return null;
}

async createOne<T extends Document>(
    collectionName: string,
    newObj: T
): Promise<WithId<T>> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    try {
        const result = await this.getCollection<T>(collectionName)
            .insertOne(newObj as OptionalUnlessRequiredId<T>);
        
        if (!result.acknowledged) {
            throw new Error('Insert was not acknowledged by MongoDB');
        }
        
        return {
            ...newObj,
            _id: result.insertedId
        } as WithId<T>;
    } catch (err) {
        const duplicateError = this.parseDuplicateKeyError(err, collectionName);
        if (duplicateError) {
            throw duplicateError;
        }
        throw err;
    }
}
```

### Tests to Write

```typescript
// createOne tests:
// ✅ Creates document and returns with _id
// ✅ Returns correct document type
// ✅ Throws DuplicateKeyError when unique index violated
// ✅ DuplicateKeyError contains collection name
// ✅ DuplicateKeyError contains field name
// ✅ Throws ConnectionError when not connected
```

### Completion Criteria
- [x] `uniqueFields` parameter removed
- [x] Return type changed to `Promise<WithId<T>>` (not nullable)
- [x] DuplicateKeyError parsing implemented
- [x] 5 tests written and passing
- [x] Old tests updated to new signature

---

## Phase 7: Query Enhancements

**Goal**: Add `getMany`, `count`, `exists` with query options.

### Type Definitions

#### `src/types/index.ts`
```typescript
import { Sort } from 'mongodb';

export interface QueryOptions {
    limit?: number;
    skip?: number;
    sort?: Sort;
}

export interface OperationOptions {
    session?: ClientSession;
}
```

### Additions to `src/mongoConnector.ts`

```typescript
import { QueryOptions } from './types';

/**
 * Finds multiple documents matching a filter.
 */
async getMany<T extends Document>(
    collectionName: string,
    filter: Filter<T> = {},
    options: QueryOptions = {}
): Promise<WithId<T>[]> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    let cursor = this.getCollection<T>(collectionName).find(filter);
    
    if (options.sort) {
        cursor = cursor.sort(options.sort);
    }
    if (options.skip !== undefined) {
        cursor = cursor.skip(options.skip);
    }
    if (options.limit !== undefined) {
        cursor = cursor.limit(options.limit);
    }
    
    return cursor.toArray();
}

/**
 * Counts documents matching a filter.
 */
async count<T extends Document>(
    collectionName: string,
    filter: Filter<T> = {}
): Promise<number> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    return this.getCollection<T>(collectionName).countDocuments(filter);
}

/**
 * Checks if any document matches the filter.
 * More efficient than getOne when you only need existence check.
 */
async exists<T extends Document>(
    collectionName: string,
    filter: Filter<T>
): Promise<boolean> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    const doc = await this.getCollection<T>(collectionName).findOne(filter, {
        projection: { _id: 1 },
        limit: 1
    });
    
    return doc !== null;
}

// DEPRECATED: Remove getCollectionArray, replace with getMany
// Delete the getCollectionArray method entirely
```

### Tests to Write

```typescript
// getMany tests:
// ✅ Returns all documents when no filter
// ✅ Returns matching documents with filter
// ✅ Returns empty array when no matches
// ✅ Respects limit option
// ✅ Respects skip option
// ✅ Respects sort option (ascending)
// ✅ Respects sort option (descending)
// ✅ Combines limit, skip, sort correctly

// count tests:
// ✅ Returns total count with no filter
// ✅ Returns count of matching documents
// ✅ Returns 0 when no matches

// exists tests:
// ✅ Returns true when document exists
// ✅ Returns false when document doesn't exist
// ✅ Works with complex filters
// ✅ Only fetches _id field (verify with explain if possible)

// getCollectionArray removal:
// ✅ Method no longer exists on connector
```

### Completion Criteria
- [x] `getMany` with QueryOptions implemented
- [x] `count` implemented
- [x] `exists` implemented
- [x] `getCollectionArray` removed
- [x] 17 tests written and passing

---

## Phase 8: Bulk Operations

**Goal**: Efficient multi-document operations.

### Additions to `src/mongoConnector.ts`

```typescript
import { BulkWriteResult } from 'mongodb';
import { assertNotEmpty } from './utils/validation';

export interface BulkCreateResult<T> {
    inserted: WithId<T>[];
    failed: Array<{ document: T; error: Error }>;
}

/**
 * Inserts multiple documents. Continues on error (ordered: false).
 * Returns both successful inserts and failures.
 */
async createMany<T extends Document>(
    collectionName: string,
    documents: T[]
): Promise<BulkCreateResult<T>> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    assertNotEmpty(documents, 'documents', 'createMany');
    
    const result: BulkCreateResult<T> = {
        inserted: [],
        failed: []
    };
    
    try {
        const insertResult = await this.getCollection<T>(collectionName)
            .insertMany(documents as OptionalUnlessRequiredId<T>[], { ordered: false });
        
        // Map inserted IDs back to documents
        documents.forEach((doc, index) => {
            const insertedId = insertResult.insertedIds[index];
            if (insertedId) {
                result.inserted.push({ ...doc, _id: insertedId } as WithId<T>);
            }
        });
    } catch (err: any) {
        // Handle partial failure (some docs inserted, some failed)
        if (err.code === 11000 && err.writeErrors) {
            // Process write errors
            const failedIndexes = new Set(
                err.writeErrors.map((we: any) => we.index)
            );
            
            documents.forEach((doc, index) => {
                if (failedIndexes.has(index)) {
                    const writeError = err.writeErrors.find((we: any) => we.index === index);
                    result.failed.push({
                        document: doc,
                        error: new DuplicateKeyError(
                            collectionName,
                            'unknown', // Parse from error if needed
                            'unknown'
                        )
                    });
                } else if (err.insertedIds?.[index]) {
                    result.inserted.push({
                        ...doc,
                        _id: err.insertedIds[index]
                    } as WithId<T>);
                }
            });
        } else {
            throw err;
        }
    }
    
    if (result.failed.length > 0 && result.inserted.length === 0) {
        throw new ValidationError(
            `All ${documents.length} documents failed to insert`,
            'documents'
        );
    }
    
    return result;
}

/**
 * Updates all documents matching filter.
 * Returns count of modified documents.
 */
async updateMany<T extends Document>(
    collectionName: string,
    filter: Filter<T>,
    update: UpdateFilter<T>
): Promise<number> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    const result = await this.getCollection<T>(collectionName)
        .updateMany(filter, update);
    
    return result.modifiedCount;
}

/**
 * Deletes all documents matching filter.
 * Throws if filter is empty (safety check).
 * Returns count of deleted documents.
 */
async deleteMany<T extends Document>(
    collectionName: string,
    filter: Filter<T>
): Promise<number> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    // Safety check: prevent accidental delete all
    if (Object.keys(filter).length === 0) {
        throw new ValidationError(
            'deleteMany requires a non-empty filter. Use deleteAll() to delete all documents.',
            'filter'
        );
    }
    
    const result = await this.getCollection<T>(collectionName).deleteMany(filter);
    return result.deletedCount;
}

/**
 * Deletes ALL documents in a collection.
 * Explicit method to prevent accidental data loss.
 */
async deleteAll<T extends Document>(
    collectionName: string
): Promise<number> {
    this.assertConnected();
    if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
    
    const result = await this.getCollection<T>(collectionName).deleteMany({});
    return result.deletedCount;
}
```

### Tests to Write

```typescript
// createMany tests:
// ✅ Inserts all documents successfully
// ✅ Returns inserted documents with _ids
// ✅ Throws ValidationError for empty array
// ✅ Partial success: returns inserted and failed arrays
// ✅ All fail: throws ValidationError
// ✅ Throws ConnectionError when not connected

// updateMany tests:
// ✅ Updates all matching documents
// ✅ Returns count of modified documents
// ✅ Returns 0 when no matches (doesn't throw)
// ✅ Works with $set operator
// ✅ Works with $inc operator
// ✅ Throws ConnectionError when not connected

// deleteMany tests:
// ✅ Deletes all matching documents
// ✅ Returns count of deleted documents
// ✅ Returns 0 when no matches (doesn't throw)
// ✅ Throws ValidationError for empty filter
// ✅ Throws ConnectionError when not connected

// deleteAll tests:
// ✅ Deletes all documents in collection
// ✅ Returns count of deleted documents
// ✅ Returns 0 for empty collection
```

### Completion Criteria
- [x] `createMany` with partial success handling
- [x] `updateMany` implemented
- [x] `deleteMany` with safety check
- [x] `deleteAll` explicit method
- [x] 20 tests written and passing (exceeded requirement of 18)

---

---

## Future Work: Phase 9 - Aggregation Support

**Status**: Deferred to post-v2.0.0 release

**Goal**: Type-safe aggregation pipelines.

See implementation plan for full details. This feature will be added in a future minor version release.

---

## Future Work: Phase 10 - Transaction Support

**Status**: Deferred to post-v2.0.0 release

**Goal**: Multi-document atomic operations (requires replica set).

See implementation plan for full details. This feature requires MongoDB replica set configuration and will be added in a future release.

---

## Phase 11: Testing Utilities

**Goal**: Help library consumers write tests.

### New File: `src/testing.ts`

```typescript
import { MongoConnector } from './mongoConnector';

/**
 * Resets the singleton instance for testing purposes.
 * Only exported from testing utilities, not main package.
 */
export function resetMongoConnector(): void {
    // Access private static via any cast for testing
    (MongoConnector as any).instance = undefined;
}

/**
 * Creates a fresh MongoConnector instance for testing.
 * Bypasses singleton pattern.
 */
export function createTestConnector(): MongoConnector {
    return (MongoConnector as any).createInstance();
}
```

### Update `src/mongoConnector.ts`

```typescript
// Add private method for testing
private static createInstance(): MongoConnector {
    return new MongoConnector();
}
```

### Update `src/index.ts`

```typescript
// Main exports
export { mongoConnector, MongoConnector, ConnectOptions } from './mongoConnector';
export * from './errors';
export * from './types';

// Testing utilities (separate import path)
// Consumers use: import { resetMongoConnector } from '@dsavidge02/mongo-connector-ts/testing'
```

### Update `package.json`

```json
{
    "exports": {
        ".": "./dist/index.js",
        "./testing": "./dist/testing.js"
    }
}
```

### Tests to Write

```typescript
// resetMongoConnector tests:
// ✅ Resets singleton instance
// ✅ Next getInstance() returns fresh instance
// ✅ Old instance still works (but disconnected from singleton)

// createTestConnector tests:
// ✅ Returns new instance
// ✅ Instance is independent from singleton
```

### Completion Criteria
- [x] `testing.ts` created
- [x] Separate export path configured
- [x] 6 tests written and passing (exceeded requirement of 4)

---

## Final Checklist

### Before Release

- [ ] All phases completed
- [ ] All tests passing
- [ ] Test coverage > 90%
- [ ] No console.log/error in library code
- [ ] TypeScript strict mode passing
- [ ] README.md updated with new API
- [ ] CHANGELOG.md created for v2.0.0
- [ ] Breaking changes documented
- [ ] package.json version bumped to 2.0.0

### API Documentation Update

Create or update README with:
- Installation
- Quick start
- Full API reference
- Migration guide from v1.x
- Error handling examples
- Index setup examples
- Transaction examples

---

## Session Checkpoints

Use these to track progress across Claude Code sessions:

### Session 1: Foundation ✅ COMPLETE
- [x] Phase 1: Custom Errors
- [x] Phase 2: Input Validation

### Session 2: Connection ✅ COMPLETE
- [x] Phase 3: Connection Management
- [x] Phase 5: Remove Logging

### Session 3: Core Changes ✅ COMPLETE
- [x] Phase 4: Index Management
- [x] Phase 6: Refactor createOne

### Session 4: Query Features ✅ COMPLETE
- [x] Phase 7: Query Enhancements

### Session 5: Bulk Operations ✅ COMPLETE
- [x] Phase 8: Bulk Operations

### Session 6: Testing Utilities & Cleanup ✅ COMPLETE
- [x] Phase 11: Testing Utilities
- [ ] Documentation (in progress)
- [ ] Final testing
- [ ] Release preparation

### Future Work (Post v2.0.0)
These features will be added in subsequent minor/major releases:
- [ ] Phase 9: Aggregation Support
- [ ] Phase 10: Transaction Support (requires replica set)

---

## Appendix: Complete Type Definitions

```typescript
// src/types/index.ts

import { ClientSession, Sort, Document, Filter, UpdateFilter, WithId, ObjectId } from 'mongodb';

export interface ConnectOptions {
    retry?: {
        maxAttempts?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
    };
}

export interface QueryOptions {
    limit?: number;
    skip?: number;
    sort?: Sort;
}

export interface OperationOptions {
    session?: ClientSession;
}

export interface BulkCreateResult<T> {
    inserted: WithId<T>[];
    failed: Array<{
        document: T;
        error: Error;
    }>;
}

export type IdFilter<T> = Partial<T> & { _id: string | ObjectId };
export type UpdateDoc<T> = Partial<T> & { _id: string | ObjectId };
```

---

**End of Implementation Plan**