// ============================================================================
// FIREBASE CONFIGURATION
// Configured with your live Firebase Project: my-tambola-game
// ============================================================================

export interface FirebaseAppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const FIREBASE_CONFIG: FirebaseAppConfig = {
  apiKey: "AIzaSyBk2CtM96bojo736Ii799wTq2dYzGj_G3E",
  authDomain: "my-tambola-game.firebaseapp.com",
  projectId: "my-tambola-game",
  storageBucket: "my-tambola-game.firebasestorage.app",
  messagingSenderId: "119351545823",
  appId: "1:119351545823:web:375225e5dcd0e88a1b7e6a"
};

/**
 * Checks if real Firebase credentials are provided via window, localStorage, or config file.
 */
export function isFirebaseConfigured(): boolean {
  // 1. Check window.FIREBASE_CONFIG (from index.html)
  if (typeof window !== 'undefined' && (window as unknown as { FIREBASE_CONFIG?: FirebaseAppConfig }).FIREBASE_CONFIG) {
    const winCfg = (window as unknown as { FIREBASE_CONFIG: FirebaseAppConfig }).FIREBASE_CONFIG;
    if (winCfg.apiKey && winCfg.apiKey !== 'YOUR_API_KEY' && winCfg.projectId && winCfg.projectId !== 'YOUR_PROJECT_ID') {
      return true;
    }
  }

  // 2. Check in-app localStorage override
  const localConfigStr = typeof localStorage !== 'undefined' ? localStorage.getItem('tambola_custom_firebase_config') : null;
  if (localConfigStr) {
    try {
      const parsed = JSON.parse(localConfigStr);
      if (parsed.apiKey && parsed.apiKey !== 'YOUR_API_KEY' && parsed.projectId && parsed.projectId !== 'YOUR_PROJECT_ID') {
        return true;
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  // 3. Check constant in this file
  return (
    Boolean(FIREBASE_CONFIG.apiKey) &&
    FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
    Boolean(FIREBASE_CONFIG.projectId) &&
    FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID"
  );
}

/**
 * Retrieves the effective Firebase configuration.
 */
export function getActiveFirebaseConfig(): FirebaseAppConfig {
  // 1. Window config (from index.html)
  if (typeof window !== 'undefined' && (window as unknown as { FIREBASE_CONFIG?: FirebaseAppConfig }).FIREBASE_CONFIG) {
    const winCfg = (window as unknown as { FIREBASE_CONFIG: FirebaseAppConfig }).FIREBASE_CONFIG;
    if (winCfg.apiKey && winCfg.apiKey !== 'YOUR_API_KEY') {
      return winCfg;
    }
  }

  // 2. LocalStorage config
  if (typeof localStorage !== 'undefined') {
    const localConfigStr = localStorage.getItem('tambola_custom_firebase_config');
    if (localConfigStr) {
      try {
        const parsed = JSON.parse(localConfigStr);
        if (parsed.apiKey && parsed.apiKey !== 'YOUR_API_KEY') {
          return parsed;
        }
      } catch {
        // ignore
      }
    }
  }

  // 3. File config
  return FIREBASE_CONFIG;
}
