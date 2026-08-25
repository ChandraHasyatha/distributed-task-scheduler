import pg from 'pg';
import { IMemoryDb } from 'pg-mem';
export declare function getMemoryDb(): IMemoryDb;
export declare function initMemoryDatabase(): pg.Pool;
export declare function getPool(): pg.Pool;
export declare function query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>>;
export declare function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
export declare function isMemoryDbMode(): boolean;
export declare function closeDb(): Promise<void>;
