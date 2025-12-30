/**
 * DogCache - Local caching layer using IndexedDB
 */

import { Dog } from './client';

// Extended Dog type with search field for caching
interface CachedDog extends Dog {
    searchName: string;
}

export class DogCache {
    private dbName: string;
    private dbVersion: number;
    private storeName: string;
    private db: IDBDatabase | null;

    constructor() {
        this.dbName = 'QuickerCheckerDB';
        this.dbVersion = 1;
        this.storeName = 'dogs';
        this.db = null;
    }

    async init(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    // Index for searching by name and owner
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('ownerLastName', 'ownerLastName', { unique: false });
                    // Combined index for better searching if needed
                    store.createIndex('searchName', 'searchName', { unique: false });
                }
            };

            request.onsuccess = (event: Event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve(this.db);
            };

            request.onerror = (event: Event) => {
                console.error('IndexedDB error:', (event.target as IDBOpenDBRequest).error);
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
    }

    async putDogs(dogs: Dog[]): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            dogs.forEach(dog => {
                // Add a lowercase search field for easier matching
                const cachedDog: CachedDog = {
                    ...dog,
                    searchName: ((dog.name || '') + ' ' + (dog.owner_last_name || '')).toLowerCase()
                };
                store.put(cachedDog);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event: Event) => reject((event.target as IDBRequest).error);
        });
    }

    async search(query: string): Promise<CachedDog[]> {
        await this.init();
        const queryLower = query.toLowerCase();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const results: CachedDog[] = [];

            // We iterate and filter because IndexedDB doesn't support easy "contains" search on indexes
            // For small to medium datasets (a few thousand dogs), this is very fast locally
            const request = store.openCursor();

            request.onsuccess = (event: Event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
                if (cursor) {
                    const dog = cursor.value as CachedDog;
                    if (dog.searchName.includes(queryLower)) {
                        results.push(dog);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (event: Event) => reject((event.target as IDBRequest).error);
        });
    }

    async clear(): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event: Event) => reject((event.target as IDBRequest).error);
        });
    }

    async getCount(): Promise<number> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event: Event) => reject((event.target as IDBRequest).error);
        });
    }
}

export const dogCache = new DogCache();
