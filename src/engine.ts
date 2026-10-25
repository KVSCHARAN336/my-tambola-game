import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  collection,
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

// Generate secret host token (used for host session UI resumption)
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
 * Verifies whether a room exists in Firestore (or local storage in demo mode)
 * and whether it has expired (past 24h limit).
 */
export async function verifyRoomExists(code: string): Promise<{
  valid: boolean;
  expired?: boolean;
  error?: string;
  room?: Partial<TambolaRoom>;
}> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 4) {
    return { valid: false, error: 'Invalid room code format.' };
  }

  const { db } = getFirebaseServices();

  if (db) {
    try {
      const roomRef = doc(db, 'rooms', cleanCode);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
        return { valid: false, error: `Room ${cleanCode} does not exist or has been closed.` };
      }
      const data = roomSnap.data() as TambolaRoom;
      if (Date.now() - data.createdAt > 24 * 60 * 60 * 1000) {
        return { valid: false, expired: true, error: `Room ${cleanCode} has expired (24-hour limit reached).` };
      }
      return { valid: true, expired: false, room: data };
    } catch (err: unknown) {
      console.error('Error verifying room in Firestore:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Failed to connect to room: ${msg}` };
    }
  }

  // Local demo mode fallback
  const local = getLocalRoom(cleanCode);
  if (!local) {
    return { valid: false, error: `Room ${cleanCode} was not found.` };
  }
  if (Date.now() - local.createdAt > 24 * 60 * 60 * 1000) {
    return { valid: false, expired: true, error: `Room ${cleanCode} has expired.` };
  }
  return { valid: true, expired: false, room: local };
}

/**
 * Creates a new Tambola room with unique 6-character code and host UID.
 * Game state lives in `rooms/{code}`, players live in subcollection `rooms/{code}/players/{playerUid}`.
 */
export async function createGameRoom(code: string, hostToken?: string): Promise<TambolaRoom> {
  const hostUid = await ensureAuthUser();

  const newRoom: TambolaRoom = {
    code,
    hostUid,
    currentNumber: null,
    calledNumbers: [],
    players: [],
    hostHeartbeat: Date.now(),
    autoInterval: 6,
    createdAt: Date.now(),
    status: 'waiting'
  };

  // Save host credentials locally for fast session resumption on page reload
  if (hostToken) {
    localStorage.setItem(`tambola_host_token_${code}`, hostToken);
  }
  localStorage.setItem('tambola_last_room', code);

  const { db } = getFirebaseServices();
  if (db) {
    try {
      // Room document contains strictly game metadata and state (no player array)
      const roomPayload = {
        code,
        hostUid,
        currentNumber: null,
        calledNumbers: [],
        hostHeartbeat: Date.now(),
        autoInterval: 6,
        createdAt: Date.now(),
        status: 'waiting'
      };
      await setDoc(doc(db, 'rooms', code), roomPayload);
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
 * Subscribes to real-time room updates via Firestore listeners on both:
 * 1. `rooms/{code}` (game state)
 * 2. `rooms/{code}/players` (player subcollection)
 * Combines them into the single standard TambolaRoom interface.
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
    let latestRoomDoc: Partial<TambolaRoom> | null = initialLocal || null;
    let latestPlayers: TambolaPlayer[] = initialLocal?.players || [];

    const emitCombined = () => {
      if (isUnsubscribed) return;
      if (!latestRoomDoc) {
        onUpdate(null);
        return;
      }

      // Check 24 hour expiry
      if (latestRoomDoc.createdAt && Date.now() - latestRoomDoc.createdAt > 24 * 60 * 60 * 1000) {
        onError(new Error('This room has expired (24 hour limit reached).'));
        onUpdate(null);
        return;
      }

      // Sort players by join timestamp ascending for deterministic roster order
      const sortedPlayers = [...latestPlayers].sort((a, b) => a.joinedAt - b.joinedAt);

      const fullRoom: TambolaRoom = {
        code: latestRoomDoc.code || code,
        hostUid: latestRoomDoc.hostUid || '',
        currentNumber: latestRoomDoc.currentNumber ?? null,
        calledNumbers: latestRoomDoc.calledNumbers || [],
        players: sortedPlayers,
        hostHeartbeat: latestRoomDoc.hostHeartbeat || Date.now(),
        autoInterval: latestRoomDoc.autoInterval || 6,
        createdAt: latestRoomDoc.createdAt || Date.now(),
        status: (latestRoomDoc.status as TambolaRoom['status']) || 'waiting'
      };

      saveLocalRoom(fullRoom);
      onUpdate(fullRoom);
    };

    // 1. Listen to Room document (game state)
    const roomRef = doc(db, 'rooms', code);
    const firestoreRoomUnsub = onSnapshot(
      roomRef,
      snapshot => {
        if (isUnsubscribed) return;
        if (snapshot.exists()) {
          latestRoomDoc = snapshot.data() as Partial<TambolaRoom>;
          emitCombined();
        } else {
          latestRoomDoc = null;
          emitCombined();
        }
      },
      error => {
        if (isUnsubscribed) return;
        console.error('Firestore room listener error:', error);
        onError(new Error(`Firestore sync error: ${error.message}`));
      }
    );

    // 2. Listen to Players subcollection
    const playersColRef = collection(db, 'rooms', code, 'players');
    const firestorePlayersUnsub = onSnapshot(
      playersColRef,
      snapshot => {
        if (isUnsubscribed) return;
        latestPlayers = snapshot.docs.map(docSnap => docSnap.data() as TambolaPlayer);
        emitCombined();
      },
      error => {
        if (isUnsubscribed) return;
        console.error('Firestore players listener error:', error);
        onError(new Error(`Firestore players sync error: ${error.message}`));
      }
    );

    return () => {
      isUnsubscribed = true;
      activeListeners.delete(sameWindowListener);
      if (localChannel) {
        localChannel.removeEventListener('message', handleBroadcast);
      }
      firestoreRoomUnsub();
      firestorePlayersUnsub();
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
 * Joins a room as a player by creating or updating only their own player document in
 * `rooms/{code}/players/{playerUid}`. Ordinary players never write to the room document.
 */
export async function joinGameRoom(
  code: string,
  playerName: string,
  _existingPlayerId?: string
): Promise<{ playerId: string; room: TambolaRoom }> {
  const trimmedName = playerName.trim();
  if (!trimmedName) throw new Error('Please enter a valid player name');
  if (trimmedName.length > 30) throw new Error('Player name must be 30 characters or less');

  const playerUid = await ensureAuthUser();

  const { db } = getFirebaseServices();

  if (db) {
    // 1. Verify room exists and is active
    const roomSnap = await getDoc(doc(db, 'rooms', code));
    if (!roomSnap.exists()) {
      throw new Error(`Room ${code} was not found. Please check the code and try again.`);
    }

    const roomData = roomSnap.data() as TambolaRoom;
    if (Date.now() - roomData.createdAt > 24 * 60 * 60 * 1000) {
      throw new Error('This room has expired (24 hour limit reached).');
    }

    // 2. Check if player already has an existing seat in the subcollection
    const playerDocRef = doc(db, 'rooms', code, 'players', playerUid);
    const existingPlayerSnap = await getDoc(playerDocRef);

    let playerData: TambolaPlayer;

    if (existingPlayerSnap.exists()) {
      // Rejoining existing seat
      const existing = existingPlayerSnap.data() as TambolaPlayer;
      playerData = {
        id: playerUid,
        name: trimmedName,
        joinedAt: existing.joinedAt || Date.now()
      };
      if (existing.name !== trimmedName) {
        await updateDoc(playerDocRef, { name: trimmedName });
      }
    } else {
      // 3. New player join: check current player capacity
      const allPlayersSnap = await getDocs(collection(db, 'rooms', code, 'players'));
      if (allPlayersSnap.size >= 10) {
        throw new Error('Room is full (Maximum 10 players reached). Cannot join.');
      }

      playerData = {
        id: playerUid,
        name: trimmedName,
        joinedAt: Date.now()
      };

      // Create own player record
      await setDoc(playerDocRef, playerData);
    }

    localStorage.setItem(`tambola_player_name_${code}`, trimmedName);
    localStorage.setItem(`tambola_player_id_${code}`, playerUid);

    // Fetch latest players for immediate return
    const currentPlayersSnap = await getDocs(collection(db, 'rooms', code, 'players'));
    const playersList = currentPlayersSnap.docs.map(d => d.data() as TambolaPlayer);

    const fullRoom: TambolaRoom = {
      ...roomData,
      players: playersList
    };

    saveLocalRoom(fullRoom);
    return { playerId: playerUid, room: fullRoom };
  }

  // Local demo fallback
  const currentRoom = getLocalRoom(code);
  if (!currentRoom) {
    throw new Error(`Room ${code} not found. Please check and try again.`);
  }

  if (Date.now() - currentRoom.createdAt > 24 * 60 * 60 * 1000) {
    throw new Error('This room has expired (24 hour limit reached).');
  }

  const existingIndex = currentRoom.players.findIndex(
    p => p.id === playerUid || p.name.toLowerCase() === trimmedName.toLowerCase()
  );

  let updatedPlayers: TambolaPlayer[];
  if (existingIndex >= 0) {
    updatedPlayers = [...currentRoom.players];
    updatedPlayers[existingIndex] = {
      ...updatedPlayers[existingIndex],
      name: trimmedName
    };
  } else {
    if (currentRoom.players.length >= 10) {
      throw new Error('Room is full (Maximum 10 players reached).');
    }
    updatedPlayers = [
      ...currentRoom.players,
      { id: playerUid, name: trimmedName, joinedAt: Date.now() }
    ];
  }

  const updatedRoom: TambolaRoom = {
    ...currentRoom,
    players: updatedPlayers
  };

  saveLocalRoom(updatedRoom);
  localStorage.setItem(`tambola_player_name_${code}`, trimmedName);
  localStorage.setItem(`tambola_player_id_${code}`, playerUid);

  return { playerId: playerUid, room: updatedRoom };
}

/**
 * Host calls a new random number.
 * Only the authenticated host UID can mutate the room document.
 */
export async function callNextNumber(
  code: string,
  _hostToken: string,
  currentRoom?: TambolaRoom
): Promise<{ pickedNumber: number | null; updatedRoom: TambolaRoom }> {
  const room = currentRoom || getLocalRoom(code);
  if (!room) throw new Error('Room not found');

  const currentUid = await ensureAuthUser();
  if (room.hostUid && room.hostUid !== currentUid) {
    throw new Error('Unauthorized: Only the authenticated room host can call numbers.');
  }

  const calledSet = new Set(room.calledNumbers);
  const uncalled: number[] = [];
  for (let i = 1; i <= 90; i++) {
    if (!calledSet.has(i)) uncalled.push(i);
  }

  if (uncalled.length === 0) {
    return { pickedNumber: null, updatedRoom: room };
  }

  // Draw random uncalled number
  const randomIndex = Math.floor(Math.random() * uncalled.length);
  const pickedNumber = uncalled[randomIndex];
  const newCalled = [...room.calledNumbers, pickedNumber];

  const updatedRoom: TambolaRoom = {
    ...room,
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
      throw new Error(`Firebase update failed: ${msg}. Only the authenticated host can call numbers.`);
    }
  }

  saveLocalRoom(updatedRoom);
  return { pickedNumber, updatedRoom };
}

/**
 * Host undoes the last call.
 * Only the authenticated host UID can mutate the room document.
 */
export async function undoLastCall(
  code: string,
  _hostToken: string,
  currentRoom?: TambolaRoom
): Promise<TambolaRoom> {
  const room = currentRoom || getLocalRoom(code);
  if (!room) throw new Error('Room not found');

  const currentUid = await ensureAuthUser();
  if (room.hostUid && room.hostUid !== currentUid) {
    throw new Error('Unauthorized: Only the authenticated host can undo calls.');
  }

  if (room.calledNumbers.length === 0) return room;

  const newCalled = room.calledNumbers.slice(0, -1);
  const newCurrent = newCalled.length > 0 ? newCalled[newCalled.length - 1] : null;

  const updatedRoom: TambolaRoom = {
    ...room,
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
 * Host resets the game (clears called numbers, keeps players).
 * Only the authenticated host UID can mutate the room document.
 */
export async function resetGame(
  code: string,
  _hostToken: string,
  currentRoom?: TambolaRoom
): Promise<TambolaRoom> {
  const room = currentRoom || getLocalRoom(code);
  if (!room) throw new Error('Room not found');

  const currentUid = await ensureAuthUser();
  if (room.hostUid && room.hostUid !== currentUid) {
    throw new Error('Unauthorized: Only the authenticated host can reset the game.');
  }

  const updatedRoom: TambolaRoom = {
    ...room,
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
 * Host updates auto call interval.
 */
export async function updateAutoInterval(
  code: string,
  _hostToken: string,
  intervalSeconds: number,
  currentRoom?: TambolaRoom
): Promise<TambolaRoom> {
  const room = currentRoom || getLocalRoom(code);
  if (!room) throw new Error('Room not found');

  const currentUid = await ensureAuthUser();
  if (room.hostUid && room.hostUid !== currentUid) {
    throw new Error('Unauthorized: Only the authenticated host can change auto-call interval.');
  }

  const updatedRoom: TambolaRoom = {
    ...room,
    autoInterval: intervalSeconds
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      await updateDoc(doc(db, 'rooms', code), {
        autoInterval: intervalSeconds
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to update interval: ${msg}`);
    }
  }

  saveLocalRoom(updatedRoom);
  return updatedRoom;
}

/**
 * Host removes a player from the room by deleting their document in `rooms/{code}/players/{playerId}`.
 * Only the room host has permission in security rules to delete another user's player document.
 */
export async function removePlayer(
  code: string,
  _hostToken: string,
  playerId: string,
  currentRoom?: TambolaRoom
): Promise<TambolaRoom> {
  const room = currentRoom || getLocalRoom(code);
  if (!room) throw new Error('Room not found');
  if (!playerId) return room;

  const currentUid = await ensureAuthUser();
  if (room.hostUid && room.hostUid !== currentUid) {
    throw new Error('Unauthorized: Only the authenticated room host can remove players.');
  }

  const updatedPlayers = room.players.filter(p => p.id !== playerId);
  const updatedRoom: TambolaRoom = {
    ...room,
    players: updatedPlayers
  };

  const { db } = getFirebaseServices();
  if (db) {
    try {
      // Host deletes player document in subcollection
      await deleteDoc(doc(db, 'rooms', code, 'players', playerId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to remove player: ${msg}`);
    }
  }

  saveLocalRoom(updatedRoom);
  return updatedRoom;
}

/**
 * Host sends heartbeat timestamp (throttled).
 */
export async function sendHostHeartbeat(code: string, _hostToken?: string): Promise<void> {
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
