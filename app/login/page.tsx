"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res?.json().catch(() => ({}));
    setError(data?.error ?? "Brak połączenia z serwerem.");
    setBusy(false);
  }

  return (
    <main className="wrap login">
      <h1>Kalorie posiłków</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="password">Hasło</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="primary" type="submit" disabled={busy || !password}>
          {busy ? "Logowanie…" : "Zaloguj"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
