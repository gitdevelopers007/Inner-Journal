import React, { useState, useRef, useEffect } from 'react';
import {
  AskJournalMessage,
  AskJournalResponse,
  MemoryType,
} from '../types';
import { askJournalService } from '../services/askJournalService';
import {
  X,
  Sparkles,
  ShieldCheck,
  Send,
  RotateCcw,
  BookOpen,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  Compass,
  Target,
  Lightbulb,
  Milestone,
  RefreshCw,
  GitCommit,
  ExternalLink,
} from 'lucide-react';

interface AskJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntry: (entryId: string) => void;
  onOpenMemory?: (memoryId?: string) => void;
  totalEntries: number;
}

const MEMORY_TYPE_ICONS: Record<MemoryType, React.ElementType> = {
  theme: Compass,
  goal: Target,
  lesson: Lightbulb,
  moment: Milestone,
  open_loop: RefreshCw,
  thinking_shift: GitCommit,
};

const SUGGESTED_STARTERS = [
  'What themes keep coming back in my reflections?',
  'What goals am I still working toward?',
  'What have I changed my mind about?',
  'What have I learned recently?',
  'What decisions have I made recently?',
  'What am I leaving unresolved?',
  'When did I first mention my main project?',
];

export const AskJournalModal: React.FC<AskJournalModalProps> = ({
  isOpen,
  onClose,
  onSelectEntry,
  onOpenMemory,
  totalEntries,
}) => {
  const [messages, setMessages] = useState<AskJournalMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeWhyId, setActiveWhyId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText !== undefined ? queryText : inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMessageId = `msg_user_${Date.now()}`;
    const userMsg: AskJournalMessage = {
      id: userMessageId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    // Prepare bounded history context from previous messages (up to 4 turns)
    const historyPayload = messages.slice(-4).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const response: AskJournalResponse = await askJournalService.ask(textToSend, historyPayload);
      const assistantMsg: AskJournalMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Ask My Journal error:', err);
      const errorMsg: AskJournalMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: "Couldn't search your journal right now.",
        error: err?.message || "Couldn't search your journal right now. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = (failedQuestion: string) => {
    handleSend(failedQuestion);
  };

  const handleClearSession = () => {
    setMessages([]);
    setInputQuery('');
    setActiveWhyId(null);
  };

  const toggleWhy = (msgId: string) => {
    setActiveWhyId((prev) => (prev === msgId ? null : msgId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div
        id="ask-journal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Ask My Journal"
        className="bg-white rounded-2xl w-full max-w-3xl h-[92vh] max-h-[820px] flex flex-col shadow-2xl border border-neutral-200/90 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-neutral-200/90 flex items-center justify-between bg-neutral-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900 leading-none">
                  Ask My Journal
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 bg-neutral-200/70 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Private Query</span>
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                Searches only your authenticated journal reflections.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                id="ask-journal-reset-btn"
                onClick={handleClearSession}
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Clear current queries"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Query</span>
              </button>
            )}
            <button
              id="ask-journal-close-btn"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div
          id="ask-journal-messages-container"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-neutral-50/30"
        >
          {/* Empty Conversation State */}
          {messages.length === 0 && (
            <div className="max-w-xl mx-auto py-6 sm:py-10 text-center space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-100/70 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto shadow-2xs">
                <Sparkles className="w-6 h-6 text-amber-700" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-neutral-900">
                  {totalEntries < 1
                    ? 'Your journal is still getting to know you'
                    : 'Personal Reflection Intelligence'}
                </h3>
                <p className="text-xs text-neutral-600 max-w-md mx-auto leading-relaxed">
                  {totalEntries < 1
                    ? "Write a few reflections and you'll be able to ask deeper questions about patterns, goals, and changes over time."
                    : 'Ask questions grounded strictly in your personal thoughts, goals, recurring patterns, and recorded lessons.'}
                </p>
              </div>

              {/* Sample Starters */}
              <div className="pt-2 text-left space-y-2">
                <p className="text-[11px] font-medium text-neutral-600 uppercase tracking-wider text-center">
                  Suggested Questions
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {SUGGESTED_STARTERS.map((starter, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(starter)}
                      className="text-xs text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-200 hover:border-neutral-300 px-3 py-1.5 rounded-full transition-all text-left shadow-2xs cursor-pointer"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200/70 text-[11px] text-neutral-600 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Ask My Journal uses evidence exclusively from your private reflections.</span>
              </div>
            </div>
          )}

          {/* Messages Thread */}
          {messages.map((msg, index) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-neutral-900 text-white rounded-2xl rounded-tr-xs px-4 py-2.5 max-w-[85%] sm:max-w-[75%] shadow-xs text-xs sm:text-sm leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Assistant Response Card
            const resp = msg.response;
            const hasError = Boolean(msg.error);

            if (hasError) {
              // Find the preceding user question
              const prevUserMsg = messages[index - 1]?.content || '';
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="bg-white border border-rose-200 rounded-2xl rounded-tl-xs p-4 sm:p-5 max-w-[95%] sm:max-w-[90%] shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-rose-700 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Couldn&apos;t search your journal right now</span>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      {msg.error}
                    </p>
                    {prevUserMsg && (
                      <button
                        onClick={() => handleRetry(prevUserMsg)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry query</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-start">
                <div className="bg-white border border-neutral-200/90 rounded-2xl rounded-tl-xs p-4 sm:p-5 max-w-[95%] sm:max-w-[92%] shadow-2xs space-y-4">
                  {/* Category & Confidence Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pb-2 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Journal Synthesis</span>
                      </span>
                      {resp?.insufficientEvidence ? (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                          Insufficient Evidence
                        </span>
                      ) : resp?.evidence && resp.evidence.length > 0 ? (
                        <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full font-medium">
                          Based on {resp.evidence.length}{' '}
                          {resp.evidence.length === 1 ? 'reflection' : 'reflections'}
                        </span>
                      ) : null}
                    </div>

                    {resp?.confidence && (
                      <span className="text-neutral-600 capitalize">
                        Confidence: {resp.confidence}
                      </span>
                    )}
                  </div>

                  {/* Primary Answer Content */}
                  <div className="text-xs sm:text-sm text-neutral-800 leading-relaxed whitespace-pre-line space-y-2">
                    {msg.content}
                  </div>

                  {/* Inspectable "Why am I seeing this?" Section */}
                  {resp?.whyExplanation && (
                    <div className="border border-neutral-200/70 rounded-xl overflow-hidden bg-neutral-50/50">
                      <button
                        onClick={() => toggleWhy(msg.id)}
                        className="w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
                        title="Inspect how this response was grounded in journal reflections"
                      >
                        <span className="flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Why am I seeing this?</span>
                        </span>
                        {activeWhyId === msg.id ? (
                          <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                        )}
                      </button>

                      {activeWhyId === msg.id && (
                        <div className="px-3 pb-2.5 pt-1 text-[11px] text-neutral-600 border-t border-neutral-200/50 space-y-1">
                          <p className="leading-relaxed">{resp.whyExplanation}</p>
                          <p className="text-[10px] text-neutral-600 italic">
                            Grounding relies exclusively on verbatim text and dates from your reflections.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Evidence Cards List */}
                  {resp?.evidence && resp.evidence.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-semibold text-neutral-700 flex items-center justify-between">
                        <span>Supporting Evidence from Your Journal</span>
                        <span className="text-neutral-600 font-normal">
                          {resp.evidence.length} {resp.evidence.length === 1 ? 'entry' : 'entries'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {resp.evidence.map((ev, evIdx) => (
                          <div
                            key={evIdx}
                            className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-xs space-y-1.5 hover:border-neutral-300 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-neutral-900">
                                    {ev.entryTitle || 'Reflection'}
                                  </span>
                                  {ev.date && (
                                    <span className="text-[10px] text-neutral-600 font-medium bg-neutral-200/60 px-1.5 py-0.5 rounded-md">
                                      {new Date(ev.date).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-neutral-600 leading-snug">
                                  {ev.reason}
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  onSelectEntry(ev.entryId);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-800 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-200 px-2 py-1 rounded-md shrink-0 shadow-2xs transition-colors cursor-pointer"
                                title="Open this journal entry"
                              >
                                <span>Open</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>

                            {ev.snippet && (
                              <div className="bg-white border-l-2 border-amber-400 p-2 rounded-r-md text-[11px] italic text-neutral-700 font-serif">
                                &ldquo;{ev.snippet}&rdquo;
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Memories List */}
                  {resp?.relatedMemories && resp.relatedMemories.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 space-y-1.5">
                      <span className="text-[11px] font-semibold text-neutral-700">
                        Related Personal Memories
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {resp.relatedMemories.map((mem) => {
                          const IconComp = MEMORY_TYPE_ICONS[mem.type] || Compass;
                          return (
                            <button
                              key={mem.id}
                              onClick={() => {
                                if (onOpenMemory) {
                                  onOpenMemory(mem.id);
                                  onClose();
                                }
                              }}
                              className="inline-flex items-center gap-1.5 text-xs text-neutral-800 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/90 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                              title={mem.description || mem.title}
                            >
                              <IconComp className="w-3.5 h-3.5 text-amber-700" />
                              <span className="font-medium">{mem.title}</span>
                              <ExternalLink className="w-3 h-3 text-neutral-400" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Suggested Follow-Ups */}
                  {resp?.suggestedFollowUps && resp.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 space-y-1.5">
                      <span className="text-[10px] font-medium text-neutral-600 uppercase tracking-wider">
                        Suggested Follow-Up
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {resp.suggestedFollowUps.map((followUp, fIdx) => (
                          <button
                            key={fIdx}
                            onClick={() => handleSend(followUp)}
                            disabled={isLoading}
                            className="text-xs text-neutral-700 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-full transition-colors cursor-pointer disabled:opacity-50"
                          >
                            &bull; {followUp}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active Query Loading State */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-neutral-200/90 rounded-2xl rounded-tl-xs p-4 max-w-[80%] shadow-2xs space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-800">
                  <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                  <span>Searching reflections for grounded evidence...</span>
                </div>
                <p className="text-[11px] text-neutral-600">
                  Retrieving your entries, validating facts, and cross-referencing Personal Memories.
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer Footer */}
        <div className="p-3 sm:p-4 bg-white border-t border-neutral-200/90 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex flex-col gap-2"
          >
            <div className="relative flex items-center">
              <textarea
                ref={inputRef}
                id="ask-journal-input"
                rows={1}
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isLoading}
                placeholder="Ask about your past thoughts, goals, recurring themes, or lessons..."
                maxLength={1000}
                className="w-full bg-neutral-50 hover:bg-neutral-100/60 focus:bg-white text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-600 rounded-xl pl-3.5 pr-20 py-2.5 border border-neutral-200 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 outline-hidden transition-all resize-none disabled:opacity-60"
              />

              <div className="absolute right-2 flex items-center gap-1.5">
                <button
                  id="ask-journal-send-btn"
                  type="submit"
                  disabled={!inputQuery.trim() || isLoading}
                  className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white disabled:bg-neutral-200 disabled:text-neutral-400 flex items-center justify-center transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                  title="Submit journal query"
                >
                  {isLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-600 px-1">
              <span>Press Enter to ask &bull; Shift+Enter for new line</span>
              <span>{inputQuery.length} / 1000</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
