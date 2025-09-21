import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${openSans.variable} antialiased bg-[#f2f3f8] min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}