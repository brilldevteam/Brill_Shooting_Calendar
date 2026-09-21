import type { Metadata } from "next";
import "@fontsource-variable/mona-sans";
import "./globals.css";
export const metadata: Metadata = {
  title: "Brill Creations | Shooting Calendar",
  description: "Your production, beautifully coordinated.",
  icons: {
    icon: [{ url: "/brill-favicon.webp", type: "image/webp" }],
    shortcut: "/brill-favicon.webp",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
