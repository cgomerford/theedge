type Props = {
  conditions: string
  size?: number
  className?: string
}

export default function WeatherIcon({ conditions, size = 32, className = '' }: Props) {
  const c = conditions.toLowerCase()

  // Sun (clear)
  if (c === 'clear') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="4" fill="#f59e0b"/>
        <path stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    )
  }

  // Partly cloudy
  if (c.includes('partly')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="8" cy="8" r="3.5" fill="#f59e0b"/>
        <path d="M16 18a4 4 0 1 0-1.5-7.7A5 5 0 0 0 5 12a4 4 0 0 0 1 7.9h10z" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
      </svg>
    )
  }

  // Rain
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M16 13a4 4 0 1 0-1.5-7.7A5 5 0 0 0 5 7a4 4 0 0 0 1 7.9h10z" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
        <path stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>
      </svg>
    )
  }

  // Thunder
  if (c.includes('thunder')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M16 12a4 4 0 1 0-1.5-7.7A5 5 0 0 0 5 6a4 4 0 0 0 1 7.9h10z" fill="#6b7280" stroke="#4b5563" strokeWidth="1"/>
        <path d="M11 14l-2 4h2l-1 3 3-5h-2l1-2z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5"/>
      </svg>
    )
  }

  // Snow
  if (c.includes('snow')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M16 13a4 4 0 1 0-1.5-7.7A5 5 0 0 0 5 7a4 4 0 0 0 1 7.9h10z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1"/>
        <circle cx="8" cy="20" r="1" fill="#3b82f6"/>
        <circle cx="12" cy="19" r="1" fill="#3b82f6"/>
        <circle cx="16" cy="20" r="1" fill="#3b82f6"/>
      </svg>
    )
  }

  // Fog
  if (c.includes('fog')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" d="M3 8h18M3 12h18M3 16h12M3 20h15"/>
      </svg>
    )
  }

  // Default: cloud
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M16 18a4 4 0 1 0-1.5-7.7A5 5 0 0 0 5 12a4 4 0 0 0 1 7.9h10z" fill="#9ca3af" stroke="#6b7280" strokeWidth="1"/>
    </svg>
  )
}