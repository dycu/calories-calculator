import { Redis } from "@upstash/redis";
import type { Meal } from "./types";

// Namespaced so the database can be shared with other projects without clashes.
const MEALS_KEY = "calories-calculator:meals"; // Redis hash: meal id -> meal JSON

let redis: Redis | null = null;

export class DbNotConfiguredError extends Error {
  constructor() {
    super("No database connected. In Vercel, add an Upstash Redis database to this project under Storage.");
  }
}

function db(): Redis {
  const configured =
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!configured) throw new DbNotConfiguredError();
  // fromEnv reads either the Vercel (KV_REST_API_*) or Upstash (UPSTASH_REDIS_REST_*) variables.
  return (redis ??= Redis.fromEnv());
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
