import React, { useMemo, useRef } from 'react'
import { Box } from '@mui/material'
import { keyframes } from '@emotion/react'
import type { BoxAnimation } from '@/types/panel'

// ── Color helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n) || h.length !== 6) return [124, 110, 245]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix hex color `a` toward `b` by t (0..1) → #rrggbb. */
function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t))
  return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`
}

function randomHueColor(): string {
  return `hsl(${Math.floor(Math.random() * 360)} 85% 60%)`
}

// ── Shared rain-pattern builders (12 rows × 3 layers, from the Uiverse CSS) ──

const RAIN_ROWS = [235, 252, 150, 253, 204, 134, 179, 299, 215, 281, 158, 210]

function rainGradients(color: string, dotSize = '1.5px 1.5px', dotColor?: string): string {
  const c = dotColor ?? color
  const parts: string[] = []
  for (const y of RAIN_ROWS) {
    parts.push(`radial-gradient(4px 100px at 0px ${y}px, ${color}, #0000)`)
    parts.push(`radial-gradient(4px 100px at 300px ${y}px, ${color}, #0000)`)
    parts.push(`radial-gradient(${dotSize} at 150px ${y / 2}px, ${c} 100%, #0000 150%)`)
  }
  return parts.join(', ')
}

function rainSizes(): string {
  return RAIN_ROWS.flatMap(y => [`300px ${y}px`, `300px ${y}px`, `300px ${y}px`]).join(', ')
}

const RAIN_POS_0 = [
  '0px 220px', '3px 220px', '151.5px 337.5px',
  '25px 24px', '28px 24px', '176.5px 150px',
  '50px 16px', '53px 16px', '201.5px 91px',
  '75px 224px', '78px 224px', '226.5px 350.5px',
  '100px 19px', '103px 19px', '251.5px 121px',
  '125px 120px', '128px 120px', '276.5px 187px',
  '150px 31px', '153px 31px', '301.5px 120.5px',
  '175px 235px', '178px 235px', '326.5px 384.5px',
  '200px 121px', '203px 121px', '351.5px 228.5px',
  '225px 224px', '228px 224px', '376.5px 364.5px',
  '250px 26px', '253px 26px', '401.5px 105px',
  '275px 75px', '278px 75px', '426.5px 180px',
].join(', ')

const RAIN_POS_100 = [
  '0px 6800px', '3px 6800px', '151.5px 6917.5px',
  '25px 13632px', '28px 13632px', '176.5px 13758px',
  '50px 5416px', '53px 5416px', '201.5px 5491px',
  '75px 17175px', '78px 17175px', '226.5px 17301.5px',
  '100px 5119px', '103px 5119px', '251.5px 5221px',
  '125px 8428px', '128px 8428px', '276.5px 8495px',
  '150px 9876px', '153px 9876px', '301.5px 9965.5px',
  '175px 13391px', '178px 13391px', '326.5px 13540.5px',
  '200px 14741px', '203px 14741px', '351.5px 14848.5px',
  '225px 18770px', '228px 18770px', '376.5px 18910.5px',
  '250px 5082px', '253px 5082px', '401.5px 5161px',
  '275px 6375px', '278px 6375px', '426.5px 6480px',
].join(', ')

const RAIN_KEYFRAMES: Record<string, { backgroundPosition: string }> = {
  '0%': { backgroundPosition: RAIN_POS_0 },
  '100%': { backgroundPosition: RAIN_POS_100 },
}

interface EffectProps {
  color?: string
  random?: boolean
  /** Animation speed multiplier (default 1). */
  speed?: number
}

// ── Effect layers ───────────────────────────────────────────────────────────

/** Animated diagonal grid lines (adamgiebl). */
function GridEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  const line = color ? `color-mix(in srgb, ${color} 30%, transparent)` : 'rgba(114, 114, 114, 0.3)'
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#191a1a',
        '--xstat-grid-c': line,
        backgroundImage: [
          'linear-gradient(0deg, transparent 24%, var(--xstat-grid-c) 25%, var(--xstat-grid-c) 26%, transparent 27%, transparent 74%, var(--xstat-grid-c) 75%, var(--xstat-grid-c) 76%, transparent 77%, transparent)',
          'linear-gradient(90deg, transparent 24%, var(--xstat-grid-c) 25%, var(--xstat-grid-c) 26%, transparent 27%, transparent 74%, var(--xstat-grid-c) 75%, var(--xstat-grid-c) 76%, transparent 77%, transparent)',
        ].join(', '),
        backgroundSize: '55px 55px',
        animation: `xstatBoxGrid ${(16 / s).toFixed(1)}s linear infinite`,
        '@keyframes xstatBoxGrid': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '55px 55px' },
        },
      }}
    />
  )
}

/** Cyan rain + blur grain (SelfMadeSystem). */
function RainEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#000',
        '--xstat-rain-c': color ?? '#09f',
        backgroundImage: rainGradients('var(--xstat-rain-c)'),
        backgroundSize: rainSizes(),
        animation: `xstatBoxRain ${(150 / s).toFixed(1)}s linear infinite`,
        '@keyframes xstatBoxRain': RAIN_KEYFRAMES,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          backdropFilter: 'blur(1em) brightness(6)',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #0000 0, #0000 2px, hsl(0 0 4%) 2px)',
          backgroundSize: '8px 8px',
        },
      }}
    />
  )
}

/** Drifting neon blur blobs (SelfMadeSystem) — transform-based so it always moves. */
const BLOB_DEFAULT_COLORS = ['#0ff', '#f0f', '#ff0', '#0f0', '#f80', '#08f']
const BLOB_LAYOUT = [
  { x: 8,  y: 12, size: 52, dur: 7,  delay: 0,  dx: 70,  dy: -48, scale: 1.4  },
  { x: 58, y: 8,  size: 42, dur: 9,  delay: -2, dx: -60, dy: 62,  scale: 1.3  },
  { x: 74, y: 52, size: 56, dur: 8,  delay: -4, dx: -64, dy: -42, scale: 1.45 },
  { x: 10, y: 58, size: 46, dur: 10, delay: -6, dx: 64,  dy: 52,  scale: 1.35 },
  { x: 40, y: 32, size: 62, dur: 11, delay: -3, dx: -52, dy: -58, scale: 1.5  },
  { x: 32, y: 72, size: 36, dur: 6.5, delay: -5, dx: 58,  dy: -36, scale: 1.3 },
]

function BlobEffect({ color, random, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  const randomColors = useRef<string[] | null>(null)
  if (random && !randomColors.current) randomColors.current = Array.from({ length: BLOB_LAYOUT.length }, randomHueColor)
  const colors = random ? randomColors.current! : color ? Array.from({ length: BLOB_LAYOUT.length }, () => color) : BLOB_DEFAULT_COLORS
  const drifts = useMemo(
    () => BLOB_LAYOUT.map(b => keyframes({
      '0%': { transform: 'translate(0, 0) scale(1)', opacity: 0.75 },
      '100%': { transform: `translate(${b.dx}px, ${b.dy}px) scale(${b.scale})`, opacity: 1 },
    })),
    []
  )
  return (
    <>
      <Box sx={{ position: 'absolute', inset: 0, backgroundColor: '#0a0a12' }} />
      {BLOB_LAYOUT.map((b, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: `${b.size}%`,
            height: `${b.size}%`,
            left: `${b.x}%`,
            top: `${b.y}%`,
            background: `radial-gradient(circle at 50% 50%, ${colors[i]} 0%, transparent 70%)`,
            filter: 'blur(18px)',
            animation: `${drifts[i]} ${(b.dur / s).toFixed(1)}s ease-in-out infinite alternate`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
      {/* grain overlay for the frosted look */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #0000 0, #0000 2px, #000 2px)',
          backgroundSize: '8px 8px',
          opacity: 0.6,
        }}
      />
    </>
  )
}

/** Orange/red rain tilted -45° with animated hue-rotate flicker (SelfMadeSystem). */
function NeonEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  const streak = color ?? '#fa0'
  const dot = color ? mixHex(color, '#000', 0.35) : '#f00'
  return (
    <>
      <Box sx={{ position: 'absolute', inset: 0, backgroundColor: '#000' }} />
      <Box
        sx={{
          position: 'absolute',
          inset: '-145%',
          rotate: '-45deg',
          backgroundImage: rainGradients(streak, '3px 4px', dot),
          backgroundSize: rainSizes(),
          animation: `xstatNeonRain ${(150 / s).toFixed(1)}s linear infinite`,
          '@keyframes xstatNeonRain': RAIN_KEYFRAMES,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at 50% 50%, #0000 0, #0000 2px, hsl(0 0 4%) 2px)',
          backgroundSize: '8px 8px',
          animation: `xstatNeonHue ${(5 / s).toFixed(1)}s ease-in-out infinite`,
          '@keyframes xstatNeonHue': {
            '0%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
            '25%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(-25deg)' },
            '28%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
            '32%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(-20deg)' },
            '39%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
            '40%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(-20deg)' },
            '41%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
            '42%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(-25deg)' },
            '44%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
            '58%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(-20deg)' },
            '64%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
            '80%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(-25deg)' },
            '100%': { backdropFilter: 'blur(3em) brightness(9) hue-rotate(0deg)' },
          },
        }}
      />
    </>
  )
}

/** Cyber grid — vignette + cyan big grid + magenta small grid (sunn_2633). */
function CyberEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  const base = color ?? '#03e9f4'
  const bigH = `linear-gradient(color-mix(in srgb, ${base} 10%, transparent) 1px, transparent 1px)`
  const bigV = `linear-gradient(90deg, color-mix(in srgb, ${base} 10%, transparent) 1px, transparent 1px)`
  const smallH = `linear-gradient(color-mix(in srgb, ${base} 5%, transparent) 1px, transparent 1px)`
  const smallV = `linear-gradient(90deg, color-mix(in srgb, ${base} 5%, transparent) 1px, transparent 1px)`
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#050505',
        backgroundImage: [
          'radial-gradient(circle at center, transparent 30%, #000 90%)',
          bigH, bigV, smallH, smallV,
        ].join(', '),
        backgroundSize: '100% 100%, 60px 60px, 60px 60px, 20px 20px, 20px 20px',
        animation: `xstatCyber ${(10 / s).toFixed(1)}s linear infinite`,
        '@keyframes xstatCyber': {
          '0%': { backgroundPosition: '0 0, 0 0, 0 0, 0 0, 0 0' },
          '100%': { backgroundPosition: '0 0, 60px 60px, 60px 60px, 40px 40px, 40px 40px' },
        },
      }}
    />
  )
}

// ── Matrix digital rain (whoisyourdeadie) ───────────────────────────────────

const MATRIX_CHARS = [
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789',
  'ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴァィゥェォャュョッABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'アカサタナハマヤラワイキシチニヒミリウクスツヌフムユルエケセテネヘメレオコソトノホモヨロヲン0987654321',
  'ンヲロヨモホノトソコオレメヘネテセケエルユムフヌツスクウリミヒニチシキイワラヤマハナタサカア',
  'ガザダバパギジヂビピグズヅブプゲゼデベペゴゾドボポヴァィゥェォャュョッ!@#$%^&*()_+-=[]{}|;:,.<>?',
]

/** White head → color → dark tail gradient (the "trail" of a falling character). */
function matrixGradient(color: string): string {
  const d = (t: number) => mixHex(color, '#000', t)
  return [
    'linear-gradient(to bottom,',
    '#ffffff 0%, #ffffff 5%,',
    `${color} 10%, ${color} 20%,`,
    `${d(0.2)} 30%, ${d(0.35)} 40%,`,
    `${d(0.5)} 50%, ${d(0.65)} 60%,`,
    `${d(0.8)} 70%, ${d(0.9)} 80%,`,
    `color-mix(in srgb, ${color} 50%, transparent) 90%,`,
    'transparent 100%)',
  ].join(' ')
}

function MatrixEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  const gradient = useMemo(() => matrixGradient(color ?? '#00ff41'), [color])
  const columns = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: ((i / 27) * 100).toFixed(2),
        duration: (2.3 + ((i * 7) % 23) / 10).toFixed(1),
        delay: (-(1.2 + ((i * 13) % 29) / 10)).toFixed(1),
        chars: MATRIX_CHARS[i % MATRIX_CHARS.length],
      })),
    []
  )
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#000',
        overflow: 'hidden',
        '@keyframes xstatMatrixFall': {
          '0%': { transform: 'translateY(-10%)', opacity: 1 },
          '100%': { transform: 'translateY(200%)', opacity: 0 },
        },
      }}
    >
      {columns.map((c, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            top: '-100%',
            width: 20,
            height: '100%',
            left: `${c.left}%`,
            fontSize: 16,
            lineHeight: '18px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            writingMode: 'vertical-lr',
            letterSpacing: '1px',
            background: gradient,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: `xstatMatrixFall ${(Number(c.duration) / s).toFixed(1)}s linear infinite`,
            animationDelay: `${c.delay}s`,
          }}
        >
          {c.chars}
        </Box>
      ))}
    </Box>
  )
}

/** Green rain (SelfMadeSystem). */
function GreenEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#000',
        backgroundImage: rainGradients(color ?? '#0f0'),
        backgroundSize: rainSizes(),
        animation: `xstatGreenRain ${(150 / s).toFixed(1)}s linear infinite`,
        '@keyframes xstatGreenRain': RAIN_KEYFRAMES,
      }}
    />
  )
}

/** Scanline stripe pattern scrolling vertically (MiPiBoy). */
function ScanEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  const c = color ?? '#8825ec'
  const stripeA = `linear-gradient(45deg, ${c} 0% 14.285714285714285%, transparent 14.285714285714285% 28.57142857142857%, ${c} 28.57142857142857% 42.857142857142854%, transparent 42.857142857142854% 57.14285714285714%, ${c} 57.14285714285714% 71.42857142857142%, transparent 71.42857142857142% 85.71428571428571%, ${c} 85.71428571428571% 100%)`
  const stripeB = `linear-gradient(45deg, ${c} 0% 30.76923076923077%, transparent 30.76923076923077% 61.53846153846154%, ${c} 61.53846153846154% 92.3076923076923%, transparent 92.3076923076923%)`
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#252a29',
        backgroundImage: [
          stripeA,
          stripeA.replace('45deg', '-45deg'),
          stripeB,
          stripeB.replace('45deg', '-45deg'),
          stripeB,
          stripeB.replace('45deg', '-45deg'),
          stripeB,
          stripeB.replace('45deg', '-45deg'),
        ].join(', '),
        backgroundSize: '50px 20px, 50px 20px, 50px 80px, 50px 80px, 50px 80px, 50px 80px, 50px 80px, 50px 80px',
        backgroundPositionX: '4px, 54px, 108px, 158px, 212px, 262px, 316px, 366px',
        backgroundRepeat: 'repeat-y',
        animation: `xstatScan ${(10 / s).toFixed(1)}s linear infinite`,
        '@keyframes xstatScan': {
          '100%': { backgroundPositionY: '800px, 800px, 1040px, 1040px, 1360px, 1360px, 1040px, 1040px' },
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: 0,
          backgroundImage: [stripeB, stripeB.replace('45deg', '-45deg')].join(', '),
          backgroundSize: '50px 80px, 50px 80px',
          backgroundPositionX: '108px, 158px',
          backgroundRepeat: 'repeat-y',
          animation: `xstatScanFlash ${(5 / s).toFixed(1)}s linear infinite`,
        },
        '@keyframes xstatScanFlash': {
          '5%': { opacity: 1 },
          '0%, 4.99%, 20%, 100%': { opacity: 0 },
        },
      }}
    />
  )
}

/** Cyan rain + scanline grain (SelfMadeSystem). */
function CyanEffect({ color, speed }: EffectProps) {
  const s = Math.max(0.1, speed ?? 1)
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#000',
        '--xstat-rain-c': color ?? '#09f',
        backgroundImage: rainGradients('var(--xstat-rain-c)'),
        backgroundSize: rainSizes(),
        animation: `xstatCyanRain ${(150 / s).toFixed(1)}s linear infinite`,
        '@keyframes xstatCyanRain': RAIN_KEYFRAMES,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(ellipse 1.5px 2px at 1.5px 50%, #0000 0, #0000 90%, #000 100%)',
          backgroundSize: '25px 8px',
        },
      }}
    />
  )
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export function BoxEffectLayer({ effect, color, random, speed }: { effect: BoxAnimation; color?: string; random?: boolean; speed?: number }) {
  switch (effect) {
    case 'rain':    return <RainEffect color={color} speed={speed} />
    case 'blob':    return <BlobEffect color={color} random={random} speed={speed} />
    case 'neon':    return <NeonEffect color={color} speed={speed} />
    case 'cyber':   return <CyberEffect color={color} speed={speed} />
    case 'matrix':  return <MatrixEffect color={color} speed={speed} />
    case 'green':   return <GreenEffect color={color} speed={speed} />
    case 'scan':    return <ScanEffect color={color} speed={speed} />
    case 'cyan':    return <CyanEffect color={color} speed={speed} />
    default:        return <GridEffect color={color} speed={speed} />
  }
}

/** Whether the effect supports randomized colors (blob is generated random). */
export function boxEffectSupportsRandom(effect: BoxAnimation): boolean {
  return effect === 'blob'
}
