import "./globals.css";

export const metadata = {
  title: "Champions League Fantasy Hockey",
  description: "Salary-cap fantasy hockey for league champions."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <a className="brand" href="/" aria-label="Champions League home">
              <span className="brand-mark">CL</span>
              <span>
                <strong>Champions League</strong>
                <small>Fantasy Hockey</small>
              </span>
            </a>
            <a className="header-link" href="/">Standings</a>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            Champions League · 2026–27 salary-cap season
          </footer>
        </div>
      </body>
    </html>
  );
}
