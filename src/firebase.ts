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
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
} from 'firebase/firestore';

interface EnvFirebaseConfig extends FirebaseOptions {
  firestoreDatabaseId?: string;
}

export const DEFAULT_SHOP_ID = 'mingalar-mart-pos-main';

export function resolveShopId(settingsShopId?: string | null): string {
  const cleanedSettings = settingsShopId?.trim();
  if (cleanedSettings && /^[a-zA-Z0-9_-]{1,128}$/.test(cleanedSettings)) {
    return cleanedSettings;
  }
  const envShop = sanitizeEnvValue(import.meta.env.VITE_FIREBASE_SHOP_ID);
  if (envShop && /^[a-zA-Z0-9_-]{1,128}$/.test(envShop)) {
    return envShop;
  }
  return DEFAULT_SHOP_ID;
}

const MISSING_OR_INVALID_CONFIG_MSG = 'VITE_FIREBASE_CONFIG missing or invalid JSON';

function sanitizeEnvValue(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  let cleaned = val
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();

  // Strip accidental trailing comma copied from a JSON/JS snippet
  if (cleaned.endsWith(',') && !cleaned.startsWith('{')) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Handle double-quoted + trailing comma like '"AIza...",'
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('",')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("',"))
  ) {
    cleaned = cleaned.slice(1, -2).trim();
  }

  if (!cleaned || cleaned === 'undefined' || cleaned === 'null' || cleaned === '...') {
    return undefined;
  }
  return cleaned;
}

function isValidApiKeyFormat(key: string | undefined): key is string {
  if (!key) return false;
  if (/\s/.test(key)) return false;
  if (key.includes('MY_') || key.includes('YOUR_') || key.includes('*')) return false;
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(key);
}

function normalizeJsObjectSnippetToJson(input: string): string {
  let text = input.trim();
  // Strip `export default` or `const firebaseConfig =` prefix and trailing `;`
  text = text.replace(/^(?:export\s+default\s+|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)/, '');
  text = text.replace(/;\s*$/, '').trim();
  // Strip block comments and standalone // comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  text = text.replace(/^\s*\/\/.*$/gm, '');
  // Convert single-quoted values/keys to double-quoted
  text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner: string) => {
    const unescaped = inner.replace(/\\'/g, "'").replace(/"/g, '\\"');
    return `"${unescaped}"`;
  });
  // Quote standard unquoted Firebase config keys
  text = text.replace(
    /([{,]\s*)(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId|firestoreDatabaseId)\s*:/g,
    '$1"$2":'
  );
  // Remove trailing commas before closing brace
  text = text.replace(/,\s*}/g, '}');
  return text;
}

function tryParseJsonObject(raw: string): EnvFirebaseConfig | null {
  let parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed value is not a JSON object');
  }
  return parsed as EnvFirebaseConfig;
}

function parseFirebaseConfigJson(rawConfig: string): EnvFirebaseConfig | null {
  let candidate = rawConfig
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();

  // First attempt: strict JSON.parse (also handles double-encoded JSON strings natively)
  try {
    return tryParseJsonObject(candidate);
  } catch {
    // Continue to normalization fallbacks
  }

  // Strip outer single quotes `'{"apiKey":...}'` if wrapped in shell/dashboard
  if (candidate.startsWith("'") && candidate.endsWith("'")) {
    candidate = candidate.slice(1, -1).trim();
  }

  // Unescape `\"` if user pasted escaped JSON without outer quotes
  if (candidate.includes('\\"') && !candidate.startsWith('"')) {
    candidate = candidate.replace(/\\"/g, '"');
  }

  try {
    return tryParseJsonObject(candidate);
  } catch {
    // Try normalizing Firebase Console JS snippet syntax (unquoted keys, trailing commas, single quotes)
  }

  try {
    const normalized = normalizeJsObjectSnippetToJson(candidate);
    return tryParseJsonObject(normalized);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Invalid JSON syntax';
    // Log parse failure safely without printing raw config or apiKey
    console.error(`Failed to parse VITE_FIREBASE_CONFIG JSON: ${reason}`);
    return null;
  }
}

export type FirebaseConfigSource = 'VITE_FIREBASE_CONFIG' | 'VITE_FIREBASE_*' | null;

function loadConfigFromEnv(): {
  config: FirebaseOptions | null;
  databaseId: string | undefined;
  error: string | null;
  source: FirebaseConfigSource;
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

  const hasRawJson = typeof rawJson === 'string' && rawJson.trim().length > 0;
  const parsedJson = hasRawJson ? parseFirebaseConfigJson(rawJson) : null;

  if (hasRawJson && !parsedJson) {
    return {
      config: null,
      databaseId: undefined,
      error: MISSING_OR_INVALID_CONFIG_MSG,
      source: null,
    };
  }

  const useJsonConfig = Boolean(parsedJson);
  const apiKey = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.apiKey) ?? fallbackApiKey
    : fallbackApiKey;
  const authDomain = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.authDomain) ?? fallbackAuthDomain
    : fallbackAuthDomain;
  const projectId = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.projectId) ?? fallbackProjectId
    : fallbackProjectId;
  const storageBucket = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.storageBucket) ?? fallbackStorageBucket
    : fallbackStorageBucket;
  const messagingSenderId = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.messagingSenderId) ?? fallbackMessagingSenderId
    : fallbackMessagingSenderId;
  const appId = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.appId) ?? fallbackAppId
    : fallbackAppId;
  const measurementId = useJsonConfig
    ? sanitizeEnvValue(parsedJson?.measurementId) ?? fallbackMeasurementId
    : fallbackMeasurementId;

  if (!isValidApiKeyFormat(apiKey) || !projectId) {
    if (typeof apiKey === 'string' && !/^AIza[0-9A-Za-z_-]{30,}$/.test(apiKey)) {
      console.error(
        `Configured Firebase apiKey has invalid format (length=${apiKey.length}). Expected a valid AIza... Web API key.`
      );
    }
    return {
      config: null,
      databaseId: undefined,
      error: MISSING_OR_INVALID_CONFIG_MSG,
      source: null,
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

  return {
    config: cleanOptions,
    databaseId,
    error: null,
    source: useJsonConfig ? 'VITE_FIREBASE_CONFIG' : 'VITE_FIREBASE_*',
  };
}

const envConfig = loadConfigFromEnv();

export const isFirebaseConfigured = Boolean(envConfig.config);
export const firebaseConfigError: string | null = envConfig.error;
export const firebaseProjectId: string | null = envConfig.config?.projectId ?? null;
export const firebaseConfigSource: FirebaseConfigSource = envConfig.source;

const CACHE_RECOVERY_KEY = 'mingalar_firestore_cache_recovered';
const CACHE_MODE_KEY = 'mingalar_firestore_cache_mode';

function shouldUseMemoryCacheFallback(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(CACHE_MODE_KEY) === 'memory';
  } catch {
    return false;
  }
}

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
  const useMemoryCache = shouldUseMemoryCacheFallback();

  try {
    const firestoreDb = initializeFirestore(
      firebaseApp,
      {
        localCache: useMemoryCache
          ? memoryLocalCache()
          : persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
      },
      envConfig.databaseId
    );
    return {
      app: firebaseApp,
      db: firestoreDb,
      auth: firebaseAuth,
      persistenceEnabled: !useMemoryCache,
      persistenceReason: useMemoryCache ? 'memory-fallback' : null,
    };
  } catch (err) {
    const fallbackDb = envConfig.databaseId
      ? getFirestore(firebaseApp, envConfig.databaseId)
      : getFirestore(firebaseApp);
    return {
      app: firebaseApp,
      db: fallbackDb,
      auth: firebaseAuth,
      persistenceEnabled: !useMemoryCache,
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
            `Firebase Auth rejected the API key for project "${firebaseProjectId ?? 'unknown'}" (source: ${firebaseConfigSource ?? 'unknown'}).`
          );
          throw new Error(
            `Firebase API key rejected (auth/api-key-not-valid) for project "${firebaseProjectId ?? 'unknown'}". Check that VITE_FIREBASE_CONFIG matches Firebase Project Settings (delete any stale VITE_FIREBASE_API_KEY), enable Authentication (Identity Toolkit API), and allow your domain in Google Cloud API Key restrictions.`
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

let recoveryInProgress = false;

export function isFirestoreCacheError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return (
    lower.includes('target id already exists') ||
    lower.includes('indexeddbtransactionerror') ||
    lower.includes('allocate target') ||
    lower.includes('indexeddb transaction') ||
    lower.includes('backing store') ||
    (lower.includes('aborterror') && lower.includes('indexeddb'))
  );
}

async function deleteFirestoreIndexedDbDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  try {
    const dbs = await indexedDB.databases();
    const targets = dbs
      .map((entry) => entry.name)
      .filter((name): name is string => Boolean(name && name.startsWith('firestore/')));
    await Promise.all(
      targets.map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            const timer = setTimeout(resolve, 1500);
            req.onsuccess = () => {
              clearTimeout(timer);
              resolve();
            };
            req.onerror = () => {
              clearTimeout(timer);
              resolve();
            };
            req.onblocked = () => {
              clearTimeout(timer);
              resolve();
            };
          })
      )
    );
  } catch {
    // Ignore unsupported indexedDB.databases() environments
  }
}

export async function recoverFromFirestoreCacheError(errMsg: string): Promise<boolean> {
  if (!db || !isFirestoreCacheError(errMsg)) return false;
  if (typeof window === 'undefined') return false;
  if (recoveryInProgress) return true;

  let currentMode: string | null = null;
  let recoveryStage: string | null = null;
  try {
    currentMode = sessionStorage.getItem(CACHE_MODE_KEY);
    recoveryStage = sessionStorage.getItem(CACHE_RECOVERY_KEY);
  } catch {
    return false;
  }

  // Already running in memory-cache fallback mode; do not reload in a loop
  if (currentMode === 'memory') return false;

  recoveryInProgress = true;
  try {
    if (recoveryStage !== 'cleared') {
      sessionStorage.setItem(CACHE_RECOVERY_KEY, 'cleared');
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
        await deleteFirestoreIndexedDbDatabases();
      } catch (clearErr) {
        console.warn('Firestore IndexedDB clear failed, switching to memory cache:', clearErr);
        sessionStorage.setItem(CACHE_MODE_KEY, 'memory');
      }
      window.location.reload();
      return true;
    }

    // Tier 2: clearing IndexedDB once was not enough in this browser/iframe -> fall back to memoryLocalCache
    sessionStorage.setItem(CACHE_MODE_KEY, 'memory');
    try {
      await terminate(db);
      await deleteFirestoreIndexedDbDatabases();
    } catch {
      // Proceed to reload with memoryLocalCache
    }
    window.location.reload();
    return true;
  } catch (err) {
    console.warn('Firestore cache recovery failed:', err);
    recoveryInProgress = false;
    return false;
  }
}

export const recoverFromTargetIdConflict = recoverFromFirestoreCacheError;

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
