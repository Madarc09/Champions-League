"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [manager, setManager] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setManager(data.manager || null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setManager(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="scene-header">
      <a className="scene-brand" href="/" aria-label="Champions League home">
        <span className="scene-brand-mark" aria-hidden="true">CL</span>
        <span className="scene-brand-copy">
          <strong>Champions League</strong>
          <small>2026–27 Fantasy Hockey</small>
        </span>
      </a>

      <nav className="scene-links" aria-label="Primary navigation">
        <a className={pathname === "/" ? "active" : ""} href="/">Home</a>
        {manager ? <a href={`/team/${manager.slug}/locker-room`}>My Locker</a> : null}
        {manager ? (
          <button type="button" onClick={logout}>Log out</button>
        ) : loaded ? (
          <a className={pathname === "/login" ? "active" : ""} href="/login">Manager Login</a>
        ) : null}
      </nav>
    </header>
  );
}
