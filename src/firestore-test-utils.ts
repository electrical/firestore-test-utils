
/**
 * @fileOverview A utility for creating a consistent, in-memory mock of the Firebase Admin Firestore SDK for testing.
 * This helps avoid repetitive and error-prone manual mocking in individual test files.
 */

import { jest } from '@jest/globals';

// --- Type Definitions for Clarity and Safety ---
type DocumentData = { [key: string]: any };
type CollectionData = { [key:string]: DocumentData };
type MockDbData = { [key: string]: CollectionData };
type UnknownFunction = (...args: unknown[]) => unknown;

/**
 * Custom deep cloning function that preserves mock Timestamp objects.
 * JSON.stringify and JSON.parse would strip methods like .toDate().
 */
const deepCloneWithTimestamp = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Check if the object is a mock Timestamp
    if (typeof obj.toDate === 'function' || (typeof obj === 'object' && obj._seconds !== undefined && obj._nanoseconds !== undefined)) {
        const date = obj.toDate ? obj.toDate() : new Date(obj._seconds * 1000 + obj._nanoseconds / 1e6);
        return {
             _seconds: Math.floor(date.getTime() / 1000),
             _nanoseconds: (date.getTime() % 1000) * 1e6,
             toDate: (): Date => date,
             toMillis: (): number => date.getTime(),
        };
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (Array.isArray(obj)) {
        return obj.map(deepCloneWithTimestamp);
    }

    const newObj: DocumentData = Object.assign({}, obj);
    for (const key in newObj) {
        if (Object.prototype.hasOwnProperty.call(newObj, key)) {
            newObj[key] = deepCloneWithTimestamp(newObj[key]);
        }
    }
    return newObj;
};


/**
 * Creates a mock Firestore instance with basic implementations for common methods.
 * @param initialData - An object representing the initial state of the database.
 *   e.g., { users: { 'user1': { name: 'Alice' } }, posts: { 'post1': { title: 'Hello' } } }
 */
export const createFirestoreMock = (initialData: MockDbData = {}) => {
  let dbData: MockDbData = deepCloneWithTimestamp(initialData);

  const mockBatch = {
    _operations: [] as { type: 'set' | 'update' | 'delete'; ref: any; data?: DocumentData; options?: any }[],
    set: jest.fn(function(this: any, docRef: any, data: DocumentData, options?: { merge?: boolean }) {
        this._operations.push({ type: 'set', ref: docRef, data, options });
        return this;
    }),
    update: jest.fn(function(this: any, docRef: any, data: Partial<DocumentData>) {
        this._operations.push({ type: 'update', ref: docRef, data });
        return this;
    }),
    delete: jest.fn(function(this: any, docRef: any) {
        this._operations.push({ type: 'delete', ref: docRef });
        return this;
    }),
    commit: jest.fn(function(this: any) {
      this._operations.forEach((op: any) => {
        const { path } = op.ref;
        const parts = path.split('/');
        const collectionPath = parts[0];
        const docId = parts[1];
        
        if (op.type === 'delete') {
            if (dbData[collectionPath]?.[docId]) {
                delete (dbData as any)[collectionPath][docId];
            }
        } else if (op.type === 'update') {
            if (dbData[collectionPath]?.[docId] && typeof op.data === 'object' && op.data !== null) {
                Object.assign((dbData as any)[collectionPath][docId], op.data);
            }
        } else if (op.type === 'set') {
             if (!dbData[collectionPath]) {
              dbData[collectionPath] = {};
            }
            if (op.options?.merge && typeof op.data === 'object' && op.data !== null) {
              (dbData as any)[collectionPath][docId] = { ...((dbData as any)[collectionPath]?.[docId] || {}), ...op.data };
            } else {
              (dbData as any)[collectionPath][docId] = op.data;
            }
        }
      });
      // Clear operations after commit
      this._operations = [];
      return Promise.resolve();
    }),
  };
  
  const collectionMocks = new Map<string, any>();
  const docMocks = new Map<string, any>();
  
  const getCollectionMock = (collectionPath: string) => {
    if (!collectionMocks.has(collectionPath)) {
      
      const createQueryChain = (options: { filters?: any[], limit?: number, orderBy?: any } = {}) => {
        const { filters = [], limit, orderBy } = options;
        const queryResult: any = {
          where: jest.fn<(field: string, op: string, value: any) => any>().mockImplementation((field, op, value) => {
            //const [field, op, value] = args as [string, string, any];
            return createQueryChain({...options, filters: [...filters, {field, op, value}]});
          }),
          orderBy: jest.fn<(field: string, direction: string) => any>().mockImplementation((field, direction) => {
            //const [field, direction] = args as [string, "asc" | "desc"];
            return createQueryChain({...options, orderBy: { field, direction }});
          }),
          limit: jest.fn<(limitValue: number) => any>().mockImplementation((limitValue) => {
            //const [limitValue] = args as [number];
            return createQueryChain({...options, limit: limitValue});
          }),
          startAfter: jest.fn().mockReturnThis(),
          get: jest.fn().mockImplementation(() => {
            const collectionData = dbData[collectionPath] || {};
            let allDocs: DocumentData[] = Object.entries(collectionData).map(([id, data]) => ({ id, ...data }));
            
            // Apply all chained filters
            filters.forEach(filter => {
                allDocs = allDocs.filter(doc => {
                    const toDate = (val: any): Date | any => {
                        if (!val) return val;
                        if (val instanceof Date) return val;
                        if (typeof val.toDate === 'function') {
                            return val.toDate();
                        }
                        if (typeof val === 'object' && val !== null && val._seconds !== undefined) {
                            return new Date(val._seconds * 1000 + (val._nanoseconds || 0) / 1e6);
                        }
                        if (typeof val === 'string' && isNaN(Number(val))) {
                            const d = new Date(val);
                            if (!isNaN(d.getTime())) return d;
                        }
                        return val;
                    };
                    
                    const docValue = filter.field === '__name__' ? doc.id : (doc as any)[filter.field];
                    
                    const comparableDocValue = toDate(docValue);
                    const comparableValue = toDate(filter.value);

                    if (comparableDocValue instanceof Date && comparableValue instanceof Date) {
                         switch (filter.op) {
                            case '==': return comparableDocValue.getTime() === comparableValue.getTime();
                            case '>=': return comparableDocValue.getTime() >= comparableValue.getTime();
                            case '<=': return comparableDocValue.getTime() <= comparableValue.getTime();
                            case '>': return comparableDocValue.getTime() > comparableValue.getTime();
                            case '<': return comparableDocValue.getTime() < comparableValue.getTime();
                            default: return false;
                        }
                    }

                    switch (filter.op) {
                        case '==': return docValue === filter.value;
                        case '!=': return docValue !== filter.value;
                        case '>': return docValue > filter.value;
                        case '>=': return docValue >= filter.value;
                        case '<': return docValue < filter.value;
                        case '<=': return docValue <= filter.value;
                        case 'in': return Array.isArray(filter.value) && filter.value.includes(docValue);
                        case 'not-in': return !(Array.isArray(filter.value) && filter.value.includes(docValue));
                        case 'array-contains': return Array.isArray(docValue) && docValue.includes(filter.value);
                        case 'array-contains-any': return Array.isArray(docValue) && Array.isArray(filter.value) && filter.value.some((v: any) => docValue.includes(v));
                    }
                    return false;
                });
            });

            if (orderBy) {
              allDocs.sort((a, b) => {
                const valA = (a as any)[orderBy.field];
                const valB = (b as any)[orderBy.field];
                const order = orderBy.direction === 'desc' ? -1 : 1;
                if (valA < valB) return -1 * order;
                if (valA > valB) return 1 * order;
                return 0;
              });
            }

            if (limit !== undefined) {
              allDocs = allDocs.slice(0, limit);
            }

            const docs = allDocs.map(doc => {
              const { id, ...rest } = doc;
              return {
                id: id,
                data: () => rest,
                exists: true,
                ref: getDocMock(collectionPath, id),
              };
            });

            return Promise.resolve({
              docs,
              empty: docs.length === 0,
              size: docs.length,
              forEach: (callback: (doc: any) => void) => docs.forEach(callback),
            });
          }),
        };
        return queryResult;
      };

      const newMock = {
        doc: (docId?: string) => {
            const id = docId || `mock-id-${Math.random()}`;
            return getDocMock(collectionPath, id);
        },
        ...createQueryChain(),
        add: jest.fn().mockImplementation((...args: any[]) => {
            const [data] = args as [DocumentData];
            const newId = `new-doc-${Math.random()}`;
            if (!dbData[collectionPath]) {
                dbData[collectionPath] = {};
            }
            dbData[collectionPath][newId] = data;
            const newDocRef = getDocMock(collectionPath, newId);
            return Promise.resolve(newDocRef);
        }),
      };
      collectionMocks.set(collectionPath, newMock);
    }
    return collectionMocks.get(collectionPath)!;
  };

  const getDocMock = (collectionPath: string, docId: string) => {
    const path = `${collectionPath}/${docId}`;
    if (!docMocks.has(path)) {
       const newMock = {
          id: docId,
          get: jest.fn().mockImplementation(() => Promise.resolve({
            id: docId,
            exists: !!dbData[collectionPath]?.[docId],
            data: () => dbData[collectionPath]?.[docId],
            ref: getDocMock(collectionPath, docId),
          })),
          set: jest.fn().mockImplementation((...args: any[]) => {
            const [data, options] = args as [DocumentData, { merge?: boolean }?];
            if (!dbData[collectionPath]) {
              dbData[collectionPath] = {};
            }
            if (options?.merge && typeof data === 'object' && data !== null) {
                if (typeof (dbData as any)[collectionPath]?.[docId] === 'object') {
                     (dbData as any)[collectionPath][docId] = { ...((dbData as any)[collectionPath]?.[docId] || {}), ...data };
                } else {
                     (dbData as any)[collectionPath][docId] = data;
                }
            } else {
              (dbData as any)[collectionPath][docId] = data;
            }
            return Promise.resolve();
          }),
          update: jest.fn().mockImplementation((...args: any[]) => {
            const [data] = args as [Partial<DocumentData>];
            if (dbData[collectionPath]?.[docId] && typeof data === 'object' && data !== null) {
              (dbData as any)[collectionPath][docId] = { ...(dbData as any)[collectionPath][docId], ...data };
            }
            return Promise.resolve();
          }),
          delete: jest.fn().mockImplementation(() => {
            if (dbData[collectionPath]?.[docId]) {
              delete (dbData as any)[collectionPath][docId];
            }
            return Promise.resolve();
          }),
          collection: jest.fn((subCollectionPath: string) => {
              const fullPath = `${path}/${subCollectionPath}`;
              return getCollectionMock(fullPath);
          }),
          path: path,
        };
        docMocks.set(path, newMock);
    }
    return docMocks.get(path)!;
  }

  return {
    collection: jest.fn(getCollectionMock),
    doc: (path: string) => {
        const parts = path.split('/');
        const collectionPath = parts[0];
        const docId = parts[1];
        if (!collectionPath || !docId) {
            throw new Error(`Invalid document path provided to mock: ${path}`);
        }
        return getDocMock(collectionPath, docId);
    },
    batch: jest.fn(() => mockBatch),
    settings: jest.fn(),
    __getInternalData: () => dbData,
  };
};

const mockFirestore = createFirestoreMock();

jest.mock('firebase-admin/firestore', () => {
  const mockTimestamp = {
    now: jest.fn(() => ({ 
        toDate: () => new Date(), 
        toMillis: () => Date.now(),
        _seconds: Math.floor(Date.now() / 1000),
        _nanoseconds: (Date.now() % 1000) * 1e6
    })),
    fromDate: jest.fn((date: Date) => ({ 
        toDate: () => date, 
        toMillis: () => date.getTime(),
        _seconds: Math.floor(date.getTime() / 1000),
        _nanoseconds: (date.getTime() % 1000) * 1e6
    })),
    fromMillis: jest.fn((ms: number) => ({ 
        toDate: () => new Date(ms), 
        toMillis: () => ms,
        _seconds: Math.floor(ms / 1000),
        _nanoseconds: (ms % 1000) * 1e6
    })),
  };

  const actualFirestore = jest.requireActual('firebase-admin/firestore') as object;
  return {
    ...actualFirestore,
    Timestamp: mockTimestamp,
    FieldValue: {
      serverTimestamp: jest.fn(),
      delete: jest.fn(),
    },
  };
});
