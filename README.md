# MongoDB Connector TypeScript

A robust, type-safe MongoDB connector library with a singleton pattern, comprehensive error handling, and modern async/await operations.

## Installation

```bash
npm install @dsavidge02/mongo-connector-ts
```

## Features

- **Singleton Pattern**: Single connection instance across your application
- **Type-Safe**: Full TypeScript support with generics
- **Comprehensive Error Handling**: Custom error classes for different failure scenarios
- **Connection Management**: Built-in retry logic with exponential backoff
- **Index Management**: Easy-to-use methods for creating and managing indexes
- **Bulk Operations**: Efficient multi-document operations
- **Query Enhancements**: Powerful query options with limit, skip, and sort
- **Zero Logging**: Silent by default, won't pollute your logs
- **Testing Utilities**: Helper functions for testing with the singleton pattern

## Quick Start

```typescript
import { mongoConnector } from '@dsavidge02/mongo-connector-ts';

// Connect to MongoDB
await mongoConnector.connect('mongodb://localhost:27017', 'myDatabase');

// Create a document
interface User {
    name: string;
    email: string;
    age: number;
}

const user = await mongoConnector.createOne<User>('users', {
    name: 'Alice',
    email: 'alice@example.com',
    age: 30
});

// Query documents
const users = await mongoConnector.getMany<User>('users',
    { age: { $gte: 25 } },
    { limit: 10, sort: { name: 1 } }
);

// Close connection when done
await mongoConnector.close();
```

## API Reference

### Connection Management

#### `connect(uri: string, dbName?: string, options?: ConnectOptions): Promise<void>`

Connects to MongoDB with automatic retry logic.

```typescript
// Basic connection
await mongoConnector.connect('mongodb://localhost:27017', 'mydb');

// With custom retry options
await mongoConnector.connect('mongodb://localhost:27017', 'mydb', {
    retry: {
        maxAttempts: 5,
        baseDelayMs: 200,
        maxDelayMs: 10000
    }
});
```

#### `close(): Promise<void>`

Closes the MongoDB connection and resets the connector state.

```typescript
await mongoConnector.close();
```

#### `setDB(dbName: string): void`

Switches to a different database.

```typescript
mongoConnector.setDB('anotherDatabase');
```

#### `isConnected(): boolean`

Checks if the connector is currently connected.

```typescript
if (mongoConnector.isConnected()) {
    console.log('Connected to MongoDB');
}
```

### CRUD Operations

#### `createOne<T>(collectionName: string, document: T): Promise<WithId<T>>`

Creates a single document and returns it with its generated `_id`.

```typescript
const user = await mongoConnector.createOne<User>('users', {
    name: 'Bob',
    email: 'bob@example.com',
    age: 25
});
// user now has _id property
```

**Throws**: `DuplicateKeyError` if a unique index is violated.

#### `getOne<T>(collectionName: string, filter: Filter<T>): Promise<WithId<T> | null>`

Finds a single document matching the filter.

```typescript
const user = await mongoConnector.getOne<User>('users', { email: 'alice@example.com' });
if (user) {
    console.log(user.name);
}
```

**Returns**: `null` if no document is found.

#### `getMany<T>(collectionName: string, filter?: Filter<T>, options?: QueryOptions): Promise<WithId<T>[]>`

Finds multiple documents with optional query options.

```typescript
// Get all users
const allUsers = await mongoConnector.getMany<User>('users');

// Get users with filter
const adults = await mongoConnector.getMany<User>('users', { age: { $gte: 18 } });

// With query options
const topUsers = await mongoConnector.getMany<User>(
    'users',
    { active: true },
    { limit: 10, skip: 0, sort: { createdAt: -1 } }
);
```

#### `updateOne<T>(collectionName: string, filter: Filter<T>, update: UpdateFilter<T>): Promise<WithId<T>>`

Updates a single document and returns the updated document.

```typescript
const updatedUser = await mongoConnector.updateOne<User>(
    'users',
    { email: 'alice@example.com' },
    { $set: { age: 31 } }
);
```

**Throws**: `DocumentNotFoundError` if no document matches the filter.

#### `deleteOne<T>(collectionName: string, filter: Filter<T>): Promise<void>`

Deletes a single document.

```typescript
await mongoConnector.deleteOne<User>('users', { email: 'alice@example.com' });
```

**Throws**: `DocumentNotFoundError` if no document matches the filter.

### Bulk Operations

#### `createMany<T>(collectionName: string, documents: T[]): Promise<BulkCreateResult<T>>`

Inserts multiple documents, continuing on error (unordered insert).

```typescript
const result = await mongoConnector.createMany<User>('users', [
    { name: 'User1', email: 'user1@example.com', age: 20 },
    { name: 'User2', email: 'user2@example.com', age: 25 },
    { name: 'User3', email: 'user3@example.com', age: 30 }
]);

console.log(`Inserted: ${result.inserted.length}`);
console.log(`Failed: ${result.failed.length}`);
```

**Returns**: Object with `inserted` array and `failed` array.
**Throws**: `ValidationError` if all documents fail to insert.

#### `updateMany<T>(collectionName: string, filter: Filter<T>, update: UpdateFilter<T>): Promise<number>`

Updates all documents matching the filter.

```typescript
const modifiedCount = await mongoConnector.updateMany<User>(
    'users',
    { active: false },
    { $set: { status: 'inactive' } }
);
console.log(`Updated ${modifiedCount} documents`);
```

**Returns**: Number of documents modified.

#### `deleteMany<T>(collectionName: string, filter: Filter<T>): Promise<number>`

Deletes all documents matching the filter.

```typescript
const deletedCount = await mongoConnector.deleteMany<User>(
    'users',
    { status: 'inactive' }
);
```

**Returns**: Number of documents deleted.
**Throws**: `ValidationError` if filter is empty (safety check).

#### `deleteAll<T>(collectionName: string): Promise<number>`

Deletes all documents in a collection (explicit method to prevent accidents).

```typescript
const deletedCount = await mongoConnector.deleteAll<User>('users');
```

### Query Utilities

#### `count<T>(collectionName: string, filter?: Filter<T>): Promise<number>`

Counts documents matching the filter.

```typescript
const totalUsers = await mongoConnector.count<User>('users');
const activeUsers = await mongoConnector.count<User>('users', { active: true });
```

#### `exists<T>(collectionName: string, filter: Filter<T>): Promise<boolean>`

Checks if any document matches the filter (more efficient than `getOne`).

```typescript
const emailExists = await mongoConnector.exists<User>('users', {
    email: 'alice@example.com'
});
```

### Index Management

#### `ensureIndex<T>(collectionName: string, field: keyof T & string, options?: CreateIndexesOptions): Promise<string>`

Creates an index on a field.

```typescript
await mongoConnector.ensureIndex<User>('users', 'email');
```

#### `ensureUniqueIndex<T>(collectionName: string, field: keyof T & string): Promise<string>`

Creates a unique index on a field.

```typescript
await mongoConnector.ensureUniqueIndex<User>('users', 'email');
```

#### `ensureCompoundIndex<T>(collectionName: string, fields: (keyof T & string)[], options?: CreateIndexesOptions): Promise<string>`

Creates a compound index on multiple fields.

```typescript
await mongoConnector.ensureCompoundIndex<User>('users', ['email', 'name'], { unique: true });
```

#### `listIndexes(collectionName: string): Promise<Document[]>`

Lists all indexes on a collection.

```typescript
const indexes = await mongoConnector.listIndexes('users');
console.log(indexes);
```

#### `dropIndex(collectionName: string, indexName: string): Promise<void>`

Drops an index from a collection.

```typescript
await mongoConnector.dropIndex('users', 'email_1');
```

## Error Handling

The library provides custom error classes for different scenarios:

### `ConnectionError`

Thrown when connection to MongoDB fails.

```typescript
import { ConnectionError } from '@dsavidge02/mongo-connector-ts';

try {
    await mongoConnector.connect('mongodb://invalid-uri:27017');
} catch (err) {
    if (err instanceof ConnectionError) {
        console.error('Failed to connect:', err.message);
        console.error('URI:', err.uri);
    }
}
```

### `ValidationError`

Thrown when input validation fails.

```typescript
import { ValidationError } from '@dsavidge02/mongo-connector-ts';

try {
    await mongoConnector.createMany('users', []); // Empty array
} catch (err) {
    if (err instanceof ValidationError) {
        console.error('Validation failed:', err.field);
    }
}
```

### `InvalidObjectIdError`

Thrown when an invalid ObjectId string is provided.

```typescript
import { InvalidObjectIdError } from '@dsavidge02/mongo-connector-ts';

try {
    await mongoConnector.getOne('users', { _id: 'not-valid-id' });
} catch (err) {
    if (err instanceof InvalidObjectIdError) {
        console.error('Invalid ID:', err.value);
    }
}
```

### `DuplicateKeyError`

Thrown when a unique index constraint is violated.

```typescript
import { DuplicateKeyError } from '@dsavidge02/mongo-connector-ts';

try {
    await mongoConnector.createOne('users', { email: 'duplicate@example.com' });
} catch (err) {
    if (err instanceof DuplicateKeyError) {
        console.error(`Duplicate ${err.field} in ${err.collection}`);
    }
}
```

### `DocumentNotFoundError`

Thrown when `updateOne` or `deleteOne` cannot find the target document.

```typescript
import { DocumentNotFoundError } from '@dsavidge02/mongo-connector-ts';

try {
    await mongoConnector.updateOne('users', { _id: 'nonexistent' }, { $set: { name: 'X' } });
} catch (err) {
    if (err instanceof DocumentNotFoundError) {
        console.error(`Not found in ${err.collection}: ${err.id}`);
    }
}
```

## Testing

The library provides testing utilities to work with the singleton pattern:

```typescript
import { resetMongoConnector, createTestConnector } from '@dsavidge02/mongo-connector-ts/testing';

describe('My Tests', () => {
    beforeEach(() => {
        // Reset singleton between tests
        resetMongoConnector();
    });

    it('should work with independent connector', () => {
        // Create independent test instance
        const testConnector = createTestConnector();
        // Use testConnector in your tests
    });
});
```

## TypeScript Types

All operations support full TypeScript generics:

```typescript
interface Product {
    name: string;
    price: number;
    category: string;
    inStock: boolean;
}

// Type-safe operations
const product = await mongoConnector.createOne<Product>('products', {
    name: 'Widget',
    price: 29.99,
    category: 'Tools',
    inStock: true
});

// product._id is typed as ObjectId
// product.name is typed as string
```

## Migration from v1.x

### Breaking Changes in v2.0.0

1. **`createOne` signature changed**:
   - **Before**: `createOne(collection, doc, uniqueFields)`
   - **After**: `createOne(collection, doc)`
   - Use `ensureUniqueIndex()` to create unique indexes instead

2. **`createOne` return type changed**:
   - **Before**: Returns `WithId<T> | null`
   - **After**: Returns `WithId<T>` (throws on error)

3. **`getCollectionArray` removed**:
   - Use `getMany()` instead

4. **No more console logging**:
   - Library is silent; handle errors with try-catch

### Migration Example

```typescript
// v1.x
const user = await mongoConnector.createOne('users',
    { email: 'test@example.com', name: 'Test' },
    ['email'] // uniqueFields parameter
);
if (!user) {
    console.error('Failed to create user');
}

// v2.0.0
// Setup (once, during app initialization)
await mongoConnector.ensureUniqueIndex<User>('users', 'email');

// Usage
try {
    const user = await mongoConnector.createOne('users',
        { email: 'test@example.com', name: 'Test' }
    );
    // user is guaranteed to exist here
} catch (err) {
    if (err instanceof DuplicateKeyError) {
        console.error('Email already exists');
    }
}
```

## Future Work

The following features are planned for post-v2.0.0 releases:

### Phase 9: Aggregation Support
- Type-safe aggregation pipeline execution
- Support for complex MongoDB aggregation operations
- Generic typing for input and output document types

### Phase 10: Transaction Support
- Multi-document atomic operations
- Automatic commit/abort handling
- **Note**: Requires MongoDB replica set configuration

These features will be added in subsequent minor or major version releases based on user demand and project priorities.

## License

MIT

## Author

Daniel Savidge

## Repository

https://github.com/dsavidge02/mongo-connector