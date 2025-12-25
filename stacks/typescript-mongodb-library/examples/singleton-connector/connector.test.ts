import { MongoMemoryServer } from 'mongodb-memory-server';
import { mongoConnector } from './mongoConnector';

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
      
      expect(() => mongoConnector.setDB('test-db')).toThrow('MongoClient is not connected');
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

  describe('Testing Getting a Collection', () => {
    it('Getting a Collection', () => {
      const collection = mongoConnector.getCollection('test-collection');
      expect(collection).toBeDefined();
      expect(collection.collectionName).toBe('test-collection');
    });

    it('Getting a Collection Array', async () => {
      const collection = mongoConnector.getCollection('test-collection');
      await collection.insertMany([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ]);
      
      const results = await mongoConnector.getCollectionArray('test-collection');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Alice');
      expect(results[0].age).toBe(30);
      expect(results[1].name).toBe('Bob');
      expect(results[1].age).toBe(25);
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

  describe('Testing CreateOne', () => {
    it('Creating One Document', async() => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 }, ['name']);
      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
      expect(result?.age).toBe(30);

      const result2 = await mongoConnector.getOne('test-collection', { name: 'Alice' });
      expect(result2).toBeDefined();
      expect(result2?.name).toBe('Alice');
      expect(result2?.age).toBe(30);
    });

    it('Creating two documents with the same non-unique field', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 }, ['name']);
      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
      expect(result?.age).toBe(30);

      const result2 = await mongoConnector.createOne('test-collection', { name: 'Bob', age: 30 }, ['name']);
      expect(result2).toBeDefined();
      expect(result2?.name).toBe('Bob');
      expect(result2?.age).toBe(30);
    });

    it('Failing to Create One Document', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 }, ['name']);
      expect(result).toBeDefined();
      await expect(
        mongoConnector.createOne('test-collection', { name: 'Alice', age: 35 }, ['name'])
      ).rejects.toThrow('ERROR: Unable to create new document.');
    });
  });

  describe('Testing UpdateOne', () => {
    it('Updating One Document', async () => {
      const initResult = await mongoConnector.createOne<TestDoc>('test-collection', { name: 'Alice', age: 30 }, ['name']);
      expect(initResult).toBeDefined(); 
      expect(initResult?._id).toBeDefined();

      const updateResult = await mongoConnector.updateOne<TestDoc>('test-collection', { _id: initResult!._id, age: 35 });
      expect(updateResult).toBeDefined();
      expect(updateResult.name).toBe('Alice');
      expect(updateResult.age).toBe(35);
    });

    it('Failing to Update One Document', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 }, ['name']);
      expect(result).toBeDefined();
      await expect(
        mongoConnector.updateOne('test-collection', { _id: 'invalid-id', name:'Alice', age: 35 })
      ).rejects.toThrow('ERROR: Unable to update document.');
    });
  });

  describe('Testing DeleteOne', () => {
    it('Deleting One Document', async () => {
      const result = await mongoConnector.createOne('test-collection', { name: 'Alice', age: 30 }, ['name']);
      expect(result).toBeDefined();
      expect(result?._id).toBeDefined();

      const deleteResult = await mongoConnector.deleteOne('test-collection', { _id: result!._id });
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
});


