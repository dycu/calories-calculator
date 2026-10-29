import { DbNotConfiguredError } from "./db";

/** Turn a thrown error into a JSON response the client can show. */
export function errorResponse(error: unknown): Response {
  if (error instanceof DbNotConfiguredError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  console.error(error);
  return Response.json({ error: "Server error while talking to the database." }, { status: 500 });
}
