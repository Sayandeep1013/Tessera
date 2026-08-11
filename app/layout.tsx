import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tessera — pixel art, code underneath',
  description:
    'A code-native pixel-art editor. Paint on a canvas; underneath, every pixel is a palette index in readable, editable JSON.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    // token-exempt: the OS reads these from a meta tag before any stylesheet
    // loads, so they cannot be var(). Keep in step with --surface in globals.css.
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#17171b' },
  ],
}

/**
 * Theme is resolved before paint to avoid a flash. Default is light — matching
 * the reference, whose `:root` is dark with a `.light` class layered on top.
 */
const themeScript = `(function(){try{
var s=localStorage.getItem('tessera-theme');
var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.add(d?'dark':'light');
}catch(e){document.documentElement.classList.add('light')}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
