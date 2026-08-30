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

/**
 * POST /api/gemini/converse
 * Multi-turn reflective conversation with system prompts tailored to journaling & mindfulness
 */
app.post('/api/gemini/converse', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    const history = Array.isArray(data.history) ? data.history : [];
    const mode = typeof data.mode === 'string' ? data.mode : 'reflect';
    const mood = typeof data.mood === 'string' ? data.mood : 'thoughtful';
    const title = typeof data.title === 'string' ? data.title : 'Journal Entry';

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt cannot be empty.' });
    }

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
      error: error?.message || 'Failed to generate AI reflection response.',
    });
  }
});

/**
 * POST /api/gemini/summarize
 * Generates structured executive summary, emotional tone, key themes, and actionable micro-steps
 */
app.post('/api/gemini/summarize', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const title = typeof data.title === 'string' ? data.title : 'Journal Reflection';
    const mood = typeof data.mood === 'string' ? data.mood : 'thoughtful';
    const interactions = Array.isArray(data.interactions) ? data.interactions : [];

    if (interactions.length === 0) {
      return res.status(400).json({ error: 'No interaction history provided to summarize.' });
    }

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
      error: error?.message || 'Failed to generate journal summary.',
    });
  }
});

/**
 * POST /api/gemini/generate-title
 * Generates a creative, grounded 3-6 word title from the user's first reflection
 */
app.post('/api/gemini/generate-title', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const reflection = typeof data.reflection === 'string' ? data.reflection.trim() : '';

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
app.post('/api/gemini/suggest-prompts', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const mood = typeof data.mood === 'string' ? data.mood : 'thoughtful';

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

/**
 * POST /api/gemini/idea-evolution
 * Secure Idea Evolution analyzer:
 * 1. Requires and verifies the Firebase Auth ID Token from Authorization header.
 * 2. Derives UID directly from the verified token.
 * 3. Queries Firestore directly on the server under /users/{verifiedUid}/entries.
 * 4. Never trusts client-supplied user IDs or unverified corpus payloads.
 */
app.post('/api/gemini/idea-evolution', async (req, res) => {
  try {
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

    // Verify token using Firebase Admin
    const adminApp = getFirebaseAdmin();
    const authService = getAuth(adminApp);
    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await authService.verifyIdToken(idToken);
    } catch (authError: any) {
      console.warn('Firebase token verification failed:', authError?.message || authError);
      return res.status(401).json({
        error: 'Unauthorized: Invalid or expired Firebase ID token.',
      });
    }

    // Authenticated UID derived solely from verified token
    const verifiedUid = decodedToken.uid;
    if (!verifiedUid) {
      return res.status(401).json({ error: 'Unauthorized: Token did not contain a valid UID.' });
    }

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
      // Validate that all fallback entries belong to the verifiedUid
      for (const item of body.clientFallbackEntries.slice(0, 15)) {
        if (item && typeof item === 'object' && (!item.userId || item.userId === verifiedUid)) {
          historicalCorpus.push({
            id: String(item.id || ''),
            title: String(item.title || 'Untitled Reflection'),
            createdAt: String(item.createdAt || ''),
            mood: String(item.mood || 'thoughtful'),
            summary: item.summary?.overview ? String(item.summary.overview) : undefined,
            recentInteractions: Array.isArray(item.recentInteractions) ? item.recentInteractions.slice(0, 6) : [],
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
