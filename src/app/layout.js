import "./globals.css";
import { DM_Sans, Instrument_Serif } from "next/font/google";

const dmSans = DM_Sans({
  subsets:  ["latin"],
  variable: "--font-dm-sans",
  display:  "swap",
  weight:   ["300", "400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  subsets:  ["latin"],
  variable: "--font-instrument-serif",
  display:  "swap",
  weight:   "400",
  style:    ["normal", "italic"],
});

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
    <html lang="en" className={`${dmSans.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
