import { auth } from '../lib/firebase';
import { PersonalMemoryItem, ContextualMemoryMatch, MemoryDashboardData } from '../types';

async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (err) {
    console.error('Failed to get auth token:', err);
    return null;
  }
}

export const memoryService = {
  /**
   * Fetch all persisted memories for the authenticated user
   */
  async fetchMemories(): Promise<PersonalMemoryItem[]> {
    let token = await getAuthToken();
    if (!token) return [];

    let res = await fetch('/api/memory/all', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      token = await getAuthToken(true);
      if (!token) return [];
      res = await fetch('/api/memory/all', {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch memories: ${res.statusText}`);
    }

    const data = await res.json();
    return Array.isArray(data.memories) ? data.memories : [];
  },

  /**
   * Run the Personal Memory Engine to synthesize grounded patterns, themes, goals, lessons, etc.
   */
  async refreshMemories(): Promise<MemoryDashboardData> {
    let token = await getAuthToken();
    if (!token) {
      throw new Error('Authentication required to analyze journal memories.');
    }

    let res = await fetch('/api/memory/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      token = await getAuthToken(true);
      if (!token) throw new Error('Session expired. Please sign in again.');
      res = await fetch('/api/memory/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to refresh personal memories.');
    }

    const data = await res.json();
    return {
      memories: Array.isArray(data.memories) ? data.memories : [],
      totalAnalyzedEntries: typeof data.totalAnalyzedEntries === 'number' ? data.totalAnalyzedEntries : 0,
      lastAnalyzedAt: data.generatedAt || new Date().toISOString(),
      status: data.status === 'insufficient_evidence' ? 'insufficient_evidence' : 'success',
      message: data.message,
    };
  },

  /**
   * Contextual memory matching: "You said this before"
   */
  async checkContextualMatch(
    currentEntryId: string,
    currentContent: string
  ): Promise<ContextualMemoryMatch | null> {
    if (!currentContent || currentContent.trim().length < 25) {
      return null;
    }

    let token = await getAuthToken();
    if (!token) return null;

    let res = await fetch('/api/memory/contextual-match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentEntryId,
        currentContent: currentContent.slice(0, 2000),
      }),
    });

    if (res.status === 401) {
      token = await getAuthToken(true);
      if (!token) return null;
      res = await fetch('/api/memory/contextual-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentEntryId,
          currentContent: currentContent.slice(0, 2000),
        }),
      });
    }

    if (!res.ok) return null;

    const data = await res.json();
    return data.match || null;
  },

  /**
   * Save / keep a memory
   */
  async saveMemory(memoryId: string, isSaved = true): Promise<void> {
    let token = await getAuthToken();
    if (!token) return;

    await fetch(`/api/memory/${encodeURIComponent(memoryId)}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isSaved }),
    });
  },

  /**
   * Dismiss a memory from view
   */
  async dismissMemory(memoryId: string): Promise<void> {
    let token = await getAuthToken();
    if (!token) return;

    await fetch(`/api/memory/${encodeURIComponent(memoryId)}/dismiss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  },

  /**
   * Permanently delete a memory
   */
  async deleteMemory(memoryId: string): Promise<void> {
    let token = await getAuthToken();
    if (!token) return;

    await fetch(`/api/memory/${encodeURIComponent(memoryId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
};
