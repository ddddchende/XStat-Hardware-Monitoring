import React, { useRef, useEffect } from 'react'
import { Box, alpha, useTheme } from '@mui/material'
import type { PanelLayout, LayoutItem } from '@/types/panel'
import type { HardwareSnapshot } from '@/types/sensors'
import type { HistoryPoint } from '@/hooks/useSensorHistory'
import { WidgetRenderer } from './WidgetRenderer'

type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

const MIN_SIZE = 10
const HANDLE_PX = 8
const SNAP_THRESHOLD = 6

interface DragHandle { dir: Dir; style: React.CSSProperties }
const HANDLES: DragHandle[] = [
  { dir: 'nw', style: { top: -4,       left: -4,                                      cursor: 'nw-resize' } },
  { dir: 'n',  style: { top: -4,       left: '50%', transform: 'translateX(-50%)',    cursor: 'n-resize'  } },
  { dir: 'ne', style: { top: -4,       right: -4,                                     cursor: 'ne-resize' } },
  { dir: 'e',  style: { top: '50%',    transform: 'translateY(-50%)', right: -4,      cursor: 'e-resize'  } },
  { dir: 'se', style: { bottom: -4,    right: -4,                                     cursor: 'se-resize' } },
  { dir: 's',  style: { bottom: -4,    left: '50%', transform: 'translateX(-50%)',    cursor: 's-resize'  } },
  { dir: 'sw', style: { bottom: -4,    left: -4,                                       cursor: 'sw-resize' } },
  { dir: 'w',  style: { top: '50%',    transform: 'translateY(-50%)', left: -4,       cursor: 'w-resize'  } },
]

interface ActiveOp {
  kind: 'move' | 'resize'
  id: string
  dir?: Dir
  mx0: number; my0: number
  ox: number;  oy: number
  ow: number;  oh: number
}

/**
 * Smart-guide snap: align a widget's edges (left/right/top/bottom) and centers
 * to other widgets' edges/centers and the canvas edges/center, on both axes.
 * Returns the adjusted x/y plus the guide line positions to draw.
 */
function smartSnap(
  x: number, y: number, w: number, h: number,
  others: LayoutItem[], selfId: string,
  canvasW: number, canvasH: number,
): { x: number; y: number; vGuide: number | null; hGuide: number | null } {
  const curXs = [x, x + w / 2, x + w]
  const curYs = [y, y + h / 2, y + h]
  const tx: number[] = [0, canvasW / 2, canvasW]
  const ty: number[] = [0, canvasH / 2, canvasH]
  for (const l of others) {
    if (l.i === selfId) continue
    tx.push(l.x, l.x + l.w / 2, l.x + l.w)
    ty.push(l.y, l.y + l.h / 2, l.y + l.h)
  }
  let bestDX: number | null = null, vGuide: number | null = null
  for (const ca of curXs) for (const t of tx) {
    const d = t - ca
    if (Math.abs(d) <= SNAP_THRESHOLD && (bestDX === null || Math.abs(d) < Math.abs(bestDX))) { bestDX = d; vGuide = t }
  }
  let bestDY: number | null = null, hGuide: number | null = null
  for (const ca of curYs) for (const t of ty) {
    const d = t - ca
    if (Math.abs(d) <= SNAP_THRESHOLD && (bestDY === null || Math.abs(d) < Math.abs(bestDY))) { bestDY = d; hGuide = t }
  }
  return {
    x: bestDX !== null ? x + bestDX : x,
    y: bestDY !== null ? y + bestDY : y,
    vGuide, hGuide,
  }
}

interface Props {
  panel: PanelLayout
  snapshot: HardwareSnapshot | null
  history: Map<string, HistoryPoint[]>
  isEditMode: boolean
  snapToGrid?: boolean
  selectedWidgetId: string | null
  onSelect: (id: string | null) => void
  onWidgetGeometry: (id: string, geom: Partial<Omit<LayoutItem, 'i'>>) => void
  onPanStart?: (e: React.MouseEvent) => void
  onCanvasSelect?: () => void
}

export const PanelCanvas: React.FC<Props> = ({
  panel,
  snapshot,
  history,
  isEditMode,
  snapToGrid,
  selectedWidgetId,
  onSelect,
  onWidgetGeometry,
  onPanStart,
  onCanvasSelect,
}) => {
  const theme = useTheme()

  // Stable refs so event listeners don't need to be re-attached on every render
  const opRef    = useRef<ActiveOp | null>(null)
  const layoutRef = useRef(panel.layout)
  const geoRef    = useRef(onWidgetGeometry)
  const snapRef   = useRef(snapToGrid)
  const vGuideRef = useRef<HTMLDivElement | null>(null)
  const hGuideRef = useRef<HTMLDivElement | null>(null)
  const canvasSizeRef = useRef({ w: panel.canvasWidth, h: panel.canvasHeight })
  useEffect(() => { layoutRef.current = panel.layout },   [panel.layout])
  useEffect(() => { geoRef.current    = onWidgetGeometry }, [onWidgetGeometry])
  useEffect(() => { snapRef.current   = snapToGrid },       [snapToGrid])
  useEffect(() => { canvasSizeRef.current = { w: panel.canvasWidth, h: panel.canvasHeight } }, [panel.canvasWidth, panel.canvasHeight])

  // Attach global mouse handlers once; read latest state via refs
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const op = opRef.current
      if (!op) return

      const dx = e.clientX - op.mx0
      const dy = e.clientY - op.my0
      let x = op.ox, y = op.oy, w = op.ow, h = op.oh

      if (op.kind === 'move') {
        x = op.ox + dx
        y = op.oy + dy
      } else {
        switch (op.dir) {
          case 'e':  w = Math.max(MIN_SIZE, op.ow + dx); break
          case 's':  h = Math.max(MIN_SIZE, op.oh + dy); break
          case 'se': w = Math.max(MIN_SIZE, op.ow + dx); h = Math.max(MIN_SIZE, op.oh + dy); break
          case 'n': { const cd = Math.min(dy, op.oh - MIN_SIZE); y = op.oy + cd; h = op.oh - cd; break }
          case 'w': { const cd = Math.min(dx, op.ow - MIN_SIZE); x = op.ox + cd; w = op.ow - cd; break }
          case 'ne': {
            w = Math.max(MIN_SIZE, op.ow + dx)
            const cd = Math.min(dy, op.oh - MIN_SIZE); y = op.oy + cd; h = op.oh - cd; break
          }
          case 'sw': {
            const cd = Math.min(dx, op.ow - MIN_SIZE); x = op.ox + cd; w = op.ow - cd
            h = Math.max(MIN_SIZE, op.oh + dy); break
          }
          case 'nw': {
            const cdx = Math.min(dx, op.ow - MIN_SIZE); x = op.ox + cdx; w = op.ow - cdx
            const cdy = Math.min(dy, op.oh - MIN_SIZE); y = op.oy + cdy; h = op.oh - cdy; break
          }
        }
      }

      // Update DOM directly — no React re-render during drag = buttery smooth
      // Snap to grid if enabled
      if (snapRef.current) {
        const G = 20
        const s = (v: number) => Math.round(v / G) * G
        if (op.kind === 'move') {
          x = s(x); y = s(y)
        } else {
          const fRight  = op.ox + op.ow
          const fBottom = op.oy + op.oh
          switch (op.dir) {
            case 'e':  { const r = s(x + w); w = Math.max(G, r - x); break }
            case 's':  { const b = s(y + h); h = Math.max(G, b - y); break }
            case 'se': { const r = s(x + w); w = Math.max(G, r - x); const b = s(y + h); h = Math.max(G, b - y); break }
            case 'n':  { y = s(y); h = Math.max(G, fBottom - y); break }
            case 'w':  { x = s(x); w = Math.max(G, fRight  - x); break }
            case 'ne': { y = s(y); h = Math.max(G, fBottom - y); const r2 = s(x + w); w = Math.max(G, r2 - x); break }
            case 'sw': { x = s(x); w = Math.max(G, fRight - x); const b2 = s(y + h); h = Math.max(G, b2 - y); break }
            case 'nw': { x = s(x); y = s(y); w = Math.max(G, fRight - x); h = Math.max(G, fBottom - y); break }
          }
        }
      }

      // Smart guides: snap a moved widget to other widgets' edges/centers and
      // the canvas (left/right/top/bottom + center, both axes) — like Photoshop.
      if (op.kind === 'move') {
        const snap = smartSnap(x, y, w, h, layoutRef.current, op.id, canvasSizeRef.current.w, canvasSizeRef.current.h)
        x = snap.x
        y = snap.y
        const vg = vGuideRef.current, hg = hGuideRef.current
        if (vg) {
          if (snap.vGuide !== null) { vg.style.display = 'block'; vg.style.left = `${snap.vGuide}px` }
          else vg.style.display = 'none'
        }
        if (hg) {
          if (snap.hGuide !== null) { hg.style.display = 'block'; hg.style.top = `${snap.hGuide}px` }
          else hg.style.display = 'none'
        }
      }

      const el = document.getElementById(`xw-${op.id}`)
      if (el) {
        el.style.left   = `${x}px`
        el.style.top    = `${y}px`
        el.style.width  = `${w}px`
        el.style.height = `${h}px`
      }
    }

    function onMouseUp() {
      const op = opRef.current
      if (!op) return
      opRef.current = null
      document.body.style.cursor = ''
      // Hide smart alignment guides when the drag ends.
      if (vGuideRef.current) vGuideRef.current.style.display = 'none'
      if (hGuideRef.current) hGuideRef.current.style.display = 'none'

      // Only commit if the drag actually moved (inline styles were written).
      // A plain click never sets el.style.left, so el.style.left is '' — skip commit.
      const el = document.getElementById(`xw-${op.id}`)
      if (el && el.style.left !== '') {
        const x = parseFloat(el.style.left)   || 0
        const y = parseFloat(el.style.top)    || 0
        const w = parseFloat(el.style.width)  || MIN_SIZE
        const h = parseFloat(el.style.height) || MIN_SIZE
        el.style.removeProperty('left')
        el.style.removeProperty('top')
        el.style.removeProperty('width')
        el.style.removeProperty('height')
        geoRef.current(op.id, { x, y, w, h })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
    }
  }, []) // empty deps — stable via refs

  function startMove(e: React.MouseEvent, widgetId: string) {
    e.stopPropagation()
    e.preventDefault()
    const item = layoutRef.current.find(l => l.i === widgetId)
    if (!item) return
    document.body.style.cursor = 'grabbing'
    opRef.current = {
      kind: 'move', id: widgetId,
      mx0: e.clientX, my0: e.clientY,
      ox: item.x, oy: item.y, ow: item.w, oh: item.h,
    }
  }

  function startResize(e: React.MouseEvent, widgetId: string, dir: Dir) {
    e.stopPropagation()
    e.preventDefault()
    const item = layoutRef.current.find(l => l.i === widgetId)
    if (!item) return
    document.body.style.cursor = `${dir}-resize`
    opRef.current = {
      kind: 'resize', id: widgetId, dir,
      mx0: e.clientX, my0: e.clientY,
      ox: item.x, oy: item.y, ow: item.w, oh: item.h,
    }
  }

  return (
    <Box
      onClick={e => { if (e.target === e.currentTarget) { onSelect(null); onCanvasSelect?.() } }}
      onMouseDown={e => {
        // Middle button: pan the canvas from anywhere (e.g. after zooming in).
        if (e.button === 1) { e.preventDefault(); onPanStart?.(e); return }
        // Left button on empty canvas: pan too.
        if (e.button === 0 && e.target === e.currentTarget) onPanStart?.(e)
      }}
      sx={{
        position: 'relative',
        width: panel.canvasWidth,
        height: panel.canvasHeight,
        flexShrink: 0,
        // Background: image takes precedence over solid color
        background: panel.canvasBackground,
        ...(panel.canvasBackgroundImage && {
          backgroundImage: `url("${panel.canvasBackgroundImage}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }),
        overflow: 'visible',
        userSelect: 'none',
        // Dot-grid overlay
        ...(isEditMode && panel.canvasShowGrid && {
          backgroundImage: panel.canvasBackgroundImage
            ? `radial-gradient(circle, ${alpha(panel.canvasGridColor ?? '#ffffff', 0.20)} 1px, transparent 1px), url("${panel.canvasBackgroundImage}")`
            : `radial-gradient(circle, ${alpha(panel.canvasGridColor ?? '#ffffff', 0.20)} 1px, transparent 1px)`,
          backgroundSize: panel.canvasBackgroundImage
            ? '20px 20px, cover'
            : '20px 20px',
          backgroundPosition: panel.canvasBackgroundImage
            ? 'top left, center'
            : 'top left',
          backgroundRepeat: panel.canvasBackgroundImage
            ? 'repeat, no-repeat'
            : 'repeat',
        }),
        ...(isEditMode && { outline: `1px solid ${alpha('#ffffff', 0.08)}` }),
      }}
    >
      {panel.widgets.map(widget => {
        const item     = panel.layout.find(l => l.i === widget.id)
        if (!item) return null
        const selected = selectedWidgetId === widget.id

        return (
          <Box
            key={widget.id}
            id={`xw-${widget.id}`}
            sx={{
              position: 'absolute',
              left:   item.x,
              top:    item.y,
              width:  item.w,
              height: item.h,
              zIndex: widget.zIndex ?? 0,
              overflow: 'hidden',
              cursor: 'default',
              // Selection / hover outlines
              outline: isEditMode
                ? selected
                  ? `2px solid ${theme.palette.primary.main}`
                  : `1px dashed ${alpha('#ffffff', 0.13)}`
                : 'none',
              outlineOffset: selected ? 1 : 0,
              '&:hover': isEditMode && !selected
                ? { outline: `1px dashed ${alpha(theme.palette.primary.main, 0.55)}` }
                : {},
            }}
          >
            <WidgetRenderer widget={widget} snapshot={snapshot} history={history} />

            {/* Transparent overlay in edit mode — left-click selects + drags */}
            {isEditMode && (
              <Box
                onMouseDown={e => {
                  if (e.button === 0) {
                    // Left-click selects first, then starts a drag.
                    onSelect(widget.id)
                    startMove(e, widget.id)
                  }
                }}
                sx={{
                  position: 'absolute', inset: 0,
                  zIndex: 5,
                  cursor: 'default',
                }}
              />
            )}

            {/* 8-direction resize handles — visible only on selected widget */}
            {isEditMode && selected && HANDLES.map(({ dir, style }) => (
              <Box
                key={dir}
                component="div"
                onMouseDown={e => startResize(e, widget.id, dir)}
                sx={{
                  position: 'absolute',
                  width:  HANDLE_PX,
                  height: HANDLE_PX,
                  background: theme.palette.primary.main,
                  border: `1.5px solid ${theme.palette.background.paper}`,
                  borderRadius: '2px',
                  zIndex: 10,
                  ...style,
                  '&:hover': { background: theme.palette.primary.light },
                }}
              />
            ))}


          </Box>
        )
      })}

      {/* Smart alignment guides — shown while dragging to align with other widgets */}
      {isEditMode && (
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
          <Box ref={vGuideRef} sx={{ position: 'absolute', display: 'none', top: 0, bottom: 0, width: 0, borderLeft: `1px solid ${theme.palette.primary.main}` }} />
          <Box ref={hGuideRef} sx={{ position: 'absolute', display: 'none', left: 0, right: 0, height: 0, borderTop: `1px solid ${theme.palette.primary.main}` }} />
        </Box>
      )}
    </Box>
  )
}
