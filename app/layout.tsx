import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavRail from "@/components/NavRail";
import PageFrame from "@/components/PageFrame";
import CoWorkQueueProvider from "@/components/CoWorkQueueProvider";
import AgentChatsProvider from "@/components/AgentChatsProvider";
import FloatingQueue from "@/components/FloatingQueue";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Landed",
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
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen overflow-hidden">
        <CoWorkQueueProvider>
          <AgentChatsProvider>
            <NavRail />
            <div className="flex-1 overflow-hidden"><PageFrame>{children}</PageFrame></div>
            <FloatingQueue />
          </AgentChatsProvider>
        </CoWorkQueueProvider>
      </body>
    </html>
  );
}
