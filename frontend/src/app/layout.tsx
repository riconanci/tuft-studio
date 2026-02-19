import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tuft Studio',
  description: 'Convert images into tuft-ready rug patterns',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] overflow-hidden">{children}</body>
    </html>
  );
}
