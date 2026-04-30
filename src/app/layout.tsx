import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono, Bebas_Neue } from 'next/font/google';
import "./globals.css";

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

const bebas = Bebas_Neue({
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
  weight: '400',
})

export const metadata: Metadata = {
  title: "The Edge — Pre-game brief for the analytics era",
  description: "Statcast, advanced metrics, and the data that explains tonight's game. Free daily email.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable} ${bebas.variable}`}>
      <body className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}