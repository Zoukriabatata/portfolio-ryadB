import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import SessionProvider from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SENZOUKRIA | Trading Intelligence Platform",
  description: "Professional orderflow, footprint charts, gamma exposure analysis and volatility tools for serious traders",
  keywords: ["trading", "orderflow", "footprint chart", "gamma exposure", "volatility", "options", "futures"],
};

// Script to patch DOM methods and suppress removeChild errors
// This runs before React hydrates, preventing errors from Lightweight Charts cleanup
const domPatchScript = `
(function() {
  var originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    if (child && child.parentNode === this) {
      return originalRemoveChild.call(this, child);
    }
    return child;
  };

  var originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, refNode) {
    if (refNode && refNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, refNode);
  };
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: domPatchScript }} />
      </head>
      <body className={`${montserrat.variable} antialiased`} suppressHydrationWarning>
        <SessionProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
