type Props = {
  direction: number  // degrees: 0=N, 90=E, 180=S, 270=W
  size?: number
  className?: string
}

// Wind direction is "from" — so an arrow pointing south means wind blows TOWARD south (came from north)
// We rotate so the arrow head shows where the wind is going
export default function WindArrow({ direction, size = 24, className = '' }: Props) {
  // Direction is "from" — flip 180° so arrow shows where wind is going
  const rotation = (direction + 180) % 360

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s' }}
    >
      <path
        d="M12 3 L18 14 L13 13 L13 21 L11 21 L11 13 L6 14 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}