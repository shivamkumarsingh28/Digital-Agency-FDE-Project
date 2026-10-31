// src/app/layout.tsx  (Next.js App Router): add the widget to every page.
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* Option A: public visitor chat, talks to the chatbot service directly */}
        <Script
          src="http://localhost:3000/widget/saiam-chat-widget.js"
          strategy="lazyOnload"
        />

        {/* Option B: gateway mode (logged-in clients get tenant-aware answers). Use INSTEAD of A.
        <Script
          src="https://chat.yourdomain.com/widget/saiam-chat-widget.js"
          data-endpoint="/api/v1/ai/chat"
          data-credentials="same-origin"
          strategy="lazyOnload"
        /> */}
      </body>
    </html>
  );
}
