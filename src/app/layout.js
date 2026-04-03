import "./globals.css";

export const metadata = {
  title: "Uncle Carter Pipeline",
  description: "Content production hub — Peek Media Company",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  themeColor: "#000000",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "UC Pipeline" },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
