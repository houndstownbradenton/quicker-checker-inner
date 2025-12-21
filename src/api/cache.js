/**
 * DogCache - Local caching layer using IndexedDB
 */
export class DogCache {
    constructor() {
        this.dbName = 'QuickerCheckerDB';
        this.dbVersion = 1;
        this.storeName = 'dogs';
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    // Index for searching by name and owner
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('ownerLastName', 'ownerLastName', { unique: false });
                    // Combined index for better searching if needed
                    store.createIndex('searchName', 'searchName', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async putDogs(dogs) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            dogs.forEach(dog => {
                // Add a lowercase search field for easier matching
                dog.searchName = (dog.name + ' ' + dog.ownerLastName).toLowerCase();
                store.put(dog);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    async search(query) {
        await this.init();
        const queryLower = query.toLowerCase();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const results = [];

            // We iterate and filter because IndexedDB doesn't support easy "contains" search on indexes
            // For small to medium datasets (a few thousand dogs), this is very fast locally
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const dog = cursor.value;
                    if (dog.searchName.includes(queryLower)) {
                        results.push(dog);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async clear() {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getCount() {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }
}

export const dogCache = new DogCache();
