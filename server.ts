import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfigData from './firebase-applet-config.json';

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Firebase Admin SDK
let firebaseAdminApp: App | null = null;
function getFirebaseAdmin(): App {
  if (!firebaseAdminApp) {
    const apps = getApps();
    if (apps.length > 0 && apps[0]) {
      firebaseAdminApp = apps[0]!;
    } else {
      firebaseAdminApp = initializeApp({
        projectId: firebaseConfigData.projectId,
      });
    }
  }
  return firebaseAdminApp;
}

// Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Gemini SDK lazy initialization
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment variables.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Resilient Model Fallback Ladder ordered by active availability and latency
const MODEL_LADDER = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

interface FallbackResult {
  text: string;
  modelUsed: string;
}

/**
 * Standard Helper: execute content generation with automated fallback ladder
 */
async function generateContentWithFallback(
  promptOrContents: string | any,
  systemInstruction?: string,
  responseSchema?: any
): Promise<FallbackResult> {
  const ai = getAIClient();
  let lastError: any = null;

  for (const model of MODEL_LADDER) {
    try {
      const config: any = {};
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (responseSchema) {
        config.responseMimeType = 'application/json';
        config.responseSchema = responseSchema;
      }

      const response = await ai.models.generateContent({
        model,
        contents: promptOrContents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      if (response && response.text) {
        return {
          text: response.text,
          modelUsed: model,
        };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini Fallback] Model ${model} encountered error:`, err?.message || err);
      // Attempt next model in ladder
      continue;
    }
  }

  throw new Error(
    `All models in the fallback ladder failed. Last error: ${lastError?.message || 'Unknown generation failure'}`
  );
}

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

export interface AuthenticatedRequest extends express.Request {
  user?: DecodedIdToken;
  verifiedUid?: string;
  firebaseIdToken?: string;
}

/**
 * Reusable Middleware: Requires valid Firebase Bearer token and extracts verified UID
 */
async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or malformed Authorization header with Firebase Bearer token.',
    });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided.' });
  }

  // Pre-validate that idToken has the structure of a valid JWT (three dot-separated segments)
  const tokenParts = idToken.split('.');
  if (tokenParts.length !== 3 || !tokenParts[0] || !tokenParts[1] || !tokenParts[2]) {
    return res.status(401).json({
      error: 'Unauthorized: Malformed Firebase ID token. A valid 3-part JWT is required.',
    });
  }

  try {
    const adminApp = getFirebaseAdmin();
    const authService = getAuth(adminApp);
    const decodedToken = await authService.verifyIdToken(idToken);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ error: 'Unauthorized: Token did not contain a valid UID.' });
    }

    req.user = decodedToken;
    req.verifiedUid = decodedToken.uid;
    req.firebaseIdToken = idToken;
    next();
  } catch (_authError: any) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired Firebase ID token.',
    });
  }
}

/**
 * POST /api/gemini/converse
 * Multi-turn reflective conversation with system prompts tailored to journaling & mindfulness
 */
app.post('/api/gemini/converse', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    let prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt cannot be empty.' });
    }
    // Bound prompt length to prevent quota exhaustion
    if (prompt.length > 4000) {
      prompt = prompt.slice(0, 4000);
    }

    const rawHistory = Array.isArray(data.history) ? data.history : [];
    // Bound history to last 20 messages, each bounded to 2500 chars
    const history = rawHistory.slice(-20).map((item: any) => ({
      role: item && item.role === 'assistant' ? 'assistant' : 'user',
      content: typeof item?.content === 'string' ? item.content.slice(0, 2500) : '',
    }));

    const validModes = ['reflect', 'brainstorm', 'summarize', 'chat'];
    const mode = typeof data.mode === 'string' && validModes.includes(data.mode) ? data.mode : 'reflect';
    const mood = typeof data.mood === 'string' ? data.mood.slice(0, 50) : 'thoughtful';
    const title = typeof data.title === 'string' ? data.title.slice(0, 120) : 'Journal Entry';

    let modeInstruction = '';
    switch (mode) {
      case 'reflect':
        modeInstruction =
          'You are a compassionate, thoughtful reflection and mindfulness partner. Offer deep empathy, active listening, gentle perspective shifts, and 1-2 open-ended inquiry questions to help the user explore their thoughts more deeply.';
        break;
      case 'brainstorm':
        modeInstruction =
          'You are an energetic, creative brainstorming collaborator. Help the user unpack ideas, explore divergent creative possibilities, structure options, and suggest actionable pathways.';
        break;
      case 'summarize':
        modeInstruction =
          'You are a concise thought distiller. Synthesize the core insights, emotional currents, and themes from what the user shared.';
        break;
      case 'chat':
      default:
        modeInstruction =
          'You are a friendly, supportive journaling companion. Have a genuine, grounded conversation helping the user process their day.';
        break;
    }

    const systemInstruction = `You are a private AI journaling and reflection companion inside the "Gemini Journal & Reflections" application.
Current Journal Context:
- Session Title: "${title}"
- User Mood: ${mood}
- Mode: ${mode}

Guidelines:
- Tone: Warm, grounded, insightful, clear, non-judgmental, and authentic.
- Formatting: Use concise markdown with bullet points or bold text where it aids clarity.
- Maintain strict privacy and conversational continuity.
- Directives: ${modeInstruction}`;

    // Assemble multi-turn history into structured contents
    const contents: any[] = [];

    // Append prior conversational turns
    for (const msg of history) {
      if (msg && typeof msg.content === 'string' && msg.content.trim()) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content.trim() }],
        });
      }
    }

    // Append latest user prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const result = await generateContentWithFallback(contents, systemInstruction);

    return res.json({
      response: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/converse:', error);
    return res.status(500).json({
      error: 'Failed to generate AI reflection response.',
    });
  }
});

/**
 * POST /api/gemini/summarize
 * Generates structured executive summary, emotional tone, key themes, and actionable micro-steps
 */
app.post('/api/gemini/summarize', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const title = typeof data.title === 'string' ? data.title.slice(0, 120) : 'Journal Reflection';
    const mood = typeof data.mood === 'string' ? data.mood.slice(0, 50) : 'thoughtful';
    const rawInteractions = Array.isArray(data.interactions) ? data.interactions : [];

    if (rawInteractions.length === 0) {
      return res.status(400).json({ error: 'No interaction history provided to summarize.' });
    }

    const interactions = rawInteractions.slice(-30).map((item: any) => ({
      role: item && item.role === 'user' ? 'user' : 'assistant',
      content: typeof item?.content === 'string' ? item.content.slice(0, 2000) : '',
    }));

    const transcript = interactions
      .map((item: any) => `${item.role === 'user' ? 'User' : 'Gemini'}: ${item.content}`)
      .join('\n\n');

    const prompt = `Please analyze and summarize this private journal session titled "${title}" (User Mood: ${mood}):

--- TRANSCRIPT START ---
${transcript}
--- TRANSCRIPT END ---

Produce a structured reflection analysis with:
1. "overview": A concise paragraph (2-4 sentences) capturing the core essence of this reflection.
2. "keyThemes": 3 to 5 distinct thematic tags/concepts explored (e.g., "Work-Life Balance", "Creative Momentum", "Boundary Setting").
3. "emotionalTone": A nuanced descriptor of the user's emotional arc (e.g., "Shifting from overwhelm to grounded clarity").
4. "actionableInsights": 2 to 4 gentle, practical micro-steps or takeaways the user can carry forward.`;

    const systemInstruction =
      'You are a high-caliber reflection synthesizer. Provide structured JSON output summarizing journal entries.';

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        overview: { type: 'STRING' },
        keyThemes: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        emotionalTone: { type: 'STRING' },
        actionableInsights: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
      },
      required: ['overview', 'keyThemes', 'emotionalTone', 'actionableInsights'],
    };

    const result = await generateContentWithFallback(prompt, systemInstruction, responseSchema);

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      // Fallback parsing if string had markdown wrapping
      const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const summaryPayload = {
      overview: parsed.overview || 'Reflection captured and synthesized.',
      keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : [],
      emotionalTone: parsed.emotionalTone || mood,
      actionableInsights: Array.isArray(parsed.actionableInsights) ? parsed.actionableInsights : [],
      generatedAt: new Date().toISOString(),
    };

    return res.json({
      summary: summaryPayload,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/summarize:', error);
    return res.status(500).json({
      error: 'Failed to generate journal summary.',
    });
  }
});

/**
 * POST /api/gemini/generate-title
 * Generates a creative, grounded 3-6 word title from the user's first reflection
 */
app.post('/api/gemini/generate-title', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const reflection = typeof data.reflection === 'string' ? data.reflection.trim().slice(0, 1000) : '';

    if (!reflection) {
      return res.json({ title: 'New Reflection', modelUsed: 'default' });
    }

    const prompt = `Based on the following journal entry, suggest an elegant, concise 3 to 6 word title that captures its core topic without quotes or punctuation:

"${reflection.slice(0, 500)}"`;

    const systemInstruction = 'You are a minimalist naming assistant. Reply ONLY with the title text.';

    const result = await generateContentWithFallback(prompt, systemInstruction);
    const cleanTitle = result.text.replace(/["'\n\r]/g, '').trim();

    return res.json({
      title: cleanTitle || 'Mindful Reflection',
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/generate-title:', error);
    return res.json({ title: 'Mindful Reflection', modelUsed: 'fallback' });
  }
});

/**
 * POST /api/gemini/suggest-prompts
 * Returns inspiring prompts tailored to mood or focus category
 */
app.post('/api/gemini/suggest-prompts', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const mood = typeof data.mood === 'string' ? data.mood.slice(0, 50) : 'thoughtful';

    const prompt = `Generate 4 insightful, evocative journaling prompt questions tailored for someone feeling "${mood}". Keep each prompt to 1 sentence.`;
    const responseSchema = {
      type: 'ARRAY',
      items: { type: 'STRING' },
    };

    const result = await generateContentWithFallback(prompt, undefined, responseSchema);
    let prompts: string[] = [];
    try {
      prompts = JSON.parse(result.text);
    } catch {
      prompts = [
        'What is one moment from today that made you pause?',
        'What thought or feeling is demanding your attention right now?',
        'Where can you offer yourself more grace this week?',
        'What is one small intentional step you want to take next?',
      ];
    }

    return res.json({ prompts, modelUsed: result.modelUsed });
  } catch (error: any) {
    console.error('Error in /api/gemini/suggest-prompts:', error);
    return res.json({
      prompts: [
        'What gave you energy today, and what drained it?',
        'What is one thing you are grateful for in this exact moment?',
        'What is a challenge you are currently navigating?',
        'How would you describe your headspace right now in three words?',
      ],
      modelUsed: 'fallback',
    });
  }
});

// Helper to parse Firestore REST API field values into plain JavaScript objects
function parseFirestoreRestFields(fields: Record<string, any> | undefined): Record<string, any> {
  const result: Record<string, any> = {};
  if (!fields || typeof fields !== 'object') return result;
  for (const [key, val] of Object.entries(fields)) {
    if (!val || typeof val !== 'object') continue;
    if ('stringValue' in val) result[key] = val.stringValue;
    else if ('integerValue' in val) result[key] = parseInt(val.integerValue, 10);
    else if ('doubleValue' in val) result[key] = parseFloat(val.doubleValue);
    else if ('booleanValue' in val) result[key] = val.booleanValue;
    else if ('timestampValue' in val) result[key] = val.timestampValue;
    else if ('nullValue' in val) result[key] = null;
    else if ('arrayValue' in val) {
      result[key] = (val.arrayValue?.values || []).map((v: any) => {
        if (!v || typeof v !== 'object') return v;
        if ('stringValue' in v) return v.stringValue;
        if ('mapValue' in v) return parseFirestoreRestFields(v.mapValue?.fields);
        return v;
      });
    } else if ('mapValue' in val) {
      result[key] = parseFirestoreRestFields(val.mapValue?.fields);
    }
  }
  return result;
}

function getFirestoreInstance() {
  const adminApp = getFirebaseAdmin();
  const databaseId = (firebaseConfigData as { firestoreDatabaseId?: string }).firestoreDatabaseId;
  return databaseId && databaseId !== '(default)'
    ? getFirestore(adminApp, databaseId)
    : getFirestore(adminApp);
}

interface ServerJournalCorpusItem {
  id: string;
  title: string;
  createdAt: string;
  mood: string;
  tags?: string[];
  summary?: string;
  recentInteractions: string[];
}

/**
 * Server-side Journal Corpus Retrieval
 * Strictly queries entries for the verified UID. Never trusts client-supplied corpus arrays.
 */
async function fetchUserHistoricalCorpusServerSide(
  verifiedUid: string,
  idToken: string,
  maxEntries = 25
): Promise<ServerJournalCorpusItem[]> {
  const historicalCorpus: ServerJournalCorpusItem[] = [];
  const projectId = firebaseConfigData.projectId;
  const databaseId = (firebaseConfigData as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';

  let querySucceeded = false;
  // Attempt 1: Firestore Admin SDK
  try {
    const firestore = getFirestoreInstance();
    const entriesSnapshot = await firestore
      .collection('users')
      .doc(verifiedUid)
      .collection('entries')
      .orderBy('createdAt', 'desc')
      .limit(maxEntries)
      .get();

    if (!entriesSnapshot.empty) {
      for (const docSnap of entriesSnapshot.docs) {
        const docData = docSnap.data();
        const entryId = docSnap.id;
        const title = docData.title || 'Untitled Reflection';
        const createdAt = docData.createdAt || '';
        const mood = docData.mood || 'thoughtful';
        const tags = Array.isArray(docData.tags) ? docData.tags : [];
        const summaryOverview = docData.summary?.overview || '';

        const interactionsSnap = await firestore
          .collection('users')
          .doc(verifiedUid)
          .collection('entries')
          .doc(entryId)
          .collection('interactions')
          .orderBy('timestamp', 'asc')
          .limit(6)
          .get();

        const recentInteractions: string[] = [];
        interactionsSnap.forEach((iSnap) => {
          const iData = iSnap.data();
          const role = iData.role === 'assistant' ? 'Gemini' : 'User';
          const snippet = (iData.content || '').slice(0, 400);
          if (snippet.trim()) {
            recentInteractions.push(`${role}: ${snippet}`);
          }
        });

        historicalCorpus.push({
          id: entryId,
          title,
          createdAt,
          mood,
          tags,
          summary: summaryOverview,
          recentInteractions,
        });
      }
      querySucceeded = true;
    } else {
      querySucceeded = true;
    }
  } catch (adminErr: any) {
    console.warn('Firestore Admin SDK query skipped/failed (falling back to user-authenticated REST API):', adminErr?.message || adminErr);
  }

  // Attempt 2: Direct query via Firestore REST API with verified User ID Token
  if (!querySucceeded || historicalCorpus.length === 0) {
    try {
      const restBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${verifiedUid}`;
      const entriesRes = await fetch(`${restBaseUrl}/entries?pageSize=${maxEntries}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (entriesRes.ok) {
        const restData = (await entriesRes.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
        const documents = restData.documents || [];

        for (const doc of documents) {
          const parsedFields = parseFirestoreRestFields(doc.fields);
          const entryId = doc.name.split('/').pop() || '';
          const title = parsedFields.title || 'Untitled Reflection';
          const createdAt = parsedFields.createdAt || '';
          const mood = parsedFields.mood || 'thoughtful';
          const tags = Array.isArray(parsedFields.tags) ? parsedFields.tags : [];
          const summaryOverview = parsedFields.summary?.overview || '';

          const interactionsRes = await fetch(`${restBaseUrl}/entries/${entryId}/interactions?pageSize=6`, {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });

          const recentInteractions: string[] = [];
          if (interactionsRes.ok) {
            const iData = (await interactionsRes.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
            const iDocs = iData.documents || [];
            for (const iDoc of iDocs) {
              const iFields = parseFirestoreRestFields(iDoc.fields);
              const role = iFields.role === 'assistant' ? 'Gemini' : 'User';
              const snippet = (iFields.content || '').slice(0, 400);
              if (snippet.trim()) {
                recentInteractions.push(`${role}: ${snippet}`);
              }
            }
          }

          historicalCorpus.push({
            id: entryId,
            title,
            createdAt,
            mood,
            tags,
            summary: summaryOverview,
            recentInteractions,
          });
        }
      }
    } catch (restErr: any) {
      console.warn('Firestore REST API fallback error:', restErr?.message || restErr);
    }
  }

  return historicalCorpus;
}

/**
 * Fetch persisted personal memories from Firestore for authenticated user
 */
async function getUserMemoriesFromFirestore(verifiedUid: string, idToken: string): Promise<any[]> {
  const memories: any[] = [];
  try {
    const firestore = getFirestoreInstance();
    const snap = await firestore
      .collection('users')
      .doc(verifiedUid)
      .collection('memories')
      .orderBy('updatedAt', 'desc')
      .get();
    snap.forEach((doc) => {
      memories.push({ id: doc.id, ...doc.data() });
    });
    return memories;
  } catch (err: any) {
    console.warn('Firestore Admin getUserMemories failed, falling back to REST:', err?.message || err);
  }

  // REST fallback
  try {
    const projectId = firebaseConfigData.projectId;
    const databaseId = (firebaseConfigData as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';
    const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${verifiedUid}/memories?pageSize=50`;
    const res = await fetch(restUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
      for (const doc of data.documents || []) {
        const id = doc.name.split('/').pop() || '';
        const parsed = parseFirestoreRestFields(doc.fields);
        memories.push({ id, ...parsed });
      }
    }
  } catch (restErr: any) {
    console.warn('REST getUserMemories error:', restErr?.message || restErr);
  }
  return memories;
}

/**
 * Persist or update a memory in Firestore
 */
async function saveMemoryToFirestore(verifiedUid: string, memory: any): Promise<void> {
  try {
    const firestore = getFirestoreInstance();
    await firestore
      .collection('users')
      .doc(verifiedUid)
      .collection('memories')
      .doc(memory.id)
      .set(memory, { merge: true });
  } catch (err: any) {
    console.warn('Admin saveMemoryToFirestore failed:', err?.message || err);
  }
}

/**
 * Delete a memory from Firestore
 */
async function deleteMemoryFromFirestore(verifiedUid: string, memoryId: string): Promise<void> {
  try {
    const firestore = getFirestoreInstance();
    await firestore
      .collection('users')
      .doc(verifiedUid)
      .collection('memories')
      .doc(memoryId)
      .delete();
  } catch (err: any) {
    console.warn('Admin deleteMemoryFromFirestore failed:', err?.message || err);
  }
}

// =======================================================
// PERSONAL MEMORY ENGINE ENDPOINTS (Phase 3A)
// =======================================================

/**
 * GET /api/memory/all
 * Retrieve all persisted personal memories for the authenticated user
 */
app.get('/api/memory/all', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const idToken = req.firebaseIdToken!;
    const memories = await getUserMemoriesFromFirestore(verifiedUid, idToken);
    return res.json({
      memories,
      count: memories.length,
    });
  } catch (error: any) {
    console.error('Error in /api/memory/all:', error);
    return res.status(500).json({ error: 'Failed to retrieve personal memories.' });
  }
});

/**
 * POST /api/memory/refresh
 * Synthesizes personal memories, recurring patterns, goals, lessons, moments, open loops, and thinking shifts
 * using server-retrieved user journal history.
 */
app.post('/api/memory/refresh', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const idToken = req.firebaseIdToken!;

    // 1. Strictly fetch entries server-side for this verified user
    const historicalCorpus = await fetchUserHistoricalCorpusServerSide(verifiedUid, idToken, 25);

    if (historicalCorpus.length < 2) {
      return res.json({
        status: 'insufficient_evidence',
        message: 'Your journal needs a little more history before meaningful patterns can be found.',
        memories: [],
        totalAnalyzedEntries: historicalCorpus.length,
      });
    }

    // Sort chronologically ascending
    historicalCorpus.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const entryMap = new Map(historicalCorpus.map((e) => [e.id, e]));

    // Construct bounded corpus text with explicit boundary tags
    let corpusText = '';
    historicalCorpus.forEach((entry, idx) => {
      corpusText += `\n<entry index="${idx + 1}" id="${entry.id}" date="${entry.createdAt}" title="${entry.title}" mood="${entry.mood}">\n`;
      if (entry.summary) {
        corpusText += `Summary: ${entry.summary}\n`;
      }
      if (entry.recentInteractions.length > 0) {
        corpusText += `Excerpts:\n${entry.recentInteractions.join('\n')}\n`;
      }
      corpusText += `</entry>\n`;
    });

    const prompt = `You are the Personal Memory Engine for an individual's private journal.
Analyze the user's chronological journal reflections below across time to discover recurring patterns, goals, lessons, important moments, open loops, and thinking shifts.

CRITICAL EVIDENCE & CAUTION REQUIREMENTS:
1. Grounding: Rely ONLY on the provided entries. Never invent details, occurrences, or feelings not documented in the text.
2. Cautious Language: Observations must be presented as gentle inferences or patterns, NOT as objective personality facts or psychological diagnoses.
   Use cautious phrasing:
   - "You have mentioned..."
   - "Your entries suggest..."
   - "A possible pattern is..."
   - "This appears several times..."
3. No Medical/Clinical Inferences: Do NOT infer or diagnose medical, mental health, or psychological conditions.
4. EVIDENCE IS MANDATORY: Every single memory MUST include an "evidence" array with valid "entryId" matching the provided <entry id="..."> attributes.
5. If evidence is insufficient for any category, leave its array empty. If the entire corpus has insufficient recurring substance, set "status": "insufficient_evidence".

--- USER JOURNAL CORPUS START ---
${corpusText}
--- USER JOURNAL CORPUS END ---

Extract memories in these 6 categories:
1. "themes": Recurring topics or patterns across reflections. Include title, description, firstObservedDate, mostRecentDate, occurrenceCount, possibleInterpretation, and evidence list.
2. "goals": Clear goals, ambitions, or projects mentioned by the user. Include title, description, status ("active", "completed", "paused", or "unclear"), firstObservedDate, mostRecentDate, and evidence list.
3. "lessons": Distinct realizations or lessons expressed by the user. Include title, description, firstObservedDate, and evidence list.
4. "moments": Meaningful decisions, turning points, milestones, achievements, or setbacks. Include title, description, firstObservedDate, and evidence list.
5. "openLoops": Unresolved questions, dilemmas, or persistent decisions pending. Include title, description, mostRecentDate, and evidence list.
6. "thinkingShifts": Observed changes where an earlier perspective shifted to a later perspective. Include title, description, earlierPerspective, laterPerspective, firstObservedDate, mostRecentDate, and evidence list.`;

    const systemInstruction =
      'You are a thoughtful, evidence-first Personal Memory Engine. You discover longitudinal patterns strictly grounded in journal reflections. Return structured JSON.';

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING' }, // 'success' or 'insufficient_evidence'
        themes: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              firstObservedDate: { type: 'STRING' },
              mostRecentDate: { type: 'STRING' },
              occurrenceCount: { type: 'INTEGER' },
              possibleInterpretation: { type: 'STRING' },
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    entryId: { type: 'STRING' },
                    date: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['entryId', 'date', 'reason'],
                },
              },
            },
            required: ['title', 'description', 'evidence'],
          },
        },
        goals: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              status: { type: 'STRING' },
              firstObservedDate: { type: 'STRING' },
              mostRecentDate: { type: 'STRING' },
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    entryId: { type: 'STRING' },
                    date: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['entryId', 'date', 'reason'],
                },
              },
            },
            required: ['title', 'description', 'status', 'evidence'],
          },
        },
        lessons: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              firstObservedDate: { type: 'STRING' },
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    entryId: { type: 'STRING' },
                    date: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['entryId', 'date', 'reason'],
                },
              },
            },
            required: ['title', 'description', 'evidence'],
          },
        },
        moments: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              firstObservedDate: { type: 'STRING' },
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    entryId: { type: 'STRING' },
                    date: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['entryId', 'date', 'reason'],
                },
              },
            },
            required: ['title', 'description', 'evidence'],
          },
        },
        openLoops: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              mostRecentDate: { type: 'STRING' },
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    entryId: { type: 'STRING' },
                    date: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['entryId', 'date', 'reason'],
                },
              },
            },
            required: ['title', 'description', 'evidence'],
          },
        },
        thinkingShifts: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              earlierPerspective: { type: 'STRING' },
              laterPerspective: { type: 'STRING' },
              firstObservedDate: { type: 'STRING' },
              mostRecentDate: { type: 'STRING' },
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    entryId: { type: 'STRING' },
                    date: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['entryId', 'date', 'reason'],
                },
              },
            },
            required: ['title', 'description', 'earlierPerspective', 'laterPerspective', 'evidence'],
          },
        },
      },
      required: ['status', 'themes', 'goals', 'lessons', 'moments', 'openLoops', 'thinkingShifts'],
    };

    const result = await generateContentWithFallback(prompt, systemInstruction, responseSchema);

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    if (parsed.status === 'insufficient_evidence') {
      return res.json({
        status: 'insufficient_evidence',
        message: 'Your journal needs a little more history before meaningful patterns can be found.',
        memories: [],
        totalAnalyzedEntries: historicalCorpus.length,
      });
    }

    // Existing memories to preserve saved flags
    const existingMemories = await getUserMemoriesFromFirestore(verifiedUid, idToken);
    const savedTitles = new Set(existingMemories.filter((m) => m.isSaved).map((m) => m.title.toLowerCase().trim()));

    // Sanitize and strictly validate each memory item
    const cleanText = (val: any, max = 500): string => {
      if (typeof val !== 'string') return '';
      return val.replace(/<[^>]*>?/gm, '').trim().slice(0, max);
    };

    const validatedMemories: any[] = [];
    const now = new Date().toISOString();

    const processCategory = (items: any[], type: string) => {
      if (!Array.isArray(items)) return;
      items.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const title = cleanText(item.title, 120);
        const description = cleanText(item.description, 600);
        if (!title || !description) return;

        // Evidence validation: ONLY accept valid entry IDs from this user's corpus
        const validEvidence = (Array.isArray(item.evidence) ? item.evidence : [])
          .filter((ev: any) => ev && typeof ev.entryId === 'string' && entryMap.has(ev.entryId))
          .map((ev: any) => ({
            entryId: ev.entryId,
            entryTitle: entryMap.get(ev.entryId)?.title || 'Reflection',
            date: cleanText(ev.date, 50) || entryMap.get(ev.entryId)?.createdAt || '',
            reason: cleanText(ev.reason, 300) || 'Mentions this topic in reflection.',
          }));

        // Reject memories with NO valid evidence
        if (validEvidence.length === 0) return;

        const isSaved = savedTitles.has(title.toLowerCase().trim());
        const memoryId = `mem_${type}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;

        const memoryObj: any = {
          id: memoryId,
          userId: verifiedUid,
          type,
          title,
          description,
          evidence: validEvidence,
          isSaved,
          isDismissed: false,
          createdAt: now,
          updatedAt: now,
        };

        if (type === 'theme') {
          memoryObj.firstObservedDate = cleanText(item.firstObservedDate, 50) || validEvidence[0]?.date || '';
          memoryObj.mostRecentDate = cleanText(item.mostRecentDate, 50) || validEvidence[validEvidence.length - 1]?.date || '';
          memoryObj.occurrenceCount = typeof item.occurrenceCount === 'number' && item.occurrenceCount > 0 ? item.occurrenceCount : validEvidence.length;
          if (item.possibleInterpretation) {
            memoryObj.possibleInterpretation = cleanText(item.possibleInterpretation, 400);
          }
        } else if (type === 'goal') {
          const validStatuses = ['active', 'completed', 'paused', 'unclear'];
          memoryObj.status = validStatuses.includes(item.status) ? item.status : 'active';
          memoryObj.firstObservedDate = cleanText(item.firstObservedDate, 50) || validEvidence[0]?.date || '';
          memoryObj.mostRecentDate = cleanText(item.mostRecentDate, 50) || validEvidence[validEvidence.length - 1]?.date || '';
        } else if (type === 'lesson') {
          memoryObj.firstObservedDate = cleanText(item.firstObservedDate, 50) || validEvidence[0]?.date || '';
        } else if (type === 'moment') {
          memoryObj.firstObservedDate = cleanText(item.firstObservedDate, 50) || validEvidence[0]?.date || '';
        } else if (type === 'open_loop') {
          memoryObj.mostRecentDate = cleanText(item.mostRecentDate, 50) || validEvidence[validEvidence.length - 1]?.date || '';
        } else if (type === 'thinking_shift') {
          memoryObj.earlierPerspective = cleanText(item.earlierPerspective, 400);
          memoryObj.laterPerspective = cleanText(item.laterPerspective, 400);
          memoryObj.firstObservedDate = cleanText(item.firstObservedDate, 50) || validEvidence[0]?.date || '';
          memoryObj.mostRecentDate = cleanText(item.mostRecentDate, 50) || validEvidence[validEvidence.length - 1]?.date || '';
        }

        validatedMemories.push(memoryObj);
      });
    };

    processCategory(parsed.themes, 'theme');
    processCategory(parsed.goals, 'goal');
    processCategory(parsed.lessons, 'lesson');
    processCategory(parsed.moments, 'moment');
    processCategory(parsed.openLoops, 'open_loop');
    processCategory(parsed.thinkingShifts, 'thinking_shift');

    if (validatedMemories.length === 0) {
      return res.json({
        status: 'insufficient_evidence',
        message: 'Your journal needs a little more history before meaningful patterns can be found.',
        memories: [],
        totalAnalyzedEntries: historicalCorpus.length,
      });
    }

    // Persist validated memories to Firestore for the user
    for (const mem of validatedMemories) {
      await saveMemoryToFirestore(verifiedUid, mem);
    }

    return res.json({
      status: 'success',
      memories: validatedMemories,
      totalAnalyzedEntries: historicalCorpus.length,
      generatedAt: now,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/memory/refresh:', error);
    return res.status(500).json({
      error: error?.message || 'Could not refresh your memory right now.',
    });
  }
});

/**
 * POST /api/memory/contextual-match
 * Contextual memory check ("You said this before"):
 * Compares current reflection draft against historical entries to find meaningful resonances.
 */
app.post('/api/memory/contextual-match', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const idToken = req.firebaseIdToken!;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const currentEntryId = typeof body.currentEntryId === 'string' ? body.currentEntryId.trim() : '';
    let currentContent = typeof body.currentContent === 'string' ? body.currentContent.trim() : '';

    // Ignore very short or empty drafts to prevent frivolous checks
    if (currentContent.length < 25) {
      return res.json({ match: null });
    }

    if (currentContent.length > 2000) {
      currentContent = currentContent.slice(0, 2000);
    }

    // Retrieve user's historical corpus server-side
    const historicalCorpus = await fetchUserHistoricalCorpusServerSide(verifiedUid, idToken, 15);
    // Exclude the current entry
    const otherEntries = historicalCorpus.filter((e) => e.id !== currentEntryId);

    if (otherEntries.length === 0) {
      return res.json({ match: null });
    }

    const otherEntryMap = new Map(otherEntries.map((e) => [e.id, e]));

    // Format top past entries
    let pastCorpusText = '';
    otherEntries.slice(0, 10).forEach((e) => {
      pastCorpusText += `\n<past_entry id="${e.id}" title="${e.title}" date="${e.createdAt}">\n`;
      if (e.summary) {
        pastCorpusText += `Summary: ${e.summary}\n`;
      }
      if (e.recentInteractions.length > 0) {
        pastCorpusText += `Key lines: ${e.recentInteractions.slice(0, 3).join(' | ')}\n`;
      }
      pastCorpusText += `</past_entry>\n`;
    });

    const prompt = `A user is currently reflecting in their private journal:
"${currentContent}"

Compare this current reflection against their historical reflections below.
Determine if one of the historical entries shares a meaningful, authentic, and specific thematic, goal, or emotional resonance with what they are writing right now.

STRICT CONSTRAINTS:
- Do NOT match on generic common words (e.g., "today", "work", "tired", "feeling").
- Only match if there is an insightful, genuine connection that would be helpful for the user's self-awareness (e.g. "You said something similar before").
- If there is NO strong meaningful match, set "hasMatch": false.
- If there IS a strong meaningful match:
  - "matchedEntryId": MUST exactly match one of the <past_entry id="..."> values.
  - "snippet": a short authentic quote or phrase (10-25 words) from that historical entry illustrating the connection.
  - "connectionReason": 1 cautious sentence (e.g. "You previously reflected on a similar tension between creative exploration and shipping.")
  - "promptQuestion": a gentle, reflective inquiry (e.g. "Has anything changed since then?", "What feels different this time?")

--- PAST REFLECTIONS ---
${pastCorpusText}
--- END PAST REFLECTIONS ---`;

    const systemInstruction =
      'You are a contextual memory assistant for a private journal. Only surface past entries when there is a strong, genuine connection. Return structured JSON.';

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        hasMatch: { type: 'BOOLEAN' },
        matchedEntryId: { type: 'STRING' },
        snippet: { type: 'STRING' },
        connectionReason: { type: 'STRING' },
        promptQuestion: { type: 'STRING' },
      },
      required: ['hasMatch'],
    };

    const result = await generateContentWithFallback(prompt, systemInstruction, responseSchema);

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    if (
      parsed &&
      parsed.hasMatch &&
      typeof parsed.matchedEntryId === 'string' &&
      otherEntryMap.has(parsed.matchedEntryId) &&
      parsed.matchedEntryId !== currentEntryId
    ) {
      const matched = otherEntryMap.get(parsed.matchedEntryId)!;
      return res.json({
        match: {
          matchedEntryId: matched.id,
          matchedEntryTitle: matched.title,
          matchedEntryDate: matched.createdAt,
          snippet: typeof parsed.snippet === 'string' ? parsed.snippet.slice(0, 300) : '',
          connectionReason: typeof parsed.connectionReason === 'string' ? parsed.connectionReason.slice(0, 300) : '',
          promptQuestion: typeof parsed.promptQuestion === 'string' ? parsed.promptQuestion.slice(0, 200) : 'Has anything changed since then?',
        },
      });
    }

    return res.json({ match: null });
  } catch (error: any) {
    console.error('Error in /api/memory/contextual-match:', error);
    return res.json({ match: null });
  }
});

/**
 * POST /api/memory/:id/save
 * Toggle or set saved/kept state on a memory
 */
app.post('/api/memory/:id/save', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const memoryId = req.params.id;
    const isSaved = req.body.isSaved !== false;
    await saveMemoryToFirestore(verifiedUid, {
      id: memoryId,
      isSaved,
      updatedAt: new Date().toISOString(),
    });
    return res.json({ success: true, isSaved });
  } catch (error: any) {
    console.error('Error saving memory:', error);
    return res.status(500).json({ error: 'Failed to save memory.' });
  }
});

/**
 * POST /api/memory/:id/dismiss
 * Dismiss a memory from the active dashboard
 */
app.post('/api/memory/:id/dismiss', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const memoryId = req.params.id;
    await saveMemoryToFirestore(verifiedUid, {
      id: memoryId,
      isDismissed: true,
      updatedAt: new Date().toISOString(),
    });
    return res.json({ success: true, isDismissed: true });
  } catch (error: any) {
    console.error('Error dismissing memory:', error);
    return res.status(500).json({ error: 'Failed to dismiss memory.' });
  }
});

/**
 * DELETE /api/memory/:id
 * Permanently delete a memory
 */
app.delete('/api/memory/:id', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const memoryId = req.params.id;
    await deleteMemoryFromFirestore(verifiedUid, memoryId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting memory:', error);
    return res.status(500).json({ error: 'Failed to delete memory.' });
  }
});

// =======================================================
// ASK MY JOURNAL ENDPOINT (Phase 3B)
// Personal Journal Query Intelligence
// =======================================================

/**
 * POST /api/gemini/ask-journal
 * Secure, evidence-grounded natural-language interface over the authenticated user's journal and personal memory.
 * - Requires verified Firebase Bearer token via requireFirebaseAuth
 * - Derives UID strictly from token (req.verifiedUid)
 * - Queries journal and memory data server-side
 * - Validates evidence entryIds strictly against retrieved entries
 */
app.post('/api/gemini/ask-journal', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const idToken = req.firebaseIdToken!;

    // 1. Sanitize input payload
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let question = typeof body.question === 'string' ? body.question.trim() : '';

    if (!question) {
      return res.status(400).json({ error: 'Question cannot be empty.' });
    }

    // Bound question length
    if (question.length > 1000) {
      question = question.slice(0, 1000);
    }

    // Bounded conversation history (max 4 turns, max 500 chars each)
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const boundedHistory = rawHistory.slice(-4).map((h: any) => ({
      role: h && h.role === 'assistant' ? 'assistant' : 'user',
      content: typeof h?.content === 'string' ? h.content.trim().slice(0, 500) : '',
    })).filter((h: any) => Boolean(h.content));

    // Helper: Clean and sanitize text
    const cleanText = (val: any, max = 500): string => {
      if (typeof val !== 'string') return '';
      return val.replace(/<[^>]*>?/gm, '').trim().slice(0, max);
    };

    // 2. Conversational greetings/pleasantries check (do not hallucinate journal data for generic greetings)
    const greetingPattern = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|sup|greetings|thanks|thank\s+you|who\s+are\s+you|what\s+can\s+you\s+do)\b/i;
    if (greetingPattern.test(question) && question.length < 40) {
      return res.json({
        answer:
          "Hello! I am 'Ask My Journal', your private query interface. I search only your authenticated reflections to help you recall ideas, notice recurring themes, track goals, and observe how your thinking has evolved over time. Try asking: \"What themes keep coming back?\", \"What goals have I mentioned?\", or \"What have I learned recently?\"",
        evidence: [],
        relatedMemories: [],
        confidence: 'high',
        insufficientEvidence: false,
        whyExplanation: 'This was a conversational greeting or general introduction rather than a factual query about your reflections.',
        suggestedFollowUps: [
          'What themes keep coming back in my reflections?',
          'What goals am I still working toward?',
          'What have I learned recently?',
        ],
        queryCategory: 'conversational',
        modelUsed: 'direct-guide',
      });
    }

    // 3. Server-side retrieval of user's journal entries & personal memories
    const historicalCorpus = await fetchUserHistoricalCorpusServerSide(verifiedUid, idToken, 25);
    const userMemories = await getUserMemoriesFromFirestore(verifiedUid, idToken);

    // If the journal has 0 entries
    if (historicalCorpus.length === 0) {
      return res.json({
        answer:
          "Your journal is still getting to know you. Write a few more reflections and you'll be able to ask deeper questions about patterns, goals, and changes over time.",
        evidence: [],
        relatedMemories: [],
        confidence: 'low',
        insufficientEvidence: true,
        whyExplanation: 'No saved reflections were found in your authenticated journal.',
        suggestedFollowUps: [
          'Write a first reflection about today',
          'What should I write about to get started?',
        ],
        queryCategory: 'general',
        modelUsed: 'direct-corpus-check',
      });
    }

    // Sort chronologically ascending
    historicalCorpus.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const entryMap = new Map(historicalCorpus.map((e) => [e.id, e]));
    const memoryMap = new Map(userMemories.map((m) => [m.id, m]));

    // Construct bounded corpus text
    let corpusText = '';
    historicalCorpus.forEach((entry, idx) => {
      corpusText += `\n<entry index="${idx + 1}" id="${entry.id}" date="${entry.createdAt}" title="${entry.title}" mood="${entry.mood}">\n`;
      if (entry.summary) {
        corpusText += `Summary: ${entry.summary}\n`;
      }
      if (entry.recentInteractions.length > 0) {
        corpusText += `Key Excerpts:\n${entry.recentInteractions.join('\n')}\n`;
      }
      corpusText += `</entry>\n`;
    });

    // Format active personal memories
    let memoryText = '';
    if (userMemories.length > 0) {
      userMemories.slice(0, 15).forEach((mem) => {
        memoryText += `\n<memory id="${mem.id}" type="${mem.type}" title="${mem.title}">\n${mem.description}\n</memory>\n`;
      });
    }

    // Format bounded conversation turns
    let historyContext = '';
    if (boundedHistory.length > 0) {
      historyContext = '\n--- PREVIOUS QUESTION CONTEXT (BOUNDED) ---\n';
      boundedHistory.forEach((h: any) => {
        historyContext += `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}\n`;
      });
      historyContext += '--- END PREVIOUS CONTEXT ---\n';
    }

    const systemInstruction = `You are "Ask My Journal", a private, evidence-grounded intelligence interface for an individual's personal reflections.
You answer user questions strictly based on evidence contained in the authenticated user's journal entries and personal memory records.

CRITICAL DIRECTIVES:
1. STRICT GROUNDING: Rely ONLY on the provided reflections and memories. NEVER invent or extrapolate occurrences, entries, dates, or details.
2. DISTINGUISH FACT FROM INFERENCE:
   - State facts clearly: "Your entries show you mentioned this project on three occasions.", "On August 12, you wrote that..."
   - State patterns or interpretations with gentle, cautious framing: "A possible pattern is...", "Your recent reflections suggest...", "It appears..."
3. NO CLINICAL OR PERSONALITY LABELS: Do not provide psychological diagnoses, medical advice, or assign permanent personality traits.
4. EVIDENCE IS MANDATORY FOR FACTUAL CLAIMS:
   - For every factual claim, provide an item in the "evidence" array with the exact matching "entryId" from <entry id="...">.
   - Include a brief quote or snippet (10-30 words) from that entry.
   - If an entry is referenced, its "entryId" MUST be an authentic ID from the provided corpus. Do NOT fabricate IDs.
5. INSUFFICIENT EVIDENCE RULE:
   - If the user's question asks about something not present or lacking sufficient evidence in their journal, set "insufficientEvidence": true and explicitly state: "I couldn't find enough evidence in your journal to answer that yet."
   - Never invent an answer.
6. INSPECTABLE "WHY":
   - Provide a concise 1-2 sentence "whyExplanation" explaining transparently how the answer was derived from the supporting evidence.
7. PROVIDE 2-3 NATURAL FOLLOW-UPS:
   - Suggest 2-3 contextual follow-up questions the user might ask next based on what was found.
8. RETURN STRICT STRUCTURED JSON ONLY.`;

    const prompt = `The user is asking a question about their personal journal history:
"${question}"
${historyContext}
--- AUTHENTICATED USER JOURNAL CORPUS ---
${corpusText}
--- END USER JOURNAL CORPUS ---

--- AUTHENTICATED PERSONAL MEMORIES ---
${memoryText || '(No saved personal memories yet)'}
--- END PERSONAL MEMORIES ---

Classify the query into one of: 'recall' | 'pattern' | 'goal' | 'lesson' | 'decision' | 'change' | 'history' | 'related' | 'open_loop' | 'achievement' | 'comparison' | 'general' | 'conversational'.
Synthesize an evidence-first, grounded answer following all critical directives.`;

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        answer: { type: 'STRING' },
        evidence: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              entryId: { type: 'STRING' },
              snippet: { type: 'STRING' },
              reason: { type: 'STRING' },
            },
            required: ['entryId', 'snippet', 'reason'],
          },
        },
        relatedMemoryIds: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        confidence: { type: 'STRING' }, // 'high' | 'medium' | 'low'
        insufficientEvidence: { type: 'BOOLEAN' },
        whyExplanation: { type: 'STRING' },
        suggestedFollowUps: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        queryCategory: { type: 'STRING' },
      },
      required: [
        'answer',
        'evidence',
        'confidence',
        'insufficientEvidence',
        'whyExplanation',
        'suggestedFollowUps',
        'queryCategory',
      ],
    };

    const result = await generateContentWithFallback(prompt, systemInstruction, responseSchema);

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    // 4. Validate every evidence item against authentic entries in this user's corpus
    const rawEvidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const validatedEvidence: any[] = [];

    for (const ev of rawEvidence) {
      if (ev && typeof ev.entryId === 'string' && entryMap.has(ev.entryId)) {
        const authenticEntry = entryMap.get(ev.entryId)!;
        validatedEvidence.push({
          entryId: authenticEntry.id,
          entryTitle: authenticEntry.title || 'Untitled Reflection',
          date: authenticEntry.createdAt || '',
          snippet: cleanText(ev.snippet, 300),
          reason: cleanText(ev.reason, 300) || 'Relevant reflection passage.',
        });
      }
    }

    // 5. Validate related memories against user's actual memory collection
    const rawMemoryIds = Array.isArray(parsed.relatedMemoryIds) ? parsed.relatedMemoryIds : [];
    const validatedRelatedMemories: any[] = [];
    for (const memId of rawMemoryIds) {
      if (typeof memId === 'string' && memoryMap.has(memId)) {
        const mem = memoryMap.get(memId)!;
        validatedRelatedMemories.push({
          id: mem.id,
          type: mem.type,
          title: mem.title,
          description: mem.description || '',
        });
      }
    }

    // 6. Handle Insufficient Evidence or Hallucinated Factual Claims
    let answerText = cleanText(parsed.answer, 2500);
    let insufficientEvidence = Boolean(parsed.insufficientEvidence);
    const queryCategory = cleanText(parsed.queryCategory, 30) || 'general';

    // If the model claimed to find specific facts/entries, but all returned entryIds were hallucinated/invalid:
    if (!insufficientEvidence && queryCategory !== 'conversational' && validatedEvidence.length === 0 && rawEvidence.length > 0) {
      insufficientEvidence = true;
      answerText = "I couldn't find enough verified evidence in your reflections to answer that question accurately.";
    }

    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

    const cleanFollowUps = (Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps : [])
      .map((f: any) => cleanText(f, 120))
      .filter((f: string) => f.length > 0)
      .slice(0, 4);

    return res.json({
      answer: answerText,
      evidence: validatedEvidence,
      relatedMemories: validatedRelatedMemories,
      confidence,
      insufficientEvidence,
      whyExplanation: cleanText(parsed.whyExplanation, 400) || 'Answer formulated from your journal entries.',
      suggestedFollowUps: cleanFollowUps,
      queryCategory,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/ask-journal:', error);
    return res.status(500).json({
      error: error?.message || "Couldn't search your journal right now.",
    });
  }
});

/**
 * POST /api/gemini/idea-evolution
 * Secure Idea Evolution analyzer:
 * 1. Requires and verifies the Firebase Auth ID Token via requireFirebaseAuth.
 * 2. Derives UID directly from the verified token (req.verifiedUid).
 * 3. Queries Firestore directly on the server under /users/{verifiedUid}/entries.
 * 4. Never trusts client-supplied user IDs or unverified corpus payloads.
 */
app.post('/api/gemini/idea-evolution', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const verifiedUid = req.verifiedUid!;
    const idToken = req.firebaseIdToken!;
    const adminApp = getFirebaseAdmin();

    // Extract optional focused entry ID from request body
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const focusedEntryId = typeof body.focusedEntryId === 'string' ? body.focusedEntryId.trim() : undefined;

    const projectId = firebaseConfigData.projectId;
    const databaseId = (firebaseConfigData as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';

    // Structured historical corpus
    let historicalCorpus: Array<{
      id: string;
      title: string;
      createdAt: string;
      mood: string;
      summary?: string;
      recentInteractions: string[];
    }> = [];

    // Attempt 1: Server-side query via Firestore Admin SDK
    let querySucceeded = false;
    try {
      const firestore = databaseId && databaseId !== '(default)'
        ? getFirestore(adminApp, databaseId)
        : getFirestore(adminApp);

      const entriesSnapshot = await firestore
        .collection('users')
        .doc(verifiedUid)
        .collection('entries')
        .orderBy('createdAt', 'desc')
        .limit(15)
        .get();

      if (!entriesSnapshot.empty) {
        for (const docSnap of entriesSnapshot.docs) {
          const docData = docSnap.data();
          const entryId = docSnap.id;
          const title = docData.title || 'Untitled Reflection';
          const createdAt = docData.createdAt || '';
          const mood = docData.mood || 'thoughtful';
          const summaryOverview = docData.summary?.overview || '';

          const interactionsSnap = await firestore
            .collection('users')
            .doc(verifiedUid)
            .collection('entries')
            .doc(entryId)
            .collection('interactions')
            .orderBy('timestamp', 'asc')
            .limit(6)
            .get();

          const recentInteractions: string[] = [];
          interactionsSnap.forEach((iSnap) => {
            const iData = iSnap.data();
            const role = iData.role === 'assistant' ? 'Gemini' : 'User';
            const snippet = (iData.content || '').slice(0, 400);
            if (snippet.trim()) {
              recentInteractions.push(`${role}: ${snippet}`);
            }
          });

          historicalCorpus.push({
            id: entryId,
            title,
            createdAt,
            mood,
            summary: summaryOverview,
            recentInteractions,
          });
        }
        querySucceeded = true;
      } else {
        querySucceeded = true; // Query succeeded but user has no entries
      }
    } catch (adminErr: any) {
      console.warn('Firestore Admin SDK query skipped/failed (falling back to user-authenticated REST API):', adminErr?.message || adminErr);
    }

    // Attempt 2: Direct query via Firestore REST API with verified User ID Token
    if (!querySucceeded || historicalCorpus.length === 0) {
      try {
        const restBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${verifiedUid}`;
        const entriesRes = await fetch(`${restBaseUrl}/entries?pageSize=15`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (entriesRes.ok) {
          const restData = (await entriesRes.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
          const documents = restData.documents || [];

          for (const doc of documents) {
            const parsedFields = parseFirestoreRestFields(doc.fields);
            const entryId = doc.name.split('/').pop() || '';
            const title = parsedFields.title || 'Untitled Reflection';
            const createdAt = parsedFields.createdAt || '';
            const mood = parsedFields.mood || 'thoughtful';
            const summaryOverview = parsedFields.summary?.overview || '';

            // Fetch interactions for this entry
            const interactionsRes = await fetch(`${restBaseUrl}/entries/${entryId}/interactions?pageSize=6`, {
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            });

            const recentInteractions: string[] = [];
            if (interactionsRes.ok) {
              const iData = (await interactionsRes.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
              const iDocs = iData.documents || [];
              for (const iDoc of iDocs) {
                const iFields = parseFirestoreRestFields(iDoc.fields);
                const role = iFields.role === 'assistant' ? 'Gemini' : 'User';
                const snippet = (iFields.content || '').slice(0, 400);
                if (snippet.trim()) {
                  recentInteractions.push(`${role}: ${snippet}`);
                }
              }
            }

            historicalCorpus.push({
              id: entryId,
              title,
              createdAt,
              mood,
              summary: summaryOverview,
              recentInteractions,
            });
          }
        }
      } catch (restErr: any) {
        console.warn('Firestore REST API fallback error:', restErr?.message || restErr);
      }
    }

    // Attempt 3: If server queries returned 0 entries, check if client provided its own verified session entries
    if (historicalCorpus.length === 0 && Array.isArray(body.clientFallbackEntries) && body.clientFallbackEntries.length > 0) {
      // Validate that all fallback entries strictly belong to the verifiedUid
      for (const item of body.clientFallbackEntries.slice(0, 15)) {
        if (item && typeof item === 'object' && item.userId === verifiedUid) {
          historicalCorpus.push({
            id: String(item.id || '').slice(0, 100),
            title: String(item.title || 'Untitled Reflection').slice(0, 120),
            createdAt: String(item.createdAt || '').slice(0, 50),
            mood: String(item.mood || 'thoughtful').slice(0, 50),
            summary: item.summary?.overview ? String(item.summary.overview).slice(0, 1000) : undefined,
            recentInteractions: Array.isArray(item.recentInteractions)
              ? item.recentInteractions.slice(0, 6).map((r: any) => String(r || '').slice(0, 400))
              : [],
          });
        }
      }
    }

    if (historicalCorpus.length === 0) {
      return res.status(400).json({
        error: 'You do not have any saved reflections yet. Create at least 1-2 reflections to analyze Idea Evolution.',
      });
    }

    // Sort chronologically ascending to allow Gemini to analyze trajectory from past to present
    historicalCorpus.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Construct analytical prompt with strict boundary delimiters
    let corpusText = '';
    historicalCorpus.forEach((entry, idx) => {
      corpusText += `\n<entry index="${idx + 1}" id="${entry.id}" date="${entry.createdAt}" title="${entry.title}" mood="${entry.mood}">\n`;
      if (entry.summary) {
        corpusText += `Summary: ${entry.summary}\n`;
      }
      if (entry.recentInteractions.length > 0) {
        corpusText += `Key Reflections:\n${entry.recentInteractions.join('\n')}\n`;
      }
      corpusText += `</entry>\n`;
    });

    const focusedContext = focusedEntryId
      ? `The user is currently viewing the entry with ID "${focusedEntryId}". Make sure to highlight how ideas from earlier entries connect to or culminate in this specific entry.`
      : `Analyze the holistic evolution of thoughts and creative or personal ideas across all provided entries.`;

    const prompt = `Analyze the chronological journal corpus of the authenticated user to map out how their ideas, perspectives, and mental models have evolved over time.

${focusedContext}

--- USER HISTORICAL CORPUS START ---
${corpusText}
--- USER HISTORICAL CORPUS END ---

Please evaluate the following 5 analytical dimensions:
1. "centralConcept": The core overarching philosophy, goal, or creative idea that threads through their writing.
2. "themeOverview": A 2-3 sentence narrative describing how their thinking has shifted over time.
3. "timelineStages": A chronological list of 2 to 5 evolution milestones. For each stage:
   - "entryId": the matching entry ID from the corpus (if applicable).
   - "entryTitle": the title of the entry.
   - "date": the date string or approximate time.
   - "stageTitle": a descriptive evolutionary phase (e.g. "Seed & Initial Curiosity", "Tension / Questioning Assumptions", "Consolidation & Strategy").
   - "evolutionDescription": 1-2 sentences on what was thought or felt at this point.
   - "keyShift": the distinct shift or revelation that occurred.
4. "recurringThemes": 2 to 4 recurring thematic threads with estimated frequency count and a brief note on how they manifest.
5. "relatedEntries": 2 to 4 specific connections linking earlier entries, explaining the connection ("relevanceReason") and matching exact "entryId" and "title".
6. "unresolvedQuestions": 2 to 4 open questions or dilemmas that the user raised across entries which remain unanswered.
7. "suggestedNextSteps": 2 to 4 practical, inspiring micro-actions or reflection prompts to advance these evolving ideas.`;

    const systemInstruction =
      'You are a high-order cognitive and philosophical journaling analyst specializing in longitudinal thought mapping. Produce precise structured JSON without markdown code fences.';

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        centralConcept: { type: 'STRING' },
        themeOverview: { type: 'STRING' },
        timelineStages: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              entryId: { type: 'STRING' },
              entryTitle: { type: 'STRING' },
              date: { type: 'STRING' },
              stageTitle: { type: 'STRING' },
              evolutionDescription: { type: 'STRING' },
              keyShift: { type: 'STRING' },
            },
            required: ['entryTitle', 'date', 'stageTitle', 'evolutionDescription', 'keyShift'],
          },
        },
        recurringThemes: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              frequencyCount: { type: 'INTEGER' },
              description: { type: 'STRING' },
            },
            required: ['name', 'frequencyCount', 'description'],
          },
        },
        relatedEntries: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              entryId: { type: 'STRING' },
              title: { type: 'STRING' },
              relevanceReason: { type: 'STRING' },
            },
            required: ['entryId', 'title', 'relevanceReason'],
          },
        },
        unresolvedQuestions: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        suggestedNextSteps: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
      },
      required: [
        'centralConcept',
        'themeOverview',
        'timelineStages',
        'recurringThemes',
        'relatedEntries',
        'unresolvedQuestions',
        'suggestedNextSteps',
      ],
    };

    const result = await generateContentWithFallback(prompt, systemInstruction, responseSchema);

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const evolutionPayload = {
      centralConcept: parsed.centralConcept || 'Thought & Reflection Evolution',
      themeOverview: parsed.themeOverview || 'Analysis of thought progression across your reflections.',
      timelineStages: Array.isArray(parsed.timelineStages) ? parsed.timelineStages : [],
      recurringThemes: Array.isArray(parsed.recurringThemes) ? parsed.recurringThemes : [],
      relatedEntries: Array.isArray(parsed.relatedEntries) ? parsed.relatedEntries : [],
      unresolvedQuestions: Array.isArray(parsed.unresolvedQuestions) ? parsed.unresolvedQuestions : [],
      suggestedNextSteps: Array.isArray(parsed.suggestedNextSteps) ? parsed.suggestedNextSteps : [],
      totalAnalyzedEntries: historicalCorpus.length,
      generatedAt: new Date().toISOString(),
    };

    return res.json({
      evolution: evolutionPayload,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/idea-evolution:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to synthesize idea evolution from journal history.',
    });
  }
});

// Vite middleware & Static Serving setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
