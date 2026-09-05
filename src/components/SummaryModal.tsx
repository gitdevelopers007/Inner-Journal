import React, { useState, useEffect } from 'react';
import { EntrySummary } from '../types';
import { Sparkles, X, Check, Copy, Heart, Tag, ArrowUpRight, Compass } from 'lucide-react';

interface SummaryModalProps {
  summary: EntrySummary | null;
  entryTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  summary,
  entryTitle,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !summary) return null;

  const handleCopy = () => {
    const text = `Reflection Summary: ${entryTitle}
Tone: ${summary.emotionalTone}

Overview:
${summary.overview}

Key Themes:
${summary.keyThemes.map((t) => `- ${t}`).join('\n')}

Actionable Takeaways:
${summary.actionableInsights.map((i) => `- ${i}`).join('\n')}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300/60 text-amber-800 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="summary-modal-title" className="text-base font-bold text-neutral-900 leading-tight">
                Reflection Synthesis
              </h2>
              <p className="text-xs text-neutral-500 truncate max-w-sm">
                {entryTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Synthesis</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Emotional Tone Banner */}
          <div className="p-4 bg-gradient-to-r from-amber-50/80 to-indigo-50/80 border border-amber-200/60 rounded-xl flex items-start gap-3">
            <Heart className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                Emotional Arc & Tone
              </p>
              <p className="text-sm font-medium text-neutral-800 mt-0.5">
                {summary.emotionalTone}
              </p>
            </div>
          </div>

          {/* Overview */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-neutral-600" />
              Executive Overview
            </h3>
            <p className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-xl border border-neutral-200/70 font-serif">
              {summary.overview}
            </p>
          </div>

          {/* Key Themes */}
          {summary.keyThemes && summary.keyThemes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-neutral-600" />
                Key Themes & Patterns
              </h3>
              <div className="flex flex-wrap gap-2">
                {summary.keyThemes.map((theme, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-lg text-xs font-medium"
                  >
                    #{theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actionable Insights */}
          {summary.actionableInsights && summary.actionableInsights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-neutral-600" />
                Actionable Micro-Steps & Takeaways
              </h3>
              <div className="space-y-2">
                {summary.actionableInsights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-emerald-50/50 border border-emerald-200/70 rounded-xl"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                      {insight}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
          <span>Synthesized by Gemini 3.6 Flash</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
