import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoConnector, mongoConnector } from '../mongoConnector';
import { resetMongoConnector, createTestConnector } from '../testing';

describe('Testing Utilities', () => {
    let mongoServer: MongoMemoryServer;
    let uri: string;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        uri = mongoServer.getUri();
    });

    afterAll(async () => {
        await mongoServer.stop();
    });

    afterEach(async () => {
        // Clean up any connections
        try {
            await mongoConnector.close();
        } catch (e) {
            // Ignore if not connected
        }
        resetMongoConnector();
    });

    describe('resetMongoConnector', () => {
        it('should reset singleton instance', async () => {
            // Get instance and connect
            const instance1 = MongoConnector.getInstance();
            await instance1.connect(uri, 'test-db-1');
            expect(instance1.isConnected()).toBe(true);

            // Close and reset
            await instance1.close();
            resetMongoConnector();

            // Get new instance - should be different
            const instance2 = MongoConnector.getInstance();
            expect(instance2.isConnected()).toBe(false);
        });

        it('should make getInstance() return fresh instance after reset', async () => {
            // First instance
            const instance1 = MongoConnector.getInstance();
            await instance1.connect(uri, 'test-db-1');

            const db1Name = instance1.getDB().databaseName;
            expect(db1Name).toBe('test-db-1');

            // Reset
            await instance1.close();
            resetMongoConnector();

            // Second instance
            const instance2 = MongoConnector.getInstance();
            await instance2.connect(uri, 'test-db-2');

            const db2Name = instance2.getDB().databaseName;
            expect(db2Name).toBe('test-db-2');

            await instance2.close();
        });

        it('should allow old instance to work independently after reset', async () => {
            // Get and connect first instance
            const instance1 = MongoConnector.getInstance();
            await instance1.connect(uri, 'test-db-1');
            expect(instance1.isConnected()).toBe(true);

            // Reset singleton (but instance1 still exists)
            resetMongoConnector();

            // Old instance should still be connected and functional
            expect(instance1.isConnected()).toBe(true);
            expect(instance1.getDB().databaseName).toBe('test-db-1');

            // New singleton instance should be different
            const instance2 = MongoConnector.getInstance();
            expect(instance2.isConnected()).toBe(false);

            // Clean up
            await instance1.close();
        });
    });

    describe('createTestConnector', () => {
        it('should return new instance', () => {
            const testInstance = createTestConnector();
            expect(testInstance).toBeInstanceOf(MongoConnector);
            expect(testInstance.isConnected()).toBe(false);
        });

        it('should create instance independent from singleton', async () => {
            // Connect singleton
            const singleton = MongoConnector.getInstance();
            await singleton.connect(uri, 'singleton-db');
            expect(singleton.isConnected()).toBe(true);

            // Create test instance
            const testInstance = createTestConnector();
            expect(testInstance.isConnected()).toBe(false);

            // Connect test instance to different db
            await testInstance.connect(uri, 'test-db');
            expect(testInstance.isConnected()).toBe(true);
            expect(testInstance.getDB().databaseName).toBe('test-db');

            // Singleton should still be connected to its db
            expect(singleton.isConnected()).toBe(true);
            expect(singleton.getDB().databaseName).toBe('singleton-db');

            // Clean up
            await singleton.close();
            await testInstance.close();
        });

        it('should allow multiple independent test instances', async () => {
            const test1 = createTestConnector();
            const test2 = createTestConnector();

            await test1.connect(uri, 'test-db-1');
            await test2.connect(uri, 'test-db-2');

            expect(test1.getDB().databaseName).toBe('test-db-1');
            expect(test2.getDB().databaseName).toBe('test-db-2');

            // Clean up
            await test1.close();
            await test2.close();
        });
    });
});
