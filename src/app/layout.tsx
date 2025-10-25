import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

// Load Open Sans
const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
});

export const metadata: Metadata = {
  title: "Instant Quote | Guardian Pressure Washing",
  description: "Instant Quote + Schedule",
};

// ✅ Add viewport export for mobile scaling inside iframe
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Redundant but safe fallback in case Next.js doesn't inject automatically */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body
        className={`${openSans.variable} antialiased bg-[#f2f3f8] min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}