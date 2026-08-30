import React from 'react';
import {
  IdeaEvolutionData,
  IdeaEvolutionStage,
  RecurringThemeItem,
  RelatedEntryItem,
} from '../types';
import {
  GitFork,
  X,
  Sparkles,
  ArrowRight,
  HelpCircle,
  CheckCircle,
  BookOpen,
  Calendar,
  Layers,
  Repeat,
  Lightbulb,
  ExternalLink,
} from 'lucide-react';

interface IdeaEvolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  evolution: IdeaEvolutionData | null;
  isLoading: boolean;
  onSelectEntry?: (entryId: string) => void;
}

export const IdeaEvolutionModal: React.FC<IdeaEvolutionModalProps> = ({
  isOpen,
  onClose,
  evolution,
  isLoading,
  onSelectEntry,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="idea-evolution-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-neutral-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="idea-evolution-modal-container"
        className="bg-white border border-neutral-200/90 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-neutral-200/80 flex items-center justify-between bg-neutral-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
              <GitFork className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-serif font-bold text-neutral-900 tracking-tight">
                  Idea Evolution Map
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/70 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  Gemini Synthesis
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Longitudinal analysis across your authenticated journal reflections
              </p>
            </div>
          </div>

          <button
            id="close-evolution-modal-btn"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shadow-lg animate-bounce">
                  <GitFork className="w-7 h-7 text-amber-300" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-neutral-900">
                  Tracing Thought Trajectories...
                </h3>
                <p className="text-xs text-neutral-500 max-w-sm">
                  Gemini is analyzing recurring themes, ideological shifts, and cognitive milestones across your private entries.
                </p>
              </div>
            </div>
          ) : !evolution ? (
            <div className="py-12 text-center text-neutral-500 text-sm">
              No evolution data available. Please try generating again.
            </div>
          ) : (
            <>
              {/* Central Concept & Overview Banner */}
              <div className="p-5 rounded-xl bg-neutral-900 text-white shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Overarching Central Philosophy
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Analyzed {evolution.totalAnalyzedEntries} private reflections
                  </span>
                </div>
                <h3 className="text-lg font-serif font-bold text-neutral-100">
                  {evolution.centralConcept}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                  {evolution.themeOverview}
                </p>
              </div>

              {/* 1. Timeline of Idea Evolution Stages */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-neutral-700" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                    Chronological Evolution Milestones
                  </h4>
                </div>

                <div className="space-y-3 relative pl-4 border-l-2 border-neutral-200">
                  {evolution.timelineStages.map((stage: IdeaEvolutionStage, idx: number) => (
                    <div
                      key={idx}
                      className="relative bg-neutral-50/80 border border-neutral-200/90 rounded-xl p-4 transition-all hover:bg-neutral-50 hover:border-neutral-300"
                    >
                      {/* Timeline Dot Indicator */}
                      <div className="absolute -left-[23px] top-4.5 w-3.5 h-3.5 rounded-full bg-neutral-900 ring-4 ring-white" />

                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-serif font-bold text-neutral-900">
                            {stage.stageTitle}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 bg-neutral-200/70 text-neutral-700 rounded-md font-medium">
                            {stage.date}
                          </span>
                        </div>

                        {stage.entryId && onSelectEntry && (
                          <button
                            onClick={() => {
                              onSelectEntry(stage.entryId!);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
                          >
                            <span>Open Entry</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-neutral-600 mb-2 leading-relaxed">
                        {stage.evolutionDescription}
                      </p>

                      <div className="flex items-start gap-1.5 p-2 bg-amber-50/70 border border-amber-200/60 rounded-lg text-amber-900 text-xs">
                        <ArrowRight className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-[11px] uppercase tracking-wide mr-1">
                            Key Shift:
                          </span>
                          <span>{stage.keyShift}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Grid: Recurring Themes & Related Connections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Recurring Themes */}
                <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-neutral-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                      Recurring Themes
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {evolution.recurringThemes.map((theme: RecurringThemeItem, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-white border border-neutral-200/80 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-900">{theme.name}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-600 rounded">
                            {theme.frequencyCount} occurrences
                          </span>
                        </div>
                        <p className="text-neutral-500 text-[11px] leading-relaxed">
                          {theme.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Related Previous Entries */}
                <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-neutral-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                      Connected Previous Reflections
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {evolution.relatedEntries.map((rel: RelatedEntryItem, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-white border border-neutral-200/80 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-neutral-900">{rel.title}</span>
                          {onSelectEntry && (
                            <button
                              onClick={() => {
                                onSelectEntry(rel.entryId);
                                onClose();
                              }}
                              className="text-[11px] text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
                            >
                              View &rarr;
                            </button>
                          )}
                        </div>
                        <p className="text-neutral-500 text-[11px] leading-relaxed">
                          {rel.relevanceReason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Unresolved Questions & Next Steps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Unresolved Questions */}
                <div className="p-4 rounded-xl bg-rose-50/40 border border-rose-200/70 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-rose-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                      Unresolved Inquiries & Blind Spots
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {evolution.unresolvedQuestions.map((q: string, idx: number) => (
                      <li
                        key={idx}
                        className="text-xs text-neutral-700 flex items-start gap-2 bg-white/80 p-2.5 rounded-lg border border-rose-100"
                      >
                        <span className="text-rose-500 font-bold shrink-0">?</span>
                        <span className="leading-relaxed">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Suggested Next Steps */}
                <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                      Suggested Next Reflection Steps
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {evolution.suggestedNextSteps.map((step: string, idx: number) => (
                      <li
                        key={idx}
                        className="text-xs text-neutral-700 flex items-start gap-2 bg-white/80 p-2.5 rounded-lg border border-emerald-100"
                      >
                        <Lightbulb className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-200 bg-neutral-50/70 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-neutral-500">
            Powered by Gemini Multi-Turn Reasoning & Firestore Owner Isolation
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-semibold hover:bg-neutral-800 transition-all cursor-pointer"
          >
            Close Map
          </button>
        </div>
      </div>
    </div>
  );
};
