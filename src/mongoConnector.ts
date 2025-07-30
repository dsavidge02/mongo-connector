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

    async connect(mongoUri: string): Promise<void> {
        await this.close();
        this.client = new MongoClient(mongoUri);
        await this.client.connect();
        console.log('MongoDB connected.');
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
        console.log(`Using database: ${dbName}`);
    }

    getCollection<T extends Document = Document>(collectionName: string): Collection<T> {
        if (!this.client) throw new Error('MongoClient is not connected. Call connect() first.');
        if (!this.db) throw new Error('Database is not selected. Call setDB() first.');
        return this.db.collection<T>(collectionName);
    }

    async getCollectionArray<T extends Document = Document>(collectionName: string): Promise<WithId<T>[]> {
        return this.getCollection<T>(collectionName).find({}).toArray();
    }

    async getOne<T extends Document = Document>(collectionName: string, query: Filter<T>): Promise<WithId<T> | null> {
        try {
            const result = await this.getCollection<T>(collectionName).findOne(query);
            return result;
        }
        catch (err) {
            console.error('Error finding document:', err);
            throw err;
        }
    }

    async createOne<T extends Document = Document>(
        collectionName: string, 
        newObj: T, 
        uniqueFields: (keyof T)[]): 
    Promise<WithId<T>> {
        try {
            for (const field of uniqueFields) {
                const value = newObj[field];
                const query: Filter<T> = { [field]: value } as Filter<T>;
                const existingDoc = await this.getOne<T>(collectionName, query);
                if (existingDoc) {
                    throw new Error(`Document with unique ${String(field)} = ${value} already exists: ${existingDoc._id}`);
                }
            }

            const result: InsertOneResult<T> = await this.getCollection<T>(collectionName).insertOne(newObj as OptionalUnlessRequiredId<T>);
            console.log(`Successfully inserted a new document: ${result.insertedId}`);

            return {
                ...newObj,
                _id: result.insertedId
            } as WithId<T>;
        }
        catch (err) {
            console.error('Error creating document:', err);
            throw err;
        }
    }

    async updateOne<T extends Document = Document>(
        collectionName: string, 
        updateObj: Partial<T> & { _id: string | ObjectId }): 
    Promise<WithId<T>> {
        try {
            const { _id, ...rest } = updateObj;
            
            if (!_id) {
                throw new Error('_id is required for updateOne.');
            }

            const updateFields: UpdateFilter<T> = {
                $set: { ...rest } as unknown as MatchKeysAndValues<T>
            };
            
            const query: Filter<Document> = { _id: typeof _id === 'string' ? new ObjectId(_id) : _id };
            
            const result = await this.getCollection<T>(collectionName).findOneAndUpdate(
                query,
                updateFields,
                { returnDocument: 'after' }
            );

            if (!result || result?.value) {
                throw new Error(`No document found for the given object id: ${_id}.`);
            }

            return result.value;
        }
        catch (err) {
            console.error('Error updating document:', err);
            throw err;
        }
    }

    async deleteOne<T extends Document = Document>(
        collectionName: string,
        deleteObj: Partial<T> & { _id: string | ObjectId }):
    Promise<boolean> {
        try {
            const { _id } = deleteObj;

            if (!_id) {
                throw new Error('_id is required for deleteOne.');
            }

            const query: Filter<Document> = { _id: typeof _id === 'string' ? new ObjectId(_id) : _id };

            const result = await this.getCollection<T>(collectionName).deleteOne(query);

            return result.deletedCount === 1;
        }
        catch (err) {
            console.error('Error deleting document:', err);
            throw err;
        }
    }
}

export const mongoConnector = MongoConnector.getInstance();

