import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, passwordMatches, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  if (!process.env.APP_PASSWORD) {
    return Response.json(
      { error: "No password set up yet. Add APP_PASSWORD in the Vercel project's Environment Variables, then redeploy." },
      { status: 503 },
    );
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || !(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  (await cookies()).set(SESSION_COOKIE, (await sessionToken())!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return Response.json({ ok: true });
}
