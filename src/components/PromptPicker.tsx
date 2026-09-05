import React, { useState } from 'react';
import { MoodType } from '../types';
import { Sparkles, RefreshCw, Lightbulb } from 'lucide-react';
import { auth } from '../lib/firebase';

interface PromptPickerProps {
  mood: MoodType;
  onSelectPrompt: (promptText: string) => void;
}

const DEFAULT_PROMPTS: Record<MoodType, string[]> = {
  peaceful: [
    'What brought a sense of calm or balance into your day?',
    'Describe a quiet moment that helped you feel grounded.',
    'What is something you want to savor without rushing?',
    'How did you honor your energy and boundaries today?',
  ],
  grateful: [
    'Who is someone who supported or uplifted you recently?',
    'What is an unexpected blessing or pleasant surprise from this week?',
    'What simple comfort are you deeply appreciative of right now?',
    'What is a challenge you faced that taught you something valuable?',
  ],
  thoughtful: [
    'What is a question you have been pondering recently?',
    'What pattern in your thoughts or habits are you noticing lately?',
    'If you looked at your current situation from 5 years in the future, what would you see?',
    'What truth have you been hesitant to admit to yourself?',
  ],
  energized: [
    'What exciting idea or project is sparking your curiosity right now?',
    'How can you channel this momentum into a meaningful action?',
    'What risk or bold step are you feeling ready to explore?',
    'What inspired your enthusiasm today?',
  ],
  stressed: [
    'What is the heaviest weight on your mind right now, in your own raw words?',
    'What part of this stress is within your control, and what is outside of it?',
    'What is one small thing you can let go of or postpone today?',
    'What would gentle self-compassion look like for you right now?',
  ],
  creative: [
    'If you had zero constraints or fear of failure, what would you create?',
    'What two unrelated concepts could you connect to solve a current problem?',
    'What artistic, musical, or narrative idea has been whispering to you?',
    'How could you make a routine task delightfully playful?',
  ],
};

export const PromptPicker: React.FC<PromptPickerProps> = ({
  mood,
  onSelectPrompt,
}) => {
  const [prompts, setPrompts] = useState<string[]>(DEFAULT_PROMPTS[mood] || DEFAULT_PROMPTS.thoughtful);
  const [loading, setLoading] = useState(false);

  // Sync default prompts when mood changes
  React.useEffect(() => {
    setPrompts(DEFAULT_PROMPTS[mood] || DEFAULT_PROMPTS.thoughtful);
  }, [mood]);

  const handleFetchAIPrompts = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      const res = await fetch('/api/gemini/suggest-prompts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mood }),
      });
      const data = await res.json();
      if (Array.isArray(data.prompts) && data.prompts.length > 0) {
        setPrompts(data.prompts);
      }
    } catch (err) {
      console.error('Error fetching AI prompts:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 bg-neutral-50/80 border border-neutral-200/80 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
          <span>Prompt Inspirations</span>
        </div>
        <button
          onClick={handleFetchAIPrompts}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-neutral-900 transition-colors disabled:opacity-50 cursor-pointer"
          title="Get AI suggested prompts"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          <span>{loading ? 'Generating...' : 'Refresh with AI'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {prompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(p)}
            className="text-left text-xs p-2 bg-white hover:bg-neutral-100/90 border border-neutral-200/60 rounded-lg text-neutral-700 hover:text-neutral-900 transition-all line-clamp-2 cursor-pointer active:scale-98"
          >
            "{p}"
          </button>
        ))}
      </div>
    </div>
  );
};
