import "server-only";

export const TONYVILLE_ENV_KEYS = [
  "NEXT_PUBLIC_MAPBOX_TOKEN",
  "REGRID_API_KEY",
  "ATTOM_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type TonyvilleEnvKey = (typeof TONYVILLE_ENV_KEYS)[number];

const warnedScopes = new Set<string>();

export function getMissingEnv(keys: readonly TonyvilleEnvKey[] = TONYVILLE_ENV_KEYS) {
  return keys.filter((key) => !process.env[key]);
}

export function logMissingEnv(scope: string, keys: readonly TonyvilleEnvKey[]) {
  const missing = getMissingEnv(keys);

  if (missing.length === 0) {
    return;
  }

  const warningKey = `${scope}:${missing.join(",")}`;

  if (warnedScopes.has(warningKey)) {
    return;
  }

  warnedScopes.add(warningKey);
  console.warn(
    `[Tonyville env:${scope}] Missing environment variable(s): ${missing.join(
      ", ",
    )}. Provider-dependent features will use visible fallback states.`,
  );
}

export function getServerEnv(key: TonyvilleEnvKey, scope: string) {
  const value = process.env[key];

  if (!value) {
    logMissingEnv(scope, [key]);
  }

  return value;
}
