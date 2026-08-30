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
