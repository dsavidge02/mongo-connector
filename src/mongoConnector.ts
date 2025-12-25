import { MongoClient, Db, Collection, Document, Filter, WithId, ObjectId, OptionalUnlessRequiredId, UpdateFilter, MatchKeysAndValues, CreateIndexesOptions, MongoBulkWriteError, WriteError }  from 'mongodb';
import { ConnectionError, DuplicateKeyError, ValidationError, DocumentNotFoundError, OperationFailedError, parseDuplicateKeyError, extractDuplicateKeyFieldInfo } from './errors';
import { assertNotEmpty, withRetry, RetryOptions, toObjectId } from './utils';
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

    /**
     * Returns the singleton instance of MongoConnector.
     *
     * @returns The singleton MongoConnector instance
     *
     * @example
     * ```typescript
     * const connector = MongoConnector.getInstance();
     * await connector.connect('mongodb://localhost:27017', 'mydb');
     * ```
     */
    static getInstance(): MongoConnector {
        if (!MongoConnector.instance) {
            MongoConnector.instance = new MongoConnector();
        }
        return MongoConnector.instance;
    }

    // Creates a new instance of mongoConnector - UNUSED
    private static createInstance(): MongoConnector {
        return new MongoConnector();
    }

    /**
     * Checks if the MongoClient is currently connected to the database.
     *
     * @returns True if connected, false otherwise
     *
     * @example
     * ```typescript
     * if (connector.isConnected()) {
     *     console.log('Database is ready');
     * }
     * ```
     */
    isConnected(): boolean {
        return this.connected && this.client !== null;
    }

    // Throws an error if MongoClient is not connected
    private assertConnected(): void {
        if (!this.isConnected()) {
            throw new ConnectionError('MongoClient is not connected. Call connect() first.');
        }
    }

    /**
     * Connects to MongoDB using the provided URI and database name.
     * Automatically closes any existing connection before establishing a new one.
     * Supports automatic retry with configurable options.
     *
     * @param mongoUri - MongoDB connection URI (e.g., 'mongodb://localhost:27017')
     * @param dbName - Optional name of the database to connect to. Can be set later with setDB()
     * @param options - Optional connection options
     * @param options.retry - Retry configuration for connection attempts
     * @param options.retry.maxAttempts - Maximum number of retry attempts (default: 3)
     * @param options.retry.baseDelayMs - Base delay in milliseconds before retrying (default: 1000)
     * @param options.retry.maxDelayMs - Maximum delay in milliseconds before retrying (default: 10000)
     *
     * @throws {ConnectionError} If connection fails after all retry attempts
     *
     * @example
     * ```typescript
     * // Basic connection
     * await connector.connect('mongodb://localhost:27017', 'mydb');
     *
     * // Connection with retry options
     * await connector.connect('mongodb://localhost:27017', 'mydb', {
     *     retry: { maxAttempts: 5, baseDelayMs: 2000 }
     * });
     * ```
     */
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

    /**
     * Closes the MongoClient connection and cleans up resources.
     * Safe to call even if not connected.
     *
     * @example
     * ```typescript
     * await connector.close();
     * ```
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.connected = false;
        }
    }

    /**
     * Sets the database to use for subsequent operations.
     * Must be called after connect() if database name wasn't provided during connection.
     *
     * @param dbName - Name of the database to use
     *
     * @throws {ConnectionError} If not connected to MongoDB
     *
     * @example
     * ```typescript
     * await connector.connect('mongodb://localhost:27017');
     * connector.setDB('mydb');
     * ```
     */
    setDB(dbName: string): void {
        this.assertConnected();
        this.db = this.client!.db(dbName);
    }

    /**
     * Returns the currently selected MongoDB database instance.
     * Provides direct access to the native MongoDB Db object for advanced operations.
     *
     * @returns The MongoDB Db instance
     *
     * @throws {ConnectionError} If database has not been selected
     *
     * @example
     * ```typescript
     * const db = connector.getDB();
     * const collections = await db.listCollections().toArray();
     * ```
     */
    getDB(): Db {
        if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
        return this.db;
    }

    /**
     * Returns a typed MongoDB collection instance.
     * Provides direct access to the native MongoDB Collection object for advanced operations.
     *
     * @template T - Document type for the collection
     * @param collectionName - Name of the collection
     * @returns The typed MongoDB Collection instance
     *
     * @throws {ConnectionError} If database has not been selected
     *
     * @example
     * ```typescript
     * interface User { name: string; email: string; }
     * const users = connector.getCollection<User>('users');
     * await users.createIndex({ email: 1 }, { unique: true });
     * ```
     */
    getCollection<T extends Document>(collectionName: string): Collection<T> {
        if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');
        return this.db.collection<T>(collectionName);
    }

    /**
     * Finds and returns a single document matching the query.
     * Automatically converts string _id values to ObjectId for convenience.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to query
     * @param query - MongoDB filter query. String _id values are automatically converted to ObjectId
     * @returns The matching document with _id, or null if not found
     *
     * @throws {OperationFailedError} If the database operation fails
     *
     * @example
     * ```typescript
     * // Find by _id (string automatically converted)
     * const user = await connector.getOne('users', { _id: '507f1f77bcf86cd799439011' });
     *
     * // Find by other field
     * const user = await connector.getOne('users', { email: 'user@example.com' });
     * ```
     */
    async getOne<T extends Document>(collectionName: string, query: Filter<T>): Promise<WithId<T> | null> {
        try {
            // Convert string _id to ObjectId if needed
            const normQuery: Filter<T> = (query._id && typeof query._id === 'string'
                ? { ...query, _id: toObjectId(query._id) }
                : query) as Filter<T>;

            const result = await this.getCollection<T>(collectionName).findOne(normQuery);
            return result;
        }
        catch (err) {
            throw new OperationFailedError('findOne', collectionName, err as Error);
        }
    }

    /**
     * Finds multiple documents matching a filter with support for sorting, pagination, and limits.
     * Automatically converts string _id values to ObjectId for convenience.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to query
     * @param filter - MongoDB filter query (default: {} for all documents)
     * @param options - Query options for sorting, pagination, and limiting results
     * @param options.sort - Sort specification (e.g., { name: 1 } for ascending)
     * @param options.skip - Number of documents to skip (for pagination)
     * @param options.limit - Maximum number of documents to return
     * @returns Array of matching documents with _id
     *
     * @throws {ConnectionError} If not connected or database not selected
     * @throws {OperationFailedError} If the database operation fails
     *
     * @example
     * ```typescript
     * // Get all users
     * const users = await connector.getMany('users');
     *
     * // Get with filter and sorting
     * const activeUsers = await connector.getMany('users',
     *     { status: 'active' },
     *     { sort: { createdAt: -1 }, limit: 10 }
     * );
     *
     * // Pagination
     * const page2 = await connector.getMany('users', {}, { skip: 20, limit: 20 });
     * ```
     */
    async getMany<T extends Document>(
        collectionName: string,
        filter: Filter<T> = {},
        options: QueryOptions = {}
    ): Promise<WithId<T>[]> {
        try {
            this.assertConnected();
            if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');

            // Convert string _id to ObjectId if needed
            const normFilter: Filter<T> = (filter._id && typeof filter._id === 'string'
                ? { ...filter, _id: toObjectId(filter._id) }
                : filter) as Filter<T>;

            let cursor = this.getCollection<T>(collectionName).find(normFilter);

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
        catch (err) {
            if (err instanceof ConnectionError) {
                throw err;
            }
            throw new OperationFailedError('find', collectionName, err as Error);
        }
    }

    /**
     * Counts the number of documents matching a filter.
     * Automatically converts string _id values to ObjectId for convenience.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to query
     * @param filter - MongoDB filter query (default: {} for all documents)
     * @returns The count of matching documents
     *
     * @throws {ConnectionError} If not connected or database not selected
     * @throws {OperationFailedError} If the database operation fails
     *
     * @example
     * ```typescript
     * // Count all documents
     * const total = await connector.count('users');
     *
     * // Count with filter
     * const activeCount = await connector.count('users', { status: 'active' });
     * ```
     */
    async count<T extends Document>(
        collectionName: string,
        filter: Filter<T> = {}
    ): Promise<number> {
        try {
            this.assertConnected();
            if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');

            // Convert string _id to ObjectId if needed
            const normFilter: Filter<T> = (filter._id && typeof filter._id === 'string'
                ? { ...filter, _id: toObjectId(filter._id) }
                : filter) as Filter<T>;

            return this.getCollection<T>(collectionName).countDocuments(normFilter);
        }
        catch (err) {
            if (err instanceof ConnectionError) {
                throw err;
            }
            throw new OperationFailedError('countDocuments', collectionName, err as Error);
        }
    }

    /**
     * Checks if any document matches the filter.
     * More efficient than getOne() when you only need an existence check.
     * Only fetches the _id field for optimal performance.
     * Automatically converts string _id values to ObjectId for convenience.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to query
     * @param filter - MongoDB filter query
     * @returns True if at least one matching document exists, false otherwise
     *
     * @throws {ConnectionError} If not connected or database not selected
     * @throws {OperationFailedError} If the database operation fails
     *
     * @example
     * ```typescript
     * // Check if user exists
     * const userExists = await connector.exists('users', { email: 'user@example.com' });
     * if (userExists) {
     *     console.log('User already registered');
     * }
     * ```
     */
    async exists<T extends Document>(
        collectionName: string,
        filter: Filter<T>
    ): Promise<boolean> {
        try {
            this.assertConnected();
            if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');

            // Convert string _id to ObjectId if needed
            const normFilter: Filter<T> = (filter._id && typeof filter._id === 'string'
                ? { ...filter, _id: toObjectId(filter._id) }
                : filter) as Filter<T>;

            const doc = await this.getCollection<T>(collectionName).findOne(normFilter, {
                projection: { _id: 1 },
                limit: 1
            });

            return doc !== null;
        }
        catch (err) {
            if (err instanceof ConnectionError) {
                throw err;
            }
            throw new OperationFailedError('exists', collectionName, err as Error);
        }
    }


    /**
     * Inserts a single document into the collection.
     * Returns the inserted document with its generated _id.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to insert into
     * @param newObj - Document to insert (without _id, will be generated)
     * @returns The inserted document with its generated _id
     *
     * @throws {ConnectionError} If not connected or database not selected
     * @throws {DuplicateKeyError} If a unique constraint is violated
     * @throws {OperationFailedError} If the insert operation fails
     *
     * @example
     * ```typescript
     * interface User { name: string; email: string; }
     *
     * const newUser = await connector.createOne<User>('users', {
     *     name: 'John Doe',
     *     email: 'john@example.com'
     * });
     * console.log(newUser._id); // Generated ObjectId
     * ```
     */
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
                throw new OperationFailedError('insertOne', collectionName);
            }

            return {
                ...newObj,
                _id: result.insertedId
            } as WithId<T>;
        } catch (err) {
            const duplicateError = parseDuplicateKeyError(err, collectionName);
            if (duplicateError) {
                throw duplicateError;
            }
            throw err;
        }
    }

    /**
     * Updates a single document by _id and returns the updated document.
     * Uses $set operator to update only the specified fields.
     * Automatically converts string _id to ObjectId.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to update
     * @param updateObj - Partial document with _id and fields to update
     * @returns The updated document with all fields
     *
     * @throws {ValidationError} If _id is not provided
     * @throws {DocumentNotFoundError} If no document matches the _id
     * @throws {OperationFailedError} If the update operation fails
     *
     * @example
     * ```typescript
     * // Update specific fields
     * const updated = await connector.updateOne('users', {
     *     _id: '507f1f77bcf86cd799439011',
     *     email: 'newemail@example.com'
     * });
     *
     * // Update multiple fields
     * const updated = await connector.updateOne('users', {
     *     _id: userId,
     *     name: 'Jane Doe',
     *     status: 'active'
     * });
     * ```
     */
    async updateOne<T extends Document>(
        collectionName: string,
        updateObj: Partial<T> & { _id: string | ObjectId }
    ): Promise<WithId<T>> {
        try {
            const { _id, ...otherFields } = updateObj;

            if (!_id) {
                throw new ValidationError('_id parameter is required for updateOne', '_id');
            }

            const updateFields: UpdateFilter<T> = {
                $set: { ...otherFields } as unknown as MatchKeysAndValues<T>
            };

            const query: Filter<Document> = { _id: typeof _id === 'string' ? toObjectId(_id) : _id };

            const result = await this.getCollection<T>(collectionName).findOneAndUpdate(
                query,
                updateFields,
                { returnDocument: 'after' }
            );

            if (!result || !result._id) {
                throw new DocumentNotFoundError(collectionName, typeof _id === 'string' ? _id : _id.toString());
            }

            return result;
        }
        catch (err) {
            if (err instanceof DocumentNotFoundError) {
                throw err;
            }
            throw new OperationFailedError('updateOne', collectionName, err as Error);
        }
    }

    /**
     * Deletes a single document by _id.
     * Automatically converts string _id to ObjectId.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to delete from
     * @param deleteObj - Object containing the _id of the document to delete
     * @returns True if document was successfully deleted
     *
     * @throws {ValidationError} If _id is not provided
     * @throws {DocumentNotFoundError} If no document matches the _id
     * @throws {OperationFailedError} If the delete operation fails
     *
     * @example
     * ```typescript
     * // Delete by _id
     * const deleted = await connector.deleteOne('users', {
     *     _id: '507f1f77bcf86cd799439011'
     * });
     * if (deleted) {
     *     console.log('User deleted successfully');
     * }
     * ```
     */
    async deleteOne<T extends Document>(
        collectionName: string,
        deleteObj: Partial<T> & { _id: string | ObjectId }
    ): Promise<boolean> {
        try {
            const { _id } = deleteObj;

            if (!_id) {
                throw new ValidationError('_id parameter is required for deleteOne', '_id');
            }

            const query: Filter<Document> = { _id: typeof _id === 'string' ? toObjectId(_id) : _id };

            const result = await this.getCollection<T>(collectionName).deleteOne(query);

            if (result.deletedCount === 1) {
                return true;
            }
            else {
                throw new DocumentNotFoundError(collectionName, typeof _id === 'string' ? _id : _id.toString());
            }
        }
        catch (err) {
            if (err instanceof DocumentNotFoundError) {
                throw err;
            }
            throw new OperationFailedError('deleteOne', collectionName, err as Error);
        }
    }

    /**
     * Creates an index on a single collection field.
     * Index creation is idempotent - calling it multiple times is safe.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection
     * @param field - Field name to create index on
     * @param options - MongoDB index options (unique, sparse, expireAfterSeconds, etc.)
     * @returns The name of the created index
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * // Create simple index
     * await connector.ensureIndex('users', 'email');
     *
     * // Create TTL index (auto-delete after 30 days)
     * await connector.ensureIndex('sessions', 'createdAt', {
     *     expireAfterSeconds: 2592000
     * });
     * ```
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
     * Creates a unique index on a single collection field.
     * Ensures that the field value is unique across all documents.
     * Convenience method that calls ensureIndex() with { unique: true }.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection
     * @param field - Field name to create unique index on
     * @returns The name of the created index
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * // Ensure email uniqueness
     * await connector.ensureUniqueIndex('users', 'email');
     *
     * // Future inserts with duplicate email will throw DuplicateKeyError
     * ```
     */
    async ensureUniqueIndex<T extends Document>(
        collectionName: string,
        field: keyof T & string
    ): Promise<string> {
        return this.ensureIndex<T>(collectionName, field, { unique: true });
    }

    /**
     * Creates a compound index on multiple fields.
     * Useful for queries that filter on multiple fields or for ensuring uniqueness across multiple fields.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection
     * @param fields - Array of field names to include in the compound index
     * @param options - MongoDB index options (unique, sparse, etc.)
     * @returns The name of the created index
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * // Create compound index for efficient queries
     * await connector.ensureCompoundIndex('orders', ['userId', 'createdAt']);
     *
     * // Create unique compound index (e.g., one vote per user per post)
     * await connector.ensureCompoundIndex('votes', ['userId', 'postId'], {
     *     unique: true
     * });
     * ```
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
     * Returns detailed information about each index including name, keys, and options.
     *
     * @param collectionName - Name of the collection
     * @returns Array of index specification documents
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * const indexes = await connector.listIndexes('users');
     * indexes.forEach(index => {
     *     console.log(`Index: ${index.name}, Keys: ${JSON.stringify(index.key)}`);
     * });
     * ```
     */
    async listIndexes(collectionName: string): Promise<Document[]> {
        this.assertConnected();
        if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');

        return this.db.collection(collectionName).listIndexes().toArray();
    }

    /**
     * Drops an index from a collection by its name.
     * Use listIndexes() to find the names of existing indexes.
     * Note: Cannot drop the default _id index.
     *
     * @param collectionName - Name of the collection
     * @param indexName - Name of the index to drop
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * // Drop an index by name
     * await connector.dropIndex('users', 'email_1');
     * ```
     */
    async dropIndex(collectionName: string, indexName: string): Promise<void> {
        this.assertConnected();
        if (!this.db) throw new ConnectionError('Database not selected. Call setDB() first.');

        await this.db.collection(collectionName).dropIndex(indexName);
    }

    /**
     * Inserts multiple documents in a single operation.
     * Uses unordered inserts (continues on error) to maximize throughput.
     * Returns both successful inserts and failures for partial success scenarios.
     *
     * **Bulk Write Behavior:**
     * - Uses MongoDB's `insertMany` with `{ ordered: false }` option
     * - Continues processing remaining documents even if some fail
     * - Partial success is supported: some documents may succeed while others fail
     * - Failed documents are typically due to duplicate key violations on unique indexes
     *
     * **Error Handling:**
     * - Catches `MongoBulkWriteError` to handle partial failures
     * - Parses `writeErrors` array to identify which documents failed and why
     * - Maps successful insertions from `insertedIds` and failed ones from `writeErrors`
     * - Throws `ValidationError` only if ALL documents fail to insert
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to insert into
     * @param documents - Array of documents to insert (without _id, will be generated)
     * @returns Object containing inserted documents (with _id) and failed documents with errors
     *
     * @throws {ConnectionError} If not connected or database not selected
     * @throws {ValidationError} If documents array is empty or all inserts fail
     *
     * @example
     * ```typescript
     * const users = [
     *     { name: 'Alice', email: 'alice@example.com' },
     *     { name: 'Bob', email: 'bob@example.com' },
     *     { name: 'Charlie', email: 'alice@example.com' } // Duplicate email
     * ];
     *
     * const result = await connector.createMany('users', users);
     * console.log(`Inserted: ${result.inserted.length}`);
     * console.log(`Failed: ${result.failed.length}`);
     *
     * result.failed.forEach(f => {
     *     console.log(`Failed to insert ${f.document.name}: ${f.error.message}`);
     * });
     * ```
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
        } catch (err: unknown) {
            // Handle partial failure (some docs inserted, some failed)
            if (err instanceof MongoBulkWriteError) {
                // Normalize writeErrors to array (handles OneOrMore<WriteError> type)
                const writeErrors = Array.isArray(err.writeErrors)
                    ? err.writeErrors
                    : [err.writeErrors];

                // Process write errors
                const failedIndexes = new Set(
                    writeErrors.map((we) => we.index)
                );

                documents.forEach((doc, index) => {
                    if (failedIndexes.has(index)) {
                        const writeError = writeErrors.find((we) => we.index === index);

                        // Extract field info from the write error
                        const { fieldName, fieldValue } = extractDuplicateKeyFieldInfo(writeError || {});

                        result.failed.push({
                            document: doc,
                            error: new DuplicateKeyError(
                                collectionName,
                                fieldName,
                                fieldValue
                            )
                        });
                    } else if (err.result.insertedIds?.[index]) {
                        result.inserted.push({
                            ...doc,
                            _id: err.result.insertedIds[index]
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
     * Updates all documents matching the filter.
     * Uses MongoDB update operators ($set, $inc, $push, etc.).
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to update
     * @param filter - MongoDB filter query to match documents
     * @param update - MongoDB update operations (must use operators like $set, $inc, etc.)
     * @returns Count of documents modified
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * // Update all inactive users
     * const modifiedCount = await connector.updateMany('users',
     *     { status: 'inactive' },
     *     { $set: { status: 'archived' } }
     * );
     *
     * // Increment all product prices by 10%
     * await connector.updateMany('products',
     *     { category: 'electronics' },
     *     { $mul: { price: 1.1 } }
     * );
     * ```
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
     * Deletes all documents matching the filter.
     * Includes safety check: requires non-empty filter to prevent accidental collection wipe.
     * Use deleteAll() if you intend to delete all documents in a collection.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to delete from
     * @param filter - MongoDB filter query (must be non-empty)
     * @returns Count of documents deleted
     *
     * @throws {ConnectionError} If not connected or database not selected
     * @throws {ValidationError} If filter is empty (use deleteAll() instead)
     *
     * @example
     * ```typescript
     * // Delete all inactive users
     * const deletedCount = await connector.deleteMany('users', {
     *     status: 'inactive',
     *     lastLogin: { $lt: new Date('2023-01-01') }
     * });
     * console.log(`Deleted ${deletedCount} inactive users`);
     * ```
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
     * This is an explicit, separate method to prevent accidental data loss.
     * Use this instead of deleteMany() with an empty filter.
     *
     * @template T - Document type
     * @param collectionName - Name of the collection to clear
     * @returns Count of documents deleted
     *
     * @throws {ConnectionError} If not connected or database not selected
     *
     * @example
     * ```typescript
     * // Clear entire collection
     * const deletedCount = await connector.deleteAll('temp_cache');
     * console.log(`Cleared ${deletedCount} documents from cache`);
     * ```
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