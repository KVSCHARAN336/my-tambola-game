# Real-Time Multiplayer Tambola (Housie) Number Caller

A mobile-first, real-time Tambola (Housie) number caller web application built with responsive vanilla HTML/CSS/JavaScript and Firebase Firestore live synchronization, featuring cryptographic host token verification, automated voice calls, share sheet with inline SVG QR generator, iOS Safari optimization, and voice on/off toggles.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following revisions have been incorporated:
> - **iOS Safari WebKit Full Support**:
>   - *Speech Synthesis Gesture Unlock*: Implements an initial silent user-gesture unlock (`speechSynthesis.speak(new SpeechSynthesisUtterance(''))`) on first tap/join so incoming numbers can be spoken automatically on iOS Mobile Safari without getting blocked by autoplay restrictions.
>   - *Safe Area & Viewport Ergonomics*: Employs `100dvh` dynamic viewport height, `env(safe-area-inset-bottom)`, `env(safe-area-inset-top)`, and `touch-action: manipulation` to prevent iOS gesture bouncing and double-tap zoom glitches.
> - **Dedicated Voice On/Off Button**:
>   - Prominent voice toggle with clean SVG speaker/mute icons accessible directly on both the Host (Caller Mode) top bar and Player View.
>   - Saved locally in `localStorage` so user audio preferences persist across reloads.
> - **Zero-Config Local Demo Fallback**: When `FIREBASE_CONFIG` is blank, the app seamlessly runs via local memory/BroadcastChannel for immediate testing.
> - **Self-Contained Inline SVG QR Generator**: 100% self-contained vector QR generator without external network calls.
> - **Voice Announcement Format**: Speaks the number name followed by individual digits (e.g. *"Forty two, four two"*), with strict emoji suppression and clean phonetics.

---

## 1. Overview & Core Concept

Tambola (Housie) requires a caller to draw numbers from 1 to 90 at random, announce them audibly, and mark a master board while players track the called numbers on their tickets.

This application provides:
1. **Host (Caller Mode)**: Generates a 6-character room, securely saves a 256-bit host secret token locally, calls numbers manually or on an adjustable auto-timer (default 6s), tracks the last 5 numbers with undo capability, monitors joined players (up to 10), and broadcasts a heartbeat timestamp every 15 seconds.
2. **Player View**: Accessible via clean URL (`/?room=CODE`) or manual room code entry, requiring only a player name (no account needed). Live-syncs the master 1–90 board, current called number, recent draws, and host connection status.
3. **Voice Audio Controls**: Host and player screens feature an accessible toggle to turn speech announcements ON or OFF at any moment.
4. **Security & Access Control**: Cryptographic SHA-256 token hashing on room creation. Writes to `calledNumbers`, `currentNumber`, `autoMode`, and game reset operations require the matching host secret token, enforced strictly in Firestore security rules.
5. **Room Capacity & Expiry**: Maximum 10 players enforced atomically; rooms older than 24 hours expire automatically.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[ Home View ]
     ├── "Create Game" ──> Generates 6-char code + hostToken ──> [ Caller Mode (Host) ]
     │                                                                 ├── Call Number (Manual / Auto)
     │                                                                 ├── Voice Toggle (On / Off)
     │                                                                 ├── Undo Last Call
     │                                                                 ├── Add Member / Share Sheet
     │                                                                 └── New Game (Reset)
     └── "Join Game" ────> Enter Name + 6-char Code ────────────> [ Player View ]
                                                                       ├── Live 1-90 Board
                                                                       ├── Voice Toggle (On / Off)
                                                                       ├── Current Number & Speech
                                                                       └── Host Heartbeat Monitor
```

### Visual Identity & Theme
- **Background**: Deep midnight navy (`#0B1220`) for atmospheric immersion.
- **Structural Surfaces & Cards**: Elevated navy panels (`#131C2E`) with hairline borders (`rgba(255, 255, 255, 0.08)`).
- **Master Board Card**: Off-white canvas (`#F8FAFC`) to maximize contrast and rapid visual scanning of numbers.
- **Primary Accent**: Energetic teal (`#14B8A6`) with darker teal gradient (`#0D9488` to `#0F766E`) for primary interactive buttons.
- **Secondary Accent**: Soft sky blue (`#7DD3FC`) for labels, indicators, and metadata separators.
- **Number States**:
  - *Called*: Solid teal background (`#14B8A6`) with crisp white tabular text.
  - *Current Number*: Teal ring, active pulse highlight, and large dotted-border circle display.
  - *Uncalled*: Clean white tile with soft slate border (`#E2E8F0`) and muted slate text (`#64748B`).
- **Zero-Emoji Discipline**: Strict adherence to no emojis in buttons, labels, toasts, speech, or messages. All iconography uses crisp, lightweight inline SVGs (megaphone, speaker, speaker-mute, share, copy, user, back, menu, undo, check, qr).
- **Mobile & iOS Ergonomics**: 44px+ touch targets, 12–16px border radii, bottom-sheet share drawer with drag handle, and full iOS Safari viewport optimization (`min-h-dvh`, `pb-safe`).

---

## 3. Key Product Decisions & Trade-Offs

### 1. iOS Safari Compatibility & Audio Context Unlocking
- **Chosen Approach**: Trigger a silent audio utterance on the very first touch/tap on the screen (e.g. clicking "Create Game", "Join Game", or the voice toggle). This initializes the WebKit Speech Synthesis engine within a valid user activation gesture, ensuring subsequent real-time sync events can call `speechSynthesis.speak()` without being suppressed by iOS Safari's audio autoplay restrictions.
- **Why**: iOS WebKit strictly requires a prior user gesture to unlock audio channels. Without this, player devices running iOS Safari remain completely silent when numbers are called.
- **CSS Safeguards for iOS**: Use `dvh` units (`min-h-dvh`), `-webkit-overflow-scrolling: touch`, `safe-area-inset` padding, and `user-select: none` / `touch-action: manipulation` to prevent 300ms click delay and bounce scrolling.

### 2. Dedicated Voice On/Off Control
- **Chosen Approach**: A high-visibility button with inline SVG speaker icons (active sound wave vs. muted slash) placed directly in the top action bar of both Host and Player screens. State is stored in `localStorage` under `tambola_voice_enabled`.
- **Why**: Allows players in quiet environments or hosts using external microphones/speakers to mute or enable speech instantly without entering settings sub-menus.

### 3. Host Authentication without User Login
- **Chosen Approach**: A 256-bit cryptographic token generated on room creation. The SHA-256 hash is recorded in the Firestore room document (`hostTokenHash`). Every host update passes the raw `hostToken` in document updates, where Firestore security rules verify `hashing.sha256(request.resource.data.hostToken) == resource.data.hostTokenHash`.
- **Why**: Prevents rogue players from modifying game state or calling numbers, while keeping the experience frictionless without requiring email sign-ups.

### 4. Dual-Mode Firestore + Local BroadcastChannel
- **Chosen Approach**: Detect if `FIREBASE_CONFIG.apiKey` contains placeholder values. If empty, the app runs in local demonstration mode using `BroadcastChannel` and `localStorage`, allowing simultaneous multi-tab testing in development. Once real Firebase credentials are provided, it connects directly to live Firestore.
- **Why**: Guarantees zero runtime crashes or blank screens during AI Studio preview review, while keeping the production Firebase SDK code front and center.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Tambola Number Caller                          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
┌────────────────────────────────┐                  ┌────────────────────────────────┐
│      Caller Mode (Host)        │                  │         Player View            │
│  - Host Secret Token in Local  │                  │  - Read-only Room Listener     │
│  - Random Number Generator     │                  │  - Auto-Speech Announcer       │
│  - Voice Toggle (On / Off)     │                  │  - Voice Toggle (On / Off)     │
│  - iOS Gesture Unlocker        │                  │  - iOS Gesture Unlocker        │
│  - Auto-Caller Timer (6s)      │                  │  - Host Heartbeat Inspector    │
│  - Member Manager & Share Sheet│                  │  - Responsive 1-90 Board Grid  │
└────────────────┬───────────────┘                  └────────────────┬───────────────┘
                 │                                                   │
                 │ writes (validated with hostToken)                 │ reads / join
                 ▼                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                             Firestore / Local Engine                               │
│                                                                                    │
│  Collection: rooms/{roomId}                                                        │
│  - code: "K8X2W9"                                                                  │
│  - hostTokenHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b78..." │
│  - currentNumber: 42 (or null)                                                     │
│  - calledNumbers: [7, 19, 42, ...]                                                 │
│  - players: [{ id: "p1", name: "Alex", joinedAt: 1729860000 }] (max 10)           │
│  - hostHeartbeat: 1729860015                                                       │
│  - autoInterval: 6                                                                 │
│  - createdAt: 1729860000 (expires in 24h)                                         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Firestore Security Rules Architecture
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read: if true;
      allow create: if request.resource.data.players.size() <= 10
                    && request.resource.data.code.size() == 6
                    && request.resource.data.hostTokenHash is string;
      allow update: if (
        // Case A: Player joining (appends name, max 10 players)
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['players'])
         && request.resource.data.players.size() <= 10)
        ||
        // Case B: Host mutations (must supply matching hostToken)
        (hashing.sha256(request.resource.data.hostToken) == resource.data.hostTokenHash)
      );
      allow delete: if hashing.sha256(request.resource.data.hostToken) == resource.data.hostTokenHash;
    }
  }
}
```

### Implementation Steps
1. **Single-File Web App Creation (`index.html` & React bridge)**: Full implementation containing:
   - Clearly marked `FIREBASE_CONFIG` block at the top with setup guidance.
   - iOS Safari WebKit optimizations (`dvh` heights, touch action manipulation, silent speech unlock on initial touch).
   - Prominent Voice ON/OFF audio toggle in both Host and Player view top bars with SVG speaker icons.
   - Complete CSS styling matching the specified midnight navy (`#0B1220`), teal (`#14B8A6`), sky blue (`#7DD3FC`), and off-white (`#F8FAFC`).
   - SVG iconography suite (megaphone, speaker, speaker-mute, share, copy, user, back, menu, undo, check, qr).
   - Lightweight zero-dependency inline SVG QR code generator for room links.
   - Full Web Speech API synthesizer with number + digits pronunciation and voice toggle checks.
   - Share bottom sheet (Web Share API, WhatsApp, Copy Link, SMS, Email, QR code).
   - Host heartbeat updater and player-side 60s disconnection alert.
   - Auto-caller with configurable interval (3s, 6s, 9s, 12s) and pause-on-exit safeguards.
2. **Firestore Security Rules**: Documented production rules with token verification and room capacity constraints.
3. **5-Step Deployment Guide**: Step-by-step instructions for Firebase Console project setup, Firestore creation, config injection, Netlify/Firebase Hosting deployment, and two-phone testing.
