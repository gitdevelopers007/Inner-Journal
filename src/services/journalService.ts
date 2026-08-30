import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { JournalEntry, Interaction, MoodType } from '../types';

/**
 * Utility to strip undefined values from objects before writing to Firestore
 */
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (value === undefined ? null : value))
  );
}

export const journalService = {
  /**
   * Save or update a journal entry under /users/{userId}/entries/{entryId}
   */
  async saveEntry(userId: string, entry: Partial<JournalEntry> & { id: string }): Promise<void> {
    if (!userId || !entry.id) {
      throw new Error('User ID and Entry ID are required to save an entry.');
    }

    const entryRef = doc(db, 'users', userId, 'entries', entry.id);
    const payload = sanitizeForFirestore({
      ...entry,
      userId,
      updatedAt: new Date().toISOString(),
      serverUpdated: serverTimestamp(),
    });

    await setDoc(entryRef, payload, { merge: true });
  },

  /**
   * Fetch all journal entries for a user ordered by updatedAt descending
   */
  async getUserEntries(userId: string): Promise<JournalEntry[]> {
    if (!userId) return [];

    try {
      const entriesRef = collection(db, 'users', userId, 'entries');
      const q = query(entriesRef, orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);

      const entries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        entries.push({
          id: docSnap.id,
          userId: data.userId || userId,
          title: data.title || 'Untitled Reflection',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          mood: (data.mood as MoodType) || 'thoughtful',
          tags: Array.isArray(data.tags) ? data.tags : [],
          summary: data.summary || undefined,
          interactionCount: typeof data.interactionCount === 'number' ? data.interactionCount : 0,
          isFavorite: Boolean(data.isFavorite),
        });
      });

      return entries;
    } catch (err) {
      console.error('Error fetching user entries:', err);
      // Fallback query without orderBy if index is still propagating
      const entriesRef = collection(db, 'users', userId, 'entries');
      const snapshot = await getDocs(entriesRef);
      const entries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        entries.push({
          id: docSnap.id,
          userId: data.userId || userId,
          title: data.title || 'Untitled Reflection',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          mood: (data.mood as MoodType) || 'thoughtful',
          tags: Array.isArray(data.tags) ? data.tags : [],
          summary: data.summary || undefined,
          interactionCount: typeof data.interactionCount === 'number' ? data.interactionCount : 0,
          isFavorite: Boolean(data.isFavorite),
        });
      });
      return entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  },

  /**
   * Fetch a single journal entry
   */
  async getEntry(userId: string, entryId: string): Promise<JournalEntry | null> {
    if (!userId || !entryId) return null;
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    const snap = await getDoc(entryRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      userId: data.userId || userId,
      title: data.title || 'Untitled Reflection',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      mood: (data.mood as MoodType) || 'thoughtful',
      tags: Array.isArray(data.tags) ? data.tags : [],
      summary: data.summary || undefined,
      interactionCount: typeof data.interactionCount === 'number' ? data.interactionCount : 0,
      isFavorite: Boolean(data.isFavorite),
    };
  },

  /**
   * Delete a journal entry and its interactions
   */
  async deleteEntry(userId: string, entryId: string): Promise<void> {
    if (!userId || !entryId) return;

    // Delete interactions subcollection items
    const interactionsRef = collection(db, 'users', userId, 'entries', entryId, 'interactions');
    const snap = await getDocs(interactionsRef);
    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    // Delete top-level entry
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    await deleteDoc(entryRef);
  },

  /**
   * Save an interaction under /users/{userId}/entries/{entryId}/interactions/{interactionId}
   * and mirror to /users/{userId}/interactions/{interactionId} for fast cross-entry lookup
   */
  async saveInteraction(userId: string, entryId: string, interaction: Interaction): Promise<void> {
    if (!userId || !entryId || !interaction.id) {
      throw new Error('User ID, Entry ID, and Interaction ID are required.');
    }

    const interactionRef = doc(
      db,
      'users',
      userId,
      'entries',
      entryId,
      'interactions',
      interaction.id
    );

    const userGlobalInteractionRef = doc(
      db,
      'users',
      userId,
      'interactions',
      interaction.id
    );

    const payload = sanitizeForFirestore({
      ...interaction,
      userId,
      entryId,
      serverTimestamp: serverTimestamp(),
    });

    await Promise.all([
      setDoc(interactionRef, payload),
      setDoc(userGlobalInteractionRef, payload),
    ]);
  },

  /**
   * Fetch all interactions for a specific entry ordered by timestamp ascending
   */
  async getEntryInteractions(userId: string, entryId: string): Promise<Interaction[]> {
    if (!userId || !entryId) return [];

    try {
      const interactionsRef = collection(
        db,
        'users',
        userId,
        'entries',
        entryId,
        'interactions'
      );
      const q = query(interactionsRef, orderBy('timestamp', 'asc'));
      const snapshot = await getDocs(q);

      const list: Interaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          entryId: data.entryId || entryId,
          role: data.role || 'user',
          content: data.content || '',
          timestamp: data.timestamp || new Date().toISOString(),
          mode: data.mode || 'reflect',
          modelUsed: data.modelUsed || undefined,
        });
      });

      return list;
    } catch (err) {
      console.error('Error fetching interactions with order, falling back:', err);
      const interactionsRef = collection(
        db,
        'users',
        userId,
        'entries',
        entryId,
        'interactions'
      );
      const snapshot = await getDocs(interactionsRef);
      const list: Interaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          entryId: data.entryId || entryId,
          role: data.role || 'user',
          content: data.content || '',
          timestamp: data.timestamp || new Date().toISOString(),
          mode: data.mode || 'reflect',
          modelUsed: data.modelUsed || undefined,
        });
      });
      return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
  },
};
