export interface TambolaPlayer {
  id: string;
  name: string;
  joinedAt: number;
}

export interface TambolaRoom {
  code: string;
  hostUid: string;
  hostTokenHash?: string;
  currentNumber: number | null;
  calledNumbers: number[];
  players: TambolaPlayer[];
  hostHeartbeat: number;
  autoInterval: number; // in seconds, default 6
  createdAt: number;
  status: 'waiting' | 'active' | 'completed';
}

export type ViewState = 'home' | 'caller' | 'player';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
}
