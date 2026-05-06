import "./globals.css";

export const metadata = {
  title: "Uncle Carter Pipeline",
  description: "Content production hub — Peek Media Company",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "UC Pipeline" },
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
