import { Sort, ClientSession, WithId } from 'mongodb';

export interface QueryOptions {
    limit?: number;
    skip?: number;
    sort?: Sort;
}

export interface OperationOptions {
    session?: ClientSession;
}

export interface BulkCreateResult<T> {
    inserted: WithId<T>[];
    failed: Array<{ document: T; error: Error }>;
}
