'use client'

import Script from 'next/script'
import { useEffect } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA4_ID

export default function GoogleAnalytics() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Set consent based on localStorage on mount
    const consent = localStorage.getItem('edge_cookie_consent')
    const granted = consent === 'accepted'
    
    if ((window as any).gtag) {
      ;(window as any).gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied',
      })
    }
  }, [])

  if (!GA_ID) return null

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          
          // Default to denied — wait for consent
          gtag('consent', 'default', {
            'analytics_storage': 'denied',
            'wait_for_update': 500
          });
          
          gtag('config', '${GA_ID}', {
            send_page_view: true,
            anonymize_ip: true
          });
        `}
      </Script>
    </>
  )
}