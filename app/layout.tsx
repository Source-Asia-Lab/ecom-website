import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CartHydrator from "./components/cart/CartHydrator";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Source Asia | Wholesale sourcing, made clear",
  description:
    "Discover thoughtful everyday goods from trusted suppliers across Asia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartHydrator />
        {children}
      </body>
    </html>
  );
}
