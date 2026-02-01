import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OrderFlow Trading Platform",
  description: "Professional order flow and footprint analysis",
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
        {children}
      </body>
    </html>
  );
}
