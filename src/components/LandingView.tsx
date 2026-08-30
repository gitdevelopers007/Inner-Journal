import React, { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';
import { Sparkles, Shield, Lock, BrainCircuit, BookHeart, ArrowRight, CheckCircle2 } from 'lucide-react';

interface LandingViewProps {
  onAuthenticated: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onAuthenticated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
      onAuthenticated();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing. Please try again.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please enable popups to sign in.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-800 text-xs font-medium tracking-wide">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>Strict User-Isolated Cloud Firestore Persistence</span>
        </div>

        {/* Hero title */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900 font-serif leading-tight">
            Your Private Space for Meaningful Reflections & Clarity
          </h1>
          <p className="text-base sm:text-lg text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            Converse with Gemini 3.6 Flash to unpack your thoughts, brainstorm ideas, and capture daily summaries—secured with Google Authentication and protected by per-user Firestore security rules.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm max-w-md mx-auto text-left">
            <p className="font-semibold">Authentication Error</p>
            <p className="text-xs mt-1 text-rose-700">{error}</p>
          </div>
        )}

        {/* Main CTA */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            id="google-signin-btn"
            onClick={handleSignIn}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3.5 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1s.7 5.4 1.9 7.8l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                  />
                </svg>
                <span>Continue with Google Sign-In</span>
                <ArrowRight className="w-4 h-4 text-neutral-400" />
              </>
            )}
          </button>
        </div>

        {/* Feature Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
          <div className="p-6 bg-white rounded-2xl border border-neutral-200/80 shadow-xs hover:border-neutral-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 mb-4">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">
              Multi-Turn AI Reflections
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Explore your thoughts with Gemini 3.6 Flash through empathetic dialogue, brainstorming, or structured inquiry.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-neutral-200/80 shadow-xs hover:border-neutral-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">
              User-Isolated Storage
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Every journal entry and reflection is stored in Firestore strictly under your UID path. Other users cannot read your entries.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-neutral-200/80 shadow-xs hover:border-neutral-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700 mb-4">
              <BookHeart className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">
              Automated Synthesis
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Generate structured executive summaries, emotional tone tracking, and actionable micro-steps on demand.
            </p>
          </div>
        </div>

        {/* Security Assurance Notice */}
        <div className="p-4 bg-neutral-100/60 border border-neutral-200 rounded-xl text-xs text-neutral-600 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Zero passwords stored in application code • Federated Google OAuth & Firestore Rules enforced</span>
        </div>
      </div>
    </div>
  );
};
