import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  JournalEntry,
  Interaction,
  ReflectionMode,
  MoodType,
  EntrySummary,
} from '../types';
import { PromptPicker } from './PromptPicker';
import {
  Send,
  Sparkles,
  Heart,
  Brain,
  MessageSquare,
  FileText,
  Copy,
  Check,
  Star,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Wand2,
  BookmarkPlus,
  GitFork
} from 'lucide-react';

interface JournalEditorProps {
  userId: string;
  entry: JournalEntry;
  interactions: Interaction[];
  onSaveEntry: (updated: Partial<JournalEntry>) => Promise<void>;
  onAddInteraction: (interaction: Interaction) => Promise<void>;
  onOpenSummaryModal: (summary: EntrySummary) => void;
  onOpenEvolution?: () => void;
}

const MOODS: Array<{ type: MoodType; label: string; emoji: string }> = [
  { type: 'thoughtful', label: 'Thoughtful', emoji: '💡' },
  { type: 'grateful', label: 'Grateful', emoji: '✨' },
  { type: 'peaceful', label: 'Peaceful', emoji: '🌿' },
  { type: 'energized', label: 'Energized', emoji: '⚡' },
  { type: 'creative', label: 'Creative', emoji: '🎨' },
  { type: 'stressed', label: 'Stressed', emoji: '🌧️' },
];

const MODES: Array<{
  id: ReflectionMode;
  label: string;
  desc: string;
  icon: React.ElementType;
}> = [
  {
    id: 'reflect',
    label: 'Reflect',
    desc: 'Mindful inquiry & gentle perspective',
    icon: Heart,
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    desc: 'Creative exploration & structuring',
    icon: Brain,
  },
  {
    id: 'summarize',
    label: 'Distill',
    desc: 'Synthesizing core thoughts',
    icon: FileText,
  },
  {
    id: 'chat',
    label: 'Conversation',
    desc: 'Open dialogue & processing',
    icon: MessageSquare,
  },
];

export const JournalEditor: React.FC<JournalEditorProps> = ({
  userId,
  entry,
  interactions,
  onSaveEntry,
  onAddInteraction,
  onOpenSummaryModal,
  onOpenEvolution,
}) => {
  const [title, setTitle] = useState(entry.title);
  const [mood, setMood] = useState<MoodType>(entry.mood || 'thoughtful');
  const [mode, setMode] = useState<ReflectionMode>('reflect');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [showPrompts, setShowPrompts] = useState(interactions.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when entry prop changes
  useEffect(() => {
    setTitle(entry.title);
    setMood(entry.mood || 'thoughtful');
    setErrorMessage(null);
    setLastFailedPrompt(null);
  }, [entry.id]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions, isSending]);

  const handleTitleBlur = async () => {
    if (title.trim() && title !== entry.title) {
      await onSaveEntry({ title: title.trim() });
    }
  };

  const handleMoodChange = async (newMood: MoodType) => {
    setMood(newMood);
    await onSaveEntry({ mood: newMood });
  };

  const handleGenerateTitle = async () => {
    const firstUserMsg = interactions.find((i) => i.role === 'user');
    const sourceText = firstUserMsg ? firstUserMsg.content : inputText;
    if (!sourceText.trim()) return;

    try {
      setIsGeneratingTitle(true);
      const res = await fetch('/api/gemini/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflection: sourceText }),
      });
      const data = await res.json();
      if (data.title) {
        setTitle(data.title);
        await onSaveEntry({ title: data.title });
      }
    } catch (err) {
      console.error('Error generating title:', err);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setErrorMessage(null);
    setLastFailedPrompt(null);
    setIsSending(true);

    const userInteractionId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userInteraction: Interaction = {
      id: userInteractionId,
      entryId: entry.id,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      mode,
    };

    try {
      // 1. Immediately persist user interaction to Firestore
      await onAddInteraction(userInteraction);
      setInputText('');

      // If this is the first interaction and title is generic, auto-suggest title
      if (interactions.length === 0 && (!entry.title || entry.title === 'Untitled Reflection')) {
        handleGenerateTitle();
      }

      // 2. Call backend Gemini API with multi-turn history
      const formattedHistory = interactions.map((item) => ({
        role: item.role,
        content: item.content,
      }));

      const res = await fetch('/api/gemini/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          history: formattedHistory,
          mode,
          mood,
          title,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      const assistantText = data.response;
      const modelUsed = data.modelUsed || 'gemini-3.7-flash';

      // 3. Save assistant interaction to Firestore
      const assistantInteractionId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const assistantInteraction: Interaction = {
        id: assistantInteractionId,
        entryId: entry.id,
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toISOString(),
        mode,
        modelUsed,
      };

      await onAddInteraction(assistantInteraction);
    } catch (err: any) {
      console.error('Error in conversation cycle:', err);
      setErrorMessage(
        err.message || 'Failed to communicate with Gemini. Your reflection was saved.'
      );
      setLastFailedPrompt(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (interactions.length === 0 || isSummarizing) return;

    try {
      setIsSummarizing(true);
      setErrorMessage(null);

      const res = await fetch('/api/gemini/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          mood,
          interactions: interactions.map((i) => ({
            role: i.role,
            content: i.content,
          })),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Summary generation failed');
      }

      const data = await res.json();
      if (data.summary) {
        await onSaveEntry({ summary: data.summary });
        onOpenSummaryModal(data.summary);
      }
    } catch (err: any) {
      console.error('Error generating summary:', err);
      setErrorMessage(err.message || 'Unable to generate reflection summary right now.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] bg-neutral-50/50 overflow-hidden">
      {/* Top Workspace Toolbar */}
      <div className="bg-white border-b border-neutral-200/90 p-4 sm:px-6 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Title input with auto-generate button */}
          <div className="flex-1 flex items-center gap-2 max-w-xl">
            <input
              id="entry-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Give your reflection a title..."
              className="w-full text-lg sm:text-xl font-serif font-bold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-900 focus:outline-hidden px-1 py-0.5 transition-colors"
            />
            <button
              id="auto-title-btn"
              onClick={handleGenerateTitle}
              disabled={isGeneratingTitle}
              title="Auto-suggest title from your reflection"
              className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Wand2
                className={`w-4 h-4 ${isGeneratingTitle ? 'animate-spin text-amber-600' : ''}`}
              />
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Idea Evolution CTA */}
            {onOpenEvolution && (
              <button
                id="entry-idea-evolution-btn"
                onClick={onOpenEvolution}
                title="Trace how ideas in this reflection connect and evolved across your journal"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-lg shadow-2xs transition-all cursor-pointer"
              >
                <GitFork className="w-3.5 h-3.5 text-amber-600" />
                <span>Idea Evolution</span>
              </button>
            )}

            {/* Generate Summary CTA */}
            <button
              id="generate-summary-btn"
              onClick={
                entry.summary
                  ? () => onOpenSummaryModal(entry.summary!)
                  : handleGenerateSummary
              }
              disabled={interactions.length === 0 || isSummarizing}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                entry.summary
                  ? 'bg-amber-100/80 hover:bg-amber-200/80 text-amber-900 border border-amber-300/70'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-white'
              }`}
            >
              {isSummarizing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : entry.summary ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>View Synthesis</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Summarize with AI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sub-toolbar: Mood Selector & Interaction Mode Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-neutral-100 text-xs">
          {/* Mood Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-medium text-neutral-400 mr-1">Mood:</span>
            {MOODS.map((m) => (
              <button
                key={m.type}
                onClick={() => handleMoodChange(m.type)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] font-medium ${
                  mood === m.type
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-neutral-100 hover:bg-neutral-200/70 text-neutral-700'
                }`}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg">
            {MODES.map((m) => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  title={m.desc}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {lastFailedPrompt && (
              <button
                onClick={() => handleSendMessage(lastFailedPrompt)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-medium text-[11px] shrink-0 cursor-pointer"
              >
                Retry AI Call
              </button>
            )}
          </div>
        )}

        {/* Empty state / Welcome prompt */}
        {interactions.length === 0 ? (
          <div className="max-w-2xl mx-auto py-8 space-y-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100/80 border border-amber-300/50 text-amber-800 flex items-center justify-center mx-auto shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-serif font-bold text-neutral-900">
                Begin Your Reflection
              </h2>
              <p className="text-xs sm:text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
                Write down what is currently unfolding in your thoughts. Gemini will engage as your private partner in the{' '}
                <span className="font-semibold text-neutral-900">{mode}</span> mode.
              </p>
            </div>

            <PromptPicker
              mood={mood}
              onSelectPrompt={(text) => {
                setInputText(text);
                textareaRef.current?.focus();
              }}
            />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {interactions.map((interaction) => {
              const isUser = interaction.role === 'user';
              const isCopied = copiedId === interaction.id;

              return (
                <div
                  key={interaction.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[82%] rounded-2xl p-4 sm:p-5 space-y-2 ${
                      isUser
                        ? 'bg-neutral-900 text-white rounded-tr-xs shadow-xs'
                        : 'bg-white border border-neutral-200/90 text-neutral-900 rounded-tl-xs shadow-xs'
                    }`}
                  >
                    {/* Header meta */}
                    <div
                      className={`flex items-center justify-between gap-3 text-[10px] pb-1 border-b ${
                        isUser ? 'border-neutral-800 text-neutral-400' : 'border-neutral-100 text-neutral-500'
                      }`}
                    >
                      <span className="font-semibold uppercase tracking-wider flex items-center gap-1">
                        {isUser ? 'You' : 'Gemini 3.6 Flash'}
                        {!isUser && interaction.modelUsed && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-neutral-100 text-neutral-600 rounded font-normal lowercase">
                            {interaction.modelUsed}
                          </span>
                        )}
                      </span>

                      <div className="flex items-center gap-2">
                        <span>
                          {new Date(interaction.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          onClick={() => handleCopyText(interaction.id, interaction.content)}
                          title="Copy text"
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            isUser
                              ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
                              : 'hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700'
                          }`}
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div
                      className={`text-xs sm:text-sm leading-relaxed prose prose-sm max-w-none ${
                        isUser
                          ? 'text-neutral-100 whitespace-pre-wrap'
                          : 'text-neutral-800'
                      }`}
                    >
                      {isUser ? (
                        interaction.content
                      ) : (
                        <div className="markdown-body">
                          <ReactMarkdown>{interaction.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing / Generating state indicator */}
            {isSending && (
              <div className="flex flex-col items-start max-w-3xl mx-auto">
                <div className="bg-white border border-neutral-200/90 rounded-2xl rounded-tl-xs p-4 shadow-xs flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <span className="text-xs text-neutral-600 font-medium">
                    Gemini 3.6 Flash is reflecting...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Composer Footer */}
      <div className="p-4 sm:p-6 bg-white border-t border-neutral-200/90 shrink-0">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Prompt Toggle Bar */}
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setShowPrompts(!showPrompts)}
              className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 transition-colors font-medium cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>{showPrompts ? 'Hide Inquiries' : 'Show Inquiry Prompts'}</span>
            </button>
            <span className="text-[11px] text-neutral-400 hidden sm:inline">
              Press ⌘/Ctrl + Enter to send
            </span>
          </div>

          {/* Conditional Prompt Inspirations */}
          {showPrompts && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-150">
              <PromptPicker
                mood={mood}
                onSelectPrompt={(text) => {
                  setInputText(text);
                  textareaRef.current?.focus();
                }}
              />
            </div>
          )}

          {/* Textarea and Send */}
          <div className="relative flex items-end gap-2 bg-neutral-50 border border-neutral-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-neutral-900 focus-within:bg-white transition-all shadow-2xs">
            <textarea
              id="reflection-input"
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Write your reflection, journal entry, or ask for ${mode}...`}
              rows={3}
              className="w-full text-xs sm:text-sm bg-transparent border-0 focus:outline-hidden text-neutral-900 placeholder:text-neutral-400 resize-none p-1.5 leading-relaxed"
            />

            <button
              id="send-reflection-btn"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isSending}
              className="inline-flex items-center justify-center w-10 h-10 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 text-white rounded-lg transition-all active:scale-95 cursor-pointer shrink-0"
              title="Send Reflection"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
