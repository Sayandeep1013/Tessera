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
 * Theme is resolved before paint to avoid a flash.
 *
 * Three stored states now, not two — 'dark', 'light' and 'auto' (spec 16 §1),
 * with anything else, including nothing stored, meaning auto. The previous
 * version read `s ? s === 'dark' : system`, which was correct while the only
 * stored values were 'dark' and 'light' but silently resolved a stored 'auto'
 * to LIGHT, ignoring the system it exists to follow.
 */
const themeScript = `(function(){try{
var s=localStorage.getItem('tessera-theme');
var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
var d=s==='dark'?true:s==='light'?false:m;
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
