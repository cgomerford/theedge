'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  delay?: number
}

export default function ScrollReveal({ children, className = '', delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Respect reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setVisible(true)
      return
    }

    // Check if element is already visible on mount
    const checkIfAlreadyVisible = () => {
      const rect = el.getBoundingClientRect()
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0
      if (isVisible) {
        setVisible(true)
        return true
      }
      return false
    }

    // If already visible → show immediately
    if (checkIfAlreadyVisible()) {
      return
    }

    // Otherwise use IntersectionObserver for scroll-triggered reveals
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px', // triggers a bit earlier
      }
    )

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}