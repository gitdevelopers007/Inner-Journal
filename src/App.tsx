/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, logoutUser } from './lib/firebase';
import { journalService } from './services/journalService';
import {
  JournalEntry,
  Interaction,
  UserProfile,
  EntrySummary,
  IdeaEvolutionData,
  PersonalMemoryItem,
  MemoryDashboardData,
} from './types';
import { Navbar } from './components/Navbar';
import { LandingView } from './components/LandingView';
import { Sidebar } from './components/Sidebar';
import { JournalEditor } from './components/JournalEditor';
import { SummaryModal } from './components/SummaryModal';
import { IdeaEvolutionModal } from './components/IdeaEvolutionModal';
import { MemoryDashboardModal } from './components/MemoryDashboardModal';
import { AskJournalModal } from './components/AskJournalModal';
import { memoryService } from './services/memoryService';
import { Menu, Plus, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSummaryModal, setActiveSummaryModal] = useState<EntrySummary | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Idea Evolution State
  const [isEvolutionModalOpen, setIsEvolutionModalOpen] = useState(false);
  const [evolutionData, setEvolutionData] = useState<IdeaEvolutionData | null>(null);
  const [isEvolutionLoading, setIsEvolutionLoading] = useState(false);

  // Personal Memory Engine State
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [memories, setMemories] = useState<PersonalMemoryItem[]>([]);
  const [isMemoryLoading, setIsMemoryLoading] = useState(false);
  const [memoryDashboardData, setMemoryDashboardData] = useState<MemoryDashboardData | null>(null);

  // Ask My Journal State (Phase 3B)
  const [isAskJournalOpen, setIsAskJournalOpen] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
        setEntries([]);
        setSelectedEntryId(null);
        setInteractions([]);
        setEvolutionData(null);
        setIsEvolutionModalOpen(false);
        setActiveSummaryModal(null);
        setMemories([]);
        setIsMemoryModalOpen(false);
        setMemoryDashboardData(null);
        setIsMemoryLoading(false);
        setIsAskJournalOpen(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load User Entries from Firestore when user changes
  const loadEntries = useCallback(async (userId: string) => {
    try {
      const userEntries = await journalService.getUserEntries(userId);
      setEntries(userEntries);
      if (userEntries.length > 0 && !selectedEntryId) {
        setSelectedEntryId(userEntries[0].id);
      }
    } catch (err) {
      console.error('Error loading entries:', err);
      showToast('Failed to load reflection history', 'error');
    }
  }, [selectedEntryId]);

  useEffect(() => {
    if (user) {
      loadEntries(user.uid);
    }
  }, [user, loadEntries]);

  // Load interactions when selected entry changes
  useEffect(() => {
    let isMounted = true;
    const fetchInteractions = async () => {
      if (!user || !selectedEntryId) {
        setInteractions([]);
        return;
      }
      try {
        const list = await journalService.getEntryInteractions(user.uid, selectedEntryId);
        if (isMounted) {
          setInteractions(list);
        }
      } catch (err) {
        console.error('Error fetching interactions:', err);
      }
    };

    fetchInteractions();
    return () => {
      isMounted = false;
    };
  }, [user, selectedEntryId]);

  // Handler: Create New Reflection Entry
  const handleCreateNewEntry = async () => {
    if (!user) return;

    const newId = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newEntry: JournalEntry = {
      id: newId,
      userId: user.uid,
      title: 'Untitled Reflection',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mood: 'thoughtful',
      tags: [],
      interactionCount: 0,
      isFavorite: false,
    };

    try {
      await journalService.saveEntry(user.uid, newEntry);
      setEntries((prev) => [newEntry, ...prev]);
      setSelectedEntryId(newId);
      setInteractions([]);
      setIsSidebarOpen(false);
      showToast('Created new reflection draft');
    } catch (err: any) {
      console.error('Failed to create entry:', err);
      showToast('Error creating new entry: ' + err.message, 'error');
    }
  };

  // Handler: Save / Update active entry meta
  const handleSaveEntry = async (updated: Partial<JournalEntry>) => {
    if (!user || !selectedEntryId) return;

    try {
      await journalService.saveEntry(user.uid, {
        id: selectedEntryId,
        ...updated,
      });

      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedEntryId
            ? { ...e, ...updated, updatedAt: new Date().toISOString() }
            : e
        )
      );
    } catch (err: any) {
      console.error('Error updating entry:', err);
      showToast('Failed to save entry changes', 'error');
    }
  };

  // Handler: Add an interaction (user prompt or Gemini response)
  const handleAddInteraction = async (interaction: Interaction) => {
    if (!user || !selectedEntryId) return;

    try {
      await journalService.saveInteraction(user.uid, selectedEntryId, interaction);
      setInteractions((prev) => [...prev, interaction]);

      // Update entry metadata interaction count and updated timestamp
      const newCount = interactions.length + 1;
      await journalService.saveEntry(user.uid, {
        id: selectedEntryId,
        interactionCount: newCount,
      });

      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedEntryId
            ? {
                ...e,
                interactionCount: newCount,
                updatedAt: new Date().toISOString(),
              }
            : e
        )
      );
    } catch (err: any) {
      console.error('Error saving interaction:', err);
      showToast('Failed to save interaction: ' + err.message, 'error');
      throw err;
    }
  };

  // Handler: Delete Entry
  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;

    try {
      await journalService.deleteEntry(user.uid, entryId);
      const remaining = entries.filter((e) => e.id !== entryId);
      setEntries(remaining);
      if (selectedEntryId === entryId) {
        setSelectedEntryId(remaining.length > 0 ? remaining[0].id : null);
      }
      showToast('Reflection removed');
    } catch (err: any) {
      console.error('Error deleting entry:', err);
      showToast('Could not delete entry', 'error');
    }
  };

  // Handler: Toggle Favorite
  const handleToggleFavorite = async (entryId: string) => {
    if (!user) return;
    const target = entries.find((e) => e.id === entryId);
    if (!target) return;

    const nextState = !target.isFavorite;
    try {
      await journalService.saveEntry(user.uid, {
        id: entryId,
        isFavorite: nextState,
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, isFavorite: nextState } : e))
      );
      showToast(nextState ? 'Added to favorites' : 'Removed from favorites');
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  // Handler: Sign out
  const handleSignOut = async () => {
    try {
      setUser(null);
      setEntries([]);
      setSelectedEntryId(null);
      setInteractions([]);
      setEvolutionData(null);
      setIsEvolutionModalOpen(false);
      setActiveSummaryModal(null);
      setMemories([]);
      setIsMemoryModalOpen(false);
      setMemoryDashboardData(null);
      setIsMemoryLoading(false);
      await logoutUser();
      showToast('Signed out securely');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Handler: Open and trigger Idea Evolution analysis
  const handleOpenIdeaEvolution = async (focusedEntryId?: string) => {
    if (!auth.currentUser) {
      showToast('You must be logged in to analyze idea evolution', 'error');
      return;
    }

    if (entries.length === 0) {
      showToast('Create at least one reflection to map idea evolution', 'error');
      return;
    }

    setIsEvolutionModalOpen(true);
    setIsEvolutionLoading(true);

    try {
      // Obtain Firebase Auth ID token from client auth state
      const idToken = await auth.currentUser.getIdToken(true);
      const currentUid = auth.currentUser.uid;

      // Pass client fallback entries with correctly resolved interactions for each entry
      const clientFallbackEntries = await Promise.all(
        entries.slice(0, 10).map(async (e) => {
          let entryInteractions: Interaction[] = [];
          if (e.id === selectedEntryId && interactions.length > 0) {
            entryInteractions = interactions;
          } else {
            try {
              entryInteractions = await journalService.getEntryInteractions(currentUid, e.id);
            } catch (fetchErr) {
              console.warn(`Could not load interactions for entry ${e.id}:`, fetchErr);
            }
          }
          return {
            id: e.id,
            userId: currentUid,
            title: e.title,
            createdAt: e.createdAt,
            mood: e.mood,
            summary: e.summary,
            recentInteractions: entryInteractions
              .slice(-6)
              .map((i) => `${i.role === 'assistant' ? 'Gemini' : 'User'}: ${i.content.slice(0, 300)}`),
          };
        })
      );

      const res = await fetch('/api/gemini/idea-evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          focusedEntryId: focusedEntryId || selectedEntryId || undefined,
          clientFallbackEntries,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to synthesize idea evolution.');
      }

      setEvolutionData(data.evolution);
    } catch (err: any) {
      console.error('Error generating idea evolution:', err);
      showToast(err?.message || 'Could not synthesize idea evolution', 'error');
    } finally {
      setIsEvolutionLoading(false);
    }
  };

  // Personal Memory Engine Handlers
  const handleOpenMemory = async () => {
    if (!auth.currentUser) {
      showToast('You must be signed in to access Personal Memory', 'error');
      return;
    }

    setIsMemoryModalOpen(true);

    // If memories haven't been loaded yet, fetch persisted or synthesize if reflections exist
    if (memories.length === 0) {
      setIsMemoryLoading(true);
      try {
        const existing = await memoryService.fetchMemories();
        if (existing.length > 0) {
          setMemories(existing);
        } else if (entries.length >= 2) {
          const result = await memoryService.refreshMemories();
          setMemories(result.memories);
          setMemoryDashboardData(result);
        }
      } catch (err: any) {
        console.warn('Memory load note:', err);
      } finally {
        setIsMemoryLoading(false);
      }
    }
  };

  const handleRefreshMemories = async () => {
    if (!auth.currentUser) return;
    setIsMemoryLoading(true);
    try {
      const result = await memoryService.refreshMemories();
      setMemories(result.memories);
      setMemoryDashboardData(result);
      if (result.status === 'insufficient_evidence') {
        showToast('Needs at least 2 reflections with substantive content', 'error');
      } else {
        showToast(`Synthesized ${result.memories.length} personal memory patterns`);
      }
    } catch (err: any) {
      console.error('Error refreshing memories:', err);
      showToast(err?.message || 'Failed to analyze journal memories', 'error');
    } finally {
      setIsMemoryLoading(false);
    }
  };

  const handleSaveMemory = async (id: string, isSaved: boolean) => {
    try {
      await memoryService.saveMemory(id, isSaved);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isSaved } : m))
      );
      showToast(isSaved ? 'Memory pinned to saved' : 'Memory unpinned');
    } catch (err: any) {
      console.error('Failed to update memory save state:', err);
    }
  };

  const handleDismissMemory = async (id: string) => {
    try {
      await memoryService.dismissMemory(id);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isDismissed: true } : m))
      );
      showToast('Memory dismissed from active view');
    } catch (err: any) {
      console.error('Failed to dismiss memory:', err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await memoryService.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      showToast('Memory removed permanently');
    } catch (err: any) {
      console.error('Failed to delete memory:', err);
    }
  };

  const handleSelectEntryFromMemory = (entryId: string) => {
    setIsMemoryModalOpen(false);
    setIsSidebarOpen(false);
    setSelectedEntryId(entryId);
  };

  const currentEntry = entries.find((e) => e.id === selectedEntryId);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-md animate-pulse">
            <Sparkles className="w-5 h-5 text-amber-300" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Initializing Protected Session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col selection:bg-neutral-900 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
              toastMessage.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-neutral-900 border-neutral-800 text-white'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onNewEntry={handleCreateNewEntry}
        onOpenEvolution={() => handleOpenIdeaEvolution()}
        onOpenMemory={handleOpenMemory}
        onOpenAskJournal={() => setIsAskJournalOpen(true)}
        entryCount={entries.length}
      />

      {/* Unauthenticated State */}
      {!user ? (
        <LandingView onAuthenticated={() => {}} />
      ) : (
        /* Authenticated Dashboard */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile Sidebar Toggle Button */}
          <div className="lg:hidden absolute bottom-6 left-6 z-30">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-3 bg-neutral-900 text-white rounded-full shadow-lg hover:bg-neutral-800 transition-transform active:scale-95 cursor-pointer flex items-center justify-center"
              title="Open Reflections History"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Sidebar */}
          <Sidebar
            entries={entries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(id) => {
              setSelectedEntryId(id);
              setIsSidebarOpen(false);
            }}
            onNewEntry={handleCreateNewEntry}
            onDeleteEntry={handleDeleteEntry}
            onToggleFavorite={handleToggleFavorite}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onOpenMemory={handleOpenMemory}
            onOpenAskJournal={() => setIsAskJournalOpen(true)}
          />

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-white">
            {currentEntry ? (
              <JournalEditor
                key={currentEntry.id}
                userId={user.uid}
                entry={currentEntry}
                interactions={interactions}
                onSaveEntry={handleSaveEntry}
                onAddInteraction={handleAddInteraction}
                onOpenSummaryModal={(summary) => setActiveSummaryModal(summary)}
                onOpenEvolution={() => handleOpenIdeaEvolution(currentEntry.id)}
                onOpenMemory={handleOpenMemory}
                onOpenAskJournal={() => setIsAskJournalOpen(true)}
                onSelectEntry={(id) => setSelectedEntryId(id)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-500 shadow-xs">
                  <Sparkles className="w-7 h-7 text-neutral-800" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-serif font-bold text-neutral-900">
                    No Reflection Selected
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-500 max-w-sm">
                    Select a reflection from the sidebar or start a new journal entry.
                  </p>
                </div>
                <button
                  id="empty-state-new-entry-btn"
                  onClick={handleCreateNewEntry}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start New Reflection</span>
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Summary Insights Modal */}
      <SummaryModal
        summary={activeSummaryModal}
        entryTitle={currentEntry?.title || 'Reflection'}
        isOpen={Boolean(activeSummaryModal)}
        onClose={() => setActiveSummaryModal(null)}
      />

      {/* Idea Evolution Map Modal */}
      <IdeaEvolutionModal
        isOpen={isEvolutionModalOpen}
        onClose={() => setIsEvolutionModalOpen(false)}
        evolution={evolutionData}
        isLoading={isEvolutionLoading}
        onSelectEntry={(id) => {
          setSelectedEntryId(id);
          setIsEvolutionModalOpen(false);
        }}
      />

      {/* Personal Memory Engine Dashboard Modal */}
      <MemoryDashboardModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        memories={memories}
        isLoading={isMemoryLoading}
        dashboardData={memoryDashboardData}
        onRefresh={handleRefreshMemories}
        onSaveMemory={handleSaveMemory}
        onDismissMemory={handleDismissMemory}
        onDeleteMemory={handleDeleteMemory}
        onSelectEntry={handleSelectEntryFromMemory}
        totalEntries={entries.length}
      />

      {/* Ask My Journal Query Intelligence Modal */}
      <AskJournalModal
        isOpen={isAskJournalOpen}
        onClose={() => setIsAskJournalOpen(false)}
        onSelectEntry={(id) => {
          setSelectedEntryId(id);
          setIsAskJournalOpen(false);
        }}
        onOpenMemory={(memoryId) => {
          setIsAskJournalOpen(false);
          setIsMemoryModalOpen(true);
        }}
        totalEntries={entries.length}
      />
    </div>
  );
}
