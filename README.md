# In-Memory Firestore Mock for Jest

[![NPM Version](https://img.shields.io/npm/v/in-memory-firestore-mock.svg)](https://www.npmjs.com/package/firestore-test-utils)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, zero-dependency, in-memory mock of the Firebase Admin Firestore SDK for Jest. Designed to make testing your Firestore-dependent backend logic fast, reliable, and easy, without needing a live database connection or the Firebase emulators.

## The Problem It Solves

Testing code that interacts with Firestore can be challenging. You either have to connect to a real database (which is slow, costly, and brittle) or use the official Firebase emulators (which can be complex to set up and manage in a CI environment).

This mock utility solves this by providing an in-memory simulation of Firestore that behaves like the real thing for common operations, including:
- **Correctly handling `Timestamp` objects:** Unlike simple `JSON.stringify` mocks, this utility preserves the `.toDate()` method on mock `Timestamp` objects, preventing common `TypeError` exceptions in tests.
- **Supporting complex queries:** It handles chained `where()`, `orderBy()`, and `limit()` calls.
- **Subcollections:** Natively supports operations on nested subcollections.
- **Batch writes:** Provides a functional mock for `batch()` operations (`set`, `update`, `delete`).

## Features

This mock supports a wide range of common Firestore operations:

### Top-Level Methods
- `collection(path)`
- `doc(path)`
- `batch()`

### Querying
- Chainable queries: `collection().where().orderBy().limit().get()`
- `get()` on collections and documents.
- `where(field, op, value)` with the following operators:
    - `==` (Equal to)
    - `!=` (Not equal to)
    - `<` (Less than)
    - `<=` (Less than or equal to)
    - `>` (Greater than)
    - `>=` (Greater than or equal to)
    - `in` (In an array of values)
    - `not-in` (Not in an array of values)
    - `array-contains`
    - `array-contains-any`
- `orderBy(field, direction)` with `'asc'` or `'desc'` direction.
- `limit(number)` to restrict the number of returned documents.
- Querying by document ID using the `__name__` field path.

### Document Manipulation
- `add(data)` to add a new document with an auto-generated ID.
- `set(data, { merge: true })` to create or merge data into a document.
- `update(data)` to modify an existing document.
- `delete()` to remove a document.

### Subcollections
- Full support for `doc('id').collection('subcollection').get()` and all other query and document methods on subcollections.

### Batch Operations
- A functional mock for `adminDb.batch()` that supports:
    - `batch.set(docRef, data)`
    - `batch.update(docRef, data)`
    - `batch.delete(docRef)`
    - `batch.commit()`

### Data Types
- **Timestamp Preservation:** Correctly mocks Firestore `Timestamp` objects, preserving the `.toDate()` method to avoid type errors in tests.

## Installation

```bash
npm install --save-dev in-memory-firestore-mock
```

## Quick Start Guide

Here's how to get started with testing your Firestore-dependent server actions.

### 1. Mock the `firebase-admin` module

In your test file (e.g., `my-service.test.ts`), you need to tell Jest to use our mock instead of the real `firebase-admin` SDK.

```javascript
// src/services/my-service.test.ts

// Import the utility from your test helpers
import { createFirestoreMock } from '@/lib/firestore-test-utils'; // Adjust path as needed

// Mock the firebaseAdmin module
let mockAdminDb;
jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return mockAdminDb;
  },
}));

// Your function to test (example)
async function getAdminUsers() {
  const snapshot = await mockAdminDb.collection('users').where('role', '==', 'admin').get();
  return snapshot.docs.map(doc => doc.data());
}

// Your test suite
describe('My Firestore Service', () => {

  beforeEach(() => {
    // Reset the mock with new data for each test to ensure isolation
    const initialDbState = {
      users: {
        'user1': { name: 'Alice', role: 'admin' },
        'user2': { name: 'Bob', role: 'user' },
        'user3': { name: 'Charlie', role: 'admin' },
      }
    };
    mockAdminDb = createFirestoreMock(initialDbState);
  });

  it('should only return users with the admin role', async () => {
    // Act
    const adminUsers = await getAdminUsers();

    // Assert
    expect(adminUsers).toHaveLength(2);
    expect(adminUsers.map(u => u.name)).toEqual(expect.arrayContaining(['Alice', 'Charlie']));
  });
});
```

### 2. Using with Subcollections and Timestamps

The mock handles nested data and `Timestamp` objects gracefully.

```javascript
// In your test file...
import { Timestamp } from 'firebase-admin/firestore'; // Import from the real library for type safety

describe('Subcollection and Timestamp Test', () => {

  beforeEach(() => {
    const now = new Date();
    const initialData = {
        'users/user1/posts': {
            'post1': { title: 'My First Post', createdAt: Timestamp.fromDate(now) }
        }
    };
    mockAdminDb = createFirestoreMock(initialData);
  });

  it('should retrieve a post from a subcollection', async () => {
    const postRef = mockAdminDb.collection('users').doc('user1').collection('posts').doc('post1');
    const postSnap = await postRef.get();

    expect(postSnap.exists).toBe(true);
    expect(postSnap.data().title).toBe('My First Post');
    // The .toDate() method will exist and work correctly!
    expect(postSnap.data().createdAt.toDate()).toBeInstanceOf(Date);
  });
});
```

## API

### `createFirestoreMock(initialData?)`

-   `initialData` (optional): An object representing the starting state of your database for a test.
    -   Keys are collection paths. For subcollections, use the format `'collection/docId/subcollection'`.
    -   Values are objects where keys are document IDs and values are the document data.

Returns a mock Firestore instance with the methods listed in the "Features" section.

## Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue on our GitHub repository. If you'd like to contribute code, please open a pull request.

## License

This project is licensed under the MIT License.
