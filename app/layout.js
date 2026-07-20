import "./globals.css";
import SiteHeader from "@/components/SiteHeader";

export const metadata = {
  title: "Champions League Fantasy Hockey",
  description: "Salary-cap fantasy hockey for league champions."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <SiteHeader />
          <main>{children}</main>
          <footer className="site-footer">
            Champions League · 2026–27 salary-cap season
          </footer>
        </div>
      </body>
    </html>
  );
}
