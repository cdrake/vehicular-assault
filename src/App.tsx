// App.tsx
import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// your three storylines:
const STORYLINES = [
  'turbo-tech-takedown',
  'street-justice',
  'delivery-dash'
] as const
type RaceSlug = typeof STORYLINES[number]

// default if they don’t click:
const DEFAULT_RACE: RaceSlug = 'turbo-tech-takedown'
const SPLASH_DURATION = 30000 // ms

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()
  const timerRef = useRef<number | undefined>(undefined)

  // spinner animation
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let frame = 0
    let rafId: number

    const renderSpinner = () => {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(width/2, height/2)
      ctx.rotate(frame * 0.05)
      ctx.beginPath()
      ctx.arc(30, 0, 8, 0, Math.PI*2)
      ctx.fill()
      ctx.restore()
      frame++
      rafId = requestAnimationFrame(renderSpinner)
    }
    renderSpinner()

    // auto‑redirect after timeout
    timerRef.current = window.setTimeout(() => {
      cancelAnimationFrame(rafId)
      navigate(`/race?race=${DEFAULT_RACE}`)
    }, SPLASH_DURATION)

    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(timerRef.current)
    }
  }, [navigate])

  // when user clicks a race button
  const handleSelect = (slug: RaceSlug) => {
    clearTimeout(timerRef.current)
    navigate(`/race?race=${slug}`)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* full‑screen spinner */}
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          background: '#111'
        }}
      />

      {/* overlayed race links */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 0,
          width: '100%',
          textAlign: 'center',
          pointerEvents: 'none'  // allow clicking buttons only
        }}
      >
        {STORYLINES.map((slug) => (
          <button
            key={slug}
            onClick={() => handleSelect(slug)}
            style={{
              margin: '0 8px',
              padding: '8px 16px',
              fontSize: '1rem',
              cursor: 'pointer',
              pointerEvents: 'auto',    // re‑enable clicks here
            }}
          >
            {slug
              .split('-')
              .map(w => w[0].toUpperCase() + w.slice(1))
              .join(' ')
            }
          </button>
        ))}
      </div>
    </div>
  )
}

export default App
