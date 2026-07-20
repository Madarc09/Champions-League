"use client";

import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const isNickPage = pathname?.startsWith("/team/nick");

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Champions League home">
        <span className="brand-mark">CL</span>
        <span>
          <strong>Champions League</strong>
          <small>Fantasy Hockey</small>
        </span>
      </a>

      <nav className="header-nav" aria-label="Primary navigation">
        {isNickPage ? (
          <>
            <a
              className={pathname === "/team/nick" ? "active" : ""}
              href="/team/nick"
            >
              Draft Room
            </a>
            <a
              className={pathname === "/team/nick/locker-room" ? "active" : ""}
              href="/team/nick/locker-room"
            >
              Locker Room
            </a>
          </>
        ) : null}
        <a className={pathname === "/" ? "active" : ""} href="/">
          Standings
        </a>
      </nav>
    </header>
  );
}
