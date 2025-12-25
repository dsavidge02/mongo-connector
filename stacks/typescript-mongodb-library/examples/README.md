# TypeScript MongoDB Library Examples

This directory contains real code examples extracted from working TypeScript MongoDB library projects.

## singleton-connector/

A complete MongoDB connector implementation using the Singleton pattern with modern best practices.

**Files:**
- [connector.ts](singleton-connector/connector.ts) - Original connector class (legacy pattern)
- [connector.test.ts](singleton-connector/connector.test.ts) - Comprehensive Jest tests using mongodb-memory-server
- [duplicateKeyError.ts](singleton-connector/duplicateKeyError.ts) - Custom error class example
- [retry.ts](singleton-connector/retry.ts) - Retry utility with exponential backoff
- [types.ts](singleton-connector/types.ts) - TypeScript interface definitions

**Key Features:**
- Singleton pattern for connection management
- Generic type-safe CRUD operations (getOne, createOne, updateOne, deleteOne, getMany, createMany, etc.)
- Custom error hierarchy (DuplicateKeyError, ValidationError, ConnectionError, etc.)
- ObjectId string conversion with validation using `toObjectId()` utility
- Retry logic with configurable exponential backoff
- Input validation using assertion utilities
- JSDoc documentation for all public methods
- Comprehensive error handling with descriptive messages
- Full test coverage with in-memory MongoDB (mongodb-memory-server)
- Modular organization (errors/, utils/, types/)

**Modern Usage Pattern:**
```typescript
import { MongoConnector } from './mongoConnector';
import { toObjectId } from './utils';
import { DuplicateKeyError, ValidationError } from './errors';

// Get singleton instance
const connector = MongoConnector.getInstance();

// Connect with retry options
await connector.connect(mongoUri, 'my-database', {
  retry: { maxAttempts: 5, baseDelayMs: 1000 }
});

// Check connection status
if (connector.isConnected()) {
  // Perform CRUD operations with error handling
  try {
    const doc = await connector.createOne('users',
      { name: 'Alice', age: 30 },
      ['name']  // unique fields
    );

    const users = await connector.getMany('users',
      { age: { $gte: 25 } },
      { limit: 10, sort: { name: 1 } }
    );

    const updated = await connector.updateOne('users',
      { _id: doc._id, age: 31 }
    );

    await connector.deleteOne('users', { _id: doc._id });
  } catch (error) {
    if (error instanceof DuplicateKeyError) {
      console.error('Duplicate key:', error.message);
    } else if (error instanceof ValidationError) {
      console.error('Validation failed:', error.message);
    }
  }
}

// Close connection
await connector.close();
```

**Retry Pattern Example:**
```typescript
import { withRetry } from './utils/retry';

await withRetry(async () => {
  // Operation that may fail transiently
  return await someUnreliableOperation();
}, {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 10000
});
```

**Custom Error Example:**
```typescript
import { MongoConnectorError } from './errors/base';

export class DuplicateKeyError extends MongoConnectorError {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}
```

## How to Use These Examples

1. Copy the example files to your new project
2. Adapt the modular structure (errors/, utils/, types/)
3. Modify class/export names as needed
4. Extend with additional methods following the same patterns
5. Add JSDoc documentation to all public methods
6. Implement comprehensive tests using mongodb-memory-server
7. Use dual export strategy (main + testing utilities) via package.json exports