export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() || undefined;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new ApiError(
      503,
      `${name} is not set. Add it to .env.local for local dev or Vercel Project Settings for production.`,
    );
  }
  return value;
}
