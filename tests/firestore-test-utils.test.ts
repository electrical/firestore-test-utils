/**
 * @fileOverview Tests for the Firestore mocking utility itself.
 * This ensures that our test utilities are reliable and prevents regressions.
 */

import { createFirestoreMock } from '../src/firestore-test-utils';
import { Timestamp } from 'firebase-admin/firestore';
import { subDays, addDays } from 'date-fns';

describe('Firestore Mocking Utility (createFirestoreMock)', () => {
  
  it('should create a mock with the expected interface', () => {
    const mockDb = createFirestoreMock();
    expect(mockDb).toHaveProperty('collection');
    expect(mockDb).toHaveProperty('doc');
    expect(mockDb).toHaveProperty('batch');
  });

  it('should return a collection mock with expected methods', () => {
    const mockDb = createFirestoreMock();
    const collectionMock = mockDb.collection('test');
    expect(collectionMock).toHaveProperty('doc');
    expect(collectionMock).toHaveProperty('add');
    expect(collectionMock).toHaveProperty('where');
    expect(collectionMock).toHaveProperty('get');
  });

  it('should return a document mock with expected methods', () => {
    const mockDb = createFirestoreMock();
    const docMock = mockDb.collection('test').doc('testId');
    expect(docMock).toHaveProperty('get');
    expect(docMock).toHaveProperty('set');
    expect(docMock).toHaveProperty('update');
    expect(docMock).toHaveProperty('delete');
    expect(docMock).toHaveProperty('collection');
  });
  
  describe('Deep Cloning', () => {
    it('should correctly clone a nested mock Timestamp and preserve its .toDate() method', () => {
        const date = new Date();
        const initialData = {
            level1: {
                level2: {
                    myDate: Timestamp.fromDate(date)
                }
            }
        };

        const mockDb = createFirestoreMock(initialData);

        const internalData = (mockDb as any).__getInternalData();
        const clonedTimestamp = internalData.level1.level2.myDate;
        
        expect(clonedTimestamp).not.toBe(initialData.level1.level2.myDate); // Ensure it's a clone, not the same object reference
        expect(typeof clonedTimestamp.toDate).toBe('function');
        expect(clonedTimestamp.toDate().getTime()).toBe(date.getTime());
    });
  });

  describe('Batch Operations', () => {
    it('should correctly apply a batch delete operation on commit', async () => {
        const initialData = {
            items: {
                'item1': { name: 'Item One' },
                'item2': { name: 'Item Two' },
            }
        };
        const mockDb = createFirestoreMock(initialData);
        
        const batch = mockDb.batch();
        const item1Ref = mockDb.collection('items').doc('item1');
        const item2Ref = mockDb.collection('items').doc('item2');

        // Check initial state
        let snap1 = await item1Ref.get();
        expect(snap1.exists).toBe(true);

        // Perform batch delete
        batch.delete(item1Ref);
        await batch.commit();

        // Check final state
        snap1 = await item1Ref.get();
        const snap2 = await item2Ref.get();
        expect(snap1.exists).toBe(false);
        expect(snap2.exists).toBe(true);
    });

    it('should correctly apply a batch update operation on commit', async () => {
        const initialData = { items: { 'item1': { name: 'Old Name' } } };
        const mockDb = createFirestoreMock(initialData);
        
        const batch = mockDb.batch();
        const itemRef = mockDb.collection('items').doc('item1');

        batch.update(itemRef, { name: 'New Name' });
        await batch.commit();

        const updatedSnap = await itemRef.get();
        expect(updatedSnap.data().name).toBe('New Name');
    });

     it('should correctly apply a batch set operation on commit', async () => {
        const mockDb = createFirestoreMock();
        
        const batch = mockDb.batch();
        const itemRef = mockDb.collection('items').doc('item1');

        batch.set(itemRef, { name: 'Brand New Item' });
        await batch.commit();

        const newSnap = await itemRef.get();
        expect(newSnap.exists).toBe(true);
        expect(newSnap.data().name).toBe('Brand New Item');
    });

    it('should correctly apply a batch set operation with merge on commit', async () => {
        const initialData = { items: { 'item1': { name: 'Old Name', count: 1 } } };
        const mockDb = createFirestoreMock(initialData);
        
        const batch = mockDb.batch();
        const itemRef = mockDb.collection('items').doc('item1');

        // Set with merge: should update one field and keep the other
        batch.set(itemRef, { name: 'New Merged Name' }, { merge: true });
        await batch.commit();

        const mergedSnap = await itemRef.get();
        expect(mergedSnap.exists).toBe(true);
        expect(mergedSnap.data().name).toBe('New Merged Name');
        expect(mergedSnap.data().count).toBe(1); // Should still exist
    });
  });
  
  describe('Document Operations', () => {
     it('should add a new document and return a reference with an ID', async () => {
        const mockDb = createFirestoreMock();
        const itemsCollection = mockDb.collection('items');
        const docRef = await itemsCollection.add({ name: 'A brand new item' });
        
        expect(docRef.id).toBeDefined();

        const allItems = await itemsCollection.get();
        expect(allItems.size).toBe(1);
        expect(allItems.docs[0].data().name).toBe('A brand new item');
    });

    it('should set a document, overwriting existing data', async () => {
        const initialData = { items: { 'item1': { name: 'Old Name', count: 1 } } };
        const mockDb = createFirestoreMock(initialData);
        const itemRef = mockDb.collection('items').doc('item1');

        await itemRef.set({ name: 'Completely New Item' }); // No merge option
        
        const finalSnap = await itemRef.get();
        expect(finalSnap.exists).toBe(true);
        expect(finalSnap.data().name).toBe('Completely New Item');
        expect(finalSnap.data().count).toBeUndefined(); // count field should be gone
    });
    
    it('should set a document in a non-existent collection path', async () => {
        const mockDb = createFirestoreMock(); // Start with empty DB
        const itemRef = mockDb.collection('new_items').doc('new_doc');

        await itemRef.set({ name: 'Hello World' });
        
        const finalSnap = await itemRef.get();
        expect(finalSnap.exists).toBe(true);
        expect(finalSnap.data().name).toBe('Hello World');
    });

    it('should set a document with merge option', async () => {
        const initialData = { items: { 'item1': { name: 'Old Name', count: 1 } } };
        const mockDb = createFirestoreMock(initialData);
        const itemRef = mockDb.collection('items').doc('item1');

        await itemRef.set({ name: 'Merged Name' }, { merge: true });
        
        const finalSnap = await itemRef.get();
        expect(finalSnap.data().name).toBe('Merged Name');
        expect(finalSnap.data().count).toBe(1); // count should still exist
    });

    it('should update a document', async () => {
        const initialData = { items: { 'item1': { name: 'Old Name', count: 1 } } };
        const mockDb = createFirestoreMock(initialData);
        const itemRef = mockDb.collection('items').doc('item1');

        await itemRef.update({ name: 'Updated Name' });
        
        const finalSnap = await itemRef.get();
        expect(finalSnap.data().name).toBe('Updated Name');
        expect(finalSnap.data().count).toBe(1);
    });

    it('should delete a document', async () => {
        const initialData = { items: { 'item1': { name: 'To Be Deleted' } } };
        const mockDb = createFirestoreMock(initialData);
        const itemRef = mockDb.collection('items').doc('item1');

        let snap = await itemRef.get();
        expect(snap.exists).toBe(true);

        await itemRef.delete();

        snap = await itemRef.get();
        expect(snap.exists).toBe(false);
    });
    
    it('should correctly iterate with forEach on a query snapshot', async () => {
      const initialData = {
          items: {
              'item1': { name: 'A' },
              'item2': { name: 'B' },
          }
      };
      const mockDb = createFirestoreMock(initialData);
      
      const query = mockDb.collection('items');
      const snapshot = await query.get();

      const iteratedNames: string[] = [];
      snapshot.forEach((doc: any) => {
          iteratedNames.push(doc.data().name);
      });

      expect(snapshot.size).toBe(2);
      expect(iteratedNames).toHaveLength(2);
      expect(iteratedNames).toContain('A');
      expect(iteratedNames).toContain('B');
    });

    it('should return a functional doc.ref from a query snapshot', async () => {
       const initialData = { items: { 'item1': { name: 'A' } } };
       const mockDb = createFirestoreMock(initialData);
       const query = mockDb.collection('items');
       const snapshot = await query.get();

       const doc = snapshot.docs[0];
       expect(doc.ref).toBeDefined();
       expect(typeof doc.ref.update).toBe('function');
       expect(typeof doc.ref.set).toBe('function');
       expect(typeof doc.ref.delete).toBe('function');

       await doc.ref.update({ name: 'Updated A' });
       const updatedSnap = await doc.ref.get();
       expect(updatedSnap.data().name).toBe('Updated A');
    });
  });

  describe('Subcollection Operations', () => {
      const initialData = {
          'users/user1/posts': {
              'post1': { title: 'User1 Post 1' },
          },
          'users/user2/posts': {
              'post2': { title: 'User2 Post 2' },
          }
      };
      
      it('should get documents from a subcollection', async () => {
          const mockDb = createFirestoreMock(initialData);
          const postsRef = mockDb.collection('users').doc('user1').collection('posts');
          const postsSnap = await postsRef.get();
          
          expect(postsSnap.size).toBe(1);
          expect(postsSnap.docs[0].id).toBe('post1');
          expect(postsSnap.docs[0].data().title).toBe('User1 Post 1');
      });

      it('should add a document to a subcollection', async () => {
           const mockDb = createFirestoreMock(initialData);
           const postsRef = mockDb.collection('users').doc('user1').collection('posts');
           await postsRef.add({ title: 'A new post!' });
           
           const postsSnap = await postsRef.get();
           expect(postsSnap.size).toBe(2); // The original + the new one
           const titles = postsSnap.docs.map(d => d.data().title);
           expect(titles).toContain('User1 Post 1');
           expect(titles).toContain('A new post!');
      });
  });

  describe('Date/Timestamp Comparisons', () => {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const tomorrow = addDays(today, 1);
    const initialData = {
        events: {
            'event-yesterday': { eventDate: Timestamp.fromDate(yesterday) },
            'event-today': { eventDate: Timestamp.fromDate(today) },
            'event-tomorrow': { eventDate: Timestamp.fromDate(tomorrow) },
        }
    };
    
    it('should correctly filter with a where clause using "<=" and a Date object', async () => {
        const mockDb = createFirestoreMock(initialData);
        const query = mockDb.collection('events').where('eventDate', '<=', today);
        const snap = await query.get();
        expect(snap.size).toBe(2);
        const ids = snap.docs.map(d => d.id);
        expect(ids).toContain('event-yesterday');
        expect(ids).toContain('event-today');
    });

    it('should correctly filter with a where clause using "<" and a Date object', async () => {
        const mockDb = createFirestoreMock(initialData);
        const query = mockDb.collection('events').where('eventDate', '<', today);
        const snap = await query.get();
        expect(snap.size).toBe(1);
        expect(snap.docs[0].id).toBe('event-yesterday');
    });

    it('should correctly filter with a where clause using ">=" and a Date object', async () => {
        const mockDb = createFirestoreMock(initialData);
        const query = mockDb.collection('events').where('eventDate', '>=', today);
        const snap = await query.get();
        expect(snap.size).toBe(2);
        const ids = snap.docs.map(d => d.id);
        expect(ids).toContain('event-today');
        expect(ids).toContain('event-tomorrow');
    });

    it('should correctly filter with a where clause using ">" and a Date object', async () => {
        const mockDb = createFirestoreMock(initialData);
        const query = mockDb.collection('events').where('eventDate', '>', today);
        const snap = await query.get();
        expect(snap.size).toBe(1);
        expect(snap.docs[0].id).toBe('event-tomorrow');
    });

    it('should correctly filter with a where clause using "==" and a Date object', async () => {
        const mockDb = createFirestoreMock(initialData);
        const query = mockDb.collection('events').where('eventDate', '==', today);
        const snap = await query.get();
        expect(snap.size).toBe(1);
        expect(snap.docs[0].id).toBe('event-today');
    });
  });

  describe('where() clause operators', () => {
    const initialData = {
      users: {
        'user1': { name: 'Alice', role: 'admin', age: 30, tags: ['a', 'b'] },
        'user2': { name: 'Bob', role: 'user', age: 25, tags: ['b', 'c'] },
        'user3': { name: 'Charlie', role: 'admin', age: 35, tags: ['c', 'd'] },
      }
    };
    let mockDb = createFirestoreMock(initialData);

    beforeEach(() => {
        mockDb = createFirestoreMock(initialData);
    });
    
    it('should correctly filter with "==" operator', async () => {
      const adminsQuery = mockDb.collection('users').where('role', '==', 'admin');
      const querySnapshot = await adminsQuery.get();
      
      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Alice', 'Charlie']));
    });

    it('should correctly filter with "!=" operator', async () => {
      const nonAdminsQuery = mockDb.collection('users').where('role', '!=', 'admin');
      const querySnapshot = await nonAdminsQuery.get();

      expect(querySnapshot.size).toBe(1);
      expect(querySnapshot.docs[0].data().name).toBe('Bob');
    });
    
    it('should correctly filter with ">" operator', async () => {
      const olderThan30 = mockDb.collection('users').where('age', '>', 30);
      const querySnapshot = await olderThan30.get();

      expect(querySnapshot.size).toBe(1);
      expect(querySnapshot.docs[0].data().name).toBe('Charlie');
    });
    
    it('should correctly filter with ">=" operator', async () => {
      const olderOr30 = mockDb.collection('users').where('age', '>=', 30);
      const querySnapshot = await olderOr30.get();

      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Alice', 'Charlie']));
    });
    
    it('should correctly filter with "<" operator', async () => {
      const youngerThan30 = mockDb.collection('users').where('age', '<', 30);
      const querySnapshot = await youngerThan30.get();

      expect(querySnapshot.size).toBe(1);
      expect(querySnapshot.docs[0].data().name).toBe('Bob');
    });

    it('should correctly filter with "<=" operator', async () => {
      const youngerOr30 = mockDb.collection('users').where('age', '<=', 30);
      const querySnapshot = await youngerOr30.get();

      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Alice', 'Bob']));
    });
    
    it('should correctly filter with "in" operator', async () => {
      const specificAges = mockDb.collection('users').where('age', 'in', [25, 35]);
      const querySnapshot = await specificAges.get();

      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Bob', 'Charlie']));
    });
    
    it('should correctly filter with "not-in" operator', async () => {
      const notSpecificAges = mockDb.collection('users').where('age', 'not-in', [25, 35]);
      const querySnapshot = await notSpecificAges.get();

      expect(querySnapshot.size).toBe(1);
      expect(querySnapshot.docs[0].data().name).toBe('Alice');
    });

    it('should correctly filter with "__name__" (document ID)', async () => {
      const byIdQuery = mockDb.collection('users').where('__name__', 'in', ['user1', 'user3']);
      const querySnapshot = await byIdQuery.get();

      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Alice', 'Charlie']));
    });

    it('should correctly filter with "array-contains" operator', async () => {
      const containsB = mockDb.collection('users').where('tags', 'array-contains', 'b');
      const querySnapshot = await containsB.get();

      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Alice', 'Bob']));
    });

    it('should correctly filter with "array-contains-any" operator', async () => {
      const containsAorD = mockDb.collection('users').where('tags', 'array-contains-any', ['a', 'd']);
      const querySnapshot = await containsAorD.get();

      expect(querySnapshot.size).toBe(2);
      const names = querySnapshot.docs.map(doc => doc.data().name);
      expect(names).toEqual(expect.arrayContaining(['Alice', 'Charlie']));
    });

    it('should return no results for an unknown operator', async () => {
      // @ts-ignore - Intentionally using an invalid operator for testing
      const unknownQuery = mockDb.collection('users').where('role', 'contains', 'admin');
      const querySnapshot = await unknownQuery.get();
      
      expect(querySnapshot.size).toBe(0);
    });

    it('should correctly filter with a ">" operator on a numeric field', async () => {
        const query = mockDb.collection('users').where('age', '>', 25);
        const snap = await query.get();
        expect(snap.size).toBe(2); // Alice (30) and Charlie (35)
    });
  });

  describe('Query Chaining', () => {
    it('should correctly apply a limit to a query', async () => {
        const initialData = {
            items: {
                'item1': { name: 'A', order: 1 },
                'item2': { name: 'B', order: 2 },
                'item3': { name: 'C', order: 3 },
            }
        };
        const mockDb = createFirestoreMock(initialData);
        
        const query = mockDb.collection('items').limit(2);
        const snap = await query.get();
        expect(snap.size).toBe(2);
    });

    it('should correctly apply orderBy and limit together', async () => {
        const initialData = {
            items: {
                'item1': { name: 'A', order: 3 },
                'item2': { name: 'B', order: 1 },
                'item3': { name: 'C', order: 2 },
            }
        };
        const mockDb = createFirestoreMock(initialData);

        const query = mockDb.collection('items').orderBy('order', 'asc').limit(2);
        const snap = await query.get();

        expect(snap.size).toBe(2);
        const names = snap.docs.map(d => d.data().name);
        expect(names).toEqual(['B', 'C']); // Should be ordered by 'order' field before limiting
    });
  });
});
