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

const MISSING_OR_INVALID_CONFIG_MSG = 'VITE_FIREBASE_CONFIG missing or invalid JSON';

function sanitizeEnvValue(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  let cleaned = val.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (!cleaned || cleaned === 'undefined' || cleaned === 'null' || cleaned === '...') {
    return undefined;
  }
  return cleaned;
}

function isValidApiKeyFormat(key: string | undefined): key is string {
  if (!key) return false;
  if (key.length < 20) return false;
  if (/\s/.test(key)) return false;
  if (key.includes('MY_') || key.includes('YOUR_')) return false;
  return true;
}

function parseFirebaseConfigJson(rawConfig: string): EnvFirebaseConfig | null {
  let candidate = rawConfig
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();

  if (
    (candidate.startsWith("'") && candidate.endsWith("'")) ||
    (candidate.startsWith('"') && candidate.endsWith('"') && candidate.includes('\\"'))
  ) {
    candidate = candidate.slice(1, -1).trim();
  }

  try {
    let parsed: unknown = JSON.parse(candidate);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Parsed value is not a JSON object');
    }
    return parsed as EnvFirebaseConfig;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Invalid JSON syntax';
    // Log parse failure safely without printing raw config or apiKey
    console.error(`Failed to parse VITE_FIREBASE_CONFIG JSON: ${reason}`);
    return null;
  }
}

function loadConfigFromEnv(): {
  config: FirebaseOptions | null;
  databaseId: string | undefined;
  error: string | null;
} {
  // Vite replaces static import.meta.env.VITE_* references at build time
  const rawJson = import.meta.env.VITE_FIREBASE_CONFIG;
  const fallbackApiKey = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_API_KEY);
  const fallbackAuthDomain = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
  const fallbackProjectId = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID);
  const fallbackStorageBucket = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);
  const fallbackMessagingSenderId = sanitizeEnvValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  );
  const fallbackAppId = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_APP_ID);
  const fallbackMeasurementId = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID);
  const fallbackDatabaseId = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_DATABASE_ID);

  let parsedJson: EnvFirebaseConfig | null = null;
  if (typeof rawJson === 'string' && rawJson.trim().length > 0) {
    parsedJson = parseFirebaseConfigJson(rawJson);
  }

  const apiKey = sanitizeEnvValue(parsedJson?.apiKey) ?? fallbackApiKey;
  const authDomain = sanitizeEnvValue(parsedJson?.authDomain) ?? fallbackAuthDomain;
  const projectId = sanitizeEnvValue(parsedJson?.projectId) ?? fallbackProjectId;
  const storageBucket = sanitizeEnvValue(parsedJson?.storageBucket) ?? fallbackStorageBucket;
  const messagingSenderId =
    sanitizeEnvValue(parsedJson?.messagingSenderId) ?? fallbackMessagingSenderId;
  const appId = sanitizeEnvValue(parsedJson?.appId) ?? fallbackAppId;
  const measurementId = sanitizeEnvValue(parsedJson?.measurementId) ?? fallbackMeasurementId;

  if (!isValidApiKeyFormat(apiKey) || !projectId) {
    return {
      config: null,
      databaseId: undefined,
      error: MISSING_OR_INVALID_CONFIG_MSG,
    };
  }

  const jsonDbId = sanitizeEnvValue(parsedJson?.firestoreDatabaseId);
  const resolvedDbId = fallbackDatabaseId ?? jsonDbId;
  const databaseId = resolvedDbId && resolvedDbId !== '(default)' ? resolvedDbId : undefined;

  const cleanOptions: FirebaseOptions = {
    apiKey,
    ...(authDomain ? { authDomain } : {}),
    projectId,
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
    ...(appId ? { appId } : {}),
    ...(measurementId ? { measurementId } : {}),
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
        if (code === 'auth/api-key-not-valid' || code.includes('api-key-not-valid')) {
          console.error(
            'Firebase Auth rejected the configured API key (auth/api-key-not-valid). Check VITE_FIREBASE_CONFIG / VITE_FIREBASE_API_KEY and Google Cloud API key HTTP referrer restrictions.'
          );
          throw new Error(
            'Firebase API key rejected (auth/api-key-not-valid). Verify VITE_FIREBASE_CONFIG / VITE_FIREBASE_API_KEY in Cloudflare and allow your domain in Google Cloud API Key restrictions.'
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
