import React, { useState, useEffect } from 'react';
import { IconMegaphone, IconUsers, IconShield } from './Icons';
import { generateRoomCode, generateHostToken } from '../engine';
import { unlockSpeechOnIOS } from '../speech';
import { isFirebaseConfigured } from '../firebaseConfig';

interface HomeScreenProps {
  initialCode?: string;
  onCreateGame: (code: string, hostToken: string) => Promise<void>;
  onJoinGame: (code: string, name: string) => Promise<void>;
  onResumeHost: (code: string, hostToken: string) => Promise<void>;
  onOpenGuide: () => void;
  onShowToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  initialCode = '',
  onCreateGame,
  onJoinGame,
  onResumeHost,
  onOpenGuide,
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [roomCode, setRoomCode] = useState(initialCode);
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastRoom, setLastRoom] = useState<{ code: string; token: string } | null>(null);

  useEffect(() => {
    // Check if there was a previous host session
    const savedRoom = localStorage.getItem('tambola_last_room');
    if (savedRoom) {
      const savedToken = localStorage.getItem(`tambola_host_token_${savedRoom}`);
      if (savedToken) {
        setLastRoom({ code: savedRoom, token: savedToken });
      }
    }

    // Auto-fill existing player name if joining
    if (initialCode) {
      const prevName = localStorage.getItem(`tambola_player_name_${initialCode}`);
      if (prevName) setPlayerName(prevName);
    }
  }, [initialCode]);

  const handleCreate = async () => {
    unlockSpeechOnIOS();
    setIsLoading(true);
    try {
      const code = generateRoomCode();
      const hostToken = generateHostToken();
      await onCreateGame(code, hostToken);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      onShowToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockSpeechOnIOS();

    const cleanCode = roomCode.trim().toUpperCase();
    const cleanName = playerName.trim();

    if (!cleanCode || cleanCode.length < 4) {
      onShowToast('Please enter a valid 6-character room code', 'error');
      return;
    }
    if (!cleanName) {
      onShowToast('Please enter your name to join', 'error');
      return;
    }

    setIsLoading(true);
    try {
      await onJoinGame(cleanCode, cleanName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      onShowToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const hasFirebase = isFirebaseConfigured();

  return (
    <div className="flex flex-col min-h-dvh max-w-xl md:max-w-2xl mx-auto bg-[#0B0F19] text-slate-100 justify-between px-4 sm:px-6 py-6 pt-safe pb-safe">
      {/* Top Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <IconMegaphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Tambola Live</h1>
            <p className="text-xs font-semibold text-indigo-400">Multiplayer Number Caller</p>
          </div>
        </div>

        <button
          onClick={onOpenGuide}
          className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-amber-300 flex items-center gap-1.5 border border-slate-700 transition-colors"
          title="Firebase Setup and Firestore Rules"
        >
          <IconShield className="w-3.5 h-3.5" />
          <span>Setup</span>
        </button>
      </header>

      {/* Cloud/Local Mode Banner */}
      <div className="my-3 px-4 py-2.5 rounded-2xl bg-[#151C2C] border border-[#232D42] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              hasFirebase ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-200 font-bold">
            {hasFirebase ? 'Cloud Mode: my-tambola-game' : 'Local Demo Mode (No Cloud Connection)'}
          </span>
        </div>
        <button
          onClick={onOpenGuide}
          className="text-amber-400 hover:text-amber-300 text-xs font-bold underline"
        >
          {hasFirebase ? 'Rules & Guide' : 'Connect Firebase'}
        </button>
      </div>

      {/* Main Center Card */}
      <div className="flex-1 flex flex-col justify-center my-4">
        <div className="bg-[#151C2C] border border-[#232D42] rounded-3xl p-5 sm:p-7 shadow-2xl">
          {/* Tabs: Create Game vs Join Game */}
          <div className="grid grid-cols-2 p-1.5 bg-[#0B0F19] rounded-2xl mb-6 border border-slate-800">
            <button
              onClick={() => setActiveTab('create')}
              className={`py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'create'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Game
            </button>
            <button
              onClick={() => setActiveTab('join')}
              className={`py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'join'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Join Game
            </button>
          </div>

          {activeTab === 'create' ? (
            <div className="space-y-5">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0B0F19] border border-slate-800 text-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Host Caller Mode
                </span>
                <p className="text-sm font-extrabold text-slate-200">
                  Draw numbers, auto-announce via speech, and track live players.
                </p>
                <div className="mt-3 text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-2.5">
                  Up to 10 players can join your room via share link or QR code.
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base tracking-wider uppercase shadow-xl shadow-amber-950/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <IconMegaphone className="w-5 h-5" />
                <span>{isLoading ? 'Creating Room...' : 'CREATE GAME (HOST)'}</span>
              </button>

              {/* Resume Last Hosted Game */}
              {lastRoom && (
                <div className="pt-3 border-t border-slate-800 text-center">
                  <span className="text-xs text-slate-400">Previous game found: </span>
                  <button
                    onClick={() => {
                      unlockSpeechOnIOS();
                      onResumeHost(lastRoom.code, lastRoom.token);
                    }}
                    className="text-xs font-extrabold text-amber-400 hover:text-amber-300 underline font-num ml-1"
                  >
                    Resume Room {lastRoom.code}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Room Code (6 Characters)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K8X2W9"
                  className="w-full p-4 rounded-xl bg-[#0B0F19] border border-slate-700 text-white font-num font-black text-xl tracking-widest text-center uppercase placeholder-slate-600 focus:outline-hidden focus:border-indigo-400 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full p-3.5 rounded-xl bg-[#0B0F19] border border-slate-700 text-white text-sm font-semibold placeholder-slate-600 focus:outline-hidden focus:border-indigo-400 transition-colors"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-black text-base tracking-wider uppercase shadow-xl shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <IconUsers className="w-5 h-5" />
                <span>{isLoading ? 'Joining Room...' : 'JOIN GAME (PLAYER)'}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <footer className="text-center text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-400">Real-time sync · Maximum 10 players per room</p>
        <p className="text-[11px] text-slate-500">Accessible for all ages · Mobile & Tablet optimized</p>
      </footer>
    </div>
  );
};
