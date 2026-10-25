# Tambola (Housie) Real-Time Multiplayer Number Caller

A real-time multiplayer Tambola (Housie) caller web application built with responsive vanilla HTML/CSS/JavaScript and Firebase Firestore live sync, featuring cryptographic host token authentication, automated voice calls with iOS Safari support, a bottom-sheet share drawer with an inline vector QR code generator, and a dual-engine fallback (live Firestore + zero-config multi-tab local demo mode).

---

## Firestore Security Rules

Deploy the following rules under your **Firebase Console → Firestore Database → Rules** tab:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Default-deny all undefined documents
    match /{document=**} {
      allow read, write: if false;
    }

    // Tambola Game Rooms
    match /rooms/{roomId} {
      // 1. Any player or host can read room state in real-time
      allow read: if true;

      // 2. Room creation
      // Requires 6-character room code, initial player count <= 10, and hostTokenHash string
      allow create: if request.resource.data.code is string
                    && request.resource.data.code.size() == 6
                    && request.resource.data.hostTokenHash is string
                    && request.resource.data.players is list
                    && request.resource.data.players.size() <= 10;

      // 3. Room updates: strict authorization
      allow update: if (
        // Case A: Player joining the room
        // Must ONLY modify the 'players' list and cannot exceed 10 players
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['players'])
         && request.resource.data.players is list
         && request.resource.data.players.size() <= 10)
        ||
        // Case B: Host mutations (calling numbers, undo, auto timer, heartbeat, reset)
        // Must supply raw hostToken whose SHA-256 hash matches the hostTokenHash stored on the room
        (request.resource.data.hostToken is string
         && hashing.sha256(request.resource.data.hostToken) == resource.data.hostTokenHash)
      );

      // 4. Host can delete room only if matching token is provided
      allow delete: if request.resource.data.hostToken is string
                    && hashing.sha256(request.resource.data.hostToken) == resource.data.hostTokenHash;
    }
  }
}
```

---

## 5-Step Deployment Guide

### Step 1: Create a Firebase Project
1. Navigate to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Name your project (e.g., `tambola-live-caller`), toggle Google Analytics according to your preference, and click **Create Project**.

### Step 2: Enable Cloud Firestore
1. In your Firebase project sidebar under **Build**, click **Firestore Database**.
2. Click **Create database**.
3. Select a cloud region close to your primary players (e.g. `nam5` for US or `asia-south1` for India).
4. Choose **Start in production mode** (or test mode), and click **Create**.
5. Once provisioned, open the **Rules** tab, paste the `firestore.rules` provided above, and click **Publish**.

### Step 3: Register Web App & Paste Config
1. In your Firebase Console, click the **Project Settings** (gear icon) → **General**.
2. Scroll down to **Your apps** and click the Web icon (`</>`).
3. Enter an app nickname (e.g., `Tambola Web`), then click **Register app**.
4. Copy the values inside the `firebaseConfig` object.
5. Open `src/firebaseConfig.ts` in this project and replace the placeholder object:
   ```typescript
   export const FIREBASE_CONFIG = {
     apiKey: "AIzaSyD...",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.appspot.com",
     messagingSenderId: "123456789...",
     appId: "1:123456789:web:abcdef..."
   };
   ```
   *(Note: You can also paste this JSON directly into the in-app "Setup" modal without changing code!)*

### Step 4: Deploy to Netlify or Firebase Hosting
- **Option A (Netlify)**:
  1. Push this repository to GitHub or drag-and-drop the project folder to Netlify.
  2. Set Build Command: `npm run build`
  3. Set Publish Directory: `dist`
  4. Click **Deploy Site**.

- **Option B (Firebase Hosting)**:
  1. Install Firebase CLI: `npm install -g firebase-tools`
  2. Run `firebase login` and `firebase init hosting` (set `dist` as public directory, configure as single-page app `Yes`).
  3. Run `npm run build && firebase deploy --only hosting`.

### Step 5: Test Real-Time Sync with Two Phones
1. Open the deployed URL on **Phone 1** (Host). Tap **Create Game**.
2. Tap **Add member** and share the link via WhatsApp, SMS, or scan the on-screen **QR code** using **Phone 2** (Player).
3. On Phone 2, enter any nickname and tap **Join Game**. Phone 1's player counter will immediately increment to `(1/10)`.
4. On Phone 1, tap **Call number** or toggle **AUTO CALL**.
5. Observe that Phone 2 speaks the number aloud ("Forty two, four two") and fills the master board in real-time!
