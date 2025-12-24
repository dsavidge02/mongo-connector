import { MongoMemoryServer } from 'mongodb-memory-server';
import { mongoConnector } from './mongoConnector';
import { ConnectionError, DuplicateKeyError } from './errors';

describe('MongoConnector', () => {
  let mongoServer: MongoMemoryServer;

  interface TestDoc {
    name: string;
    age: number;
  }

  beforeEach(async () => {
    // Start MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    
    // Connect to the in-memory database
    await mongoConnector.connect(uri, 'test-db');
  });

  afterEach(async () => {
    // Clean up: close connection and stop server
    await mongoConnector.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('Testing Connectivity', () => {
    it('Connecting to MongoDB', async () => {
      const uri = mongoServer.getUri();
      await mongoConnector.connect(uri);

      expect(() => mongoConnector.setDB('test-db')).not.toThrow('MongoClient is not connected');
    });

    it('Closing MongoDB Connection', async () => {
      await mongoConnector.close();

      expect(() => mongoConnector.setDB('test-db')).toThrow(ConnectionError);
    });

    it('Connecting to a DB', () => {
      mongoConnector.setDB('custom-db');

      const db = mongoConnector.getDB();
      expect(db.databaseName).toBe('custom-db');
    });

    it('Getting a DB', () => {
      const db = mongoConnector.getDB();
      expect(db).toBeDefined();
      expect(db.databaseName).toBe('test-db');
    });
  });

  describe('Connection State Management', () => {
    it('isConnected() should return false before connect', async () => {
      await mongoConnector.close();
      expect(mongoConnector.isConnected()).toBe(false);
    });

    it('isConnected() should return true after successful connect', async () => {
      const uri = mongoServer.getUri();
      await mongoConnector.connect(uri, 'test-db');
      expect(mongoConnector.isConnected()).toBe(true);
    });

    it('isConnected() should return false after close', async () => {
      expect(mongoConnector.isConnected()).toBe(true);
      await mongoConnector.close();
      expect(mongoConnector.isConnected()).toBe(false);
    });

    it('isConnected() should return false after failed connect', async () => {
      await mongoConnector.close();

      try {
        await mongoConnector.connect('mongodb://localhost:9999?serverSelectionTimeoutMS=1000', 'test-db', {
          retry: { maxAttempts: 1, baseDelayMs: 10 }
        });
      } catch (error) {
        // Expected to fail
      }

      expect(mongoConnector.isConnected()).toBe(false);
    }, 15000);

    it('setDB() should throw ConnectionError when not connected', async () => {
      await mongoConnector.close();

      expect(() => mongoConnector.setDB('test-db')).toThrow(ConnectionError);
      expect(() => mongoConnector.setDB('test-db')).toThrow('MongoClient is not connected');
    });
  });

  describe('Connection Error Handling', () => {
    it('connect() should throw ConnectionError on failure', async () => {
      await mongoConnector.close();

      await expect(
        mongoConnector.connect('mongodb://localhost:9999?serverSelectionTimeoutMS=1000', 'test-db', {
          retry: { maxAttempts: 2, baseDelayMs: 10 }
        })
      ).rejects.toThrow(ConnectionError);
    }, 15000);

    it('ConnectionError should include URI', async () => {
      await mongoConnector.close();

      try {
        await mongoConnector.connect('mongodb://localhost:9999?serverSelectionTimeoutMS=1000', 'test-db', {
          retry: { maxAttempts: 1, baseDelayMs: 10 }
        });
        fail('Should have thrown ConnectionError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectionError);
        const connError = error as ConnectionError;
        expect(connError.uri).toContain('localhost:9999');
      }
    }, 15000);

    it('ConnectionError should include original error message', async () => {
      await mongoConnector.close();

      try {
        await mongoConnector.connect('mongodb://localhost:9999?serverSelectionTimeoutMS=1000', 'test-db', {
          retry: { maxAttempts: 1, baseDelayMs: 10 }
        });
        fail('Should have thrown ConnectionError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectionError);
        const connError = error as ConnectionError;
        expect(connError.message).toContain('Failed to connect to MongoDB after retries');
      }
    }, 15000);
  });

  describe('Connection Retry Logic', () => {
    it('connect() should succeed with valid URI using default retry options', async () => {
      await mongoConnector.close();
      const uri = mongoServer.getUri();

      await mongoConnector.connect(uri, 'test-db');

      expect(mongoConnector.isConnected()).toBe(true);
    });

    it('connect() should respect custom retry options', async () => {
      await mongoConnector.close();

      const startTime = Date.now();

      try {
        await mongoConnector.connect('mongodb://localhost:9999?serverSelectionTimeoutMS=1000', 'test-db', {
          retry: { maxAttempts: 2, baseDelayMs: 50, maxDelayMs: 100 }
        });
      } catch (error) {
        // Expected to fail
      }

      const elapsedTime = Date.now() - startTime;

      // Should have attempted twice with at least one delay
      // Allow margin for test execution
      expect(elapsedTime).toBeGreaterThanOrEqual(30);
    }, 15000);
  });

  describe('Testing Getting a Collection', () => {
    it('Getting a Collection', () => {
      const collection = mongoConnector.getCollection('test-collection');
      expect(collection).toBeDefined();
      expect(collection.collectionName).toBe('test-collection');
    });

  });

  describe('Testing GetOne', () => {
    it('Getting One Document', async () => {
      const collection = mongoConnector.getCollection('test-collection');
      await collection.insertOne({ name: 'Alice', age: 30 });

      const result = await mongoConnector.getOne('test-collection', { name: 'Alice' });
      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
      expect(result?.age).toBe(30);
    });

    it('Failing to Get One Document', async () => {
      const result = await mongoConnector.getOne('test-collection', { name: 'Alice' });
      expect(result).toBeNull();
    });
  });

  describe('Testing Query Enhancements', () => {
    describe('getMany', () => {
      beforeEach(async () => {
        // Insert test data
        const collection = mongoConnector.getCollection('test-collection');
        await collection.insertMany([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 35 },
          { name: 'David', age: 28 },
          { name: 'Eve', age: 32 }
        ]);
      });

      it('should return all documents when no filter provided', async () => {
        const results = await mongoConnector.getMany<TestDoc>('test-collection');
        expect(results).toHaveLength(5);
      });

      it('should return matching documents with filter', async () => {
        const results = await mongoConnector.getMany<TestDoc>('test-collection', { name: 'Alice' });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Alice');
      });

      it('should return empty array when no matches', async () => {
        const results = await mongoConnector.getMany<TestDoc>('test-collection', { name: 'NonExistent' });
        expect(results).toHaveLength(0);
        expect(Array.isArray(results)).toBe(true);
      });

      it('should respect limit option', async () => {
        const results = await mongoConnector.getMany<TestDoc>('test-collection', {}, { limit: 2 });
        expect(results).toHaveLength(2);
      });

      it('should respect skip option', async () => {
        const allResults = await mongoConnector.getMany<TestDoc>('test-collection');
        const skippedResults = await mongoConnector.getMany<TestDoc>('test-collection', {}, { skip: 2 });

        expect(skippedResults).toHaveLength(3);
        expect(skippedResults[0]._id).toEqual(allResults[2]._id);
      });

      it('should respect sort option (ascending)', async () => {
        const results = await mongoConnector.getMany<TestDoc>('test-collection', {}, { sort: { age: 1 } });

        expect(results[0].age).toBe(25);
        expect(results[1].age).toBe(28);
        expect(results[2].age).toBe(30);
        expect(results[3].age).toBe(32);
        expect(results[4].age).toBe(35);
      });

      it('should respect sort option (descending)', async () => {
        const results = await mongoConnector.getMany<TestDoc>('test-collection', {}, { sort: { age: -1 } });

        expect(results[0].age).toBe(35);
        expect(results[1].age).toBe(32);
        expect(results[2].age).toBe(30);
        expect(results[3].age).toBe(28);
        expect(results[4].age).toBe(25);
      });

      it('should combine limit, skip, and sort correctly', async () => {
        const results = await mongoConnector.getMany<TestDoc>(
          'test-collection',
          {},
          { sort: { age: 1 }, skip: 1, limit: 2 }
        );

        expect(results).toHaveLength(2);
        expect(results[0].age).toBe(28);
        expect(results[1].age).toBe(30);
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.getMany('test-collection')
        ).rejects.toThrow(ConnectionError);
      });
    });

    describe('count', () => {
      beforeEach(async () => {
        const collection = mongoConnector.getCollection('test-collection');
        await collection.insertMany([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 30 }
        ]);
      });

      it('should return total count with no filter', async () => {
        const count = await mongoConnector.count<TestDoc>('test-collection');
        expect(count).toBe(3);
      });

      it('should return count of matching documents', async () => {
        const count = await mongoConnector.count<TestDoc>('test-collection', { age: 30 });
        expect(count).toBe(2);
      });

      it('should return 0 when no matches', async () => {
        const count = await mongoConnector.count<TestDoc>('test-collection', { name: 'NonExistent' });
        expect(count).toBe(0);
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.count('test-collection')
        ).rejects.toThrow(ConnectionError);
      });
    });

    describe('exists', () => {
      beforeEach(async () => {
        const collection = mongoConnector.getCollection('test-collection');
        await collection.insertMany([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ]);
      });

      it('should return true when document exists', async () => {
        const exists = await mongoConnector.exists<TestDoc>('test-collection', { name: 'Alice' });
        expect(exists).toBe(true);
      });

      it('should return false when document does not exist', async () => {
        const exists = await mongoConnector.exists<TestDoc>('test-collection', { name: 'NonExistent' });
        expect(exists).toBe(false);
      });

      it('should work with complex filters', async () => {
        const exists = await mongoConnector.exists<TestDoc>('test-collection', { name: 'Bob', age: 25 });
        expect(exists).toBe(true);

        const notExists = await mongoConnector.exists<TestDoc>('test-collection', { name: 'Bob', age: 30 });
        expect(notExists).toBe(false);
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.exists('test-collection', { name: 'Alice' })
        ).rejects.toThrow(ConnectionError);
      });
    });
  });

  describe('Testing CreateOne', () => {
    it('Creating One Document', async() => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });
      expect(result).toBeDefined();
      expect(result.name).toBe('Alice');
      expect(result.age).toBe(30);

      const result2 = await mongoConnector.getOne('test-collection', { name: 'Alice' });
      expect(result2).toBeDefined();
      expect(result2?.name).toBe('Alice');
      expect(result2?.age).toBe(30);
    });

    it('Creating two documents with the same non-unique field', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });
      expect(result).toBeDefined();
      expect(result.name).toBe('Alice');
      expect(result.age).toBe(30);

      const result2 = await mongoConnector.createOne('test-collection', { name: 'Bob', age: 30 });
      expect(result2).toBeDefined();
      expect(result2.name).toBe('Bob');
      expect(result2.age).toBe(30);
    });

    it('Failing to Create One Document', async () => {
      // First create a unique index on the name field
      await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });
      expect(result).toBeDefined();
      await expect(
        mongoConnector.createOne('test-collection', { name: 'Alice', age: 35 })
      ).rejects.toThrow();
    });

    it('should return document with _id', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Charlie', age: 40 });

      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(result.name).toBe('Charlie');
      expect(result.age).toBe(40);
    });

    it('should throw DuplicateKeyError when unique index violated', async () => {
      await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

      await mongoConnector.createOne('test-collection', { name: 'David', age: 50 });

      await expect(
        mongoConnector.createOne('test-collection', { name: 'David', age: 55 })
      ).rejects.toThrow(DuplicateKeyError);
    });

    it('DuplicateKeyError should contain collection name', async () => {
      await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

      await mongoConnector.createOne('test-collection', { name: 'Eve', age: 60 });

      try {
        await mongoConnector.createOne('test-collection', { name: 'Eve', age: 65 });
        fail('Should have thrown DuplicateKeyError');
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateKeyError);
        const dupError = error as DuplicateKeyError;
        expect(dupError.collection).toBe('test-collection');
      }
    });

    it('DuplicateKeyError should contain field name', async () => {
      await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

      await mongoConnector.createOne('test-collection', { name: 'Frank', age: 70 });

      try {
        await mongoConnector.createOne('test-collection', { name: 'Frank', age: 75 });
        fail('Should have thrown DuplicateKeyError');
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateKeyError);
        const dupError = error as DuplicateKeyError;
        expect(dupError.field).toBeTruthy();
        expect(dupError.message).toContain('name');
      }
    });

    it('should throw ConnectionError when not connected', async () => {
      await mongoConnector.close();

      await expect(
        mongoConnector.createOne('test-collection', { name: 'Grace', age: 80 })
      ).rejects.toThrow(ConnectionError);
    });
  });

  describe('Testing UpdateOne', () => {
    it('Updating One Document', async () => {
      const initResult = await mongoConnector.createOne<TestDoc>('test-collection', { name: 'Alice', age: 30 });
      expect(initResult).toBeDefined();
      expect(initResult._id).toBeDefined();

      const updateResult = await mongoConnector.updateOne<TestDoc>('test-collection', { _id: initResult._id, age: 35 });
      expect(updateResult).toBeDefined();
      expect(updateResult.name).toBe('Alice');
      expect(updateResult.age).toBe(35);
    });

    it('Failing to Update One Document', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });
      expect(result).toBeDefined();
      await expect(
        mongoConnector.updateOne('test-collection', { _id: 'invalid-id', name:'Alice', age: 35 })
      ).rejects.toThrow('ERROR: Unable to update document.');
    });
  });

  describe('Testing DeleteOne', () => {
    it('Deleting One Document', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });
      expect(result).toBeDefined();
      expect(result._id).toBeDefined();

      const deleteResult = await mongoConnector.deleteOne('test-collection', { _id: result._id });
      expect(deleteResult).toBe(true);

      const getResult = await mongoConnector.getOne('test-collection', { name: 'Alice' });
      expect(getResult).toBeNull();
    });

    it('Failing to Delete One Document', async () => {
      await expect(
        mongoConnector.deleteOne('test-collection', { _id: 'invalid-id' })
      ).rejects.toThrow('ERROR: Unable to delete document.');
    });
  });

  describe('Testing Index Management', () => {
    describe('ensureIndex', () => {
      it('should create an index on specified field', async () => {
        const indexName = await mongoConnector.ensureIndex<TestDoc>('test-collection', 'name');

        expect(indexName).toBeDefined();
        expect(typeof indexName).toBe('string');

        // Verify index was created
        const indexes = await mongoConnector.listIndexes('test-collection');
        const nameIndex = indexes.find(idx => idx.name === indexName);
        expect(nameIndex).toBeDefined();
      });

      it('should return index name', async () => {
        const indexName = await mongoConnector.ensureIndex<TestDoc>('test-collection', 'age');

        expect(indexName).toBeTruthy();
        expect(indexName).toContain('age');
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.ensureIndex<TestDoc>('test-collection', 'name')
        ).rejects.toThrow(ConnectionError);

        await expect(
          mongoConnector.ensureIndex<TestDoc>('test-collection', 'name')
        ).rejects.toThrow('MongoClient is not connected');
      });
    });

    describe('ensureUniqueIndex', () => {
      it('should create unique index on specified field', async () => {
        const indexName = await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

        expect(indexName).toBeDefined();

        // Verify index is unique
        const indexes = await mongoConnector.listIndexes('test-collection');
        const nameIndex = indexes.find(idx => idx.name === indexName);
        expect(nameIndex).toBeDefined();
        expect(nameIndex?.unique).toBe(true);
      });

      it('should prevent duplicate values at MongoDB level', async () => {
        await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

        // Insert first document
        await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });

        // Try to insert duplicate - should fail at MongoDB level
        const collection = mongoConnector.getCollection('test-collection');
        await expect(
          collection.insertOne({ name: 'Alice', age: 35 })
        ).rejects.toThrow();
      });
    });

    describe('ensureCompoundIndex', () => {
      it('should create compound index on multiple fields', async () => {
        const indexName = await mongoConnector.ensureCompoundIndex<TestDoc>(
          'test-collection',
          ['name', 'age']
        );

        expect(indexName).toBeDefined();
        expect(typeof indexName).toBe('string');
      });

      it('should appear in listIndexes', async () => {
        const indexName = await mongoConnector.ensureCompoundIndex<TestDoc>(
          'test-collection',
          ['name', 'age']
        );

        const indexes = await mongoConnector.listIndexes('test-collection');
        const compoundIndex = indexes.find(idx => idx.name === indexName);

        expect(compoundIndex).toBeDefined();
        expect(compoundIndex?.key).toHaveProperty('name');
        expect(compoundIndex?.key).toHaveProperty('age');
      });

      it('should support unique option for compound index', async () => {
        const indexName = await mongoConnector.ensureCompoundIndex<TestDoc>(
          'test-collection',
          ['name', 'age'],
          { unique: true }
        );

        const indexes = await mongoConnector.listIndexes('test-collection');
        const compoundIndex = indexes.find(idx => idx.name === indexName);

        expect(compoundIndex?.unique).toBe(true);
      });
    });

    describe('listIndexes', () => {
      it('should return array of index documents', async () => {
        // Create collection first by inserting a document
        await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });

        const indexes = await mongoConnector.listIndexes('test-collection');

        expect(Array.isArray(indexes)).toBe(true);
        expect(indexes.length).toBeGreaterThanOrEqual(1);
      });

      it('should include _id index by default', async () => {
        // Create collection first by inserting a document
        await mongoConnector.createOne('test-collection', { name: 'Bob', age: 25 });

        const indexes = await mongoConnector.listIndexes('test-collection');

        const idIndex = indexes.find(idx => idx.name === '_id_');
        expect(idIndex).toBeDefined();
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.listIndexes('test-collection')
        ).rejects.toThrow(ConnectionError);
      });
    });

    describe('dropIndex', () => {
      it('should remove specified index', async () => {
        // Create an index
        const indexName = await mongoConnector.ensureIndex<TestDoc>('test-collection', 'name');

        // Verify it exists
        let indexes = await mongoConnector.listIndexes('test-collection');
        expect(indexes.find(idx => idx.name === indexName)).toBeDefined();

        // Drop the index
        await mongoConnector.dropIndex('test-collection', indexName);

        // Verify it's gone
        indexes = await mongoConnector.listIndexes('test-collection');
        expect(indexes.find(idx => idx.name === indexName)).toBeUndefined();
      });

      it('should throw error for non-existent index', async () => {
        await expect(
          mongoConnector.dropIndex('test-collection', 'nonexistent_index_123')
        ).rejects.toThrow();
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.dropIndex('test-collection', 'some_index')
        ).rejects.toThrow(ConnectionError);
      });
    });
  });

  describe('Testing Bulk Operations', () => {
    describe('createMany', () => {
      it('should insert all documents successfully', async () => {
        const documents = [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 35 }
        ];

        const result = await mongoConnector.createMany('test-collection', documents);

        expect(result.inserted).toHaveLength(3);
        expect(result.failed).toHaveLength(0);
        expect(result.inserted[0]._id).toBeDefined();
        expect(result.inserted[0].name).toBe('Alice');
        expect(result.inserted[1].name).toBe('Bob');
        expect(result.inserted[2].name).toBe('Charlie');
      });

      it('should return inserted documents with _ids', async () => {
        const documents = [
          { name: 'David', age: 28 },
          { name: 'Eve', age: 32 }
        ];

        const result = await mongoConnector.createMany('test-collection', documents);

        expect(result.inserted).toHaveLength(2);
        result.inserted.forEach(doc => {
          expect(doc._id).toBeDefined();
          expect(doc.name).toBeDefined();
          expect(doc.age).toBeDefined();
        });
      });

      it('should throw ValidationError for empty array', async () => {
        await expect(
          mongoConnector.createMany('test-collection', [])
        ).rejects.toThrow();
      });

      it('should handle partial success with duplicate key errors', async () => {
        // Create unique index
        await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

        // Insert first document
        await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });

        // Try to insert multiple documents with one duplicate
        const documents = [
          { name: 'Bob', age: 25 },
          { name: 'Alice', age: 35 }, // Duplicate
          { name: 'Charlie', age: 40 }
        ];

        const result = await mongoConnector.createMany('test-collection', documents);

        expect(result.inserted.length).toBeGreaterThan(0);
        expect(result.failed.length).toBeGreaterThan(0);
        expect(result.failed[0].document.name).toBe('Alice');
      });

      it('should throw ValidationError when all documents fail', async () => {
        // Create unique index
        await mongoConnector.ensureUniqueIndex<TestDoc>('test-collection', 'name');

        // Insert a document
        await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });

        // Try to insert duplicates
        const documents = [
          { name: 'Alice', age: 35 }
        ];

        await expect(
          mongoConnector.createMany('test-collection', documents)
        ).rejects.toThrow();
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.createMany('test-collection', [{ name: 'Test', age: 20 }])
        ).rejects.toThrow(ConnectionError);
      });
    });

    describe('updateMany', () => {
      beforeEach(async () => {
        // Insert test data
        const collection = mongoConnector.getCollection('test-collection');
        await collection.insertMany([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 30 }
        ]);
      });

      it('should update all matching documents', async () => {
        const count = await mongoConnector.updateMany<TestDoc>(
          'test-collection',
          { age: 30 },
          { $set: { age: 31 } }
        );

        expect(count).toBe(2);

        // Verify updates
        const updated = await mongoConnector.getMany<TestDoc>('test-collection', { age: 31 });
        expect(updated).toHaveLength(2);
      });

      it('should return count of modified documents', async () => {
        const count = await mongoConnector.updateMany<TestDoc>(
          'test-collection',
          { name: 'Alice' },
          { $set: { age: 35 } }
        );

        expect(count).toBe(1);
      });

      it('should return 0 when no matches (does not throw)', async () => {
        const count = await mongoConnector.updateMany<TestDoc>(
          'test-collection',
          { name: 'NonExistent' },
          { $set: { age: 40 } }
        );

        expect(count).toBe(0);
      });

      it('should work with $set operator', async () => {
        const count = await mongoConnector.updateMany<TestDoc>(
          'test-collection',
          {},
          { $set: { age: 50 } }
        );

        expect(count).toBe(3);

        const allDocs = await mongoConnector.getMany<TestDoc>('test-collection');
        allDocs.forEach(doc => {
          expect(doc.age).toBe(50);
        });
      });

      it('should work with $inc operator', async () => {
        const count = await mongoConnector.updateMany<TestDoc>(
          'test-collection',
          { age: 30 },
          { $inc: { age: 5 } }
        );

        expect(count).toBe(2);

        const updated = await mongoConnector.getMany<TestDoc>('test-collection', { age: 35 });
        expect(updated).toHaveLength(2);
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.updateMany('test-collection', { age: 30 }, { $set: { age: 31 } })
        ).rejects.toThrow(ConnectionError);
      });
    });

    describe('deleteMany', () => {
      beforeEach(async () => {
        // Insert test data
        const collection = mongoConnector.getCollection('test-collection');
        await collection.insertMany([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 30 }
        ]);
      });

      it('should delete all matching documents', async () => {
        const count = await mongoConnector.deleteMany<TestDoc>('test-collection', { age: 30 });

        expect(count).toBe(2);

        const remaining = await mongoConnector.getMany<TestDoc>('test-collection');
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe('Bob');
      });

      it('should return count of deleted documents', async () => {
        const count = await mongoConnector.deleteMany<TestDoc>('test-collection', { name: 'Alice' });

        expect(count).toBe(1);
      });

      it('should return 0 when no matches (does not throw)', async () => {
        const count = await mongoConnector.deleteMany<TestDoc>('test-collection', { name: 'NonExistent' });

        expect(count).toBe(0);

        const remaining = await mongoConnector.getMany<TestDoc>('test-collection');
        expect(remaining).toHaveLength(3);
      });

      it('should throw ValidationError for empty filter', async () => {
        await expect(
          mongoConnector.deleteMany<TestDoc>('test-collection', {})
        ).rejects.toThrow();
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.deleteMany('test-collection', { age: 30 })
        ).rejects.toThrow(ConnectionError);
      });
    });

    describe('deleteAll', () => {
      beforeEach(async () => {
        // Insert test data
        const collection = mongoConnector.getCollection('test-collection');
        await collection.insertMany([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 35 }
        ]);
      });

      it('should delete all documents in collection', async () => {
        const count = await mongoConnector.deleteAll<TestDoc>('test-collection');

        expect(count).toBe(3);

        const remaining = await mongoConnector.getMany<TestDoc>('test-collection');
        expect(remaining).toHaveLength(0);
      });

      it('should return count of deleted documents', async () => {
        const count = await mongoConnector.deleteAll<TestDoc>('test-collection');

        expect(count).toBe(3);
      });

      it('should return 0 for empty collection', async () => {
        // Delete all first
        await mongoConnector.deleteAll<TestDoc>('test-collection');

        // Try again on empty collection
        const count = await mongoConnector.deleteAll<TestDoc>('test-collection');

        expect(count).toBe(0);
      });

      it('should throw ConnectionError when not connected', async () => {
        await mongoConnector.close();

        await expect(
          mongoConnector.deleteAll('test-collection')
        ).rejects.toThrow(ConnectionError);
      });
    });
  });

  describe('Library Silence (No Console Output)', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleInfoSpy: jest.SpyInstance;

    beforeEach(() => {
      // Spy on all console methods
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    });

    afterEach(() => {
      // Restore console methods
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });

    it('connect() should not call console.log', async () => {
      const uri = mongoServer.getUri();
      await mongoConnector.connect(uri, 'test-db');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('close() should not call console.log', async () => {
      await mongoConnector.close();

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('setDB() should not call console.log', () => {
      mongoConnector.setDB('test-db');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('CRUD operations should not call console.log or console.error', async () => {
      // Create
      const created = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 });
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Read
      await mongoConnector.getOne('test-collection', { name: 'Alice' });
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Update
      await mongoConnector.updateOne('test-collection', { _id: created._id, age: 31 });
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Delete
      await mongoConnector.deleteOne('test-collection', { _id: created._id });
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('index operations should not call console.log', async () => {
      await mongoConnector.ensureIndex<TestDoc>('test-collection', 'name');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      await mongoConnector.listIndexes('test-collection');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('errors should not call console.error', async () => {
      await mongoConnector.close();

      try {
        await mongoConnector.createOne('test-collection', { name: 'Bob', age: 25 });
      } catch (error) {
        // Error expected
      }

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});


