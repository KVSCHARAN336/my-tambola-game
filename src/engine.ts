import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  Firestore,
  Unsubscribe
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  Auth
} from 'firebase/auth';
import { isFirebaseConfigured, getActiveFirebaseConfig } from './firebaseConfig';
import { TambolaRoom, TambolaPlayer } from './types';

// Generate human-friendly 6-character room codes
export function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < 6; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

// Generate secret host token (used for host session resumption in localStorage)
export function generateHostToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// SHA-256 for local checks
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Firebase Instances
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

function getFirebaseServices(): { db: Firestore | null; auth: Auth | null } {
  if (!isFirebaseConfigured()) {
    return { db: null, auth: null };
  }

  if (!firestoreInstance || !authInstance) {
    try {
      const config = getActiveFirebaseConfig();
      const app = getApps().length > 0 ? getApp() : initializeApp(config);
      firestoreInstance = getFirestore(app);
      authInstance = getAuth(app);
    } catch (err) {
      console.error('Failed to initialize Firebase services:', err);
      return { db: null, auth: null };
    }
  }

  return { db: firestoreInstance, auth: authInstance };
}

/**
 * Ensures user is authenticated via Firebase Anonymous Auth (or local UID in demo mode).
 * This establishes a cryptographically secure, spoof-proof request.auth.uid for Firestore rules.
 */
export async function ensureAuthUser(): Promise<string> {
  const { auth } = getFirebaseServices();

  if (!auth) {
    let localUid = localStorage.getItem('tambola_local_uid');
    if (!localUid) {
      localUid = 'local_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('tambola_local_uid', localUid);
    }
    return localUid;
  }

  if (auth.currentUser) {
    return auth.currentUser.uid;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsubscribe();
        resolve(user.uid);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          unsubscribe();
          resolve(cred.user.uid);
        } catch (err) {
          unsubscribe();
          console.error('Anonymous auth failed:', err);
          reject(new Error('Firebase Authentication failed. Please ensure Anonymous Auth is enabled in Firebase Console.'));
        }
      }
    });
  });
}

// BroadcastChannel for local demo multi-tab sync
const localChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('tambola_local_bus')
  : null;

// Local subscribers for same-window updates
type RoomListener = (room: TambolaRoom) => void;
const activeListeners = new Set<RoomListener>();

function notifyLocalListeners(room: TambolaRoom) {
  activeListeners.forEach(listener => {
    try {
      listener(room);
    } catch (e) {
      console.warn('Listener error:', e);
    }
  });
}

export function getLocalRoom(code: string): TambolaRoom | null {
  const data = localStorage.getItem(`tambola_room_${code}`);
  if (!data) return null;
  try {
    return JSON.parse(data) as TambolaRoom;
  } catch {
    return null;
  }
}

export function saveLocalRoom(room: TambolaRoom): void {
  localStorage.setItem(`tambola_room_${room.code}`, JSON.stringify(room));
  notifyLocalListeners(room);
  if (localChannel) {
    localChannel.postMessage({ type: 'ROOM_UPDATE', room });
  }
}

/**
 * Creates a new Tambola room with unique 6-character code and host UID
 */
export async function createGameRoom(code: string, hostToken: string): Promise<TambolaRoom> {
  const hostUid = await ensureAuthUser();
  const hostTokenHash = await sha256(hostToken);

  const newRoom: TambolaRoom = {
    code,
    hostUid,
    hostTokenHash,
    currentNumber: null,
    calledNumbers: [],
    players: [],
    hostHeartbeat: Date.now(),
    autoInterval: 6,
    createdAt: Date.now(),
    status: 'waiting'
  };

  // Save host credentials locally for session resumption
  localStorage.setItem(`tambola_host_token_${code}`, hostToken);
  localStorage.setItem('tambola_last_room', code);

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await setDoc(doc(db, 'rooms', code), newRoom);
      saveLocalRoom(newRoom);
      return newRoom;
    } catch (err: unknown) {
      console.error('Firestore createRoom error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Firebase error creating room: ${msg}. Check Firestore rules & Anonymous Auth.`);
    }
  }

  // Explicit local demo mode only when Firebase is unconfigured
  saveLocalRoom(newRoom);
  return newRoom;
}

/**
 * Subscribes to real-time room updates via Firestore onSnapshot
 */
export function subscribeToRoom(
  code: string,
  onUpdate: (room: TambolaRoom | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  let isUnsubscribed = false;

  // Local immediate state
  const initialLocal = getLocalRoom(code);
  if (initialLocal) {
    onUpdate(initialLocal);
  }

  // Same-window listener
  const sameWindowListener: RoomListener = (updatedRoom) => {
    if (isUnsubscribed) return;
    if (updatedRoom.code === code) {
      onUpdate(updatedRoom);
    }
  };
  activeListeners.add(sameWindowListener);

  // BroadcastChannel listener
  const handleBroadcast = (e: MessageEvent) => {
    if (isUnsubscribed) return;
    if (e.data?.type === 'ROOM_UPDATE' && e.data?.room?.code === code) {
      onUpdate(e.data.room);
    }
  };
  if (localChannel) {
    localChannel.addEventListener('message', handleBroadcast);
  }

  const { db } = getFirebaseServices();

  if (db) {
    const roomRef = doc(db, 'rooms', code);
    const firestoreUnsub = onSnapshot(
      roomRef,
      snapshot => {
        if (isUnsubscribed) return;
        if (snapshot.exists()) {
          const data = snapshot.data() as TambolaRoom;
          // Check 24 hour expiry
          if (Date.now() - data.createdAt > 24 * 60 * 60 * 1000) {
            onError(new Error('This room has expired (24 hour limit reached).'));
            onUpdate(null);
            return;
          }
          saveLocalRoom(data);
          onUpdate(data);
        } else {
          onUpdate(null);
        }
      },
      error => {
        if (isUnsubscribed) return;
        console.error('Firestore listener error:', error);
        onError(new Error(`Firestore sync error: ${error.message}`));
      }
    );

    return () => {
      isUnsubscribed = true;
      activeListeners.delete(sameWindowListener);
      if (localChannel) {
        localChannel.removeEventListener('message', handleBroadcast);
      }
      firestoreUnsub();
    };
  }

  // Local-only mode unsubscribe
  return () => {
    isUnsubscribed = true;
    activeListeners.delete(sameWindowListener);
    if (localChannel) {
      localChannel.removeEventListener('message', handleBroadcast);
    }
  };
}

/**
 * Joins a room as a player (enforces maximum 10 players, no duplicate seats)
 */
export async function joinGameRoom(
  code: string,
  playerName: string,
  existingPlayerId?: string
): Promise<{ playerId: string; room: TambolaRoom }> {
  const trimmedName = playerName.trim();
  if (!trimmedName) throw new Error('Please enter a valid player name');

  const playerUid = await ensureAuthUser();
  const playerId = existingPlayerId || playerUid;

  const { db } = getFirebaseServices();
  let currentRoom: TambolaRoom | null = null;

  if (db) {
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) {
      throw new Error(`Room ${code} was not found. Please check the code and try again.`);
    }
    currentRoom = snap.data() as TambolaRoom;
  } else {
    currentRoom = getLocalRoom(code);
  }

  if (!currentRoom) {
    throw new Error(`Room ${code} not found. Please check and try again.`);
  }

  if (Date.now() - currentRoom.createdAt > 24 * 60 * 60 * 1000) {
    throw new Error('This room has expired (24 hour limit reached).');
  }

  const existingIndex = currentRoom.players.findIndex(
    p => p.id === playerId || p.name.toLowerCase() === trimmedName.toLowerCase()
  );

  let updatedPlayers: TambolaPlayer[];
  if (existingIndex >= 0) {
    // Rejoin existing seat
    updatedPlayers = [...currentRoom.players];
    updatedPlayers[existingIndex] = {
      ...updatedPlayers[existingIndex],
      name: trimmedName,
      joinedAt: Date.now()
    };
  } else {
    // Strict 10-player capacity check
    if (currentRoom.players.length >= 10) {
      throw new Error('Room is full (Maximum 10 players reached). Rejecting 11th player.');
    }
    updatedPlayers = [
      ...currentRoom.players,
      { id: playerId, name: trimmedName, joinedAt: Date.now() }
    ];
  }

  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    players: updatedPlayers
  };

  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        players: updatedPlayers
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to join room in Firebase: ${msg}`);
    }
  }

  saveLocalRoom(updatedRoom);
  localStorage.setItem(`tambola_player_name_${code}`, trimmedName);
  localStorage.setItem(`tambola_player_id_${code}`, playerId);

  return { playerId, room: updatedRoom };
}

/**
 * Host calls a new random number (enforces host UID authorization and no duplicates)
 */
export async function callNextNumber(
  code: string,
  hostToken: string,
  currentRoom: TambolaRoom
): Promise<{ pickedNumber: number | null; updatedRoom: TambolaRoom }> {
  const currentUid = await ensureAuthUser();
  if (currentRoom.hostUid && currentRoom.hostUid !== currentUid) {
    // Check if matching hostToken from localStorage is present for resumption
    const savedToken = localStorage.getItem(`tambola_host_token_${code}`);
    if (savedToken !== hostToken) {
      throw new Error('Unauthorized: Only the host who created this room can call numbers.');
    }
  }

  const calledSet = new Set(currentRoom.calledNumbers);
  const uncalled: number[] = [];
  for (let i = 1; i <= 90; i++) {
    if (!calledSet.has(i)) uncalled.push(i);
  }

  if (uncalled.length === 0) {
    return { pickedNumber: null, updatedRoom: currentRoom };
  }

  // Draw random uncalled number
  const randomIndex = Math.floor(Math.random() * uncalled.length);
  const pickedNumber = uncalled[randomIndex];
  const newCalled = [...currentRoom.calledNumbers, pickedNumber];

  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    currentNumber: pickedNumber,
    calledNumbers: newCalled,
    status: newCalled.length >= 90 ? 'completed' : 'active',
    hostHeartbeat: Date.now()
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        currentNumber: pickedNumber,
        calledNumbers: newCalled,
        status: updatedRoom.status,
        hostHeartbeat: Date.now()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Firebase update failed: ${msg}. Only the room host is permitted to call numbers.`);
    }
  }

  saveLocalRoom(updatedRoom);
  return { pickedNumber, updatedRoom };
}

/**
 * Host undoes the last call
 */
export async function undoLastCall(
  code: string,
  hostToken: string,
  currentRoom: TambolaRoom
): Promise<TambolaRoom> {
  const currentUid = await ensureAuthUser();
  if (currentRoom.hostUid && currentRoom.hostUid !== currentUid) {
    const savedToken = localStorage.getItem(`tambola_host_token_${code}`);
    if (savedToken !== hostToken) {
      throw new Error('Unauthorized: Only the host can undo calls.');
    }
  }

  if (currentRoom.calledNumbers.length === 0) return currentRoom;

  const newCalled = currentRoom.calledNumbers.slice(0, -1);
  const newCurrent = newCalled.length > 0 ? newCalled[newCalled.length - 1] : null;

  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    currentNumber: newCurrent,
    calledNumbers: newCalled,
    status: 'active',
    hostHeartbeat: Date.now()
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        currentNumber: newCurrent,
        calledNumbers: newCalled,
        status: 'active',
        hostHeartbeat: Date.now()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Firestore undo failed: ${msg}`);
    }
  }

  saveLocalRoom(updatedRoom);
  return updatedRoom;
}

/**
 * Host resets the game (clears called numbers, keeps players)
 */
export async function resetGame(
  code: string,
  hostToken: string,
  currentRoom: TambolaRoom
): Promise<TambolaRoom> {
  const currentUid = await ensureAuthUser();
  if (currentRoom.hostUid && currentRoom.hostUid !== currentUid) {
    const savedToken = localStorage.getItem(`tambola_host_token_${code}`);
    if (savedToken !== hostToken) {
      throw new Error('Unauthorized: Only the host can reset the game.');
    }
  }

  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    currentNumber: null,
    calledNumbers: [],
    status: 'waiting',
    hostHeartbeat: Date.now()
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        currentNumber: null,
        calledNumbers: [],
        status: 'waiting',
        hostHeartbeat: Date.now()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Firestore reset failed: ${msg}`);
    }
  }

  saveLocalRoom(updatedRoom);
  return updatedRoom;
}

/**
 * Host updates auto call interval
 */
export async function updateAutoInterval(
  code: string,
  hostToken: string,
  intervalSeconds: number,
  currentRoom: TambolaRoom
): Promise<TambolaRoom> {
  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    autoInterval: intervalSeconds
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        autoInterval: intervalSeconds
      });
    } catch {
      // ignore
    }
  }

  saveLocalRoom(updatedRoom);
  return updatedRoom;
}

/**
 * Host removes a player from the room
 */
export async function removePlayer(
  code: string,
  hostToken: string,
  playerId: string,
  currentRoom: TambolaRoom
): Promise<TambolaRoom> {
  const currentUid = await ensureAuthUser();
  if (currentRoom.hostUid && currentRoom.hostUid !== currentUid) {
    const savedToken = localStorage.getItem(`tambola_host_token_${code}`);
    if (savedToken !== hostToken) {
      throw new Error('Unauthorized: Only the host can remove players.');
    }
  }

  const updatedPlayers = currentRoom.players.filter(p => p.id !== playerId);
  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    players: updatedPlayers
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        players: updatedPlayers
      });
    } catch {
      // ignore
    }
  }

  saveLocalRoom(updatedRoom);
  return updatedRoom;
}

/**
 * Host sends heartbeat timestamp (throttled every 30s to conserve Firestore quota)
 */
export async function sendHostHeartbeat(code: string, hostToken: string): Promise<void> {
  const now = Date.now();
  const room = getLocalRoom(code);
  if (room) {
    saveLocalRoom({ ...room, hostHeartbeat: now });
  }

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        hostHeartbeat: now
      });
    } catch {
      // ignore transient heartbeat write
    }
  }
}
