"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TEAMS } from "@/data/league-config";

function safeNextPath(value, fallback) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedManager = useMemo(() => (
    TEAMS.find((team) => team.name.toLowerCase() === username.trim().toLowerCase()) || null
  ), [username]);

  async function submit(event) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setStatus("Enter your manager name and password.");
      return;
    }

    setSubmitting(true);
    setStatus("Signing in…");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed.");

      const fallback = `/team/${data.manager.slug}`;
      const destination = safeNextPath(searchParams.get("next"), fallback);
      router.replace(destination);
      router.refresh();
    } catch (error) {
      setStatus(error.message || "Login failed.");
      setSubmitting(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-logo" aria-hidden="true">CL</div>
      <p className="eyebrow">Manager access</p>
      <h1>Enter the Draft Room</h1>
      <p className="login-intro">
        Sign in with your manager name. The temporary starter password is your name written backwards.
      </p>

      <label className="login-field">
        <span>Manager username</span>
        <input
          autoComplete="username"
          list="manager-usernames"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Nick"
          required
        />
        <datalist id="manager-usernames">
          {TEAMS.map((team) => <option key={team.slug} value={team.name} />)}
        </datalist>
      </label>

      <label className="login-field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={selectedManager ? `${selectedManager.name} backwards` : "Manager name backwards"}
          required
        />
      </label>

      <button className="primary-button login-button" type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="login-status" aria-live="polite">{status}</p>
      <a className="login-home-link" href="/">← Return to public standings</a>
    </form>
  );
}
