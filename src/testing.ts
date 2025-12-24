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
