import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import NavRail from "@/components/NavRail";
import PageFrame from "@/components/PageFrame";
import ThemeToggle from "@/components/ThemeToggle";
import CoWorkQueueProvider from "@/components/CoWorkQueueProvider";
import FloatingQueue from "@/components/FloatingQueue";

// Apply the saved theme before first paint so there's no flash. Light is the default — only
// opting into dark (saved 'dark') skips the .light class.
const THEME_INIT = `try{if(localStorage.getItem('theme')!=='dark')document.documentElement.classList.add('light')}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Hunt Pipeline",
  description: "Discovery → fit → tailor → apply, in one cockpit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen overflow-hidden">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <CoWorkQueueProvider>
          <ThemeToggle />
          <NavRail />
          <div className="flex-1 overflow-hidden"><PageFrame>{children}</PageFrame></div>
          <FloatingQueue />
        </CoWorkQueueProvider>
      </body>
    </html>
  );
}
