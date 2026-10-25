/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { CallerScreen } from './components/CallerScreen';
import { PlayerScreen } from './components/PlayerScreen';
import { GuideModal } from './components/GuideModal';
import { Toast } from './components/Toast';
import { IconShield } from './components/Icons';
import { TambolaRoom, ViewState, ToastMessage } from './types';
import {
  createGameRoom,
  joinGameRoom,
  subscribeToRoom,
  sha256,
  getLocalRoom,
  verifyRoomExists
} from './engine';
import { unlockSpeechOnIOS } from './speech';

export default function App() {
  const [viewState, setViewState] = useState<ViewState>('home');
  const [room, setRoom] = useState<TambolaRoom | null>(null);
  const [hostToken, setHostToken] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [urlRoomCode, setUrlRoomCode] = useState<string>('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    return localStorage.getItem('tambola_voice_enabled') !== 'false';
  });

  // Direct room join state (for URLs like /?room=ABC123)
  const [directRoomCode, setDirectRoomCode] = useState<string | null>(null);
  const [directJoinState, setDirectJoinState] = useState<'checking' | 'prompt_name' | 'joining' | 'error' | null>(null);
  const [directJoinError, setDirectJoinError] = useState<string | null>(null);
  const [directNameInput, setDirectNameInput] = useState<string>('');

  // Global user gesture listener for unlocking iOS Safari speech synthesis
  useEffect(() => {
    const handleFirstGesture = () => {
      unlockSpeechOnIOS();
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
  }, []);

  // Toast manager
  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Voice toggle
  const toggleVoice = useCallback(() => {
    unlockSpeechOnIOS();
    setVoiceEnabled(prev => {
      const next = !prev;
      localStorage.setItem('tambola_voice_enabled', String(next));
      showToast(next ? 'Voice announcements ON' : 'Voice announcements OFF', 'info');
      return next;
    });
  }, [showToast]);

  // Host Action: Resume Game
  const handleResumeHost = useCallback(async (code: string, token: string) => {
    setHostToken(token);
    const existing = getLocalRoom(code);
    if (existing) {
      setRoom(existing);
    } else {
      const initialHash = await sha256(token);
      setRoom({
        code,
        hostUid: '',
        hostTokenHash: initialHash,
        currentNumber: null,
        calledNumbers: [],
        players: [],
        hostHeartbeat: Date.now(),
        autoInterval: 6,
        createdAt: Date.now(),
        status: 'active'
      });
    }
    setViewState('caller');
  }, []);

  // Player Action: Join Game
  const handleJoinGame = useCallback(async (code: string, name: string) => {
    const existingPlayerId = localStorage.getItem(`tambola_player_id_${code}`) || undefined;
    const { room: joinedRoom } = await joinGameRoom(code, name, existingPlayerId);
    setRoom(joinedRoom);
    setPlayerName(name);
    setViewState('player');
    showToast(`Welcome ${name}! Joined room ${code}.`, 'success');
  }, [showToast]);

  // Check URL search params on mount and handle direct room links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = (params.get('room') || params.get('code'))?.trim().toUpperCase();

    if (!codeParam || codeParam.length < 4) {
      return;
    }

    setUrlRoomCode(codeParam);
    setDirectRoomCode(codeParam);

    // 1. Check if user is the authenticated host who created this room
    const savedHostToken = localStorage.getItem(`tambola_host_token_${codeParam}`);
    if (savedHostToken) {
      setHostToken(savedHostToken);
      setDirectJoinState('checking');
      verifyRoomExists(codeParam)
        .then(result => {
          if (!result.valid) {
            setDirectJoinState('error');
            setDirectJoinError(result.error || `Room ${codeParam} does not exist or has expired.`);
          } else {
            handleResumeHost(codeParam, savedHostToken);
            setDirectJoinState(null);
          }
        })
        .catch(err => {
          setDirectJoinState('error');
          setDirectJoinError(err instanceof Error ? err.message : String(err));
        });
      return;
    }

    // 2. Direct player link: validate room and either auto-join or ask only for name
    setDirectJoinState('checking');
    verifyRoomExists(codeParam)
      .then(async result => {
        if (!result.valid) {
          setDirectJoinState('error');
          setDirectJoinError(result.error || `Room ${codeParam} does not exist or has expired.`);
          return;
        }

        // Check if player has already entered their name before
        const savedPlayerName = localStorage.getItem(`tambola_player_name_${codeParam}`);
        if (savedPlayerName) {
          setDirectJoinState('joining');
          try {
            await handleJoinGame(codeParam, savedPlayerName);
            setDirectJoinState(null);
          } catch (joinErr: unknown) {
            setDirectJoinState('error');
            setDirectJoinError(joinErr instanceof Error ? joinErr.message : 'Failed to auto-join room');
          }
        } else {
          // Pre-populate with previous global name if any
          const lastGlobalName = localStorage.getItem('tambola_last_player_name') || '';
          if (lastGlobalName) setDirectNameInput(lastGlobalName);
          setDirectJoinState('prompt_name');
        }
      })
      .catch(err => {
        setDirectJoinState('error');
        setDirectJoinError(err instanceof Error ? err.message : String(err));
      });
  }, [handleJoinGame, handleResumeHost]);

  // Synchronize URL query parameter with current room state
  useEffect(() => {
    if (room?.code && (viewState === 'caller' || viewState === 'player')) {
      const currentParam = new URLSearchParams(window.location.search).get('room');
      if (currentParam !== room.code) {
        window.history.replaceState(null, '', `${window.location.pathname}?room=${room.code}`);
      }
    }
  }, [room?.code, viewState]);

  // Handle Room Subscription
  useEffect(() => {
    if (!room?.code || viewState === 'home') return;

    const unsubscribe = subscribeToRoom(
      room.code,
      updatedRoom => {
        if (!updatedRoom) {
          showToast('Game room closed or not found', 'error');
          handleBackToHome();
          return;
        }
        setRoom(updatedRoom);
      },
      err => {
        showToast(err.message, 'error');
      }
    );

    return () => {
      unsubscribe();
    };
  }, [room?.code, viewState, showToast]);

  // Host Action: Create Game
  const handleCreateGame = async (code: string, token: string) => {
    const newRoom = await createGameRoom(code, token);
    setRoom(newRoom);
    setHostToken(token);
    setViewState('caller');
    showToast(`Room ${code} created. You are Caller/Host.`, 'success');
  };

  // Leave to home
  const handleBackToHome = () => {
    window.history.replaceState(null, '', window.location.pathname);
    setViewState('home');
    setRoom(null);
    setDirectRoomCode(null);
    setDirectJoinState(null);
    setDirectJoinError(null);
  };

  // Direct State Updater from screen actions for 0ms latency
  const handleUpdateRoom = useCallback((updatedRoom: TambolaRoom) => {
    setRoom(updatedRoom);
  }, []);

  return (
    <div className="min-h-dvh bg-[#0B1220] text-slate-100 flex flex-col">
      {/* Toast Overlay */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Direct Room Link: Validating or Auto-Joining State */}
      {(directJoinState === 'checking' || directJoinState === 'joining') && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mb-5">
            <span className="w-8 h-8 rounded-full border-3 border-indigo-400 border-t-transparent animate-spin" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            {directJoinState === 'checking' ? 'Checking Room...' : 'Joining Room...'}
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-num font-bold">
            Room Code: <span className="text-amber-400">{directRoomCode}</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Connecting to Firebase Cloud Firestore in real time...
          </p>
        </div>
      )}

      {/* Direct Room Link: Room Error or Expired */}
      {directJoinState === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-red-950/80 border border-red-700/80 flex items-center justify-center mb-5 text-red-400">
            <IconShield className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">Room Unavailable</h2>
          <div className="mt-3 p-4 rounded-2xl bg-[#151C2C] border border-[#232D42] text-xs text-red-300 leading-relaxed max-w-xs">
            {directJoinError || `Room ${directRoomCode} could not be found or has expired.`}
          </div>
          <button
            onClick={handleBackToHome}
            className="mt-6 w-full max-w-xs py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 transition-colors"
          >
            Return to Home Screen
          </button>
        </div>
      )}

      {/* Direct Room Link: Name Prompt Card (Only asked for name, Create Game hidden) */}
      {directJoinState === 'prompt_name' && (
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 py-8 max-w-md mx-auto w-full">
          <div className="bg-[#151C2C] border border-[#232D42] rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Tambola Live Invite
              </span>
            </div>

            <div className="text-center mb-6">
              <div className="text-3xl font-black text-amber-400 font-num tracking-wider">
                {directRoomCode}
              </div>
              <h2 className="text-lg font-black text-white mt-1">Join Game Room</h2>
              <p className="text-xs text-indigo-300 mt-1">
                Enter your name to join this live game session
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                unlockSpeechOnIOS();
                const trimmed = directNameInput.trim();
                if (!trimmed) {
                  showToast('Please enter your display name', 'error');
                  return;
                }
                setDirectJoinState('joining');
                try {
                  localStorage.setItem('tambola_last_player_name', trimmed);
                  await handleJoinGame(directRoomCode!, trimmed);
                  setDirectJoinState(null);
                } catch (err: unknown) {
                  setDirectJoinState('error');
                  setDirectJoinError(err instanceof Error ? err.message : 'Failed to join room');
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={directNameInput}
                  onChange={(e) => setDirectNameInput(e.target.value)}
                  placeholder="e.g. Priya, Uncle Bob..."
                  maxLength={30}
                  autoFocus
                  required
                  className="w-full px-4 py-3 rounded-xl bg-[#0B0F19] border border-slate-700 text-white text-base placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={!directNameInput.trim()}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <span>Join Game</span>
              </button>

              <button
                type="button"
                onClick={handleBackToHome}
                className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors text-center cursor-pointer"
              >
                Cancel and return to home
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Standard Views (when not in direct link intercept) */}
      {!directJoinState && viewState === 'home' && (
        <HomeScreen
          initialCode={urlRoomCode}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onResumeHost={handleResumeHost}
          onOpenGuide={() => setIsGuideOpen(true)}
          onShowToast={showToast}
        />
      )}

      {!directJoinState && viewState === 'caller' && room && (
        <CallerScreen
          room={room}
          hostToken={hostToken}
          voiceEnabled={voiceEnabled}
          onToggleVoice={toggleVoice}
          onBackToHome={handleBackToHome}
          onShowToast={showToast}
          onOpenGuide={() => setIsGuideOpen(true)}
          onUpdateRoom={handleUpdateRoom}
        />
      )}

      {!directJoinState && viewState === 'player' && room && (
        <PlayerScreen
          room={room}
          playerName={playerName}
          voiceEnabled={voiceEnabled}
          onToggleVoice={toggleVoice}
          onBackToHome={handleBackToHome}
          onShowToast={showToast}
        />
      )}

      {/* Guide & Rules Modal */}
      <GuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onShowToast={showToast}
        onConfigSaved={() => showToast('Firebase configuration updated', 'success')}
      />
    </div>
  );
}
