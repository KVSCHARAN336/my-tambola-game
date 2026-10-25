import React, { useState } from 'react';
import {
  IconShare,
  IconCopy,
  IconCheck,
  IconWhatsApp,
  IconMessage,
  IconMail,
  IconClose,
  IconTrash,
  IconUser,
  IconQrCode
} from './Icons';
import { generateQrSvg } from '../qrGenerator';
import { TambolaPlayer } from '../types';

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  players: TambolaPlayer[];
  onRemovePlayer?: (playerId: string) => void;
  isHost?: boolean;
  onShowToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export const ShareSheet: React.FC<ShareSheetProps> = ({
  isOpen,
  onClose,
  roomCode,
  players,
  onRemovePlayer,
  isHost = false,
  onShowToast
}) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : `https://tambolacaller.app/?room=${roomCode}`;

  const shareText = `Join my Tambola game. Room code: ${roomCode}. Link: ${currentUrl}`;
  const encodedShareText = encodeURIComponent(shareText);

  const canWebShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: 'Tambola Game Room',
        text: shareText,
        url: currentUrl
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onShowToast('Could not open share dialog', 'error');
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      onShowToast('Link copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast('Failed to copy link', 'error');
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      onShowToast(`Room code ${roomCode} copied`, 'success');
    } catch {
      onShowToast('Failed to copy code', 'error');
    }
  };

  const isFull = players.length >= 10;
  const qrSvgMarkup = generateQrSvg(currentUrl, 160);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs transition-opacity duration-200">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Slide-up sheet panel */}
      <div
        className="relative w-full max-w-lg bg-[#151C2C] rounded-t-3xl border-t border-[#232D42] p-5 pb-safe shadow-2xl flex flex-col max-h-[90dvh] overflow-y-auto no-scrollbar z-10"
        role="dialog"
        aria-modal="true"
        aria-label="Add Member and Share"
      >
        {/* Grab Handle */}
        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-4 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-lg font-black text-white">Add Members & Share</h3>
            <p className="text-xs font-semibold text-indigo-400">Invite players to join live</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Close share sheet"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        {/* Room Code Showcase */}
        <div className="mt-4 p-4 rounded-2xl bg-[#0B0F19] border border-[#232D42] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
              Room Code
            </div>
            <div className="text-3xl font-black font-num tracking-wider text-amber-400 mt-0.5">
              {roomCode}
            </div>
          </div>
          <button
            onClick={handleCopyCode}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <IconCopy className="w-4 h-4" />
            <span>Copy Code</span>
          </button>
        </div>

        {/* Primary Action Buttons */}
        <div className="mt-4 space-y-2.5">
          {canWebShare && (
            <button
              onClick={handleNativeShare}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all"
            >
              <IconShare className="w-4 h-4" />
              <span>Share via Device</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleCopyLink}
              className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-slate-700"
            >
              {copied ? <IconCheck className="w-4 h-4 text-amber-400" /> : <IconCopy className="w-4 h-4 text-amber-400" />}
              <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
            </button>

            <a
              href={`https://wa.me/?text=${encodedShareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-3 rounded-xl bg-[#25D366]/20 hover:bg-[#25D366]/30 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-[#25D366]/40"
            >
              <IconWhatsApp className="w-4 h-4 text-[#25D366]" />
              <span>WhatsApp</span>
            </a>
          </div>

          {/* Secondary share buttons: SMS, Email, QR Code */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <a
              href={`sms:?&body=${encodedShareText}`}
              className="py-2.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
            >
              <IconMessage className="w-3.5 h-3.5 text-indigo-400" />
              <span>SMS</span>
            </a>

            <a
              href={`mailto:?subject=Join%20my%20Tambola%20game&body=${encodedShareText}`}
              className="py-2.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
            >
              <IconMail className="w-3.5 h-3.5 text-indigo-400" />
              <span>Email</span>
            </a>

            <button
              onClick={() => setShowQr(!showQr)}
              className="py-2.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
            >
              <IconQrCode className="w-3.5 h-3.5 text-amber-400" />
              <span>{showQr ? 'Hide QR' : 'Show QR'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible QR Code Generator */}
        {showQr && (
          <div className="mt-4 p-4 rounded-2xl bg-[#0B0F19] border border-[#232D42] flex flex-col items-center justify-center text-center">
            <div className="p-2.5 bg-white rounded-xl shadow-md inline-block">
              <div dangerouslySetInnerHTML={{ __html: qrSvgMarkup }} />
            </div>
            <p className="text-xs text-slate-400 mt-2.5 font-medium">
              Players can point their phone camera at this QR code to join instantly
            </p>
          </div>
        )}

        {/* Players List Section */}
        <div className="mt-5 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <IconUser className="w-4 h-4 text-indigo-400" />
              <h4 className="text-sm font-black text-white">
                Joined Players ({players.length}/10)
              </h4>
            </div>
            {isFull && (
              <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 border border-amber-800 px-2.5 py-0.5 rounded-full">
                Room is full
              </span>
            )}
          </div>

          {players.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#0B0F19] border border-[#232D42] text-center text-xs text-slate-400">
              No players joined yet. Share the code or link above!
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
              {players.map((player, idx) => (
                <div
                  key={player.id || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#0B0F19] border border-[#232D42]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-700 text-indigo-300 text-xs font-black font-num flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-slate-100 truncate max-w-[190px] sm:max-w-[260px]">
                      {player.name}
                    </span>
                  </div>

                  {isHost && onRemovePlayer && (
                    <button
                      onClick={() => onRemovePlayer(player.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors"
                      title="Remove player"
                      aria-label={`Remove ${player.name}`}
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
