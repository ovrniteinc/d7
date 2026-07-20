import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type admin from "firebase-admin";
import { ApiError, getEnv } from "./env";

function projectRoot() {
  return process.cwd();
}

function readJsonFile(filePath: string): admin.ServiceAccount {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot(), filePath);
  if (!existsSync(resolved)) {
    throw new ApiError(503, `Service account file not found: ${resolved}`);
  }

  try {
    return JSON.parse(readFileSync(resolved, "utf8")) as admin.ServiceAccount;
  } catch {
    throw new ApiError(503, `Service account file is not valid JSON: ${resolved}`);
  }
}

function parseInlineJson(raw: string): admin.ServiceAccount {
  const trimmed = raw.trim();

  if (trimmed === "{" || (trimmed.startsWith("{") && !trimmed.includes("project_id"))) {
    throw new ApiError(
      503,
      "FIREBASE_SERVICE_ACCOUNT is truncated. Multi-line JSON in .env is not supported. " +
        "Save the key as .firebase-service-account.json and set FIREBASE_SERVICE_ACCOUNT_FILE=.firebase-service-account.json",
    );
  }

  try {
    return JSON.parse(trimmed) as admin.ServiceAccount;
  } catch {
    throw new ApiError(
      503,
      "FIREBASE_SERVICE_ACCOUNT is invalid JSON. Use a single-line value, or FIREBASE_SERVICE_ACCOUNT_FILE pointing to the .json key file.",
    );
  }
}

export function loadServiceAccount(): admin.ServiceAccount {
  const fileFromEnv = getEnv("FIREBASE_SERVICE_ACCOUNT_FILE");
  if (fileFromEnv) {
    return readJsonFile(fileFromEnv);
  }

  const defaultFile = path.resolve(projectRoot(), ".firebase-service-account.json");
  if (existsSync(defaultFile)) {
    return readJsonFile(defaultFile);
  }

  const inline = getEnv("FIREBASE_SERVICE_ACCOUNT");
  if (!inline) {
    throw new ApiError(
      503,
      "Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT (single-line JSON), " +
        "FIREBASE_SERVICE_ACCOUNT_FILE, or add .firebase-service-account.json to the project root.",
    );
  }

  return parseInlineJson(inline);
}
