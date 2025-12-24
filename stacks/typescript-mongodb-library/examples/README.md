# TypeScript MongoDB Library Examples

This directory contains real code examples extracted from working TypeScript MongoDB library projects.

## singleton-connector/

A complete MongoDB connector implementation using the Singleton pattern.

**Files:**
- [connector.ts](singleton-connector/connector.ts) - Main connector class with CRUD operations
- [connector.test.ts](singleton-connector/connector.test.ts) - Comprehensive Jest tests using mongodb-memory-server

**Key Features:**
- Singleton pattern for connection management
- Generic type-safe CRUD operations
- ObjectId string conversion handling
- Unique field validation
- Comprehensive error handling
- Full test coverage with in-memory MongoDB

**Usage Pattern:**
```typescript
// Get singleton instance
const connector = MongoConnector.getInstance();

// Connect to database
await connector.connect(mongoUri, 'my-database');

// Perform CRUD operations
const doc = await connector.createOne('users', { name: 'Alice', age: 30 }, ['name']);
const user = await connector.getOne('users', { name: 'Alice' });
await connector.updateOne('users', { _id: user._id, age: 31 });
await connector.deleteOne('users', { _id: user._id });

// Close connection
await connector.close();
```

## How to Use These Examples

1. Copy the example files to your new project
2. Modify class/export names as needed
3. Adjust types and interfaces for your domain
4. Extend with additional methods as required
5. Follow the same patterns for consistency