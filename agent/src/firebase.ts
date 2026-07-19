import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = join(here, "../../.env");
const localEnv = join(here, "../.env");

if (existsSync(rootEnv)) loadEnv({ path: rootEnv });
if (existsSync(localEnv)) loadEnv({ path: localEnv, override: true });

function env(primary: string, fallbackKey?: string) {
  const value = process.env[primary] || (fallbackKey ? process.env[fallbackKey] : undefined);
  if (!value) {
    throw new Error(`Missing environment variable: ${primary}${fallbackKey ? ` or ${fallbackKey}` : ""}`);
  }
  return value;
}

export const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY", "FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN", "FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET", "FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID", "FIREBASE_APP_ID"),
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function signInAgent(): Promise<User> {
  const email = process.env.D7_AGENT_EMAIL || process.env.D7_EMAIL;
  const password = process.env.D7_AGENT_PASSWORD || process.env.D7_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set D7_AGENT_EMAIL and D7_AGENT_PASSWORD in .env (same login as the web app).",
    );
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}
