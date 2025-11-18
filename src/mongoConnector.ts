import { MongoClient, Db, Collection, Document, Filter, WithId, InsertOneResult, ObjectId, OptionalUnlessRequiredId, UpdateFilter, MatchKeysAndValues }  from 'mongodb';

class MongoConnector {
    private static instance: MongoConnector;
    private client: MongoClient | null = null;
    private db: Db | null = null;

    private constructor() {}

    static getInstance(): MongoConnector {
        if (!MongoConnector.instance) {
            MongoConnector.instance = new MongoConnector();
        }
        return MongoConnector.instance;
    }

    async connect(mongoUri: string, dbName?: string): Promise<void> {
        await this.close();
        try {
            this.client = new MongoClient(mongoUri);
            await this.client.connect();
            console.log('MongoDB connected.');

            if (dbName) {
                this.setDB(dbName);
            }
        }
        catch (err) {
            this.client = null;
            console.error('ERROR: Failed to connect with MongoDB:', err);
            throw new Error('ERROR: Failed to connect to MongoDB. Please validate your connection URI.');
        }
        
    }

    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            console.log('MongoDB connection closed.');
        }
    }

    setDB(dbName: string): void {
        if (!this.client) throw new Error('MongoClient is not connected. Call connect() first.');
        this.db = this.client.db(dbName);
        console.log(`MongoDB using database: ${dbName}`);
    }

    getDB(): Db {
        if (!this.db) throw new Error('ERROR: Database not selected. Call setDB() first.');
        return this.db;
    }

    getCollection<T extends Document>(collectionName: string): Collection<T> {
        if (!this.db) throw new Error('Database is not selected. Call setDB() first.');
        return this.db.collection<T>(collectionName);
    }

    async getCollectionArray<T extends Document>(collectionName: string): Promise<WithId<T>[]> {
        return this.getCollection<T>(collectionName).find({}).toArray();
    }

    async getOne<T extends Document>(collectionName: string, query: Filter<T>): Promise<WithId<T> | null> {
        try {
            const result = await this.getCollection<T>(collectionName).findOne(query);
            return result;
        }
        catch (err) {
            console.error('ERROR: Could not find document:', err);
            throw new Error('ERROR: Could not find document.');
        }
    }

    async createOne<T extends Document>(
        collectionName: string, 
        newObj: T, 
        uniqueFields: (keyof T)[]
    ): Promise<WithId<T> | null> {
        try {
            for (const field of uniqueFields) {
                const value = newObj[field];
                const query: Filter<T> = { [field]: value } as Filter<T>;
                const existingDoc = await this.getOne<T>(collectionName, query);
                if (existingDoc) {
                    console.error(`ERROR: Existing document with unique ${String(field)}: ${value} already exists. See ${existingDoc._id}`);
                    throw new Error('ERROR: Failed to create new document. Unique fields overlap with existing document.');
                }
            }

            const result: InsertOneResult<T> = await this.getCollection<T>(collectionName).insertOne(newObj as OptionalUnlessRequiredId<T>);
            
            if (result.acknowledged) {
                console.log('Document successfully created.');
                return {
                    ...newObj,
                    _id: result.insertedId
                } as WithId<T>;
            }
            else {
                console.log('ERROR: Unable to insert document into collection.');
                throw new Error('ERROR: Unable to insert document into collection.');
            }
        }
        catch (err) {
            console.error('ERROR: Unable to create document:', err);
            throw new Error('ERROR: Unable to create new document.');
        }
    }

    async updateOne<T extends Document>(
        collectionName: string, 
        updateObj: Partial<T> & { _id: string | ObjectId }
    ): Promise<WithId<T>> {
        try {
            const { _id, ...otherFields } = updateObj;
            
            if (!_id) {
                console.error('ERROR: _id is required for use of updateOne.');
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

            if (!result || !result.value) {
                console.error(`ERROR: No document found for the given object id: ${_id}.`);
                throw new Error(`ERROR: Unable to update document.`);
            }

            return result.value;
        }
        catch (err) {
            console.error('ERROR: Unable to update document:', err);
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
                console.error('ERROR: _id is required for use of deleteOne.');
                throw new Error('ERROR: _id is required for deleteOne.');
            }

            const query: Filter<Document> = { _id: typeof _id === 'string' ? new ObjectId(_id) : _id };

            const result = await this.getCollection<T>(collectionName).deleteOne(query);

            if (result.deletedCount === 1) {
                console.log(`Successfully deleted document with ${_id}`);
                return true;
            }
            else {
                console.error(`ERROR: Unable to delete document with ${_id}`);
                throw new Error('ERROR: Unable to delete document.');
            }
        }
        catch (err) {
            console.error('ERROR: Unable to delete document:', err);
            throw new Error('ERROR: Unable to delete document.');
        }
    }
}

export const mongoConnector = MongoConnector.getInstance();

