import React, { useState } from 'react';
import { IconClose, IconCopy, IconCheck, IconShield } from './Icons';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  onConfigSaved?: () => void;
}

export const FIRESTORE_RULES_TEXT = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /rooms/{roomId} {
      function isAuth() {
        return request.auth != null && request.auth.uid != null;
      }
      function isHost() {
        return isAuth() && resource.data.hostUid == request.auth.uid;
      }

      allow read: if isAuth();

      allow create: if isAuth()
        && request.resource.data.hostUid == request.auth.uid
        && request.resource.data.code == roomId
        && request.resource.data.code is string
        && request.resource.data.code.size() == 6
        && request.resource.data.calledNumbers.size() == 0
        && request.resource.data.currentNumber == null;

      allow update: if isHost()
        && request.resource.data.hostUid == resource.data.hostUid
        && request.resource.data.code == resource.data.code
        && request.resource.data.createdAt == resource.data.createdAt;

      allow delete: if isHost();

      match /players/{playerUid} {
        allow read: if isAuth();
        allow create: if isAuth() && request.auth.uid == playerUid && request.resource.data.id == request.auth.uid;
        allow update: if isAuth() && request.auth.uid == playerUid;
        allow delete: if isAuth() && (
          request.auth.uid == playerUid || request.auth.uid == get(/databases/$(database)/documents/rooms/$(roomId)).data.hostUid
        );
      }
    }
  }
}`;

export const GuideModal: React.FC<GuideModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
  onConfigSaved
}) => {
  const [copiedRules, setCopiedRules] = useState(false);
  const [customConfigInput, setCustomConfigInput] = useState('');

  if (!isOpen) return null;

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_RULES_TEXT);
      setCopiedRules(true);
      onShowToast('Firestore rules copied to clipboard', 'success');
      setTimeout(() => setCopiedRules(false), 2000);
    } catch {
      onShowToast('Failed to copy rules', 'error');
    }
  };

  const handleSaveCustomConfig = () => {
    try {
      const parsed = JSON.parse(customConfigInput);
      if (!parsed.apiKey || !parsed.projectId) {
        onShowToast('Config must include apiKey and projectId', 'error');
        return;
      }
      localStorage.setItem('tambola_custom_firebase_config', JSON.stringify(parsed));
      onShowToast('Firebase configuration saved successfully', 'success');
      if (onConfigSaved) onConfigSaved();
      onClose();
    } catch {
      onShowToast('Invalid JSON format. Please paste valid Firebase config JSON', 'error');
    }
  };

  const handleClearCustomConfig = () => {
    localStorage.removeItem('tambola_custom_firebase_config');
    onShowToast('Reverted to default / local demo mode', 'info');
    if (onConfigSaved) onConfigSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="relative w-full max-w-xl max-h-[88dvh] bg-[#151C2C] border border-[#232D42] rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col z-10 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Firebase Setup & Deployment Guide"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <IconShield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                Firebase Setup & Deployment
              </h3>
              <p className="text-xs font-semibold text-indigo-400">Project: my-tambola-game</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto no-scrollbar space-y-5 py-4 text-xs sm:text-sm text-slate-300">
          {/* Step-by-Step Deployment Guide */}
          <div>
            <h4 className="font-black text-amber-400 uppercase tracking-wider text-xs mb-3">
              Required Firebase Steps
            </h4>
            <ol className="space-y-3 pl-1">
              <li className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong className="text-white">Enable Anonymous Authentication (Important):</strong> In Firebase Console, go to <strong>Build → Authentication → Sign-in method</strong>, click <strong>Anonymous</strong>, switch it to <strong>Enable</strong>, and click <strong>Save</strong>. This allows seamless zero-account security.
                </div>
              </li>

              <li className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong className="text-white">Publish Security Rules:</strong> Under <strong>Firestore Database → Rules</strong> tab, copy the security rules below, paste them in, and click <strong>Publish</strong>.
                </div>
              </li>

              <li className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <strong className="text-white">Deploy Hosting:</strong> Run <code className="text-amber-300">firebase deploy</code> in your terminal to publish to Firebase Hosting.
                </div>
              </li>
            </ol>
          </div>

          {/* Firestore Security Rules Box */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-black text-amber-400 uppercase tracking-wider text-xs">
                Production Firestore Security Rules
              </h4>
              <button
                onClick={handleCopyRules}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                {copiedRules ? <IconCheck className="w-3.5 h-3.5 text-amber-400" /> : <IconCopy className="w-3.5 h-3.5" />}
                <span>{copiedRules ? 'Copied' : 'Copy Rules'}</span>
              </button>
            </div>
            <pre className="p-3 bg-[#0B0F19] rounded-xl border border-slate-800 text-[11px] font-num text-slate-300 overflow-x-auto max-h-44">
              {FIRESTORE_RULES_TEXT}
            </pre>
          </div>

          {/* Quick Paste Firebase Config */}
          <div className="p-3.5 bg-[#0B0F19] rounded-2xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                Live Firebase Project Configured
              </span>
              <button
                onClick={handleClearCustomConfig}
                className="text-[11px] text-slate-400 hover:text-red-400 underline"
              >
                Reset to local mode
              </button>
            </div>
            <textarea
              value={customConfigInput}
              onChange={e => setCustomConfigInput(e.target.value)}
              placeholder='{"apiKey": "AIzaSy...", "projectId": "my-tambola-game", ...}'
              rows={3}
              className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-num text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
            />
            <button
              onClick={handleSaveCustomConfig}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider transition-all"
            >
              Update Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
