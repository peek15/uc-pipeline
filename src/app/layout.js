import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  subsets:  ["latin"],
  variable: "--font-instrument-serif",
  display:  "swap",
  weight:   "400",
  style:    ["normal", "italic"],
});

export const metadata = {
  title: "Creative Engine",
  description: "AI content studio — research, script, schedule, analyze.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Creative Engine" },
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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
