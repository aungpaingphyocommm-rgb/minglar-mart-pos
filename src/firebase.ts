import { FirebaseApp, FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  User,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import {
  Firestore,
  clearIndexedDbPersistence,
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
} from 'firebase/firestore';

interface EnvFirebaseConfig extends FirebaseOptions {
  firestoreDatabaseId?: string;
}

function extractKnownFirebaseFields(text: string): EnvFirebaseConfig | null {
  const keys: Array<keyof EnvFirebaseConfig> = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
    'measurementId',
    'firestoreDatabaseId',
  ];
  const result: Record<string, string> = {};
  for (const key of keys) {
    const regex = new RegExp(`(?:["']?${key}["']?)\\s*:\\s*["']([^"']+)["']`);
    const match = text.match(regex);
    if (match?.[1]) {
      result[key] = match[1].trim();
    }
  }
  if (result.apiKey && result.projectId) {
    return result as EnvFirebaseConfig;
  }
  return null;
}

function parseFlexibleFirebaseConfig(raw: string): EnvFirebaseConfig | null {
  let text = raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();

  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"') && text.includes('\\"'))
  ) {
    text = text.slice(1, -1).trim();
  }

  // 1. Direct JSON parse (and double-encoded JSON)
  try {
    let parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      return parsed as EnvFirebaseConfig;
    }
  } catch {
    // Continue to flexible parsing
  }

  // 2. Unescape \" if user pasted escaped JSON
  if (text.includes('\\"')) {
    const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    try {
      const parsed = JSON.parse(unescaped) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as EnvFirebaseConfig;
      }
    } catch {
      text = unescaped;
    }
  }

  // 3. Normalize Firebase Console JS object snippet (const firebaseConfig = { ... };)
  let jsLike = text
    .replace(/^(?:export\s+default\s+|(?:const|let|var)\s+\w+\s*=\s*)/, '')
    .replace(/;\s*$/, '')
    .trim();

  const firstBrace = jsLike.indexOf('{');
  const lastBrace = jsLike.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsLike = jsLike.slice(firstBrace, lastBrace + 1);
  } else if (!jsLike.startsWith('{')) {
    jsLike = `{${jsLike}}`;
  }

  // Convert single-quoted values/keys and quote unquoted keys while preserving string literals
  const normalizedJson = jsLike
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) =>
      JSON.stringify(inner.replace(/\\'/g, "'"))
    )
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1');

  try {
    const parsed = JSON.parse(normalizedJson) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as EnvFirebaseConfig;
    }
  } catch {
    // Fallback to regex field extraction
  }

  return extractKnownFirebaseFields(text);
}

function loadConfigFromEnv(): {
  config: EnvFirebaseConfig | null;
  databaseId: string | undefined;
  error: string | null;
} {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw || !raw.trim()) {
    return {
      config: null,
      databaseId: undefined,
      error: 'VITE_FIREBASE_CONFIG environment variable is not configured.',
    };
  }

  const parsed = parseFlexibleFirebaseConfig(raw);
  if (!parsed) {
    return {
      config: null,
      databaseId: undefined,
      error: 'VITE_FIREBASE_CONFIG contains invalid JSON.',
    };
  }

  if (
    typeof parsed.apiKey !== 'string' ||
    !parsed.apiKey.trim() ||
    typeof parsed.projectId !== 'string' ||
    !parsed.projectId.trim()
  ) {
    return {
      config: null,
      databaseId: undefined,
      error: 'VITE_FIREBASE_CONFIG must include valid "apiKey" and "projectId" fields.',
    };
  }

  const envDbId = (import.meta.env.VITE_FIREBASE_DATABASE_ID ?? '').trim();
  const jsonDbId =
    typeof parsed.firestoreDatabaseId === 'string' ? parsed.firestoreDatabaseId.trim() : '';
  const resolvedDbId = envDbId || jsonDbId;
  const databaseId = resolvedDbId && resolvedDbId !== '(default)' ? resolvedDbId : undefined;

  const cleanOptions: FirebaseOptions = {
    apiKey: parsed.apiKey.trim(),
    authDomain: parsed.authDomain?.trim(),
    projectId: parsed.projectId.trim(),
    storageBucket: parsed.storageBucket?.trim(),
    messagingSenderId: parsed.messagingSenderId?.trim(),
    appId: parsed.appId?.trim(),
    measurementId: parsed.measurementId?.trim(),
  };

  return { config: cleanOptions, databaseId, error: null };
}

const envConfig = loadConfigFromEnv();

export const isFirebaseConfigured = Boolean(envConfig.config);
export const firebaseConfigError: string | null = envConfig.error;
export const firebaseProjectId: string | null = envConfig.config?.projectId ?? null;

function initFirebaseServices(): {
  app: FirebaseApp | null;
  db: Firestore | null;
  auth: Auth | null;
  persistenceEnabled: boolean;
  persistenceReason: string | null;
} {
  if (!envConfig.config) {
    return {
      app: null,
      db: null,
      auth: null,
      persistenceEnabled: false,
      persistenceReason: 'not-configured',
    };
  }

  const firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(envConfig.config);
  const firebaseAuth = getAuth(firebaseApp);

  try {
    const firestoreDb = initializeFirestore(
      firebaseApp,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      envConfig.databaseId
    );
    return {
      app: firebaseApp,
      db: firestoreDb,
      auth: firebaseAuth,
      persistenceEnabled: true,
      persistenceReason: null,
    };
  } catch (err) {
    const fallbackDb = envConfig.databaseId
      ? getFirestore(firebaseApp, envConfig.databaseId)
      : getFirestore(firebaseApp);
    return {
      app: firebaseApp,
      db: fallbackDb,
      auth: firebaseAuth,
      persistenceEnabled: true,
      persistenceReason: err instanceof Error ? err.message : 'already-initialized',
    };
  }
}

const services = initFirebaseServices();
export const db: Firestore | null = services.db;
export const auth: Auth | null = services.auth;

// Persist anonymous auth session locally across reloads/restarts
const authPersistencePromise = auth
  ? setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Auth persistence setup warning:', err);
    })
  : Promise.resolve();

let pendingAnonSignIn: Promise<User> | null = null;

export async function ensureAnonymousAuth(): Promise<User> {
  if (!auth || !isFirebaseConfigured) {
    throw new Error(
      firebaseConfigError ??
        'Firebase is not configured. Please set VITE_FIREBASE_CONFIG environment variable.'
    );
  }

  if (auth.currentUser?.isAnonymous) {
    return auth.currentUser;
  }

  if (!pendingAnonSignIn) {
    pendingAnonSignIn = (async () => {
      await authPersistencePromise;
      await auth.authStateReady();

      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        await signOut(auth);
      }

      if (auth.currentUser?.isAnonymous) {
        return auth.currentUser;
      }

      try {
        const cred = await signInAnonymously(auth);
        return cred.user;
      } catch (err: unknown) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: string }).code)
            : '';
        if (
          code === 'auth/operation-not-allowed' ||
          code === 'auth/admin-restricted-operation'
        ) {
          throw new Error(
            'Anonymous Auth is disabled in Firebase Console. Enable Authentication > Sign-in method > Anonymous.'
          );
        }
        throw err;
      }
    })().finally(() => {
      pendingAnonSignIn = null;
    });
  }

  return pendingAnonSignIn;
}

if (auth) {
  // Keep the app permanently signed in anonymously without user intervention
  onAuthStateChanged(auth, (user) => {
    if ((!user || !user.isAnonymous) && (typeof navigator === 'undefined' || navigator.onLine)) {
      void ensureAnonymousAuth().catch((err) => {
        console.warn('Anonymous Auth auto-login warning:', err);
      });
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (!auth.currentUser?.isAnonymous) {
        void ensureAnonymousAuth().catch((err) => {
          console.warn('Anonymous Auth reconnect warning:', err);
        });
      }
    });
  }
}

export const persistencePromise: Promise<{ enabled: boolean; reason: string | null }> =
  Promise.resolve({
    enabled: services.persistenceEnabled,
    reason: services.persistenceReason,
  });

const CACHE_RECOVERY_KEY = 'mingalar_firestore_cache_recovered';

export async function recoverFromTargetIdConflict(errMsg: string): Promise<boolean> {
  if (!db || !errMsg.includes('Target ID already exists')) return false;
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(CACHE_RECOVERY_KEY)) return false;
    sessionStorage.setItem(CACHE_RECOVERY_KEY, '1');
    await terminate(db);
    await clearIndexedDbPersistence(db);
    window.location.reload();
    return true;
  } catch (err) {
    console.warn('Firestore cache recovery failed:', err);
    return false;
  }
}

// Startup connection validation
async function testConnection() {
  if (!db) return;
  try {
    await persistencePromise;
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
