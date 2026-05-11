import "./globals.css";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";

const instrumentSans = Instrument_Sans({
  subsets:  ["latin"],
  variable: "--font-instrument-sans",
  display:  "swap",
  weight:   ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets:  ["latin"],
  variable: "--font-ibm-plex-mono",
  display:  "swap",
  weight:   ["400", "500", "600"],
});

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
    <html lang="en" className={`${instrumentSans.variable} ${ibmPlexMono.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
