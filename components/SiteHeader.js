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

  if (pathname === "/") return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setManager(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="minimal-scene-header">
      <nav aria-label="Primary navigation">
        <a href="/">Home</a>
        <a href="/mini-games">Mini Games</a>
        {manager ? <a href={`/team/${manager.slug}/locker-room`}>My Locker</a> : null}
        {manager ? (
          <button type="button" onClick={logout}>Log out</button>
        ) : loaded ? (
          <a href="/login">Log in</a>
        ) : null}
      </nav>
    </header>
  );
}
