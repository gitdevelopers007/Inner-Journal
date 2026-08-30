# Gemini Journal & Reflections

A secure, user-authenticated, multi-turn reflective journaling web application powered by **Gemini 3.6 Flash** and **Google Cloud Firestore**, fortified with **Firebase Authentication** (Google Sign-In) and per-user data isolation security rules.

---

## 1. Agentic Threat Model Summary

| Threat Zone | Identified Risks & Vectors | Countermeasures & Applied Defenses |
| :--- | :--- | :--- |
| **Input Surfaces** | Untrusted prompt injections, oversized payload submissions, malicious script injections. | Strict length caps, sanitization, defensive destructuring on incoming request bodies, typed JSON deserialization (`express.json({ limit: '10mb' })`). |
| **Planning & Reasoning** | System prompt hijacking, unauthorized role assumptions, instruction leakage. | Rigid assistant boundaries framing Gemini as an empathetic mindful reflection partner; instructions delimited from user text. |
| **Tool Execution & APIs** | SSRF, privilege escalation via unprotected API tokens, dynamic evaluation risks. | Gemini API calls strictly proxied through server-side endpoints (`/api/gemini/*`); API key is never sent to browser; zero `eval()` or unparameterized execution. |
| **Memory & State** | Cross-user data leakage, unauthorized reads/writes in Firestore, dirty payloads with undefined values. | Granular owner-bound Firestore Security Rules enforcing `request.auth.uid == userId`; client and server undefined-stripping sanitizers. |
| **Inter-System Communication** | Key exposure in client bundles, token interception, insecure third-party authentication. | Federated Google OAuth through Firebase Auth; backend credentials managed via Google Cloud Secret Manager and environment variables. |

---

## 2. Architecture & Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, React Markdown.
- **Backend API Proxy**: Node.js, Express, tsx/esbuild, `@google/genai` TypeScript SDK.
- **AI Processing**: Gemini 3.6 Flash with automated resilient fallback ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`).
- **Database & Persistence**: Google Cloud Firestore (structured collections under `/users/{userId}/entries` and subcollections `/interactions`).
- **Identity & Auth**: Firebase Authentication with Federated Google Sign-In popups.

---

## 3. Database Security Configuration (Cloud Firestore)

The application enforces strict owner-bound rules in `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Isolated User namespace: only the authenticated owner can read or write their data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Top-level interactions subcollection for cross-entry querying
      match /interactions/{interactionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // Journal entries subcollection
      match /entries/{entryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
        
        // Nested interactions subcollection within a journal entry
        match /interactions/{interactionId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }

      // Explicit recursive path match for all child documents
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

To deploy the security rules:
```bash
firebase deploy --only firestore:rules
```

---

## 4. Secret Management Setup (Google Cloud Secret Manager)

Store your Gemini API key in Google Cloud Secret Manager and grant Cloud Run runtime service accounts read access:

```bash
# 1. Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# 2. Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Grant the Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 5. Production Cloud Run Deployment Flow

Deploy the containerized full-stack application directly to Google Cloud Run with the mandatory verification campaign label:

```bash
# Build and deploy service to Cloud Run
gcloud run deploy gemini-reflections-app \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --update-labels=dev-tutorial=cloud-run-ai-challenge
```

---

## 6. Comprehensive Functional Verification & Walkthrough Test Cases

Use this test plan to verify all system components and interactions:

### Test Case 1: Landing Page & Unauthenticated State
1. Open the application URL without an active session.
2. **Expected Outcome**: The Landing view renders with the "Strict User-Isolated Cloud Firestore Persistence" badge, value pillars, and a prominent "Continue with Google Sign-In" button. No private journal records are visible.

### Test Case 2: Federated Google Sign-In
1. Click the **"Continue with Google Sign-In"** button.
2. Select your Google account in the popup window.
3. **Expected Outcome**: Firebase authenticates the user, the UI updates smoothly, and the user's avatar, name, and email appear in the top navbar.

### Test Case 3: Create a New Reflection
1. Click the **"+ New Reflection"** button in the navbar or sidebar.
2. Edit the title by clicking into the title field (e.g., "Navigating Creative Block").
3. Select a mood from the mood selector chips (e.g., "Creative 🎨" or "Thoughtful 💡").
4. Select a reflection mode tab (e.g., "Reflect", "Brainstorm", or "Distill").
5. **Expected Outcome**: A new document is created in Firestore under `/users/{userId}/entries/{entryId}`. The entry card appears immediately in the sidebar list with the correct mood icon.

### Test Case 4: Inquiry Prompt Inspiration
1. Click **"Show Inquiry Prompts"** above the text composer.
2. Click on one of the suggested prompt cards or click **"Refresh with AI"**.
3. **Expected Outcome**: The prompt text populates directly into the reflection textarea.

### Test Case 5: Multi-Turn Reflection Dialogue with Gemini
1. Enter your thoughts into the reflection composer and click the **Send** button (or press `Cmd/Ctrl + Enter`).
2. **Expected Outcome**:
   - The user message is saved to Firestore under `/users/{userId}/entries/{entryId}/interactions/{interactionId}` and renders immediately in the conversation stream.
   - A pulsing "Gemini 3.6 Flash is reflecting..." loading indicator appears.
   - The server routes the prompt and conversation history through the Gemini fallback ladder.
   - Gemini's empathetic, markdown-formatted response is received, saved to Firestore, and displayed with a model badge and copy button.

### Test Case 6: Auto-Suggest Reflection Title
1. In a new untitled entry, submit a reflection and click the **Wand / Magic** icon next to the title field.
2. **Expected Outcome**: The backend generates a grounded, concise 3-5 word title from your reflection and updates both the header and the Firestore document.

### Test Case 7: Automated Executive Synthesis & Takeaways
1. After having a multi-turn conversation, click the **"Summarize with AI"** button in the top toolbar.
2. **Expected Outcome**:
   - The synthesis modal opens displaying the Executive Overview, Identified Emotional Tone, Key Themes chips, and Actionable Micro-Steps checklist.
   - The summary payload is persisted to the entry's Firestore document.
   - The entry card in the sidebar displays the "Summarized ✨" tag.

### Test Case 8: Reflection History, Search & Filtering
1. In the sidebar, type keywords into the search box.
2. Filter by mood (e.g., click "Grateful ✨").
3. Click the star icon on an entry to mark it as favorite, then click the "Starred" filter pill.
4. **Expected Outcome**: The list filters instantly to match query parameters without page reload.

### Test Case 9: Safe Entry Deletion
1. In the sidebar, hover over an entry card and click the **Trash** icon.
2. Click **"Yes"** to confirm deletion.
3. **Expected Outcome**: All interactions and the parent entry are deleted from Firestore; the sidebar updates and switches to the next available entry.

### Test Case 10: Secure Sign-Out & Cross-User Isolation
1. Click the **Sign Out** button in the top navbar.
2. Sign in with a different Google account.
3. **Expected Outcome**: The dashboard loads only the second user's private reflections. Firestore security rules reject any unauthorized attempt to query another user's path.
