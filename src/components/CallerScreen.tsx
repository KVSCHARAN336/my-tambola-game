import React, { useState, useEffect, useRef } from 'react';
import {
  IconArrowLeft,
  IconMenu,
  IconSpeaker,
  IconSpeakerMuted,
  IconUndo,
  IconUsers,
  IconRefresh,
  IconShield,
  IconClose
} from './Icons';
import { Board } from './Board';
import { ShareSheet } from './ShareSheet';
import { TambolaRoom } from '../types';
import {
  callNextNumber,
  undoLastCall,
  resetGame,
  removePlayer,
  sendHostHeartbeat,
  updateAutoInterval
} from '../engine';
import { announceNumber, unlockSpeechOnIOS, formatAnnouncement } from '../speech';

interface CallerScreenProps {
  room: TambolaRoom;
  hostToken: string;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onBackToHome: () => void;
  onShowToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  onOpenGuide: () => void;
  onUpdateRoom: (room: TambolaRoom) => void;
}

export const CallerScreen: React.FC<CallerScreenProps> = ({
  room,
  hostToken,
  voiceEnabled,
  onToggleVoice,
  onBackToHome,
  onShowToast,
  onOpenGuide,
  onUpdateRoom
}) => {
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAutoActive, setIsAutoActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [numberPulse, setNumberPulse] = useState(false);

  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Heartbeat loop every 15s
  useEffect(() => {
    sendHostHeartbeat(room.code, hostToken);
    heartbeatTimerRef.current = setInterval(() => {
      sendHostHeartbeat(room.code, hostToken);
    }, 15000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [room.code, hostToken]);

  // Handle number calling
  const handleCallNumber = async () => {
    if (isCalling) return;
    if (room.calledNumbers.length >= 90) {
      onShowToast('All 90 numbers have been called', 'info');
      setIsAutoActive(false);
      return;
    }

    unlockSpeechOnIOS();
    setIsCalling(true);
    try {
      const { pickedNumber, updatedRoom } = await callNextNumber(room.code, hostToken, room);
      if (pickedNumber !== null) {
        onUpdateRoom(updatedRoom);
        announceNumber(pickedNumber, voiceEnabled);
        setNumberPulse(true);
        setTimeout(() => setNumberPulse(false), 500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to call number';
      onShowToast(message, 'error');
      setIsAutoActive(false);
    } finally {
      setIsCalling(false);
    }
  };

  // Repeat current call speech
  const handleRepeatCall = () => {
    if (room.currentNumber === null) return;
    unlockSpeechOnIOS();
    announceNumber(room.currentNumber, true);
    onShowToast(`Announced: ${formatAnnouncement(room.currentNumber)}`, 'info');
  };

  // AUTO caller loop
  useEffect(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);

    if (isAutoActive) {
      if (room.calledNumbers.length >= 90) {
        setIsAutoActive(false);
        return;
      }
      autoTimerRef.current = setInterval(() => {
        handleCallNumber();
      }, (room.autoInterval || 6) * 1000);
    }

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [isAutoActive, room.calledNumbers.length, room.autoInterval, room.code, hostToken, voiceEnabled]);

  // Undo last call
  const handleUndo = async () => {
    if (room.calledNumbers.length === 0) return;
    try {
      const updated = await undoLastCall(room.code, hostToken, room);
      onUpdateRoom(updated);
      onShowToast('Last call undone', 'info');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to undo call';
      onShowToast(message, 'error');
    }
  };

  // Reset / New Game
  const handleNewGame = async () => {
    try {
      setIsAutoActive(false);
      const updated = await resetGame(room.code, hostToken, room);
      onUpdateRoom(updated);
      setIsMenuOpen(false);
      onShowToast('New game started. Player roster kept intact.', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset game';
      onShowToast(message, 'error');
    }
  };

  // Remove player
  const handleRemovePlayer = async (playerId: string) => {
    try {
      const updated = await removePlayer(room.code, hostToken, playerId, room);
      onUpdateRoom(updated);
      onShowToast('Player removed', 'info');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove player';
      onShowToast(message, 'error');
    }
  };

  // Update auto interval
  const handleSetInterval = async (seconds: number) => {
    try {
      const updated = await updateAutoInterval(room.code, hostToken, seconds, room);
      onUpdateRoom(updated);
      onShowToast(`Auto timer set to ${seconds}s`, 'info');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to change timer';
      onShowToast(message, 'error');
    }
  };

  const isCompleted = room.calledNumbers.length >= 90;
  const recentCalls = room.calledNumbers.slice(-5).reverse();

  return (
    <div className="flex flex-col min-h-dvh max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto bg-[#0B0F19] text-slate-100">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-[#0B0F19]/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3 pt-safe">
        <div className="flex items-center justify-between">
          {/* Back button */}
          <button
            onClick={onBackToHome}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Back to home"
          >
            <IconArrowLeft className="w-5 h-5" />
          </button>

          {/* Title and Subtitle */}
          <div className="text-center px-2">
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight">Caller Mode</h1>
            <p className="text-[11px] sm:text-xs font-semibold text-indigo-400">Announcing in English</p>
          </div>

          {/* Action buttons: Voice Toggle & Menu */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleVoice}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                voiceEnabled
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50'
                  : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
              title={voiceEnabled ? 'Voice is ON' : 'Voice is OFF'}
              aria-label={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
            >
              {voiceEnabled ? <IconSpeaker className="w-5 h-5" /> : <IconSpeakerMuted className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setIsMenuOpen(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Open menu"
            >
              <IconMenu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {/* Players & Add Member Strip */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#151C2C] border border-[#232D42] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <IconUsers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-extrabold text-white">
                Players ({room.players.length}/10)
              </div>
              <div className="text-[11px] text-slate-400 font-num">
                Room Code: <span className="text-amber-400 font-black">{room.code}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsShareOpen(true)}
            className="px-3.5 sm:px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-indigo-600/20 transition-all shrink-0"
          >
            Add Member / Share
          </button>
        </div>

        {/* Current Number Display (No text-border overlap!) */}
        <div className="flex flex-col items-center justify-center py-2 sm:py-3">
          <div className="text-center mb-2">
            <span className="text-xs sm:text-sm font-black tracking-widest text-indigo-400 uppercase">
              CURRENT NUMBER
            </span>
          </div>

          {/* Dotted border circle with generous internal padding */}
          <div
            className={`
              w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 border-dashed border-amber-400/80 flex flex-col items-center justify-center bg-[#151C2C] shadow-2xl shadow-amber-950/40 relative transition-transform duration-300
              ${numberPulse ? 'scale-105 border-amber-300 ring-8 ring-amber-400/30' : ''}
            `}
          >
            <span className="text-6xl sm:text-7xl md:text-8xl font-black font-num text-amber-400 tracking-tight leading-none select-none">
              {room.currentNumber !== null ? room.currentNumber : '—'}
            </span>
          </div>

          {/* Announcement text cleanly outside the circle */}
          {room.currentNumber !== null ? (
            <div className="text-center mt-2.5">
              <div className="text-xs sm:text-sm font-black text-slate-200 tracking-wide uppercase font-num">
                {formatAnnouncement(room.currentNumber)}
              </div>
              <button
                onClick={handleRepeatCall}
                className="mt-2 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 border border-slate-700 shadow-sm transition-colors"
              >
                <IconSpeaker className="w-3.5 h-3.5 text-amber-400" />
                <span>Repeat Announcement</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 font-medium mt-2 italic">
              Tap "Call Number" below to draw the first number
            </p>
          )}
        </div>

        {/* Recently Called Section */}
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-[#151C2C] border border-[#232D42] shadow-sm">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-xs font-black tracking-wider text-slate-300 uppercase shrink-0">
              RECENT:
            </span>
            {recentCalls.length === 0 ? (
              <span className="text-xs text-slate-500 italic">None yet</span>
            ) : (
              recentCalls.map((num, i) => (
                <span
                  key={`${num}-${i}`}
                  className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-950 border border-indigo-600 text-indigo-200 text-sm sm:text-base font-black font-num flex items-center justify-center shrink-0 shadow-xs"
                >
                  {num}
                </span>
              ))
            )}
          </div>

          <button
            onClick={handleUndo}
            disabled={room.calledNumbers.length === 0 || isAutoActive}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0 transition-colors border border-slate-700"
            title="Undo last call"
          >
            <IconUndo className="w-4 h-4 text-indigo-400" />
            <span>Undo</span>
          </button>
        </div>

        {/* Master Board 1-90 */}
        <Board calledNumbers={room.calledNumbers} currentNumber={room.currentNumber} />
      </main>

      {/* Bottom Sticky Action Bar */}
      <footer className="sticky bottom-0 z-20 bg-[#0B0F19]/95 backdrop-blur-md border-t border-slate-800 px-4 sm:px-6 py-3.5 pb-safe space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs sm:text-sm font-black text-slate-200">
              AUTO CALL ({room.autoInterval || 6}s)
            </span>
            <div className="text-[11px] text-slate-400">Automatic number caller</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isAutoActive}
              disabled={isCompleted}
              onChange={e => {
                unlockSpeechOnIOS();
                setIsAutoActive(e.target.checked);
              }}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>

        <button
          onClick={handleCallNumber}
          disabled={isCompleted || isCalling || isAutoActive}
          className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-black text-base sm:text-lg tracking-wider uppercase flex items-center justify-center gap-2 shadow-2xl shadow-amber-950/60 transition-all active:scale-[0.98]"
        >
          <span>{isCompleted ? 'All 90 numbers called' : isCalling ? 'Drawing Number...' : 'CALL NUMBER'}</span>
        </button>
      </footer>

      {/* Share Bottom Sheet */}
      <ShareSheet
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        roomCode={room.code}
        players={room.players}
        onRemovePlayer={handleRemovePlayer}
        isHost={true}
        onShowToast={onShowToast}
      />

      {/* Caller Menu Modal */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => setIsMenuOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-sm bg-[#151C2C] border border-[#232D42] rounded-3xl p-5 shadow-2xl space-y-4 z-10">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Caller Settings</h3>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>

            {/* Auto Interval Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Auto Call Timer (Seconds)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[3, 6, 9, 12].map(sec => (
                  <button
                    key={sec}
                    onClick={() => handleSetInterval(sec)}
                    className={`py-2 rounded-xl text-xs font-bold font-num transition-colors ${
                      (room.autoInterval || 6) === sec
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* New Game Button */}
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={handleNewGame}
                className="w-full py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
              >
                <IconRefresh className="w-4 h-4 text-amber-400" />
                <span>New Game (Clear Board, Keep Players)</span>
              </button>
            </div>

            {/* Firebase Guide Trigger */}
            <div>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenGuide();
                }}
                className="w-full py-3 px-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-indigo-800/60"
              >
                <IconShield className="w-4 h-4" />
                <span>Firebase & Deployment Guide</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
