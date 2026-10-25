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
import { TambolaRoom, ViewState, ToastMessage } from './types';
import {
  createGameRoom,
  joinGameRoom,
  subscribeToRoom,
  sha256,
  getLocalRoom
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

  // Check URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('room') || params.get('code');
    if (codeParam) {
      const clean = codeParam.trim().toUpperCase();
      setUrlRoomCode(clean);

      // Check if user is host of this room
      const savedHostToken = localStorage.getItem(`tambola_host_token_${clean}`);
      if (savedHostToken) {
        setHostToken(savedHostToken);
      }
    }
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

  // Handle Room Subscription
  useEffect(() => {
    if (!room?.code || viewState === 'home') return;

    const unsubscribe = subscribeToRoom(
      room.code,
      updatedRoom => {
        if (!updatedRoom) {
          showToast('Game room closed or not found', 'error');
          setViewState('home');
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

  // Host Action: Resume Game
  const handleResumeHost = async (code: string, token: string) => {
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
  };

  // Player Action: Join Game
  const handleJoinGame = async (code: string, name: string) => {
    const existingPlayerId = localStorage.getItem(`tambola_player_id_${code}`) || undefined;
    const { playerId, room: joinedRoom } = await joinGameRoom(code, name, existingPlayerId);
    setRoom(joinedRoom);
    setPlayerName(name);
    setViewState('player');
    showToast(`Welcome ${name}! Joined room ${code}.`, 'success');
  };

  // Leave to home
  const handleBackToHome = () => {
    setViewState('home');
    setRoom(null);
  };

  // Direct State Updater from screen actions for 0ms latency
  const handleUpdateRoom = useCallback((updatedRoom: TambolaRoom) => {
    setRoom(updatedRoom);
  }, []);

  return (
    <div className="min-h-dvh bg-[#0B1220] text-slate-100 flex flex-col">
      {/* Toast Overlay */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* View Router */}
      {viewState === 'home' && (
        <HomeScreen
          initialCode={urlRoomCode}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onResumeHost={handleResumeHost}
          onOpenGuide={() => setIsGuideOpen(true)}
          onShowToast={showToast}
        />
      )}

      {viewState === 'caller' && room && (
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

      {viewState === 'player' && room && (
        <PlayerScreen
          room={room}
          playerName={playerName}
          voiceEnabled={voiceEnabled}
          onToggleVoice={toggleVoice}
          onBackToHome={handleBackToHome}
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
