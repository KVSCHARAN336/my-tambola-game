import React, { useEffect, useState, useRef } from 'react';
import {
  IconArrowLeft,
  IconSpeaker,
  IconSpeakerMuted,
  IconUser,
  IconShare,
  IconCopy,
  IconCheck
} from './Icons';
import { Board } from './Board';
import { ShareSheet, getRoomShareUrl } from './ShareSheet';
import { TambolaRoom } from '../types';
import { announceNumber, formatAnnouncement, unlockSpeechOnIOS } from '../speech';

interface PlayerScreenProps {
  room: TambolaRoom;
  playerName: string;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onBackToHome: () => void;
  onShowToast?: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({
  room,
  playerName,
  voiceEnabled,
  onToggleVoice,
  onBackToHome,
  onShowToast
}) => {
  const [isHostDisconnected, setIsHostDisconnected] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const previousNumberRef = useRef<number | null>(room.currentNumber);

  // Monitor host heartbeat: if older than 60s, flag as disconnected
  useEffect(() => {
    const checkHeartbeat = () => {
      const now = Date.now();
      const diff = now - (room.hostHeartbeat || room.createdAt);
      setIsHostDisconnected(diff > 60000);
    };

    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [room.hostHeartbeat, room.createdAt]);

  // Read out new number automatically when changed
  useEffect(() => {
    if (room.currentNumber !== null && room.currentNumber !== previousNumberRef.current) {
      announceNumber(room.currentNumber, voiceEnabled);
      previousNumberRef.current = room.currentNumber;
    }
  }, [room.currentNumber, voiceEnabled]);

  const handleRepeatCall = () => {
    if (room.currentNumber === null) return;
    unlockSpeechOnIOS();
    announceNumber(room.currentNumber, true, true);
  };

  const handleCopyLink = async () => {
    const url = getRoomShareUrl(room.code);
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      if (onShowToast) onShowToast('Room link copied to clipboard', 'success');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      if (onShowToast) onShowToast('Failed to copy room link', 'error');
    }
  };

  const recentCalls = room.calledNumbers.slice(-5).reverse();

  return (
    <div className="flex flex-col min-h-dvh max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto bg-[#0B0F19] text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#0B0F19]/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3 pt-safe">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onBackToHome}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Back to home"
          >
            <IconArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center px-1 truncate">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-white">Player View</span>
              <button
                onClick={handleCopyLink}
                className="text-xs px-2.5 py-0.5 rounded-lg bg-indigo-950 border border-indigo-700/80 text-indigo-300 font-num font-black inline-flex items-center gap-1 hover:bg-indigo-900 transition-colors"
                title="Click to copy room link"
              >
                <span>{room.code}</span>
                {linkCopied ? <IconCheck className="w-3 h-3 text-amber-400" /> : <IconCopy className="w-3 h-3 text-indigo-400" />}
              </button>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 truncate">
              Joined as <span className="text-amber-400 font-bold">{playerName}</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsShareOpen(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Share Room & View Roster"
              aria-label="Share room"
            >
              <IconShare className="w-4 h-4 text-indigo-400" />
            </button>

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
          </div>
        </div>
      </header>

      {/* Host Disconnected Warning Banner */}
      {isHostDisconnected && (
        <div className="bg-amber-950/90 border-b border-amber-800 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-bold">Host caller disconnected. Waiting for host to reconnect...</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {/* Large Current Number Display */}
        <div className="flex flex-col items-center justify-center py-2 sm:py-3">
          <div className="text-center mb-2">
            <span className="text-xs sm:text-sm font-black tracking-widest text-indigo-400 uppercase">
              CURRENT NUMBER
            </span>
          </div>

          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 border-dashed border-amber-400/80 flex flex-col items-center justify-center bg-[#151C2C] shadow-2xl shadow-amber-950/40 relative">
            <span className="text-6xl sm:text-7xl md:text-8xl font-black font-num text-amber-400 tracking-tight leading-none select-none">
              {room.currentNumber !== null ? room.currentNumber : '—'}
            </span>
          </div>

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
            <p className="text-xs text-slate-400 font-medium mt-2.5 italic">
              Waiting for caller to draw the first number...
            </p>
          )}
        </div>

        {/* Recently Called Section */}
        <div className="flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-[#151C2C] border border-[#232D42] shadow-sm overflow-x-auto no-scrollbar">
          <span className="text-xs font-black tracking-wider text-slate-300 uppercase shrink-0">
            RECENT:
          </span>
          {recentCalls.length === 0 ? (
            <span className="text-xs text-slate-500 italic">No numbers called yet</span>
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

        {/* Connection and Player Roster Status */}
        <div className="flex items-center justify-between px-1 text-xs">
          <button
            onClick={() => setIsShareOpen(true)}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
            title="View joined players"
          >
            <IconUser className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-slate-300">Active Players:</span>
            <span className="font-black text-white font-num">{room.players.length} / 10</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-800/70 text-emerald-300 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live Synchronized</span>
          </div>
        </div>

        {/* Master Board 1-90 */}
        <Board calledNumbers={room.calledNumbers} currentNumber={room.currentNumber} />
      </main>

      {/* Share / Roster Sheet for Players (isHost={false} means no player kicking) */}
      <ShareSheet
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        roomCode={room.code}
        players={room.players}
        isHost={false}
        onShowToast={onShowToast || (() => {})}
      />

      <div className="pb-safe" />
    </div>
  );
};
