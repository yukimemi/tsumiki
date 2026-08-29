// Firebase app singleton.
//
// Config comes from `VITE_FIREBASE_*` env vars (see .env.example). The getters
// are lazy so an unconfigured build still boots and can render the Japanese
// "settings missing" screen instead of throwing while modules evaluate.

import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

// Local development against `firebase emulators:start`. Opt-in so a stray
// build can never point production at localhost. Ports mirror the
// `emulators` block in firebase.json; keep the two in step.
const useEmulator = import.meta.env.VITE_USE_EMULATOR === "true";
const EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8085;
const AUTH_PORT = 9099;
const STORAGE_PORT = 9199;

// App Check attests that a request came from this app running in a real
// browser. Signup is open, so the rules can say who may write but not how
// often — this is what keeps a script from creating households in a loop.
// Absent key means "not configured": the app still works, it just sends no
// attestation, which is served normally until enforcement is turned on in the
// Firebase console (see README).
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;

/**
 * Runs between initializeApp() and the first call into any Firebase service.
 * That ordering is the whole reason this lives inside `ensureApp()` rather
 * than at the entry point: every service getter below is lazy, so `ensureApp()`
 * is the one moment guaranteed to come first.
 *
 * Skipped against the emulators, which do not verify tokens and cannot serve
 * reCAPTCHA from 127.0.0.1 anyway.
 */
function startAppCheck(instance: FirebaseApp): void {
  if (!appCheckSiteKey || useEmulator) return;

  // Developing against the *real* project, opt-in in three states:
  //
  //   unset      real reCAPTCHA, which works from localhost as long as the
  //              site key lists it. The default, deliberately — a debug token
  //              nobody registered attests less than a real challenge does.
  //   "true"     ask the SDK to mint a debug token, persist it and log it.
  //              That logged value is the bootstrap: register it in the App
  //              Check console, then paste it back here.
  //   "<token>"  use that token.
  //
  // The SDK enables debug mode only for a boolean `true` or a string
  // (`initializeDebugMode`), which is why "true" has to be converted rather
  // than passed through as text — as text it would be read as a token whose
  // value is literally "true".
  //
  // Guarded on DEV so none of this can be inlined into a production bundle,
  // where a debug token would be a published bypass of the thing App Check
  // exists to enforce.
  if (import.meta.env.DEV) {
    const debug = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
    if (debug) {
      (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
        debug === "true" ? true : debug;
    }
  }

  try {
    initializeAppCheck(instance, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // A bad site key must not white-screen the app. With enforcement on the
    // requests fail either way, and they show up as unverified traffic in the
    // App Check console — which is where you would go looking.
    console.warn("[app-check] initialisation failed", e);
  }
}

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

function ensureApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase の設定が見つかりません。.env に VITE_FIREBASE_* を設定してください",
    );
  }
  if (!app) {
    app = initializeApp(config);
    startAppCheck(app);
  }
  return app;
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(ensureApp());
    if (useEmulator) {
      connectAuthEmulator(authInstance, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
        disableWarnings: true,
      });
    }
  }
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(ensureApp());
    if (useEmulator) {
      connectFirestoreEmulator(dbInstance, EMULATOR_HOST, FIRESTORE_PORT);
    }
  }
  return dbInstance;
}

export function storage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(ensureApp());
    if (useEmulator) {
      connectStorageEmulator(storageInstance, EMULATOR_HOST, STORAGE_PORT);
    }
  }
  return storageInstance;
}

export const googleProvider = new GoogleAuthProvider();
