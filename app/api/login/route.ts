import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, passwordMatches, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  if (!process.env.APP_PASSWORD) {
    return Response.json(
      { error: "Hasło nie jest jeszcze ustawione. Dodaj APP_PASSWORD w Environment Variables projektu w Vercel i zrób Redeploy." },
      { status: 503 },
    );
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (typeof password !== "string" || !(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return Response.json({ error: "Nieprawidłowe hasło." }, { status: 401 });
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
