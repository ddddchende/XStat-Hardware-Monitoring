import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { PanelCanvas }      from '@/components/PanelCanvas'
import { useSensorHistory } from '@/hooks/useSensorHistory'
import { usePanelSensors }  from './usePanelSensors'
import { PanelSubscriptionContext, type PanelSubscribeRule } from './PanelSubscriptionContext'
import type { PanelLayout } from '@/types/panel'

const EMPTY_PANEL: PanelLayout = {
  id: 'default',
  name: 'Panel',
  canvasWidth: 1280,
  canvasHeight: 720,
  canvasBackground: '#0d0d10',
  canvasShowGrid: false,
  widgets: [],
  layout: [],
}

// Shown when the LAN panel has no widgets configured yet.
const GettingStarted: React.FC<{ loading: boolean }> = ({ loading }) => (
  <div style={{
    position: 'fixed', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0d0d10', fontFamily: 'Inter, system-ui, sans-serif',
  }}>
    <div style={{
      maxWidth: 480, padding: '40px 48px', borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.03)',
      textAlign: 'center', color: '#fff',
    }}>
      {/* icon */}
      <img src="/logo.png" alt="XStat" style={{ width: 64, height: 64, marginBottom: 16, opacity: 0.6 }} />

      <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px' }}>
        {loading ? 'Connecting to XStat…' : 'No panel configured'}
      </p>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
        {loading
          ? 'Waiting for the XStat service to push a panel layout.'
          : 'Open the XStat app on your PC, go to the Panel Designer, add widgets to your panel, and this display will update automatically.'}
      </p>

      {!loading && (
        <ol style={{
          margin: 0, padding: '0 0 0 20px',
          fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 2,
          textAlign: 'left',
        }}>
          <li>Open <strong style={{ color: 'rgba(255,255,255,0.8)' }}>XStat</strong> on your PC</li>
          <li>Navigate to <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Panel Designer</strong></li>
          <li>Add at least one widget to the canvas</li>
          <li>This page updates live — no refresh needed</li>
        </ol>
      )}
    </div>
  </div>
)

export const PanelApp: React.FC = () => {
  const { snapshot, layoutJson, historySeed, setSubscription } = usePanelSensors()
  const history = useSensorHistory(snapshot, historySeed)
  const hostRef  = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)

  // 自定义控件声明的服务端订阅贡献：widgetId → 规则数组 或 'all'（旧控件未声明 → 需要全量）
  const [customSubs, setCustomSubs] = useState<Record<string, PanelSubscribeRule[] | 'all'>>({})
  const registerSubscribe = useCallback((widgetId: string, rules: PanelSubscribeRule[] | 'all' | null) => {
    setCustomSubs(prev => {
      const next = { ...prev }
      if (rules === null) delete next[widgetId]
      else next[widgetId] = rules
      return next
    })
  }, [])

  const panel = useMemo<PanelLayout>(() => {
    if (!layoutJson) return EMPTY_PANEL
    try {
      return JSON.parse(layoutJson) as PanelLayout
    } catch {
      return EMPTY_PANEL
    }
  }, [layoutJson])

  // 汇总整个面板对服务端传感器的需求并上报：
  //  - 各传感器控件绑定的 sensorId
  //  - 自定义控件声明的订阅（或未声明 → 需要全量）
  //  - SensorList 控件列出所有传感器 → 需要全量
  // 服务端据此只推送订阅的传感器，大幅减小 ws 流量（无布局时订阅空集，几乎零流量）。
  useEffect(() => {
    const ids: PanelSubscribeRule[] = []
    let needAll = false
    for (const w of panel.widgets) {
      if (w.sensorId) ids.push(w.sensorId)
      if (w.type === 'SensorList') needAll = true
    }
    for (const rules of Object.values(customSubs)) {
      if (rules === 'all') needAll = true
      else ids.push(...rules)
    }
    setSubscription(needAll ? 'all' : Array.from(new Set(ids)))
  }, [panel, customSubs, setSubscription])

  // Auto-fit: scale the fixed-size canvas to the viewport ("contain"), so the
  // whole panel is always visible on phones / tablets / TVs without scrolling.
  // Zoom is intentionally locked — the LAN display is meant to fill the screen.
  useEffect(() => {
    if (!layoutJson || panel.widgets.length === 0) return
    const compute = () => {
      const host = hostRef.current
      if (!host) return
      const s = Math.min(
        host.clientWidth  / panel.canvasWidth,
        host.clientHeight / panel.canvasHeight,
      )
      setFit(Math.max(0.05, Math.min(4, s)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (hostRef.current) ro.observe(hostRef.current)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [layoutJson, panel.canvasWidth, panel.canvasHeight, panel.widgets.length])

  // Show guidance when: still loading (no layoutJson) or panel received but empty
  if (!layoutJson || panel.widgets.length === 0) {
    return <GettingStarted loading={!layoutJson} />
  }

  return (
    <div
      ref={hostRef}
      style={{
        position: 'fixed', inset: 0, overflow: 'hidden',
        background: panel.canvasBackground,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: panel.canvasWidth,
          height: panel.canvasHeight,
          flexShrink: 0,
          transform: `scale(${fit})`,
          // Zoom is locked: no browser pinch/double-tap zoom on the panel.
          touchAction: 'pan-x pan-y',
        }}
      >
        <PanelSubscriptionContext.Provider value={registerSubscribe}>
          <PanelCanvas
            panel={panel}
            snapshot={snapshot}
            history={history}
            isEditMode={false}
            snapToGrid={false}
            selectedWidgetIds={[]}
            onSelect={() => {}}
            onWidgetGeometries={() => {}}
          />
        </PanelSubscriptionContext.Provider>
      </div>
    </div>
  )
}
