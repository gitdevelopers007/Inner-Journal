import React, { useState, useMemo } from 'react';
import { JournalEntry, MoodType } from '../types';
import {
  Search,
  Plus,
  Star,
  Trash2,
  Calendar,
  Smile,
  Sparkles,
  BookOpen,
  X,
  Filter,
  Check,
  Compass
} from 'lucide-react';

interface SidebarProps {
  entries: JournalEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onDeleteEntry: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenMemory?: () => void;
  onOpenAskJournal?: () => void;
}

const MOOD_EMOJIS: Record<MoodType, string> = {
  peaceful: '🌿',
  grateful: '✨',
  thoughtful: '💡',
  energized: '⚡',
  stressed: '🌧️',
  creative: '🎨',
};

const MOOD_LABELS: Record<MoodType, string> = {
  peaceful: 'Peaceful',
  grateful: 'Grateful',
  thoughtful: 'Thoughtful',
  energized: 'Energized',
  stressed: 'Stressed',
  creative: 'Creative',
};

export const Sidebar: React.FC<SidebarProps> = ({
  entries,
  selectedEntryId,
  onSelectEntry,
  onNewEntry,
  onDeleteEntry,
  onToggleFavorite,
  isOpen,
  onClose,
  onOpenMemory,
  onOpenAskJournal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMood, setSelectedMood] = useState<MoodType | 'all'>('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.summary?.overview &&
          entry.summary.overview.toLowerCase().includes(searchTerm.toLowerCase())) ||
        entry.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesMood = selectedMood === 'all' || entry.mood === selectedMood;
      const matchesFavorite = !showFavoritesOnly || Boolean(entry.isFavorite);

      return matchesSearch && matchesMood && matchesFavorite;
    });
  }, [entries, searchTerm, selectedMood, showFavoritesOnly]);

  const groupedEntries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: { [key: string]: JournalEntry[] } = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Earlier: [],
    };

    filteredEntries.forEach((entry) => {
      const dateVal = new Date(entry.updatedAt || entry.createdAt);
      dateVal.setHours(0, 0, 0, 0);

      if (dateVal.getTime() === today.getTime()) {
        groups.Today.push(entry);
      } else if (dateVal.getTime() === yesterday.getTime()) {
        groups.Yesterday.push(entry);
      } else if (dateVal.getTime() > lastWeek.getTime()) {
        groups['Previous 7 Days'].push(entry);
      } else {
        groups.Earlier.push(entry);
      }
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredEntries]);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recent';
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-neutral-900/30 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static top-16 bottom-0 left-0 z-40 w-80 sm:w-88 bg-white border-r border-neutral-200/90 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header & Controls */}
        <div className="p-4 border-b border-neutral-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-neutral-700" />
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
                Reflections
              </h2>
              <span className="px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600 rounded-full font-medium">
                {entries.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                id="sidebar-new-entry-btn"
                onClick={onNewEntry}
                title="New Reflection"
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg lg:hidden cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="sidebar-search-input"
              type="text"
              placeholder="Search reflections & themes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 focus:bg-white transition-all text-neutral-900 placeholder:text-neutral-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
            <button
              onClick={() => setSelectedMood('all')}
              className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedMood === 'all'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                showFavoritesOnly
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <Star className={`w-3 h-3 ${showFavoritesOnly ? 'fill-amber-500 text-amber-500' : ''}`} />
              Starred
            </button>
            {(['thoughtful', 'grateful', 'peaceful', 'creative', 'energized', 'stressed'] as MoodType[]).map(
              (m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMood(selectedMood === m ? 'all' : m)}
                  className={`px-2 py-1 rounded-md font-medium flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                    selectedMood === m
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  <span>{MOOD_EMOJIS[m]}</span>
                  <span>{MOOD_LABELS[m]}</span>
                </button>
              )
            )}
          </div>

          {onOpenAskJournal && (
            <button
              id="sidebar-ask-journal-btn"
              onClick={onOpenAskJournal}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-neutral-900 bg-amber-50/70 hover:bg-amber-100/80 border border-amber-200/80 rounded-lg transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Ask My Journal</span>
              </div>
              <span className="text-[10px] text-amber-700 font-medium">Query</span>
            </button>
          )}

          {onOpenMemory && (
            <button
              id="sidebar-memory-engine-btn"
              onClick={onOpenMemory}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-neutral-800 bg-neutral-50 hover:bg-neutral-100/90 border border-neutral-200/80 rounded-lg transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-900 transition-colors" />
                <span>Personal Memory Engine</span>
              </div>
              <span className="text-[10px] text-neutral-400 group-hover:text-neutral-600">Explore</span>
            </button>
          )}
        </div>

        {/* Entries List with Progressive Date Disclosure */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-3">
              <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                <Filter className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-neutral-700">
                {searchTerm || selectedMood !== 'all' || showFavoritesOnly
                  ? 'No matching reflections found'
                  : 'No reflections recorded yet'}
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                {searchTerm
                  ? 'Try changing your search term or mood filter.'
                  : 'Start your first private reflection conversation.'}
              </p>
              {!searchTerm && selectedMood === 'all' && !showFavoritesOnly && (
                <button
                  onClick={onNewEntry}
                  aria-label="Begin your first reflection entry"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Begin Entry
                </button>
              )}
            </div>
          ) : (
            groupedEntries.map(([groupTitle, groupItems]) => (
              <div key={groupTitle} className="space-y-2">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1 pt-1">
                  {groupTitle}
                </div>

                {groupItems.map((entry) => {
                  const isSelected = entry.id === selectedEntryId;
                  const isDeleting = confirmDeleteId === entry.id;

                  return (
                    <div
                      key={entry.id}
                      id={`entry-card-${entry.id}`}
                      onClick={() => {
                        if (!isDeleting) onSelectEntry(entry.id);
                      }}
                      className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                          : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-200/80 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm shrink-0">{MOOD_EMOJIS[entry.mood] || '💡'}</span>
                          <h3
                            className={`text-xs font-semibold truncate ${
                              isSelected ? 'text-white' : 'text-neutral-900'
                            }`}
                          >
                            {entry.title || 'Untitled Reflection'}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(entry.id);
                            }}
                            aria-label={entry.isFavorite ? 'Remove star' : 'Star reflection'}
                            title={entry.isFavorite ? 'Remove Star' : 'Star Reflection'}
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              isSelected
                                ? 'text-neutral-300 hover:text-white'
                                : 'text-neutral-400 hover:text-neutral-700'
                            }`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                entry.isFavorite
                                  ? 'fill-amber-400 text-amber-400'
                                  : ''
                              }`}
                            />
                          </button>

                          {isDeleting ? (
                            <div
                              className="flex items-center gap-1 bg-rose-600 text-white px-2 py-0.5 rounded-md text-[10px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>Delete?</span>
                              <button
                                onClick={() => {
                                  onDeleteEntry(entry.id);
                                  setConfirmDeleteId(null);
                                }}
                                aria-label="Confirm delete reflection"
                                className="hover:underline font-bold ml-1"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                aria-label="Cancel delete reflection"
                                className="hover:underline opacity-80 ml-1"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(entry.id);
                              }}
                              aria-label="Delete reflection"
                              title="Delete entry"
                              className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                                isSelected
                                  ? 'text-neutral-400 hover:text-rose-300'
                                  : 'text-neutral-400 hover:text-rose-600'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Summary preview or snippet */}
                      <p
                        className={`text-[11px] mt-1.5 line-clamp-2 leading-relaxed ${
                          isSelected ? 'text-neutral-300' : 'text-neutral-500'
                        }`}
                      >
                        {entry.summary?.overview || 'Conversational reflection with Gemini.'}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-current/10 text-[10px]">
                        <span
                          className={`flex items-center gap-1 ${
                            isSelected ? 'text-neutral-400' : 'text-neutral-400'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          {formatDate(entry.updatedAt || entry.createdAt)}
                        </span>

                        {entry.summary ? (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium ${
                              isSelected
                                ? 'bg-neutral-800 text-amber-300'
                                : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                            }`}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            Summarized
                          </span>
                        ) : (
                          <span
                            className={`font-medium ${
                              isSelected ? 'text-neutral-400' : 'text-neutral-400'
                            }`}
                          >
                            {entry.interactionCount > 0
                              ? `${entry.interactionCount} messages`
                              : 'Draft'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
};
