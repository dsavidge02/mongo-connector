import { MongoClient, Db, Collection, Document, Filter, WithId, ObjectId, OptionalUnlessRequiredId, UpdateFilter, MatchKeysAndValues, CreateIndexesOptions }  from 'mongodb';
import { ConnectionError, DuplicateKeyError, ValidationError } from './errors';
import { withRetry, RetryOptions } from './utils/retry';
import { assertNotEmpty } from './utils';
import { QueryOptions, BulkCreateResult } from './types';

export interface ConnectOptions {
    retry?: Partial<RetryOptions>;
    // MongoClientOptions can be added here
}

class MongoConnector {
    private static instance: MongoConnector;
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private connected: boolean = false;

    private constructor() {}

    static getInstance(): MongoConnector {
        if (!MongoConnector.instance) {
            MongoConnector.instance = new MongoConnector();
        }
        return MongoConnector.instance;
    }

    private static createInstance(): MongoConnector {
        return new MongoConnector();
    }

    isConnected(): boolean {
        return this.connected && this.client !== null;
    }

    private assertConnected(): void {
        if (!this.isConnected()) {
            throw new ConnectionError('MongoClient is not connected. Call connect() first.');
        }
    }

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

    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.connected = false;
        }
    }

    setDB(dbName: string): void {
        this.assertConnected();
        this.db = this.client!.db(dbName);
    }

    getDB(): Db {
        if (!this.db) throw new Error('ERROR: Database not selected. Call setDB() first.');
        return this.db;
    }

    getCollection<T extends Document>(collectionName: string): Collection<T> {
        if (!this.db) throw new Error('Database is not selected. Call setDB() first.');
        return this.db.collection<T>(collectionName);
    }

    async getOne<T extends Document>(collectionName: string, query: Filter<T>): Promise<WithId<T> | null> {
        try {
            const normQuery: Filter<T> = {...query} as Filter<T>;
            if (normQuery._id && typeof normQuery._id === 'string') {
                normQuery._id = new ObjectId(normQuery._id) as any;
            }
            const result = await this.getCollection<T>(collectionName).findOne(normQuery);
            return result;
        }
        catch (err) {
            throw new Error('ERROR: Could not find document.');
        }
    }

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
            const message = 'message' in err && typeof err.message === 'string' ? err.message : '';
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

    async updateOne<T extends Document>(
        collectionName: string,
        updateObj: Partial<T> & { _id: string | ObjectId }
    ): Promise<WithId<T>> {
        try {
            const { _id, ...otherFields } = updateObj;

            if (!_id) {
                throw new Error('ERROR: _id is required for updateOne.');
            }

            const updateFields: UpdateFilter<T> = {
                $set: { ...otherFields } as unknown as MatchKeysAndValues<T>
            };

            const query: Filter<Document> = { _id: typeof _id === 'string' ? new ObjectId(_id) : _id };

            const result = await this.getCollection<T>(collectionName).findOneAndUpdate(
                query,
                updateFields,
                { returnDocument: 'after' }
            );

            if (!result || !result._id) {
                throw new Error(`ERROR: Unable to update document.`);
            }

            return result;
        }
        catch (err) {
            throw new Error('ERROR: Unable to update document.');
        }
    }

    async deleteOne<T extends Document>(
        collectionName: string,
        deleteObj: Partial<T> & { _id: string | ObjectId }
    ): Promise<boolean> {
        try {
            const { _id } = deleteObj;

            if (!_id) {
                throw new Error('ERROR: _id is required for deleteOne.');
            }

            const query: Filter<Document> = { _id: typeof _id === 'string' ? new ObjectId(_id) : _id };

            const result = await this.getCollection<T>(collectionName).deleteOne(query);

            if (result.deletedCount === 1) {
                return true;
            }
            else {
                throw new Error('ERROR: Unable to delete document.');
            }
        }
        catch (err) {
            throw new Error('ERROR: Unable to delete document.');
        }
    }

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
}

export { MongoConnector };
export const mongoConnector = MongoConnector.getInstance();