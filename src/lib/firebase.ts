// Firebase app singleton.
//
// Config comes from `VITE_FIREBASE_*` env vars (see .env.example). The getters
// are lazy so an unconfigured build still boots and can render the Japanese
// "settings missing" screen instead of throwing while modules evaluate.

import { initializeApp, type FirebaseApp } from "firebase/app";
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
  app ??= initializeApp(config);
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
