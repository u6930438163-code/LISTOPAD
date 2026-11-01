import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';

// Safely load Firebase config from provisioned JSON or fallback environment
let firebaseConfig: any = null;
try {
  // @ts-ignore
  import('../../firebase-applet-config.json').then((cfg) => {
    firebaseConfig = cfg.default || cfg;
  }).catch(() => {});
} catch (_e) {}

// In-memory token cache ONLY — NEVER stored in localStorage or sessionStorage
let inMemoryAccessToken: string | null = null;
let cachedUser: User | null = null;

export const GOOGLE_PHOTOS_SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.readonly',
];

export interface GooglePhotoItem {
  id: string;
  filename: string;
  baseUrl: string;
  mimeType: string;
  creationTime?: string;
  mediaMetadata?: {
    width?: string;
    height?: string;
    photo?: {
      cameraMake?: string;
      cameraModel?: string;
    };
  };
}

export type IntegrationStatus = 'nie skonfigurowano' | 'oczekuje na autoryzację' | 'połączono' | 'błąd';

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  
  const config = firebaseConfig || {
    projectId: 'gen-lang-client-0695096289',
    appId: '1:313084960598:web:2baae20c3030857a5180f7',
    apiKey: 'AIzaSyAIydPSb0yoMsvoTdZ__qludqXxkMFzCXc',
    authDomain: 'gen-lang-client-0695096289.firebaseapp.com',
  };
  return initializeApp(config);
}

export function initPhotosAuthListener(
  onStateChange: (user: User | null, token: string | null) => void
) {
  try {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    return onAuthStateChanged(auth, (user) => {
      cachedUser = user;
      if (!user) {
        inMemoryAccessToken = null;
      }
      onStateChange(user, inMemoryAccessToken);
    });
  } catch (err) {
    console.warn('initPhotosAuthListener error:', err);
    return () => {};
  }
}

export async function connectGooglePhotos(): Promise<{ user: User; accessToken: string }> {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  
  const provider = new GoogleAuthProvider();
  GOOGLE_PHOTOS_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline',
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error('Nie udało się uzyskać tokenu dostępu OAuth 2.0 z Google.');
    }

    inMemoryAccessToken = token;
    cachedUser = result.user;
    return { user: result.user, accessToken: token };
  } catch (err: any) {
    inMemoryAccessToken = null;
    throw err;
  }
}

export async function disconnectGooglePhotos(): Promise<void> {
  try {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    await firebaseSignOut(auth);
  } finally {
    inMemoryAccessToken = null;
    cachedUser = null;
  }
}

export async function checkGooglePhotosStatus(): Promise<{
  status: IntegrationStatus;
  message: string;
  userEmail?: string;
  tokenExpiresIn?: number;
}> {
  if (!inMemoryAccessToken) {
    return {
      status: 'nie skonfigurowano',
      message: 'Brak aktywnego tokenu w pamięci. Wymagana autoryzacja OAuth 2.0.'
    };
  }

  try {
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${inMemoryAccessToken}`);
    if (!tokenInfoRes.ok) {
      inMemoryAccessToken = null;
      return {
        status: 'błąd',
        message: 'Token OAuth 2.0 wygasł lub został odrzucony przez serwery Google.'
      };
    }

    const tokenInfo = await tokenInfoRes.json();
    const scopes = (tokenInfo.scope || '').split(' ');
    const hasPhotosScope = scopes.some((s: string) =>
      s.includes('photoslibrary') || s.includes('photopicker')
    );

    if (!hasPhotosScope) {
      return {
        status: 'błąd',
        message: 'Token został nadany, ale brakuje uprawnień do Google Photos Library.',
        userEmail: tokenInfo.email
      };
    }

    return {
      status: 'połączono',
      message: `Połączono pomyślnie z kontem ${tokenInfo.email || cachedUser?.email || ''}.`,
      userEmail: tokenInfo.email || cachedUser?.email || '',
      tokenExpiresIn: Number(tokenInfo.expires_in) || 3600
    };
  } catch (err: any) {
    return {
      status: 'błąd',
      message: `Błąd weryfikacji połączenia: ${err.message}`
    };
  }
}

export async function fetchGooglePhotosList(pageSize = 24): Promise<{
  items: GooglePhotoItem[];
  nextPageToken?: string;
}> {
  if (!inMemoryAccessToken) {
    throw new Error('Wymagana autoryzacja OAuth 2.0 przed pobraniem zdjęć.');
  }

  const res = await fetch(`https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${pageSize}`, {
    headers: {
      Authorization: `Bearer ${inMemoryAccessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      errJson?.error?.message || `Błąd pobierania Google Photos (${res.status} ${res.statusText})`
    );
  }

  const data = await res.json();
  return {
    items: data.mediaItems || [],
    nextPageToken: data.nextPageToken,
  };
}

export function getInMemoryAccessToken(): string | null {
  return inMemoryAccessToken;
}
