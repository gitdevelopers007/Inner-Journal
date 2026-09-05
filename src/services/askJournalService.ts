import { auth } from '../lib/firebase';
import { AskJournalResponse } from '../types';

async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (err) {
    console.error('Failed to get auth token:', err);
    return null;
  }
}

export const askJournalService = {
  /**
   * Submit an evidence-grounded query about the user's journal
   */
  async ask(
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<AskJournalResponse> {
    let token = await getAuthToken();
    if (!token) {
      throw new Error('You must be signed in to query your journal.');
    }

    const payload = {
      question: question.trim(),
      history: history.slice(-4).map((h) => ({
        role: h.role,
        content: h.content.slice(0, 500),
      })),
    };

    let res = await fetch('/api/gemini/ask-journal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      token = await getAuthToken(true);
      if (!token) {
        throw new Error('Your session expired. Please sign in again.');
      }
      res = await fetch('/api/gemini/ask-journal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || "Couldn't search your journal right now.");
    }

    const data: AskJournalResponse = await res.json();
    return data;
  },
};
