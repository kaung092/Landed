import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import NavRail from "@/components/NavRail";
import PageFrame from "@/components/PageFrame";
import CoWorkQueueProvider from "@/components/CoWorkQueueProvider";
import AgentChatsProvider from "@/components/AgentChatsProvider";
import AddJobProvider from "@/components/AddJobProvider";
import FloatingQueue from "@/components/FloatingQueue";
import PendoInitializer from "@/components/PendoInitializer";

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
      <head>
        <Script id="pendo-install" strategy="afterInteractive">{`
(function(apiKey){
    (function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=o._q||[];
    v=['initialize','identify','updateOptions','pageLoad','track', 'trackAgent'];for(w=0,x=v.length;w<x;++w)(function(m){
    o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
    y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';
    z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');
})('***REDACTED-PENDO-KEY***');
`}</Script>
      </head>
      <body className="flex h-screen overflow-hidden">
        <PendoInitializer />
        <CoWorkQueueProvider>
          <AgentChatsProvider>
            <AddJobProvider>
              <NavRail />
              <div className="flex-1 overflow-hidden"><PageFrame>{children}</PageFrame></div>
              <FloatingQueue />
            </AddJobProvider>
          </AgentChatsProvider>
        </CoWorkQueueProvider>
      </body>
    </html>
  );
}
