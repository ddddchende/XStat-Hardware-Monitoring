import React, { useRef, useEffect, useMemo, useImperativeHandle } from 'react'
import { Box, alpha, useTheme } from '@mui/material'
import type { PanelLayout, LayoutItem } from '@/types/panel'
import type { HardwareSnapshot } from '@/types/sensors'
import type { HistoryPoint } from '@/hooks/useSensorHistory'
import { WidgetRenderer } from './WidgetRenderer'
import { ensurePanelFonts } from '@/fonts/loadPanelFonts'

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

interface GroupMember { id: string; x: number; y: number; w: number; h: number }

interface ActiveOp {
  kind: 'move' | 'resize' | 'marquee'
  id: string
  dir?: Dir
  mx0: number; my0: number
  ox: number;  oy: number
  ow: number;  oh: number
  // Multi-widget move: snapshot of every selected widget at drag start.
  group?: GroupMember[]
  // Final positions per widget id, filled in while dragging.
  final?: Map<string, { x: number; y: number }>
  // Marquee (box) selection: ox/oy hold the start point in canvas space;
  // additive = Ctrl/Cmd held → toggle hits against initialSelection.
  additive?: boolean
  initialSelection?: string[]
}

interface GeomUpdate { id: string; geom: Partial<Omit<LayoutItem, 'i'>> }

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

/**
 * Resize smart-snap: while dragging a resize handle, align only the edge(s)
 * being changed (e/bottom = growing edge, w/top = shrinking edge) to the other
 * widgets' edges/centers and the canvas edges/center, on the relevant axes.
 * Returns the adjusted geometry plus guide line positions to draw.
 */
function resizeSmartSnap(
  x: number, y: number, w: number, h: number, dir: Dir,
  others: LayoutItem[], selfId: string,
  canvasW: number, canvasH: number,
): { x: number; y: number; w: number; h: number; vGuide: number | null; hGuide: number | null } {
  const tx: number[] = [0, canvasW / 2, canvasW]
  const ty: number[] = [0, canvasH / 2, canvasH]
  for (const l of others) {
    if (l.i === selfId) continue
    tx.push(l.x, l.x + l.w / 2, l.x + l.w)
    ty.push(l.y, l.y + l.h / 2, l.y + l.h)
  }
  // Nearest target within threshold (returns null when nothing is close).
  const nearest = (targets: number[], current: number): number | null => {
    let best: number | null = null
    let bestT: number | null = null
    for (const t of targets) {
      const d = Math.abs(t - current)
      if (d <= SNAP_THRESHOLD && (best === null || d < best)) { best = d; bestT = t }
    }
    return bestT
  }

  let vGuide: number | null = null
  let hGuide: number | null = null
  const axes = dir.split('')

  // Vertical axis (x / width) — track the edge this handle moves
  if (axes.includes('e')) {
    const t = nearest(tx, x + w)
    if (t !== null && t - x >= MIN_SIZE) { w = t - x; vGuide = t }
  } else if (axes.includes('w')) {
    const right = x + w
    const t = nearest(tx, x)
    if (t !== null && right - t >= MIN_SIZE) { x = t; w = right - t; vGuide = t }
  }
  // Horizontal axis (y / height)
  if (axes.includes('s')) {
    const t = nearest(ty, y + h)
    if (t !== null && t - y >= MIN_SIZE) { h = t - y; hGuide = t }
  } else if (axes.includes('n')) {
    const bottom = y + h
    const t = nearest(ty, y)
    if (t !== null && bottom - t >= MIN_SIZE) { y = t; h = bottom - t; hGuide = t }
  }
  return { x, y, w, h, vGuide, hGuide }
}

interface Props {
  panel: PanelLayout
  snapshot: HardwareSnapshot | null
  history: Map<string, HistoryPoint[]>
  isEditMode: boolean
  snapToGrid?: boolean
  /** Smart alignment guides — snap dragged/moved edges to other widgets & canvas. */
  smartAlign?: boolean
  selectedWidgetIds: string[]
  onSelect: (id: string | null, additive?: boolean) => void
  /** Select a whole widget group at once (click on any member). */
  onSelectGroup?: (ids: string[]) => void
  onWidgetGeometries: (updates: GeomUpdate[]) => void
  onPanStart?: (e: React.MouseEvent) => void
  onCanvasSelect?: () => void
  /** Canvas zoom factor (the wrapper is CSS-scaled); drag deltas must be divided by it. */
  zoom?: number
  /** Locked canvas — widgets can be selected but never dragged or resized. */
  locked?: boolean
}

export interface PanelCanvasHandle {
  startMarquee: (e: React.MouseEvent) => void
}

export const PanelCanvas = React.forwardRef<PanelCanvasHandle, Props>(({
  panel,
  snapshot,
  history,
  isEditMode,
  snapToGrid,
  smartAlign = true,
  selectedWidgetIds,
  onSelect,
  onSelectGroup,
  onWidgetGeometries,
  onPanStart,
  onCanvasSelect,
  zoom,
  locked = false,
}, ref) => {
  const theme = useTheme()

  // Stable refs so event listeners don't need to be re-attached on every render
  const opRef    = useRef<ActiveOp | null>(null)
  const layoutRef = useRef(panel.layout)
  const geoRef    = useRef(onWidgetGeometries)
  const snapRef   = useRef(snapToGrid)
  const alignRef  = useRef(smartAlign)
  const zoomRef   = useRef(zoom ?? 1)
  const vGuideRef = useRef<HTMLDivElement | null>(null)
  const hGuideRef = useRef<HTMLDivElement | null>(null)
  const groupFrameRef = useRef<HTMLDivElement | null>(null)
  const canvasSizeRef = useRef({ w: panel.canvasWidth, h: panel.canvasHeight })
  const canvasRef        = useRef<HTMLDivElement | null>(null)
  const marqueeRef       = useRef<HTMLDivElement | null>(null)
  const selectRef        = useRef(onSelect)
  const selectGroupRef   = useRef(onSelectGroup)
  const canvasSelectRef  = useRef(onCanvasSelect)
  const suppressClickRef = useRef(false)
  const startMarquee = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || e.button !== 0 || !isEditMode) return
    const rect = canvas.getBoundingClientRect()
    const z = zoomRef.current
    const cx = (e.clientX - rect.left) / z
    const cy = (e.clientY - rect.top) / z
    e.preventDefault()
    e.stopPropagation()
    suppressClickRef.current = false
    document.body.style.cursor = 'crosshair'
    opRef.current = {
      kind: 'marquee', id: '',
      mx0: e.clientX, my0: e.clientY,
      ox: cx, oy: cy, ow: 0, oh: 0,
      additive: e.ctrlKey || e.metaKey,
      initialSelection: [...selectedWidgetIds],
    }
  }
  useImperativeHandle(ref, () => ({ startMarquee }), [selectedWidgetIds, isEditMode])
  useEffect(() => { layoutRef.current = panel.layout },   [panel.layout])
  useEffect(() => { geoRef.current    = onWidgetGeometries }, [onWidgetGeometries])
  useEffect(() => { snapRef.current   = snapToGrid },       [snapToGrid])
  useEffect(() => { alignRef.current  = smartAlign },       [smartAlign])
  useEffect(() => { zoomRef.current   = zoom ?? 1 },        [zoom])
  useEffect(() => { canvasSizeRef.current = { w: panel.canvasWidth, h: panel.canvasHeight } }, [panel.canvasWidth, panel.canvasHeight])
  useEffect(() => { selectRef.current       = onSelect },        [onSelect])
  useEffect(() => { selectGroupRef.current   = onSelectGroup },  [onSelectGroup])
  useEffect(() => { canvasSelectRef.current  = onCanvasSelect }, [onCanvasSelect])

  // Pull fonts referenced by the panel from the service into this browser so
  // widgets render with the exact typeface the desktop user picked (esp. LAN
  // browsers that don't have custom/Chinese fonts installed).
  useEffect(() => { ensurePanelFonts(panel.widgets) }, [panel.widgets])

  // groupId → member widget ids, so a click on any member drags the whole group.
  const groupMembersById = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const w of panel.widgets) {
      if (!w.groupId) continue
      const list = map.get(w.groupId) ?? []
      list.push(w.id)
      map.set(w.groupId, list)
    }
    return map
  }, [panel.widgets])

  // A group whose members are exactly the current selection → draw one parent
  // outline around the whole group instead of per-member boxes.
  const fullySelectedGroup = useMemo(() => {
    if (selectedWidgetIds.length < 2) return null
    const selectedSet = new Set(selectedWidgetIds)
    for (const [gid, members] of groupMembersById) {
      if (members.length === selectedWidgetIds.length && members.every(m => selectedSet.has(m))) {
        return { id: gid, members }
      }
    }
    return null
  }, [selectedWidgetIds, groupMembersById])

  // DOM geometry helpers — written inline during drags for zero React re-renders
  function setGeom(id: string, x: number, y: number, w: number, h: number) {
    const el = document.getElementById(`xw-${id}`)
    if (!el) return
    el.style.left = `${x}px`
    el.style.top  = `${y}px`
    el.style.width  = `${w}px`
    el.style.height = `${h}px`
  }
  function clearGeom(id: string) {
    const el = document.getElementById(`xw-${id}`)
    if (!el) return
    el.style.removeProperty('left')
    el.style.removeProperty('top')
    el.style.removeProperty('width')
    el.style.removeProperty('height')
  }

  // Attach global mouse handlers once; read latest state via refs
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const op = opRef.current
      if (!op) return

      // ── Marquee (box) selection: update the drag rectangle in canvas space ──
      if (op.kind === 'marquee') {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const z = zoomRef.current
        const curX = (e.clientX - rect.left) / z
        const curY = (e.clientY - rect.top) / z
        const left = Math.min(op.ox, curX)
        const top = Math.min(op.oy, curY)
        const w = Math.abs(curX - op.ox)
        const h = Math.abs(curY - op.oy)
        const box = marqueeRef.current
        if (box) {
          box.style.display = 'block'
          box.style.left = `${left}px`
          box.style.top = `${top}px`
          box.style.width = `${w}px`
          box.style.height = `${h}px`
        }
        return
      }

      // Client-space deltas → canvas-space (the wrapper is CSS-scaled by zoom)
      const z = zoomRef.current
      const dx = (e.clientX - op.mx0) / z
      const dy = (e.clientY - op.my0) / z

      // ── Group move: primary widget snaps; members follow the same delta ──
      if (op.kind === 'move') {
        let dxm = dx, dym = dy
        let lock: 'x' | 'y' | null = null
        if (e.shiftKey) {
          // Photoshop-style axis lock: Shift restricts movement to the axis
          // with the larger displacement from the drag start.
          if (Math.abs(dxm) >= Math.abs(dym)) { dym = 0; lock = 'x' }
          else { dxm = 0; lock = 'y' }
        }
        let x = op.ox + dxm, y = op.oy + dym
        if (snapRef.current) {
          const G = 20
          x = Math.round(x / G) * G
          y = Math.round(y / G) * G
        }
        let vGuide: number | null = null
        let hGuide: number | null = null
        if (alignRef.current) {
          const dragging = new Set([op.id, ...(op.group?.map(g => g.id) ?? [])])
          if (op.group && op.group.length > 1) {
            // ── Group drag: snap the group's bounding frame, preferring other
            // group frames as targets; member widgets are not alignment points.
            const cur = op.group.map(g => ({ x: g.x + dxm, y: g.y + dym, w: g.w, h: g.h }))
            const gx = Math.min(...cur.map(m => m.x))
            const gy = Math.min(...cur.map(m => m.y))
            const gw = Math.max(...cur.map(m => m.x + m.w)) - gx
            const gh = Math.max(...cur.map(m => m.y + m.h)) - gy

            const targets: { i: string; x: number; y: number; w: number; h: number }[] = []
            // Other group frames (skip groups that share a dragged member)
            for (const [gid, ids] of groupMembersById) {
              if (ids.some(id => dragging.has(id))) continue
              const items = ids.map(id => layoutRef.current.find(l => l.i === id)).filter((l): l is LayoutItem => !!l)
              if (items.length < 2) continue
              const tx = Math.min(...items.map(l => l.x))
              const ty = Math.min(...items.map(l => l.y))
              const tw = Math.max(...items.map(l => l.x + l.w)) - tx
              const th = Math.max(...items.map(l => l.y + l.h)) - ty
              targets.push({ i: `frame-${gid}`, x: tx, y: ty, w: tw, h: th })
            }
            // Ungrouped widgets still snap normally
            for (const w of panel.widgets) {
              if (w.groupId || dragging.has(w.id)) continue
              const it = layoutRef.current.find(l => l.i === w.id)
              if (it) targets.push({ i: `w-${w.id}`, x: it.x, y: it.y, w: it.w, h: it.h })
            }

            const snap = smartSnap(gx, gy, gw, gh, targets, '__group__', canvasSizeRef.current.w, canvasSizeRef.current.h)
            const gddx = snap.x - gx
            const gddy = snap.y - gy
            x = op.ox + dxm + gddx
            y = op.oy + dym + gddy
            vGuide = snap.vGuide
            hGuide = snap.hGuide
          } else {
            // ── Single-widget drag: snap against everything NOT being dragged ──
            const others = layoutRef.current.filter(l => !dragging.has(l.i))
            const snap = smartSnap(x, y, op.ow, op.oh, others, op.id, canvasSizeRef.current.w, canvasSizeRef.current.h)
            x = snap.x
            y = snap.y
            vGuide = snap.vGuide
            hGuide = snap.hGuide
          }
          // While axis-locked, never let smart-snap shift the locked axis
          if (lock === 'x') y = op.oy + dym
          if (lock === 'y') x = op.ox + dxm
        }
        const ddx = x - (op.ox + dxm)   // snap adjustment applied to the whole group
        const ddy = y - (op.oy + dym)

        const final = op.final ?? (op.final = new Map())
        final.set(op.id, { x, y })
        setGeom(op.id, x, y, op.ow, op.oh)
        for (const g of op.group ?? []) {
          if (g.id === op.id) continue
          const mx = g.x + dxm + ddx
          const my = g.y + dym + ddy
          final.set(g.id, { x: mx, y: my })
          setGeom(g.id, mx, my, g.w, g.h)
        }

        const vg = vGuideRef.current, hg = hGuideRef.current
        if (vg) {
          if (vGuide !== null) { vg.style.display = 'block'; vg.style.left = `${vGuide}px` }
          else vg.style.display = 'none'
        }
        if (hg) {
          if (hGuide !== null) { hg.style.display = 'block'; hg.style.top = `${hGuide}px` }
          else hg.style.display = 'none'
        }

        // Keep the group's parent frame glued to the dragged members (DOM-direct,
        // like setGeom, so it follows without a React re-render).
        const frame = groupFrameRef.current
        if (frame && op.group && op.group.length > 1) {
          const pts: { x: number; y: number; w: number; h: number }[] = []
          for (const g of op.group) {
            const f = final.get(g.id)
            pts.push(f ? { x: f.x, y: f.y, w: g.w, h: g.h } : { x: g.x, y: g.y, w: g.w, h: g.h })
          }
          const gx = Math.min(...pts.map(p => p.x))
          const gy = Math.min(...pts.map(p => p.y))
          const gw = Math.max(...pts.map(p => p.x + p.w)) - gx
          const gh = Math.max(...pts.map(p => p.y + p.h)) - gy
          frame.style.left = `${gx}px`
          frame.style.top = `${gy}px`
          frame.style.width = `${gw}px`
          frame.style.height = `${gh}px`
        }
        return
      }

      // ── Resize (single widget) ──
      let x = op.ox, y = op.oy, w = op.ow, h = op.oh
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

      // Snap to grid if enabled
      if (snapRef.current) {
        const G = 20
        const s = (v: number) => Math.round(v / G) * G
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

      // Smart alignment: snap the edges this handle moves to other widgets/canvas
      if (alignRef.current) {
        const others = layoutRef.current.filter(l => l.i !== op.id)
        const rs = resizeSmartSnap(x, y, w, h, op.dir!, others, op.id, canvasSizeRef.current.w, canvasSizeRef.current.h)
        x = rs.x; y = rs.y; w = rs.w; h = rs.h
        const vg = vGuideRef.current, hg = hGuideRef.current
        if (vg) {
          if (rs.vGuide !== null) { vg.style.display = 'block'; vg.style.left = `${rs.vGuide}px` }
          else vg.style.display = 'none'
        }
        if (hg) {
          if (rs.hGuide !== null) { hg.style.display = 'block'; hg.style.top = `${rs.hGuide}px` }
          else hg.style.display = 'none'
        }
      }

      setGeom(op.id, x, y, w, h)
    }

    function onMouseUp(e: MouseEvent) {
      const op = opRef.current
      if (!op) return
      opRef.current = null
      document.body.style.cursor = ''
      // Hide smart alignment guides when the drag ends.
      if (vGuideRef.current) vGuideRef.current.style.display = 'none'
      if (hGuideRef.current) hGuideRef.current.style.display = 'none'

      // ── Marquee: finalize the box selection ──
      if (op.kind === 'marquee') {
        if (marqueeRef.current) marqueeRef.current.style.display = 'none'
        const moved = Math.abs(e.clientX - op.mx0) > 3 || Math.abs(e.clientY - op.my0) > 3
        if (!moved) {
          // A plain click on empty canvas clears the selection and selects the canvas.
          selectRef.current(null, false)
          canvasSelectRef.current?.()
        } else if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect()
          const z = zoomRef.current
          const curX = (e.clientX - rect.left) / z
          const curY = (e.clientY - rect.top) / z
          const left = Math.min(op.ox, curX), top = Math.min(op.oy, curY)
          const right = Math.max(op.ox, curX), bottom = Math.max(op.oy, curY)
          // Widgets that intersect the drag rectangle (canvas-space).
          const hits = layoutRef.current
            .filter(l => l.x < right && l.x + l.w > left && l.y < bottom && l.y + l.h > top)
            .map(l => l.i)
          if (op.additive) {
            // Ctrl/Cmd: toggle (inverse) each hit widget against the current selection.
            const init = new Set(op.initialSelection ?? [])
            for (const id of hits) { if (init.has(id)) init.delete(id); else init.add(id) }
            selectGroupRef.current?.([...init])
          } else {
            selectGroupRef.current?.(hits)
          }
        }
        // Suppress the synthetic click that follows so it doesn't clear the result.
        suppressClickRef.current = true
        return
      }

      // Group move: commit every widget that was actually dragged (op.final is
      // only populated when mousemove fired, so a plain click commits nothing).
      if (op.kind === 'move' && op.final) {
        const updates: GeomUpdate[] = []
        for (const [id, { x, y }] of op.final) {
          clearGeom(id)
          updates.push({ id, geom: { x, y } })
        }
        if (updates.length) geoRef.current(updates)
        return
      }

      // Resize: only commit if inline styles were written during the drag.
      if (op.kind === 'resize') {
        const el = document.getElementById(`xw-${op.id}`)
        if (el && el.style.left !== '') {
          const x = parseFloat(el.style.left)   || 0
          const y = parseFloat(el.style.top)    || 0
          const w = parseFloat(el.style.width)  || MIN_SIZE
          const h = parseFloat(el.style.height) || MIN_SIZE
          clearGeom(op.id)
          geoRef.current([{ id: op.id, geom: { x, y, w, h } }])
        }
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
    }
  }, []) // empty deps — stable via refs

  function startMove(e: React.MouseEvent, widgetId: string, groupIds: string[]) {
    e.stopPropagation()
    e.preventDefault()
    const item = layoutRef.current.find(l => l.i === widgetId)
    if (!item) return
    const group: GroupMember[] = groupIds
      .map(id => layoutRef.current.find(l => l.i === id))
      .filter((l): l is LayoutItem => !!l)
      .map(l => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h }))
    document.body.style.cursor = 'grabbing'
    opRef.current = {
      kind: 'move', id: widgetId,
      mx0: e.clientX, my0: e.clientY,
      ox: item.x, oy: item.y, ow: item.w, oh: item.h,
      group,
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

  const primaryId = selectedWidgetIds[selectedWidgetIds.length - 1] ?? null

  return (
    <Box
      ref={canvasRef}
      onClick={e => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return }
        if (e.target === e.currentTarget) { onSelect(null, false); onCanvasSelect?.() }
      }}
      onMouseDown={e => {
        suppressClickRef.current = false
        // Middle button: pan the canvas from anywhere (e.g. after zooming in).
        // stopPropagation so the editor's work-area handler doesn't fire twice.
        if (e.button === 1) { e.preventDefault(); e.stopPropagation(); onPanStart?.(e); return }
        // Left button on empty canvas.
        if (e.button === 0 && e.target === e.currentTarget) {
          if (isEditMode) {
            startMarquee(e)
          } else {
            onPanStart?.(e)
          }
        }
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
        const selected = selectedWidgetIds.includes(widget.id)
        // When the whole group is selected, members drop their own outline and the
        // group gets a single parent frame instead.
        const groupSelected = !!fullySelectedGroup && fullySelectedGroup.members.includes(widget.id)

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
                ? groupSelected
                  ? 'none'
                  : selected
                    ? `2px solid ${theme.palette.primary.main}`
                    : `1px dashed ${alpha('#ffffff', 0.13)}`
                : 'none',
              outlineOffset: !groupSelected && selected ? 1 : 0,
              '&:hover': isEditMode && !selected && !groupSelected
                ? { outline: `1px dashed ${alpha(theme.palette.primary.main, 0.55)}` }
                : {},
            }}
          >
            <WidgetRenderer widget={widget} snapshot={snapshot} history={history} panelId={panel.id} />

            {/* Transparent overlay in edit mode — left-click selects + drags */}
            {isEditMode && (
              <Box
                onMouseDown={e => {
                  if (e.button !== 0) return
                  const additive = e.ctrlKey || e.metaKey
                  if (locked) {
                    // Locked canvas: clicking still selects, never starts a drag.
                    onSelect(widget.id, additive)
                    return
                  }
                  if (additive) {
                    // Ctrl+click on an already-selected widget → deselect only
                    if (selectedWidgetIds.includes(widget.id)) {
                      onSelect(widget.id, true)
                      return
                    }
                    // Ctrl+click on an unselected widget → append to the group,
                    // then drag the whole (extended) group together.
                    onSelect(widget.id, true)
                    startMove(e, widget.id, [...selectedWidgetIds, widget.id])
                    return
                  }
                  if (selectedWidgetIds.includes(widget.id)) {
                    // Plain drag on a selected widget → move the entire group
                    startMove(e, widget.id, selectedWidgetIds)
                    return
                  }
                  // Plain click on an unselected widget: a grouped member selects and
                  // drags the whole group; otherwise select and drag it alone.
                  if (widget.groupId) {
                    const members = groupMembersById.get(widget.groupId) ?? [widget.id]
                    onSelectGroup?.(members)
                    startMove(e, widget.id, members)
                  } else {
                    onSelect(widget.id, false)
                    startMove(e, widget.id, [widget.id])
                  }
                }}
                sx={{
                  position: 'absolute', inset: 0,
                  zIndex: 5,
                  cursor: 'default',
                }}
              />
            )}

            {/* 8-direction resize handles — visible only on the primary (last-selected) widget */}
            {isEditMode && !locked && selected && primaryId === widget.id && HANDLES.map(({ dir, style }) => (
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

      {/* Parent frame around a fully-selected group — one box instead of per-member outlines */}
      {isEditMode && fullySelectedGroup && (() => {
        const items = fullySelectedGroup.members
          .map(id => panel.layout.find(l => l.i === id))
          .filter((l): l is LayoutItem => !!l)
        if (items.length < 2) return null
        const gx = Math.min(...items.map(l => l.x))
        const gy = Math.min(...items.map(l => l.y))
        const gw = Math.max(...items.map(l => l.x + l.w)) - gx
        const gh = Math.max(...items.map(l => l.y + l.h)) - gy
        return (
          <Box
            ref={groupFrameRef}
            sx={{
              position: 'absolute',
              left: gx, top: gy, width: gw, height: gh,
              border: `2px solid ${theme.palette.primary.main}`,
              borderRadius: 1,
              pointerEvents: 'none',
              zIndex: 30,
            }}
          />
        )
      })()}

      {/* Marquee (box) selection rectangle — drawn while dragging on empty canvas */}
      {isEditMode && (
        <Box
          ref={marqueeRef}
          sx={{
            position: 'absolute',
            display: 'none',
            border: `1px solid ${theme.palette.primary.main}`,
            backgroundColor: alpha(theme.palette.primary.main, 0.15),
            pointerEvents: 'none',
            zIndex: 40,
          }}
        />
      )}

      {/* Smart alignment guides — shown while dragging to align with other widgets */}
      {isEditMode && (
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
          <Box ref={vGuideRef} sx={{ position: 'absolute', display: 'none', top: 0, bottom: 0, width: 0, borderLeft: `1px solid ${theme.palette.primary.main}` }} />
          <Box ref={hGuideRef} sx={{ position: 'absolute', display: 'none', left: 0, right: 0, height: 0, borderTop: `1px solid ${theme.palette.primary.main}` }} />
        </Box>
      )}
    </Box>
  )
})

PanelCanvas.displayName = 'PanelCanvas'
