// Note: @excalidraw/excalidraw@0.17.x bundles its own styles into its JS
// chunk and no longer ships a standalone index.css, so that import (present
// in older versions) has been dropped here.
import "./globals.css";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import NavigationLoaderProvider from "@/components/NavigationLoaderProvider";
import ToastProvider from "@/components/ToastProvider";
import CookieConsent from "@/components/CookieConsent";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata = {
  title: "Skillzage",
  description: "AI mentor workflow for internship-style project building.",
  icons: {
    icon: [{ url: "/skillzage-logo.jpg", sizes: "64x64", type: "image/jpeg" }],
    shortcut: "/skillzage-logo.jpg",
    apple: [{ url: "/skillzage-logo.jpg", sizes: "192x192", type: "image/jpeg" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <Suspense fallback={null}>
          <NavigationLoaderProvider>
            <ToastProvider>
              <main>{children}</main>
              <CookieConsent />
            </ToastProvider>
          </NavigationLoaderProvider>
        </Suspense>
      </body>
    </html>
  );
}
