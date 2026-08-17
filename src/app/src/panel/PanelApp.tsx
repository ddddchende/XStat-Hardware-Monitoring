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
  const { snapshot, layoutJson, panels, switchPanel, historySeed, setSubscription } = usePanelSensors()
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

  // 连点 3 次（600ms 窗口）呼出面板切换器 —— 平时完全无 UI，保持沉浸。
  // 注意：自定义控件是沙箱 iframe，其内部点击不冒泡到父页面；服务端在控件
  // HTML 里注入 tapBridge 脚本，通过 postMessage 上报 __xstatTap，这里统一
  // 计入连点统计，全屏控件上也能呼出切换器。
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const tapTimesRef = useRef<number[]>([])
  const switcherTimerRef = useRef<number | null>(null)
  const closeSwitcher = useCallback(() => {
    setSwitcherOpen(false)
    tapTimesRef.current = []          // 关闭时清空计数，防止关闭点击被计入下次连点
    if (switcherTimerRef.current !== null) window.clearTimeout(switcherTimerRef.current)
  }, [])
  const registerTap = useCallback(() => {
    if (panels.length < 2) return
    const now = Date.now()
    const recent = [...tapTimesRef.current.filter(t => now - t < 600), now]
    tapTimesRef.current = recent
    if (recent.length < 3) return
    tapTimesRef.current = []
    setSwitcherOpen(true)
    if (switcherTimerRef.current !== null) window.clearTimeout(switcherTimerRef.current)
    switcherTimerRef.current = window.setTimeout(() => closeSwitcher(), 6000)
  }, [panels.length, setSwitcherOpen, closeSwitcher])
  // 接收沙箱 iframe 内 tapBridge 上报的点击，与父页面点击走同一套连点逻辑。
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.__xstatTap) registerTap()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [registerTap])
  const pickPanel = (id: string) => {
    switchPanel(id)
    closeSwitcher()
  }
  useEffect(() => () => closeSwitcher(), [closeSwitcher])

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
      onClick={registerTap}
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

      {/* Panel switcher — only appears after a triple-tap, auto-hides. */}
      {switcherOpen && (
        <div
          onClick={(e) => { e.stopPropagation(); closeSwitcher() }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            minWidth: 200, maxWidth: '80vw',
            background: 'rgba(20,20,24,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14, padding: '8px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            {panels.map(p => (
              <button
                key={p.id}
                onClick={() => pickPanel(p.id)}
                style={{
                  display: 'block', width: '100%', padding: '10px 14px',
                  marginBottom: 4, border: 'none', borderRadius: 8,
                  background: 'transparent', color: '#fff',
                  fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14,
                  textAlign: 'left', cursor: 'pointer',
                  outline: p.id === panel.id ? '1px solid rgba(255,255,255,0.35)' : 'none',
                  opacity: p.id === panel.id ? 1 : 0.7,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {p.name || p.id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
