export type ReflectionMode = 'reflect' | 'brainstorm' | 'summarize' | 'chat';

export type MoodType = 'peaceful' | 'grateful' | 'thoughtful' | 'energized' | 'stressed' | 'creative';

export interface Interaction {
  id: string;
  entryId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: ReflectionMode;
  modelUsed?: string;
}

export interface EntrySummary {
  overview: string;
  keyThemes: string[];
  emotionalTone: string;
  actionableInsights: string[];
  generatedAt: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mood: MoodType;
  tags: string[];
  summary?: EntrySummary;
  interactionCount: number;
  isFavorite?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface GeminiConverseRequest {
  prompt: string;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  mode?: ReflectionMode;
  mood?: MoodType;
  title?: string;
}

export interface GeminiConverseResponse {
  response: string;
  modelUsed: string;
  error?: string;
}

export interface GeminiSummarizeRequest {
  title: string;
  mood: string;
  interactions: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface GeminiSummarizeResponse {
  summary: EntrySummary;
  modelUsed: string;
  error?: string;
}

export interface IdeaEvolutionStage {
  entryId?: string;
  entryTitle: string;
  date: string;
  stageTitle: string;
  evolutionDescription: string;
  keyShift: string;
}

export interface RecurringThemeItem {
  name: string;
  frequencyCount: number;
  description: string;
}

export interface RelatedEntryItem {
  entryId: string;
  title: string;
  relevanceReason: string;
}

export interface IdeaEvolutionData {
  centralConcept: string;
  themeOverview: string;
  timelineStages: IdeaEvolutionStage[];
  recurringThemes: RecurringThemeItem[];
  relatedEntries: RelatedEntryItem[];
  unresolvedQuestions: string[];
  suggestedNextSteps: string[];
  totalAnalyzedEntries: number;
  generatedAt: string;
}

export interface IdeaEvolutionResponse {
  evolution: IdeaEvolutionData;
  modelUsed: string;
  error?: string;
}

// ==========================================
// Personal Memory Engine Types (Phase 3A)
// ==========================================

export type MemoryType =
  | 'theme'
  | 'goal'
  | 'lesson'
  | 'moment'
  | 'open_loop'
  | 'thinking_shift';

export interface MemoryEvidence {
  entryId: string;
  entryTitle?: string;
  date: string;
  reason: string;
}

export interface PersonalMemoryItem {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  description: string;
  evidence: MemoryEvidence[];
  status?: 'active' | 'completed' | 'paused' | 'unclear'; // for goals
  firstObservedDate?: string;
  mostRecentDate?: string;
  occurrenceCount?: number;
  possibleInterpretation?: string;
  earlierPerspective?: string; // for thinking_shift
  laterPerspective?: string; // for thinking_shift
  isSaved?: boolean;
  isDismissed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContextualMemoryMatch {
  matchedEntryId: string;
  matchedEntryTitle: string;
  matchedEntryDate: string;
  snippet: string;
  connectionReason: string;
  promptQuestion?: string;
}

export interface MemoryDashboardData {
  memories: PersonalMemoryItem[];
  totalAnalyzedEntries: number;
  lastAnalyzedAt: string | null;
  status: 'success' | 'insufficient_evidence';
  message?: string;
}

// ==========================================
// Ask My Journal Types (Phase 3B)
// ==========================================

export interface AskJournalEvidence {
  entryId: string;
  entryTitle: string;
  date: string;
  snippet: string;
  reason: string;
}

export interface AskJournalRelatedMemory {
  id: string;
  type: MemoryType;
  title: string;
  description?: string;
}

export type QueryCategory =
  | 'recall'
  | 'pattern'
  | 'goal'
  | 'lesson'
  | 'decision'
  | 'change'
  | 'history'
  | 'related'
  | 'open_loop'
  | 'achievement'
  | 'comparison'
  | 'general'
  | 'conversational';

export interface AskJournalResponse {
  answer: string;
  evidence: AskJournalEvidence[];
  relatedMemories: AskJournalRelatedMemory[];
  confidence: 'high' | 'medium' | 'low';
  insufficientEvidence: boolean;
  whyExplanation?: string;
  suggestedFollowUps?: string[];
  queryCategory?: QueryCategory;
  modelUsed?: string;
}

export interface AskJournalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AskJournalResponse;
  timestamp: string;
  error?: string;
}

