// Note: @excalidraw/excalidraw@0.17.x bundles its own styles into its JS
// chunk and no longer ships a standalone index.css, so that import (present
// in older versions) has been dropped here.
import "./globals.css";
import { Suspense } from "react";
import NavigationLoaderProvider from "@/components/NavigationLoaderProvider";
import ToastProvider from "@/components/ToastProvider";
import CookieConsent from "@/components/CookieConsent";
import ThemeProvider from "@/components/theme/ThemeProvider";

export const metadata = {
  title: "InternzBee",
  description: "AI mentor workflow for internship-style project building.",
  icons: {
    icon: [{ url: "/IZB-icon.png", sizes: "64x64", type: "image/png" }],
    shortcut: "/IZB-icon.png",
    apple: [{ url: "/IZB-icon.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Suspense fallback={null}>
          <NavigationLoaderProvider>
            <ToastProvider>
              <ThemeProvider><main>{children}</main></ThemeProvider>
              <CookieConsent />
            </ToastProvider>
          </NavigationLoaderProvider>
        </Suspense>
      </body>
    </html>
  );
}
