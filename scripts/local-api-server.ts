import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const PORT = Number(process.env.D7_API_PORT || 3001);

const API_ROUTES = [
  "send-user-invite",
  "send-notification-email",
  "delete-user",
] as const;

type RouteName = (typeof API_ROUTES)[number];

function applyEnv() {
  const env = loadEnv("development", projectRoot, "");
  for (const key of [
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "FIREBASE_SERVICE_ACCOUNT",
    "FIREBASE_SERVICE_ACCOUNT_FILE",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_APP_URL",
  ]) {
    if (env[key]) process.env[key] = env[key];
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function createVercelMocks(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bodyText: string,
) {
  let statusCode = 200;
  let body: Record<string, unknown> = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const vercelReq = {
    method: req.method,
    headers: req.headers,
    body,
    query: {},
  };

  const vercelRes = {
    status(code: number) {
      statusCode = code;
      return vercelRes;
    },
    json(data: unknown) {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    },
  };

  return { vercelReq, vercelRes };
}

async function loadHandler(routeName: RouteName) {
  switch (routeName) {
    case "send-user-invite":
      return (await import("../api/send-user-invite.ts")).default;
    case "send-notification-email":
      return (await import("../api/send-notification-email.ts")).default;
    case "delete-user":
      return (await import("../api/delete-user.ts")).default;
    default:
      throw new Error("Unknown route");
  }
}

applyEnv();

const missing: string[] = [];
if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
if (
  !process.env.FIREBASE_SERVICE_ACCOUNT &&
  !process.env.FIREBASE_SERVICE_ACCOUNT_FILE &&
  !existsSync(path.resolve(projectRoot, ".firebase-service-account.json"))
) {
  missing.push("FIREBASE_SERVICE_ACCOUNT or .firebase-service-account.json");
}

const server = http.createServer(async (req, res) => {
  const pathname = req.url?.split("?")[0] || "";
  const match = pathname.match(/^\/api\/([^/]+)$/);
  if (!match) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const routeName = match[1] as RouteName;
  if (!API_ROUTES.includes(routeName)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const bodyText =
      req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
        ? await readBody(req)
        : "";

    const handler = await loadHandler(routeName);
    if (typeof handler !== "function") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API handler not found" }));
      return;
    }

    const { vercelReq, vercelRes } = createVercelMocks(req, res, bodyText);
    await handler(vercelReq, vercelRes);
  } catch (error) {
    console.error(`[local-api] /api/${routeName} failed:`, error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (error as Error).message || "Internal server error" }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`[local-api] Listening on http://localhost:${PORT}`);
  console.log(`[local-api] Routes: ${API_ROUTES.map((r) => `/api/${r}`).join(", ")}`);
  if (missing.length) {
    console.warn(
      `[local-api] Missing env: ${missing.join(", ")} — add to .env.local (see .env.example)`,
    );
  }
});
