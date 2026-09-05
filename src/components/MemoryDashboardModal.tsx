import React, { useState, useMemo, useEffect } from 'react';
import {
  PersonalMemoryItem,
  MemoryType,
  MemoryDashboardData,
} from '../types';
import {
  X,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  EyeOff,
  Trash2,
  RefreshCw,
  Clock,
  Compass,
  Target,
  Lightbulb,
  Milestone,
  HelpCircle,
  GitCommit,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from 'lucide-react';

interface MemoryDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  memories: PersonalMemoryItem[];
  isLoading: boolean;
  dashboardData: MemoryDashboardData | null;
  onRefresh: () => Promise<void>;
  onSaveMemory: (id: string, isSaved: boolean) => Promise<void>;
  onDismissMemory: (id: string) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onSelectEntry: (entryId: string) => void;
  totalEntries: number;
}

const TYPE_CONFIG: Record<
  MemoryType,
  { label: string; icon: React.ElementType; badgeBg: string; badgeText: string; badgeBorder: string }
> = {
  theme: {
    label: 'Recurring Theme',
    icon: Compass,
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200/80',
  },
  goal: {
    label: 'Observed Goal',
    icon: Target,
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-800',
    badgeBorder: 'border-blue-200/80',
  },
  lesson: {
    label: 'Realized Lesson',
    icon: Lightbulb,
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200/80',
  },
  moment: {
    label: 'Important Moment',
    icon: Milestone,
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200/80',
  },
  open_loop: {
    label: 'Open Loop',
    icon: HelpCircle,
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200/80',
  },
  thinking_shift: {
    label: 'Shift in Perspective',
    icon: GitCommit,
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200/80',
  },
};

const GOAL_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', cls: 'bg-blue-100 text-blue-800' },
  paused: { label: 'Paused', cls: 'bg-neutral-100 text-neutral-700' },
  unclear: { label: 'In Progress', cls: 'bg-amber-100 text-amber-800' },
};

export const MemoryDashboardModal: React.FC<MemoryDashboardModalProps> = ({
  isOpen,
  onClose,
  memories,
  isLoading,
  dashboardData,
  onRefresh,
  onSaveMemory,
  onDismissMemory,
  onDeleteMemory,
  onSelectEntry,
  totalEntries,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | MemoryType | 'saved'>('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const activeMemories = useMemo(() => {
    return memories.filter((m) => (showDismissed ? true : !m.isDismissed));
  }, [memories, showDismissed]);

  const filteredMemories = useMemo(() => {
    if (selectedFilter === 'saved') {
      return activeMemories.filter((m) => m.isSaved);
    }
    if (selectedFilter === 'all') {
      return activeMemories;
    }
    return activeMemories.filter((m) => m.type === selectedFilter);
  }, [activeMemories, selectedFilter]);

  const countsByType = useMemo(() => {
    const counts: Record<string, number> = {
      all: activeMemories.length,
      saved: activeMemories.filter((m) => m.isSaved).length,
    };
    activeMemories.forEach((m) => {
      counts[m.type] = (counts[m.type] || 0) + 1;
    });
    return counts;
  }, [activeMemories]);

  if (!isOpen) return null;

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      id="memory-dashboard-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200/90 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200/80 bg-neutral-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-amber-300 flex items-center justify-center shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">
                  Personal Memory Engine
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-full">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Evidence-Grounded
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Recurring themes, milestones, goals, and shifting perspectives across your private reflections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="refresh-memories-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="Re-synthesize personal memories from your journal reflections"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg shadow-2xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-neutral-600' : 'text-neutral-500'}`} />
              <span className="hidden sm:inline">{isLoading ? 'Synthesizing...' : 'Refresh Memories'}</span>
            </button>
            <button
              id="close-memory-modal-btn"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-neutral-100 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {(
              [
                { id: 'all', label: 'All Memories' },
                { id: 'theme', label: 'Themes' },
                { id: 'goal', label: 'Goals' },
                { id: 'lesson', label: 'Lessons' },
                { id: 'moment', label: 'Moments' },
                { id: 'open_loop', label: 'Open Loops' },
                { id: 'thinking_shift', label: 'Thinking Shifts' },
                { id: 'saved', label: 'Saved / Kept' },
              ] as const
            ).map((tab) => {
              const count = countsByType[tab.id] || 0;
              const isSelected = selectedFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`memory-filter-${tab.id}`}
                  onClick={() => setSelectedFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-neutral-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                      isSelected
                        ? 'bg-neutral-800 text-neutral-200'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 min-w-max pl-2">
            <button
              onClick={() => setShowDismissed((prev) => !prev)}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 underline transition-colors cursor-pointer whitespace-nowrap"
            >
              {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
            </button>
          </div>
        </div>

        {/* Modal Body / Memory Feed */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-neutral-50/40">
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-10 h-10 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-neutral-800">
                Examining your reflection history across time...
              </p>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Discovering recurring patterns, lessons, and perspective shifts grounded strictly in your authentic words.
              </p>
            </div>
          ) : dashboardData?.status === 'insufficient_evidence' || (totalEntries < 2 && memories.length === 0) ? (
            <div className="py-16 text-center max-w-md mx-auto space-y-3 bg-white p-8 rounded-2xl border border-neutral-200 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-neutral-900">
                Gathering Reflection History
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Your journal needs a little more history before meaningful patterns can be found. As you reflect across multiple days, recurring themes, goals, lessons, and thinking shifts will naturally surface here.
              </p>
              <p className="text-[11px] text-neutral-400">
                Currently tracking {totalEntries} {totalEntries === 1 ? 'reflection' : 'reflections'}. Write at least 2 reflections to enable pattern discovery.
              </p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto space-y-2">
              <Compass className="w-8 h-8 text-neutral-300 mx-auto" />
              <p className="text-sm font-medium text-neutral-700">
                No memories in this view.
              </p>
              <p className="text-xs text-neutral-400">
                {selectedFilter === 'saved'
                  ? 'You haven’t saved any memories yet. Click the bookmark icon on any item to keep it permanently.'
                  : 'Try selecting a different category filter or click "Refresh Memories".'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMemories.map((memory) => {
                const config = TYPE_CONFIG[memory.type] || TYPE_CONFIG.theme;
                const IconComponent = config.icon;
                const isEvidenceExpanded = expandedEvidenceId === memory.id;

                return (
                  <div
                    key={memory.id}
                    id={`memory-card-${memory.id}`}
                    className={`bg-white rounded-xl border p-4 shadow-xs transition-all hover:border-neutral-300 flex flex-col justify-between ${
                      memory.isDismissed
                        ? 'opacity-60 border-dashed border-neutral-300'
                        : memory.isSaved
                        ? 'border-amber-300/80 ring-1 ring-amber-100'
                        : 'border-neutral-200/90'
                    }`}
                  >
                    <div>
                      {/* Card Top Pill & Action Row */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}
                        >
                          <IconComponent className="w-3 h-3" />
                          <span>{config.label}</span>
                        </span>

                        <div className="flex items-center gap-1">
                          {memory.status && (
                            <span
                              className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                                GOAL_STATUS_STYLES[memory.status]?.cls || 'bg-neutral-100 text-neutral-700'
                              }`}
                            >
                              {GOAL_STATUS_STYLES[memory.status]?.label || memory.status}
                            </span>
                          )}

                          <button
                            id={`save-memory-btn-${memory.id}`}
                            onClick={() => onSaveMemory(memory.id, !memory.isSaved)}
                            title={memory.isSaved ? 'Remove from saved' : 'Keep / Save memory'}
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              memory.isSaved
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
                            }`}
                          >
                            {memory.isSaved ? (
                              <BookmarkCheck className="w-4 h-4 fill-amber-500/20" />
                            ) : (
                              <Bookmark className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            id={`dismiss-memory-btn-${memory.id}`}
                            onClick={() => onDismissMemory(memory.id)}
                            title={memory.isDismissed ? 'Dismissed' : 'Dismiss memory'}
                            className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                          >
                            <EyeOff className="w-4 h-4" />
                          </button>

                          <button
                            id={`delete-memory-btn-${memory.id}`}
                            onClick={() => onDeleteMemory(memory.id)}
                            title="Delete memory"
                            className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Memory Title */}
                      <h3 className="text-sm font-semibold text-neutral-900 mb-1 leading-snug">
                        {memory.title}
                      </h3>

                      {/* Memory Description */}
                      <p className="text-xs text-neutral-600 leading-relaxed mb-3">
                        {memory.description}
                      </p>

                      {/* Special Thinking Shift Comparison */}
                      {memory.type === 'thinking_shift' && (memory.earlierPerspective || memory.laterPerspective) && (
                        <div className="mb-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100/80 space-y-1.5 text-xs">
                          {memory.earlierPerspective && (
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-neutral-600 shrink-0 text-[11px]">
                                Earlier:
                              </span>
                              <span className="text-neutral-700 italic text-[11px]">
                                "{memory.earlierPerspective}"
                              </span>
                            </div>
                          )}
                          {memory.laterPerspective && (
                            <div className="flex items-start gap-1.5 pt-1 border-t border-indigo-100/60">
                              <span className="font-semibold text-indigo-700 shrink-0 text-[11px]">
                                Shifted to:
                              </span>
                              <span className="text-indigo-900 font-medium text-[11px]">
                                "{memory.laterPerspective}"
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Special Theme Interpretation */}
                      {memory.type === 'theme' && memory.possibleInterpretation && (
                        <div className="mb-3 p-2.5 rounded-lg bg-amber-50/50 border border-amber-100/80 text-xs">
                          <span className="font-semibold text-amber-800 block text-[11px] mb-0.5">
                            Possible Insight:
                          </span>
                          <p className="text-neutral-700 text-[11px] leading-relaxed">
                            {memory.possibleInterpretation}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Grounded Evidence Section */}
                    <div className="pt-2 border-t border-neutral-100">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <button
                          onClick={() => setExpandedEvidenceId(isEvidenceExpanded ? null : memory.id)}
                          className="font-medium text-neutral-700 hover:text-neutral-900 underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>
                            Grounded in {memory.evidence.length}{' '}
                            {memory.evidence.length === 1 ? 'reflection' : 'reflections'}
                          </span>
                        </button>
                        {memory.mostRecentDate && (
                          <span className="text-neutral-400">
                            Recent: {formatDate(memory.mostRecentDate)}
                          </span>
                        )}
                      </div>

                      {/* Expandable Supporting Entries List */}
                      {isEvidenceExpanded && (
                        <div className="mt-2.5 space-y-2 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200/80 text-xs">
                          <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
                            Supporting Journal Evidence:
                          </p>
                          {memory.evidence.map((ev, idx) => (
                            <div
                              key={`${ev.entryId}_${idx}`}
                              className="bg-white p-2 rounded-md border border-neutral-200/60 shadow-2xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold text-neutral-800 text-[11px]">
                                  {ev.entryTitle || 'Reflection'}
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                  {formatDate(ev.date)}
                                </span>
                              </div>
                              <p className="text-[11px] text-neutral-600 italic">
                                "{ev.reason}"
                              </p>
                              <button
                                onClick={() => {
                                  onSelectEntry(ev.entryId);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-neutral-900 hover:text-amber-600 transition-colors pt-0.5 cursor-pointer"
                              >
                                <span>Open this reflection</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer / Disclaimer */}
        <div className="px-6 py-3 border-t border-neutral-200/80 bg-neutral-50/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center gap-1.5 text-center sm:text-left">
            <AlertCircle className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <p className="text-[11px] text-neutral-500">
              Observations reflect patterns in your written reflections, not clinical personality diagnoses. You own your journey.
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
