import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin is the *only* way this app touches Firestore. There is no
 * client-side Firebase SDK anywhere in the bundle, which is what lets the
 * Firestore rules deny every direct browser read and write (see
 * firestore.rules) while the server keeps full access via the service account.
 */

const APP_NAME = 'mcu-endgame-quiz';

/** Thrown when the deployment is missing credentials. Never shown to users verbatim. */
export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseConfigError';
  }
}

interface ServiceAccountConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Newlines in a PEM key do not survive most dashboard text inputs, so they are
 * conventionally stored as the two characters `\n`. Vercel also wraps values
 * in quotes if you paste them with quotes, so strip those too.
 */
function normalizePrivateKey(raw: string): string {
  const unquoted = raw.trim().replace(/^["']|["']$/g, '');
  return unquoted.includes('\\n') ? unquoted.replace(/\\n/g, '\n') : unquoted;
}

function readServiceAccount(): ServiceAccountConfig {
  // Option A: the whole service-account JSON in one variable (base64 or raw).
  const blob = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (blob) {
    const json = blob.startsWith('{') ? blob : Buffer.from(blob, 'base64').toString('utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new FirebaseConfigError('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64 JSON.');
    }
    const record = parsed as Record<string, unknown>;
    const projectId = typeof record.project_id === 'string' ? record.project_id : '';
    const clientEmail = typeof record.client_email === 'string' ? record.client_email : '';
    const privateKey = typeof record.private_key === 'string' ? record.private_key : '';
    if (!projectId || !clientEmail || !privateKey) {
      throw new FirebaseConfigError(
        'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key.',
      );
    }
    return { projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
  }

  // Option B: the three values as separate variables.
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const missing = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY',
  ].filter((entry): entry is string => typeof entry === 'string');

  if (missing.length > 0) {
    throw new FirebaseConfigError(
      `Missing Firebase credentials: ${missing.join(', ')}. See .env.example.`,
    );
  }

  return {
    projectId: projectId as string,
    clientEmail: clientEmail as string,
    privateKey: normalizePrivateKey(privateKey as string),
  };
}

function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  const account = readServiceAccount();
  return initializeApp(
    {
      credential: cert({
        projectId: account.projectId,
        clientEmail: account.clientEmail,
        privateKey: account.privateKey,
      }),
      projectId: account.projectId,
    },
    APP_NAME,
  );
}

/**
 * The Firestore handle is cached on `globalThis` rather than in a module
 * variable.
 *
 * Next.js compiles route handlers and server-rendered pages into separate
 * bundles, each with its own copy of this module — so a module-level cache is
 * empty in the second bundle even though `getFirestore()` hands back the very
 * same instance from the Admin SDK's app registry. Calling `settings()` on
 * that already-configured instance throws. A global key is shared by every
 * bundle (and survives dev-server hot reloads), so initialisation happens
 * exactly once per process.
 */
const DB_CACHE_KEY = Symbol.for('mcu-endgame-quiz.firestore');

type SymbolKeyedGlobal = { [key: symbol]: unknown };

/**
 * Lazily initialised Firestore handle. Kept lazy so that a build or a page
 * that never touches the database does not require credentials.
 */
export function getDb(): Firestore {
  const globals = globalThis as SymbolKeyedGlobal;

  const cached = globals[DB_CACHE_KEY];
  if (cached) return cached as Firestore;

  const db = getFirestore(getAdminApp());

  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured by another bundle instance in this process, which is
    // exactly the situation the global cache exists to avoid — and harmless,
    // because the settings are held on the shared instance we just received.
  }

  globals[DB_CACHE_KEY] = db;
  return db;
}

/** Cheap check used by the health endpoint and by friendlier error screens. */
export function isFirebaseConfigured(): boolean {
  try {
    readServiceAccount();
    return true;
  } catch {
    return false;
  }
}
