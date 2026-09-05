import React from 'react';
import { UserProfile } from '../types';
import { Sparkles, LogOut, Plus, ShieldCheck, BookOpen, Layers, Compass } from 'lucide-react';

interface NavbarProps {
  user: UserProfile | null;
  onSignOut: () => void;
  onNewEntry: () => void;
  onOpenEvolution: () => void;
  onOpenMemory: () => void;
  onOpenAskJournal: () => void;
  entryCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onSignOut,
  onNewEntry,
  onOpenEvolution,
  onOpenMemory,
  onOpenAskJournal,
  entryCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-neutral-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-neutral-900 tracking-tight">
                Inner Journal
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Isolated
              </span>
            </div>
            <p className="text-xs text-neutral-500 hidden sm:block">
              Private AI Reflections & Cloud Firestore
            </p>
          </div>
        </div>

        {/* User Actions */}
        {user ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="nav-ask-journal-btn"
              onClick={onOpenAskJournal}
              title="Ask questions about your journal history"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300/80 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-neutral-800" />
              <span>Ask Journal</span>
            </button>

            <button
              id="nav-memory-engine-btn"
              onClick={onOpenMemory}
              title="Open Personal Memory Engine"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200/80 border border-neutral-200 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer hidden md:inline-flex"
            >
              <Compass className="w-3.5 h-3.5 text-neutral-700" />
              <span>Personal Memory</span>
            </button>

            <button
              id="nav-idea-evolution-btn"
              onClick={onOpenEvolution}
              title="Analyze Idea Evolution across your private reflections"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-800 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/70 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer hidden lg:inline-flex"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Idea Evolution</span>
            </button>

            <button
              id="nav-new-entry-btn"
              onClick={onNewEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Reflection</span>
            </button>

            <div className="h-6 w-px bg-neutral-200 mx-1" />

            <div className="flex items-center gap-2.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User Avatar'}
                  className="w-8 h-8 rounded-full ring-2 ring-neutral-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-300 flex items-center justify-center text-xs font-semibold text-neutral-700">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div className="hidden md:block text-left">
                <p className="text-xs font-medium text-neutral-900 leading-tight truncate max-w-[140px]">
                  {user.displayName || 'Authenticated User'}
                </p>
                <p className="text-[11px] text-neutral-500 truncate max-w-[140px]">
                  {user.email || 'Private Account'}
                </p>
              </div>

              <button
                id="sign-out-btn"
                onClick={onSignOut}
                title="Sign Out"
                className="p-2 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
};
