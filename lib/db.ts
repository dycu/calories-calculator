import { Redis } from "@upstash/redis";
import type { Meal } from "./types";

// Namespaced so the database can be shared with other projects without clashes.
const MEALS_KEY = "calories-calculator:meals"; // Redis hash: meal id -> meal JSON

let redis: Redis | null = null;

export class DbNotConfiguredError extends Error {}

/**
 * Find Upstash connection details in the environment. Accepts the names Upstash
 * uses (UPSTASH_REDIS_REST_URL/TOKEN), the names Vercel's integration uses
 * (KV_REST_API_URL/TOKEN), the same with a custom prefix chosen when connecting
 * the database in Vercel (e.g. STORAGE_KV_REST_API_URL), or a rediss:// URL to
 * an Upstash host, whose password is the REST token.
 */
export function resolveDbConfig(env: Record<string, string | undefined>): { url: string; token: string } | null {
  const names = Object.keys(env).sort((a, b) => a.length - b.length); // unprefixed names first
  for (const urlName of names) {
    const m = /^(.*(?:KV_REST_API|REDIS_REST))_URL$/.exec(urlName);
    const token = m && env[`${m[1]}_TOKEN`];
    if (m && env[urlName] && token) return { url: env[urlName]!, token };
  }
  for (const name of names) {
    if (!/(REDIS|KV)_URL$/.test(name) || !env[name]) continue;
    try {
      const u = new URL(env[name]!);
      if (/^rediss?:$/.test(u.protocol) && u.hostname.endsWith(".upstash.io") && u.password) {
        return { url: `https://${u.hostname}`, token: decodeURIComponent(u.password) };
      }
    } catch {
      /* not a URL */
    }
  }
  return null;
}

function db(): Redis {
  if (redis) return redis;
  const config = resolveDbConfig(process.env);
  if (!config) {
    // Names only (never values), to help spot a misnamed or missing variable.
    const related = Object.keys(process.env).filter((k) => /REDIS|UPSTASH|KV_/.test(k));
    throw new DbNotConfiguredError(
      "No database connected. " +
        (related.length
          ? `Found ${related.join(", ")}, but no usable Upstash REST URL + token pair.`
          : "No database variables are visible to this deployment — check they're enabled for Production, then redeploy."),
    );
  }
  return (redis = new Redis(config));
}

export async function listMeals(): Promise<Meal[]> {
  const all = await db().hgetall<Record<string, Meal | string>>(MEALS_KEY);
  return Object.values(all ?? {})
    .map((v) => (typeof v === "string" ? (JSON.parse(v) as Meal) : v))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveMeals(meals: Meal[]): Promise<void> {
  if (meals.length === 0) return;
  await db().hset(MEALS_KEY, Object.fromEntries(meals.map((m) => [m.id, JSON.stringify(m)])));
}

export async function deleteMeal(id: string): Promise<void> {
  await db().hdel(MEALS_KEY, id);
}

/** Light shape check so a malformed request can't store garbage. */
export function isMeal(v: unknown): v is Meal {
  const m = v as Meal;
  return (
    typeof m === "object" && m !== null &&
    typeof m.id === "string" && m.id.length > 0 && m.id.length <= 64 &&
    typeof m.name === "string" &&
    typeof m.createdAt === "string" &&
    Array.isArray(m.ingredients)
  );
}
