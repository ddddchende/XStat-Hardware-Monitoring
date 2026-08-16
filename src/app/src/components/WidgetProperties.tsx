import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Box, Typography, TextField, Switch, FormControlLabel,
  ToggleButton, ToggleButtonGroup, Divider, Button, Autocomplete,
  Tooltip, alpha, useTheme, Select, MenuItem, InputLabel, FormControl, IconButton,
  Slider,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import SensorsIcon from '@mui/icons-material/Sensors'
import FormatAlignLeftIcon   from '@mui/icons-material/FormatAlignLeft'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignRightIcon  from '@mui/icons-material/FormatAlignRight'
import DeleteOutlineIcon     from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon       from '@mui/icons-material/ContentCopy'
import DownloadIcon          from '@mui/icons-material/Download'
import SelectAllIcon         from '@mui/icons-material/SelectAll'
import GroupRemoveIcon       from '@mui/icons-material/GroupRemove'
import CodeIcon              from '@mui/icons-material/Code'
import ImageIcon                    from '@mui/icons-material/Image'
import KeyboardDoubleArrowUpIcon    from '@mui/icons-material/KeyboardDoubleArrowUp'
import KeyboardArrowUpIcon          from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon        from '@mui/icons-material/KeyboardArrowDown'
import KeyboardDoubleArrowDownIcon  from '@mui/icons-material/KeyboardDoubleArrowDown'
import type { PanelWidget, LayoutItem, BoxAnimation, TextShadowStyle, CustomTextStyle } from '@/types/panel'
import type { HardwareSnapshot, SensorReading } from '@/types/sensors'
import { SensorPickerDialog }   from '@/components/SensorPickerDialog'
import { boxEffectSupportsRandom } from '@/components/widgets/boxEffects'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { useFonts } from '@/hooks/useFonts'
import { extractPropSchema, type CustomPropSchema } from '@/components/widgets/CustomWidget'

const PRESET_COLORS = [
  '#03dac6', '#7c6ef5', '#4caf50', '#ff9800',
  '#f44336', '#2196f3', '#e91e63', '#ffffff',
]

function ColorSwatchesPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const theme = useTheme()
  const rafRef = React.useRef<number | null>(null)
  const pendingRef = React.useRef<string>(value)
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pendingRef.current = e.target.value
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      onChange(pendingRef.current)
      rafRef.current = null
    })
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {PRESET_COLORS.map(c => (
          <Tooltip key={c} title={c} arrow>
            <Box
              onClick={() => onChange(c)}
              sx={{
                width: 17, height: 17, borderRadius: '50%',
                background: c, cursor: 'pointer', flexShrink: 0,
                border: value === c
                  ? `2px solid ${theme.palette.primary.main}`
                  : '2px solid transparent',
                boxSizing: 'border-box',
                '&:hover': { opacity: 0.8 },
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Box
        component="input"
        type="color"
        value={pickerValue}
        onChange={handlePickerChange}
        sx={{
          display: 'block', width: '100%', height: 28,
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 1,
          cursor: 'pointer', padding: '2px 3px',
          background: 'transparent', boxSizing: 'border-box',
        }}
      />
    </>
  )
}

const COMMON_FONTS = [
  'Inter', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Georgia', 'Times New Roman', 'Courier New', 'Lucida Console',
  'Impact', 'Comic Sans MS', 'Segoe UI', 'Calibri', 'Consolas',
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
  // 中文字体（Windows 系统自带）
  '微软雅黑', '宋体', '黑体', '楷体', '仿宋', '等线', '幼圆', '隶书',
]

/** Text dump of every live sensor, grouped like the SensorList widget — for copying. */
function buildSensorListText(snapshot: HardwareSnapshot | null): string {
  const sensors = snapshot?.sensors ?? []
  const lines: string[] = [`All Sensors (${sensors.length})`, '']
  const cats = new Map<string, { hws: Map<string, SensorReading[]>; count: number }>()
  for (const s of sensors) {
    let cat = cats.get(s.category)
    if (!cat) { cat = { hws: new Map(), count: 0 }; cats.set(s.category, cat) }
    cat.count++
    const list = cat.hws.get(s.hardwareName)
    if (list) list.push(s)
    else cat.hws.set(s.hardwareName, [s])
  }
  for (const [cat, g] of [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${cat} (${g.count})`)
    for (const [hw, list] of g.hws) {
      lines.push(`  ${hw}`)
      for (const s of list) {
        lines.push(`    ${s.name}   ${s.type}   ${s.value ?? '—'}   ${s.unit}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

interface Props {
  widget: PanelWidget
  layout?: LayoutItem
  snapshot: HardwareSnapshot | null
  allWidgets?: PanelWidget[]
  onUpdate: (updates: Partial<PanelWidget>) => void
  onGeometry?: (geom: Partial<Omit<LayoutItem, 'i'>>) => void
  onRemove: () => void
  onDuplicate?: () => void
  // Group info — present when the selected widget belongs to a group.
  groupMemberCount?: number
  onSelectGroup?: () => void
  onUngroup?: () => void
  onDuplicateGroup?: () => void
  onExportGroup?: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        color: 'text.disabled', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        display: 'block', mb: 1,
      }}
    >
      {children}
    </Typography>
  )
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useTranslation()
  return (
    <Box>
      <SectionLabel>{t('widgetProperties.color')}</SectionLabel>
      <ColorSwatchesPicker value={value} onChange={onChange} />
      <TextField
        size="small"
        fullWidth
        label={t('widgetProperties.customHex')}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        inputProps={{ spellCheck: false }}
        sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
      />
    </Box>
  )
}

function AccentColorRow({ value, onChange, visible, onVisibleChange }: {
  value: string; onChange: (c: string) => void
  visible?: boolean; onVisibleChange?: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const on = visible ?? true
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: on ? 1 : 0.45 }}>
          {t('widgetProperties.accent')}
        </Typography>
        <Switch size="small" checked={on} onChange={e => onVisibleChange?.(e.target.checked)} sx={{ mr: -0.5 }} />
      </Box>
      {on && (
        <>
          <ColorSwatchesPicker value={value} onChange={onChange} />
          <TextField
            size="small"
            fullWidth
            label={t('widgetProperties.customHex')}
            value={value}
            onChange={e => onChange(e.target.value)}
            inputProps={{ spellCheck: false }}
            sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
          />
        </>
      )}
    </Box>
  )
}

/** Small labeled slider row for text-shadow parameters. */
function ShadowSlider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number
  onChange: (v: number) => void
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>{Math.round(value)}</Typography>
      </Box>
      <Slider
        size="small"
        min={min}
        max={max}
        value={value}
        onChange={(_, v) => onChange(Number(v))}
        sx={{ '& .MuiSlider-thumb': { width: 14, height: 14 } }}
      />
    </Box>
  )
}

/**
 * Text-shadow editor: enable switch + color + strength/blur/distance/angle.
 * Defined at module level so its component identity stays stable across renders —
 * defining it inside a render body would remount the subtree on every update and
 * drop the slider's pointer capture mid-drag.
 */
function ShadowControls({ shadow, onChange }: {
  shadow?: TextShadowStyle
  onChange: (s: TextShadowStyle) => void
}) {
  const { t } = useTranslation()
  return (
    <Box sx={{ mt: 0.5 }}>
      <FormControlLabel
        sx={{ mr: 0, ml: 0 }}
        control={
          <Switch
            size="small"
            checked={shadow?.enabled ?? false}
            onChange={e => onChange({ ...(shadow ?? {}), enabled: e.target.checked })}
          />
        }
        label={<Typography variant="body2">{t('widgetProperties.textShadow')}</Typography>}
      />
      {shadow?.enabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 1, borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
          <ColorSwatchesPicker
            value={shadow.color ?? '#000000'}
            onChange={c => onChange({ ...shadow, color: c })}
          />
          <ShadowSlider
            label={t('widgetProperties.shadowStrength')}
            value={shadow.opacity ?? 100}
            min={0}
            max={100}
            onChange={v => onChange({ ...shadow, opacity: v })}
          />
          <ShadowSlider
            label={t('widgetProperties.shadowBlur')}
            value={shadow.blur ?? 8}
            min={0}
            max={40}
            onChange={v => onChange({ ...shadow, blur: v })}
          />
          <ShadowSlider
            label={t('widgetProperties.shadowDistance')}
            value={shadow.distance ?? 4}
            min={0}
            max={20}
            onChange={v => onChange({ ...shadow, distance: v })}
          />
          <ShadowSlider
            label={t('widgetProperties.shadowAngle')}
            value={shadow.angle ?? 45}
            min={0}
            max={360}
            onChange={v => onChange({ ...shadow, angle: v })}
          />
        </Box>
      )}
    </Box>
  )
}

function TextStyleSection({
  title, color, fontSize, bold, fontFamily, italic, fontOptions,
  visible, onVisibleChange,
  onColorChange, onFontSizeChange, onBoldChange, onFontFamilyChange, onItalicChange,
  shadow, onShadowChange,
}: {
  title: string
  color: string
  fontSize: number
  bold: boolean
  fontFamily: string
  italic: boolean
  fontOptions: string[]
  visible?: boolean
  onVisibleChange?: (v: boolean) => void
  onColorChange: (c: string) => void
  onFontSizeChange: (s: number) => void
  onBoldChange: (b: boolean) => void
  onFontFamilyChange: (f: string) => void
  onItalicChange: (i: boolean) => void
  shadow?: TextShadowStyle
  onShadowChange?: (s: TextShadowStyle) => void
}) {
  const { t } = useTranslation()

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            opacity: onVisibleChange && visible === false ? 0.45 : 1,
          }}
        >
          {title}
        </Typography>
        {onVisibleChange !== undefined && (
          <Switch
            size="small"
            checked={visible ?? true}
            onChange={e => onVisibleChange(e.target.checked)}
            sx={{ mr: -0.5 }}
          />
        )}
      </Box>
      {(visible ?? true) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <ColorSwatchesPicker value={color} onChange={onColorChange} />
        <TextField
          size="small"
          fullWidth
          label={t('widgetProperties.colorHex')}
          value={color}
          onChange={e => onColorChange(e.target.value)}
          inputProps={{ spellCheck: false }}
          sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
        />
        <TextField
          size="small"
          fullWidth
          label={t('widgetProperties.fontSize')}
          type="number"
          value={fontSize}
          onChange={e => onFontSizeChange(Math.max(6, Number(e.target.value)))}
          inputProps={{ min: 6, max: 200, step: 1 }}
        />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            sx={{ mr: 0, ml: 0 }}
            control={
              <Switch size="small" checked={bold} onChange={e => onBoldChange(e.target.checked)} />
            }
            label={<Typography variant="body2" sx={{ fontWeight: 700 }}>{t('widgetProperties.bold')}</Typography>}
          />
          <FormControlLabel
            sx={{ mr: 0, ml: 0 }}
            control={
              <Switch size="small" checked={italic} onChange={e => onItalicChange(e.target.checked)} />
            }
            label={<Typography variant="body2" sx={{ fontStyle: 'italic' }}>{t('widgetProperties.italic')}</Typography>}
          />
        </Box>
        <Autocomplete
          size="small"
          freeSolo
          options={fontOptions}
          value={fontFamily}
          onInputChange={(_, v) => onFontFamilyChange(v)}
          renderInput={params => (
            <TextField {...params} label={t('widgetProperties.fontFamily')} placeholder={t('widgetProperties.fontFamilyPlaceholder')} />
          )}
          renderOption={(props, option) => (
            <li {...props} style={{ fontFamily: option, fontSize: '0.82rem' }}>{option}</li>
          )}
        />
        {onShadowChange && (
          <ShadowControls shadow={shadow} onChange={s => onShadowChange(s)} />
        )}
      </Box>
      )}
    </Box>
  )
}

const isSensorWidget = (w: PanelWidget) =>
  ['SensorValue', 'SensorBar', 'SensorSparkline', 'SensorGauge'].includes(w.type)

const hasRange = (w: PanelWidget) =>
  w.type === 'SensorBar' || w.type === 'SensorGauge' || w.type === 'SensorSparkline'

// Style variants per sensor widget type (shown as a segmented control in the panel)
const VARIANT_OPTIONS: Record<string, { value: string; labelKey: string }[]> = {
  SensorBar: [
    { value: 'flat',      labelKey: 'widgetProperties.variantBarFlat' },
    { value: 'rounded',   labelKey: 'widgetProperties.variantBarRounded' },
    { value: 'segmented', labelKey: 'widgetProperties.variantBarSegmented' },
  ],
  SensorGauge: [
    { value: 'arc',  labelKey: 'widgetProperties.variantGaugeArc' },
    { value: 'full', labelKey: 'widgetProperties.variantGaugeFull' },
    { value: 'half', labelKey: 'widgetProperties.variantGaugeHalf' },
  ],
  SensorSparkline: [
    { value: 'area', labelKey: 'widgetProperties.variantSparkArea' },
    { value: 'line', labelKey: 'widgetProperties.variantSparkLine' },
    { value: 'bars', labelKey: 'widgetProperties.variantSparkBars' },
  ],
}

export const WidgetProperties: React.FC<Props> = ({ widget, layout, snapshot, allWidgets, onUpdate, onGeometry, onRemove, onDuplicate, groupMemberCount, onSelectGroup, onUngroup, onDuplicateGroup, onExportGroup }) => {
  const theme = useTheme()
  const { t } = useTranslation()
  const sensors = snapshot?.sensors ?? []
  const [sensorDialogOpen, setSensorDialogOpen] = useState(false)
  // 自定义控件配置里正在编辑的 sensor 参数 key（null = 未打开）
  const [customSensorProp, setCustomSensorProp] = useState<string | null>(null)
  const [renamingWidget, setRenamingWidget] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [sensorListCopied, setSensorListCopied] = useState(false)
  // Shared system info cache — used to enumerate available disk drive letters
  // for the SystemInfo widget's per-disk visibility picker.
  const { info: sysInfo } = useSystemInfo()
  // Fonts actually installed on the OS (falls back to COMMON_FONTS while loading
  // or when running outside Electron).
  const installedFonts = useFonts()
  const fontOptions = installedFonts.length > 0 ? installedFonts : COMMON_FONTS

  // Custom widget — configurable props declared via __xstatConfig in the HTML.
  const customSchema = useMemo<CustomPropSchema[]>(
    () => (widget.type === 'Custom' ? extractPropSchema(widget.customHtml ?? '') : []),
    [widget.type, widget.customHtml],
  )

  /** Render one declared config prop as an editor control; writes back via onUpdate({ customProps }). */
  const updateCustomProp = (key: string, v: string | number | boolean | CustomTextStyle) =>
    onUpdate({ customProps: { ...(widget.customProps ?? {}), [key]: v } })

  const renderCustomPropField = (p: CustomPropSchema): React.ReactNode => {
    const value = widget.customProps?.[p.key] ?? p.default
    const update = (v: string | number | boolean | CustomTextStyle) => updateCustomProp(p.key, v)
    const label = p.label ?? p.key
    switch (p.type) {
      case 'color':
        return (
          <Box key={p.key}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
            <ColorSwatchesPicker value={String(value ?? '')} onChange={update} />
          </Box>
        )
      case 'text':
        return (
          <TextField
            key={p.key} size="small" label={label}
            value={value == null ? '' : String(value)}
            onChange={e => update(e.target.value)}
          />
        )
      case 'number':
        return (
          <TextField
            key={p.key} size="small" type="number" label={label}
            value={value == null ? '' : String(value)}
            inputProps={{ min: p.min, max: p.max, step: p.step ?? 1 }}
            onChange={e => update(e.target.value === '' ? '' : Number(e.target.value))}
          />
        )
      case 'boolean':
        return (
          <FormControlLabel
            key={p.key} sx={{ m: 0 }}
            control={<Switch size="small" checked={!!value} onChange={e => update(e.target.checked)} />}
            label={<Typography variant="body2">{label}</Typography>}
          />
        )
      case 'select': {
        const opts = p.options ?? []
        const sel = value == null ? '' : String(value)
        // 少量选项（多样式切换等场景）用分段按钮，一目了然；多选项用下拉
        if (opts.length > 0 && opts.length <= 4) {
          return (
            <Box key={p.key}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={sel}
                onChange={(_e, v) => { if (v) update(v) }}
              >
                {opts.map(o => (
                  <ToggleButton key={o} value={o} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                    {o}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )
        }
        return (
          <FormControl key={p.key} size="small" fullWidth>
            <InputLabel>{label}</InputLabel>
            <Select label={label} value={sel} onChange={e => update(e.target.value)}>
              {opts.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </Select>
          </FormControl>
        )
      }
      case 'sensor': {
        const cur = value == null ? '' : String(value)
        const sel = sensors.find(s => s.id === cur)
        return (
          <Box key={p.key}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
            <Button
              size="small"
              variant="outlined"
              fullWidth
              startIcon={<SensorsIcon sx={{ fontSize: 16 }} />}
              onClick={() => setCustomSensorProp(p.key)}
              sx={{ textTransform: 'none', justifyContent: 'flex-start', fontSize: '0.75rem' }}
            >
              {sel
                ? `${sel.category} · ${sel.name}`
                : (cur || '选择传感器')}
            </Button>
          </Box>
        )
      }
      case 'textstyle': {
        const ts = (value && typeof value === 'object' ? value : {}) as CustomTextStyle
        return (
          <TextStyleSection
            key={p.key}
            fontOptions={fontOptions}
            title={label}
            color={ts.color ?? '#ffffff'}
            fontSize={ts.fontSize ?? 14}
            bold={ts.bold ?? false}
            fontFamily={ts.fontFamily ?? ''}
            italic={ts.italic ?? false}
            onColorChange={c => update({ ...ts, color: c })}
            onFontSizeChange={s => update({ ...ts, fontSize: s })}
            onBoldChange={b => update({ ...ts, bold: b })}
            onFontFamilyChange={f => update({ ...ts, fontFamily: f })}
            onItalicChange={i => update({ ...ts, italic: i })}
            shadow={ts.textShadow}
            onShadowChange={s => update({ ...ts, textShadow: s })}
          />
        )
      }
      case 'slider':
        return (
          <Box key={p.key}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {label}: {String(value ?? '')}
            </Typography>
            <Slider
              min={p.min ?? 0} max={p.max ?? 100} step={p.step ?? 1}
              value={typeof value === 'number' ? value : (p.min ?? 0)}
              onChange={(_e, v) => update(Array.isArray(v) ? v[0] : v)}
              size="small"
            />
          </Box>
        )
      default:
        return null
    }
  }

  function startRename() {
    setRenameValue(widget.widgetName ?? widget.type.replace(/([A-Z])/g, ' $1').trim())
    setRenamingWidget(true)
  }

  function commitRename() {
    const trimmed = renameValue.trim()
    onUpdate({ widgetName: trimmed || undefined })
    setRenamingWidget(false)
  }

  // Listen for save events from the detached editor window
  useEffect(() => {
    window.xstat.widgetEditor.onSaved(({ widgetId, html, files }) => {
      if (widgetId === widget.id) {
        onUpdate({ customHtml: html, customFiles: files })
      }
    })
    return () => { window.xstat.widgetEditor.offSaved() }
  }, [widget.id, onUpdate])

  // Sort: category → hardwareName → sensorType → name
  // Group by hardwareName so duplicate sensor names (e.g. "Upload Speed" across 10 NICs)
  // each appear under their own adapter heading
  const sortedSensors = [...sensors].sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.hardwareName.localeCompare(b.hardwareName) ||
    a.type.localeCompare(b.type) ||
    a.name.localeCompare(b.name)
  )
  const selectedSensor = sensors.find(s => s.id === widget.sensorId) ?? null

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
        {renamingWidget ? (
          <TextField
            size="small"
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingWidget(false) }}
            sx={{ flex: 1, '& .MuiInputBase-input': { py: 0.4, fontSize: '0.85rem', fontWeight: 700 } }}
          />
        ) : (
          <Tooltip title={t('widgetProperties.clickToRename')} arrow placement="bottom-start">
            <Typography
              variant="subtitle2"
              onClick={startRename}
              sx={{
                fontWeight: 700, textTransform: 'capitalize', cursor: 'text', flex: 1,
                px: 0.5, py: 0.25, borderRadius: 1, border: '1px solid transparent',
                '&:hover': { border: `1px solid ${alpha('#ffffff', 0.15)}`, background: alpha('#ffffff', 0.04) },
              }}
            >
              {widget.widgetName ?? widget.type.replace(/([A-Z])/g, ' $1').trim()}
            </Typography>
          </Tooltip>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {onDuplicate && (
            <Tooltip title={t('widgetProperties.duplicateWidget')} arrow>
              <Box
                onClick={onDuplicate}
                sx={{
                  p: 0.5, borderRadius: 1, cursor: 'pointer', color: 'text.secondary',
                  '&:hover': { background: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' },
                }}
              >
                <ContentCopyIcon fontSize="small" />
              </Box>
            </Tooltip>
          )}
          <Tooltip title={t('widgetProperties.exportWidget')} arrow>
            <Box
              onClick={() => {
                const data = JSON.stringify({ version: 1, widget }, null, 2)
                const blob = new Blob([data], { type: 'application/json' })
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement('a')
                a.href     = url
                a.download = `${(widget.widgetName ?? widget.type).replace(/\s+/g, '_')}.xstatwidget`
                a.click()
                URL.revokeObjectURL(url)
              }}
              sx={{
                p: 0.5, borderRadius: 1, cursor: 'pointer', color: 'text.secondary',
                '&:hover': { background: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' },
              }}
            >
              <DownloadIcon fontSize="small" />
            </Box>
          </Tooltip>
          <Tooltip title={t('widgetProperties.deleteWidget')} arrow>
            <Box
              onClick={onRemove}
              sx={{
                p: 0.5, borderRadius: 1, cursor: 'pointer', color: 'error.main',
                '&:hover': { background: alpha(theme.palette.error.main, 0.1) },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </Box>
          </Tooltip>
        </Box>
      </Box>

      <Divider />

      {/* ── Group ────────────────────────────────────────────────── */}
      {(groupMemberCount ?? 0) > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SectionLabel>
            {t('panelEditor.group')} · {t('panelEditor.groupMembers', { count: groupMemberCount })}
          </SectionLabel>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {onSelectGroup && (
              <Button
                size="small"
                startIcon={<SelectAllIcon sx={{ fontSize: 15 }} />}
                onClick={onSelectGroup}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {t('panelEditor.selectGroup')}
              </Button>
            )}
            {onDuplicateGroup && (
              <Button
                size="small"
                startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
                onClick={onDuplicateGroup}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {t('panelEditor.duplicateGroup')}
              </Button>
            )}
            {onExportGroup && (
              <Button
                size="small"
                startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
                onClick={onExportGroup}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {t('panelEditor.exportGroup')}
              </Button>
            )}
            {onUngroup && (
              <Button
                size="small"
                startIcon={<GroupRemoveIcon sx={{ fontSize: 15 }} />}
                onClick={onUngroup}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {t('panelEditor.ungroup')}
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* ── Position & Size ──────────────────────────────────────── */}
      {layout && onGeometry && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.positionSize')}</SectionLabel>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <TextField
              size="small" label="X" type="number"
              value={layout.x}
              onChange={e => onGeometry({ x: Math.round(Number(e.target.value)) })}
              inputProps={{ step: 1 }}
            />
            <TextField
              size="small" label="Y" type="number"
              value={layout.y}
              onChange={e => onGeometry({ y: Math.round(Number(e.target.value)) })}
              inputProps={{ step: 1 }}
            />
            <TextField
              size="small" label="W" type="number"
              value={layout.w}
              onChange={e => onGeometry({ w: Math.max(1, Math.round(Number(e.target.value))) })}
              inputProps={{ step: 1, min: 1 }}
            />
            <TextField
              size="small" label="H" type="number"
              value={layout.h}
              onChange={e => onGeometry({ h: Math.max(1, Math.round(Number(e.target.value))) })}
              inputProps={{ step: 1, min: 1 }}
            />
          </Box>
        </Box>
      )}

      <Divider />

      {/* ── Layer ──────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <SectionLabel>{t('widgetProperties.layer')}</SectionLabel>
        <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center' }}>
          <Tooltip title={t('widgetProperties.sendToBack')} arrow>
            <IconButton size="small" onClick={() => {
              const min = Math.min(...(allWidgets ?? [widget]).map(w => w.zIndex ?? 0))
              onUpdate({ zIndex: min - 1 })
            }}>
              <KeyboardDoubleArrowDownIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('widgetProperties.sendBackward')} arrow>
            <IconButton size="small" onClick={() => onUpdate({ zIndex: (widget.zIndex ?? 0) - 1 })}>
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('widgetProperties.bringForward')} arrow>
            <IconButton size="small" onClick={() => onUpdate({ zIndex: (widget.zIndex ?? 0) + 1 })}>
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('widgetProperties.bringToFront')} arrow>
            <IconButton size="small" onClick={() => {
              const max = Math.max(...(allWidgets ?? [widget]).map(w => w.zIndex ?? 0))
              onUpdate({ zIndex: max + 1 })
            }}>
              <KeyboardDoubleArrowUpIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ ml: 'auto', color: 'text.disabled' }}>
            {t('widgetProperties.z', { value: widget.zIndex ?? 0 })}
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* ── Sensor binding ──────────────────────────────────────── */}
      {isSensorWidget(widget) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.sensor')}</SectionLabel>

          {/* Bind sensor button */}
          <Button
            size="small"
            variant="outlined"
            fullWidth
            startIcon={<SensorsIcon sx={{ fontSize: 16 }} />}
            onClick={() => setSensorDialogOpen(true)}
            sx={{
              justifyContent: 'flex-start', textTransform: 'none',
              fontFamily: 'inherit', fontSize: '0.8rem',
              color: selectedSensor ? 'text.primary' : 'text.disabled',
              borderColor: selectedSensor ? 'divider' : alpha('#ffffff', 0.15),
              overflow: 'hidden',
            }}
          >
            <Box sx={{ overflow: 'hidden', textAlign: 'left' }}>
              <Typography
                variant="body2"
                noWrap
                sx={{ fontSize: '0.8rem', lineHeight: 1.3, color: selectedSensor ? 'text.primary' : 'text.disabled' }}
              >
                {selectedSensor ? selectedSensor.name : t('widgetProperties.chooseSensor')}
              </Typography>
              {selectedSensor && (
                <Typography variant="caption" noWrap sx={{ fontSize: '0.68rem', color: 'text.disabled', display: 'block' }}>
                  {selectedSensor.hardwareName} · {selectedSensor.type}
                </Typography>
              )}
            </Box>
          </Button>

          <SensorPickerDialog
            open={sensorDialogOpen}
            sensors={sortedSensors}
            selectedId={widget.sensorId}
            onSelect={s => onUpdate({ sensorId: s?.id })}
            onClose={() => setSensorDialogOpen(false)}
          />
          <TextField
            size="small"
            fullWidth
            label={t('widgetProperties.labelOverride')}
            placeholder={selectedSensor?.name ?? t('widgetProperties.sensorNamePlaceholder')}
            value={widget.label ?? ''}
            onChange={e => onUpdate({ label: e.target.value || undefined })}
          />
          <TextField
            size="small"
            fullWidth
            label={t('widgetProperties.unitOverride')}
            placeholder={selectedSensor?.unit ?? t('widgetProperties.unitPlaceholder')}
            value={widget.unit ?? ''}
            onChange={e => onUpdate({ unit: e.target.value || undefined })}
          />
        </Box>
      )}

      {/* ── Style variant (Bar / Gauge / Sparkline) ──────────────── */}
      {VARIANT_OPTIONS[widget.type] && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.variant')}</SectionLabel>
          <ToggleButtonGroup
            size="small"
            exclusive
            fullWidth
            value={widget.variant ?? VARIANT_OPTIONS[widget.type][0].value}
            onChange={(_, v) => v && onUpdate({ variant: v })}
            sx={{ '& .MuiToggleButton-root': { fontSize: '0.7rem', py: 0.5, textTransform: 'none' } }}
          >
            {VARIANT_OPTIONS[widget.type].map(opt => (
              <ToggleButton key={opt.value} value={opt.value}>{t(opt.labelKey)}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {/* ── Range (Bar + Gauge + Sparkline) ─────────────────────── */}
      {hasRange(widget) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.range')}</SectionLabel>
          {/* Sparkline: Y axis auto-scales by default; turn it off to set min/max manually */}
          {widget.type === 'SensorSparkline' && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={widget.autoScale ?? true}
                  onChange={e => onUpdate({ autoScale: e.target.checked })}
                />
              }
              label={t('widgetProperties.autoScale')}
              sx={{ m: 0 }}
            />
          )}
          {(widget.type !== 'SensorSparkline' || widget.autoScale === false) && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              label={t('widgetProperties.min')}
              type="number"
              value={widget.min ?? 0}
              onChange={e => onUpdate({ min: Number(e.target.value) })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label={t('widgetProperties.max')}
              type="number"
              value={widget.max ?? 100}
              onChange={e => onUpdate({ max: Number(e.target.value) })}
              sx={{ flex: 1 }}
            />
          </Box>
          )}
          {widget.type === 'SensorBar' && (
            <TextField
              size="small"
              label={t('widgetProperties.barThickness')}
              type="number"
              inputProps={{ min: 1, max: 40, step: 1 }}
              value={widget.barThickness ?? 6}
              onChange={e => onUpdate({ barThickness: Math.max(1, Number(e.target.value)) })}
              sx={{ flex: 1 }}
            />
          )}
        </Box>
      )}

      {/* ── Clock settings ───────────────────────────────────────── */}
      {widget.type === 'Clock' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.clock')}</SectionLabel>

          {/* Time section */}
          <FormControlLabel
            control={
              <Switch size="small"
                checked={widget.showTime ?? true}
                onChange={e => onUpdate({ showTime: e.target.checked })}
              />
            }
            label={<Typography variant="body2">{t('widgetProperties.showTime')}</Typography>}
          />
          {(widget.showTime ?? true) && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1, borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
              <ToggleButtonGroup size="small" exclusive fullWidth
                value={widget.clockFormat ?? '24h'}
                onChange={(_, v) => v && onUpdate({ clockFormat: v })}
              >
                <ToggleButton value="24h">24h</ToggleButton>
                <ToggleButton value="12h">12h</ToggleButton>
              </ToggleButtonGroup>
              <FormControlLabel
                control={
                  <Switch size="small"
                    checked={widget.showSeconds ?? true}
                    onChange={e => onUpdate({ showSeconds: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">{t('widgetProperties.showSeconds')}</Typography>}
              />
              {(widget.clockFormat ?? '24h') === '12h' && (
                <FormControlLabel
                  control={
                    <Switch size="small"
                      checked={widget.showAmPm ?? true}
                      onChange={e => onUpdate({ showAmPm: e.target.checked })}
                    />
                  }
                  label={<Typography variant="body2">{t('widgetProperties.showAmPm')}</Typography>}
                />
              )}
              <TextStyleSection
                fontOptions={fontOptions}
                title={t('widgetProperties.timeStyle')}
                color={widget.color ?? '#ffffff'}
                fontSize={widget.fontSize ?? 28}
                bold={widget.timeBold ?? true}
                fontFamily={widget.fontFamily ?? ''}
                italic={widget.italic ?? false}
                onColorChange={c => onUpdate({ color: c })}
                onFontSizeChange={s => onUpdate({ fontSize: s })}
                onBoldChange={b => onUpdate({ timeBold: b })}
                onFontFamilyChange={f => onUpdate({ fontFamily: f || undefined })}
                onItalicChange={i => onUpdate({ italic: i })}
                shadow={widget.timeShadow}
                onShadowChange={s => onUpdate({ timeShadow: s })}
              />
            </Box>
          )}

          <Divider />

          {/* Date section */}
          <FormControlLabel
            control={
              <Switch size="small"
                checked={widget.showDate ?? false}
                onChange={e => onUpdate({ showDate: e.target.checked })}
              />
            }
            label={<Typography variant="body2">{t('widgetProperties.showDate')}</Typography>}
          />
          {(widget.showDate ?? false) && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1, borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('widgetProperties.dateFormat')}</InputLabel>
                <Select
                  label={t('widgetProperties.dateFormat')}
                  value={widget.dateFormat ?? 'long'}
                  onChange={e => onUpdate({ dateFormat: e.target.value as any })}
                >
                  <MenuItem value="numeric">04/08/2026</MenuItem>
                  <MenuItem value="short">Apr 8, 2026</MenuItem>
                  <MenuItem value="long">Wed, Apr 8, 2026</MenuItem>
                  <MenuItem value="full">Wednesday, April 8, 2026</MenuItem>
                  <MenuItem value="day">Wednesday</MenuItem>
                </Select>
              </FormControl>
              <TextStyleSection
                fontOptions={fontOptions}
                title={t('widgetProperties.dateStyle')}
                color={widget.dateColor ?? 'rgba(255,255,255,0.45)'}
                fontSize={widget.dateFontSize ?? 11}
                bold={widget.dateBold ?? false}
                fontFamily={widget.dateFontFamily ?? ''}
                italic={widget.dateItalic ?? false}
                onColorChange={c => onUpdate({ dateColor: c })}
                onFontSizeChange={s => onUpdate({ dateFontSize: s })}
                onBoldChange={b => onUpdate({ dateBold: b })}
                onFontFamilyChange={f => onUpdate({ dateFontFamily: f || undefined })}
                onItalicChange={i => onUpdate({ dateItalic: i })}
                shadow={widget.dateShadow}
                onShadowChange={s => onUpdate({ dateShadow: s })}
              />
            </Box>
          )}
        </Box>
      )}

      {/* ── Text settings ────────────────────────────────────────── */}
      {widget.type === 'Text' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.text')}</SectionLabel>
          <TextField
            size="small"
            fullWidth
            label={t('widgetProperties.content')}
            multiline
            minRows={2}
            value={widget.text ?? ''}
            onChange={e => onUpdate({ text: e.target.value })}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
              {t('widgetProperties.align')}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={widget.textAlign ?? 'left'}
              onChange={(_, v) => v && onUpdate({ textAlign: v })}
            >
              <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
              <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
              <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={widget.fontWeight === 'bold'}
                onChange={e => onUpdate({ fontWeight: e.target.checked ? 'bold' : 'normal' })}
              />
            }
            label={<Typography variant="body2">{t('widgetProperties.bold')}</Typography>}
          />
        </Box>
      )}

      {/* ── Font size (Text only) ─────────────────────── */}
      {widget.type === 'Text' && (
        <Box>
          <SectionLabel>{t('widgetProperties.font')}</SectionLabel>
          <TextField
            size="small"
            fullWidth
            label={t('widgetProperties.sizePx')}
            type="number"
            value={widget.fontSize ?? 14}
            inputProps={{ min: 8, max: 120, step: 2 }}
            onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
            sx={{ mb: 1 }}
          />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
            <FormControlLabel
              sx={{ mr: 0, ml: 0 }}
              control={
                <Switch
                  size="small"
                  checked={widget.italic ?? false}
                  onChange={e => onUpdate({ italic: e.target.checked })}
                />
              }
              label={<Typography variant="body2" sx={{ fontStyle: 'italic' }}>{t('widgetProperties.italic')}</Typography>}
            />
          </Box>
          <Autocomplete
            size="small"
            freeSolo
            options={fontOptions}
            value={widget.fontFamily ?? ''}
            onInputChange={(_, v) => onUpdate({ fontFamily: v || undefined })}
            renderInput={params => (
              <TextField {...params} label={t('widgetProperties.fontFamily')} placeholder={t('widgetProperties.fontFamilyPlaceholder')} />
            )}
            renderOption={(props, option) => (
              <li {...props} style={{ fontFamily: option, fontSize: '0.82rem' }}>{option}</li>
            )}
          />
          <ShadowControls
            shadow={widget.textShadow}
            onChange={s => onUpdate({ textShadow: s })}
          />
        </Box>
      )}

      {/* ── Per-element text styles (sensor widgets) ──────────── */}
      {isSensorWidget(widget) && (
        <>
          {(widget.type === 'SensorBar' || widget.type === 'SensorSparkline' || widget.type === 'SensorGauge') && (
            <>
              <Divider />
              <AccentColorRow
                value={widget.accentColor ?? widget.color ?? (widget.type === 'SensorGauge' || widget.type === 'SensorBar' ? '#7c6ef5' : '#03dac6')}
                onChange={c => onUpdate({ accentColor: c })}
                visible={widget.showAccent ?? true}
                onVisibleChange={v => onUpdate({ showAccent: v })}
              />
            </>
          )}
          <Divider />
          <TextStyleSection
            fontOptions={fontOptions}
            title={t('widgetProperties.label')}
            visible={widget.showLabel ?? true}
            onVisibleChange={v => onUpdate({ showLabel: v })}
            color={widget.labelColor ?? 'rgba(255,255,255,0.45)'}
            fontSize={widget.labelFontSize ?? (widget.type === 'SensorValue' || widget.type === 'SensorGauge' ? 10 : 11)}
            bold={widget.labelBold ?? false}
            fontFamily={widget.labelFontFamily ?? ''}
            italic={widget.labelItalic ?? false}
            onColorChange={c => onUpdate({ labelColor: c })}
            onFontSizeChange={s => onUpdate({ labelFontSize: s })}
            onBoldChange={b => onUpdate({ labelBold: b })}
            onFontFamilyChange={f => onUpdate({ labelFontFamily: f || undefined })}
            onItalicChange={i => onUpdate({ labelItalic: i })}
            shadow={widget.labelShadow}
            onShadowChange={s => onUpdate({ labelShadow: s })}
          />
          <Divider />
          <TextStyleSection
            fontOptions={fontOptions}
            title={t('widgetProperties.value')}
            visible={widget.showValue ?? true}
            onVisibleChange={v => onUpdate({ showValue: v })}
            color={widget.color ?? (widget.type === 'SensorBar' || widget.type === 'SensorGauge' ? '#7c6ef5' : '#03dac6')}
            fontSize={widget.fontSize ?? (widget.type === 'SensorValue' ? 32 : widget.type === 'SensorGauge' ? 16 : 11)}
            bold={widget.valueBold ?? true}
            fontFamily={widget.valueFontFamily ?? ''}
            italic={widget.valueItalic ?? false}
            onColorChange={c => onUpdate({ color: c })}
            onFontSizeChange={s => onUpdate({ fontSize: s })}
            onBoldChange={b => onUpdate({ valueBold: b })}
            onFontFamilyChange={f => onUpdate({ valueFontFamily: f || undefined })}
            onItalicChange={i => onUpdate({ valueItalic: i })}
            shadow={widget.valueShadow}
            onShadowChange={s => onUpdate({ valueShadow: s })}
          />
          {widget.type === 'SensorGauge' && (widget.showValue ?? true) && (
            <FormControlLabel
              control={
                <Switch size="small"
                  checked={widget.hideDecimals ?? false}
                  onChange={e => onUpdate({ hideDecimals: e.target.checked })}
                />
              }
              label={<Typography variant="body2">{t('widgetProperties.hideDecimals')}</Typography>}
            />
          )}
          {(widget.type === 'SensorValue' || widget.type === 'SensorGauge') && (
            <>
              <Divider />
              <TextStyleSection
                fontOptions={fontOptions}
                title={t('widgetProperties.unit')}
                visible={widget.showUnit ?? true}
                onVisibleChange={v => onUpdate({ showUnit: v })}
                color={widget.unitColor ?? 'rgba(255,255,255,0.45)'}
                fontSize={widget.unitFontSize ?? (widget.type === 'SensorGauge' ? 8 : Math.max(8, Math.round((widget.fontSize ?? 32) * 0.42)))}
                bold={widget.unitBold ?? false}
                fontFamily={widget.unitFontFamily ?? ''}
                italic={widget.unitItalic ?? false}
                onColorChange={c => onUpdate({ unitColor: c })}
                onFontSizeChange={s => onUpdate({ unitFontSize: s })}
                onBoldChange={b => onUpdate({ unitBold: b })}
                onFontFamilyChange={f => onUpdate({ unitFontFamily: f || undefined })}
                onItalicChange={i => onUpdate({ unitItalic: i })}
                shadow={widget.unitShadow}
                onShadowChange={s => onUpdate({ unitShadow: s })}
              />
            </>
          )}
        </>
      )}

      {/* ── Color (Text only — Clock has per-element styling above) */}
      {widget.type === 'Text' && (
        <ColorRow
          value={widget.color ?? '#ffffff'}
          onChange={c => onUpdate({ color: c })}
        />
      )}

      {/* ── Custom widget ─────────────────────────────────────────── */}
      {widget.type === 'Custom' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.customHtmlWidget')}</SectionLabel>
          <Typography variant="caption" sx={{ color: 'text.disabled', lineHeight: 1.6 }}>
            {t('widgetProperties.customDesc')}{' '}
            <code style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
              window.postMessage
            </code>{' '}
            {t('widgetProperties.customDescSuffix')}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            fullWidth
            startIcon={<CodeIcon sx={{ fontSize: 16 }} />}
            onClick={() => window.xstat.widgetEditor.open(widget)}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {t('widgetProperties.openCodeEditor')}
          </Button>
          {customSchema.length > 0 && (
            <>
              <Divider />
              <SectionLabel>{t('widgetProperties.customProps')}</SectionLabel>
              <Typography variant="caption" sx={{ color: 'text.disabled', lineHeight: 1.6 }}>
                {t('widgetProperties.customPropsHint')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {customSchema.map(renderCustomPropField)}
              </Box>
            </>
          )}
        </Box>
      )}

      {/* ── Image widget ──────────────────────────────────────────── */}
      {widget.type === 'Image' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.image')}</SectionLabel>

          {/* Preview */}
          {widget.imageDataUrl && (
            <Box
              component="img"
              src={widget.imageDataUrl}
              alt="preview"
              sx={{
                width: '100%', maxHeight: 120,
                objectFit: 'contain',
                borderRadius: 1,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
          )}

          {/* File picker */}
          <Button
            size="small"
            variant="outlined"
            fullWidth
            component="label"
            startIcon={<ImageIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {widget.imageDataUrl ? t('widgetProperties.changeImage') : t('widgetProperties.selectImage')}
            <Box
              component="input"
              type="file"
              accept="image/*"
              sx={{ display: 'none' }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => onUpdate({ imageDataUrl: reader.result as string })
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
          </Button>

          {widget.imageDataUrl && (
            <Button
              size="small"
              variant="text"
              color="error"
              fullWidth
              sx={{ textTransform: 'none', justifyContent: 'flex-start', py: 0.25 }}
              onClick={() => onUpdate({ imageDataUrl: undefined })}
            >
              {t('widgetProperties.removeImage')}
            </Button>
          )}

          {/* Object fit */}
          <Box>
            <SectionLabel>{t('widgetProperties.sizeFit')}</SectionLabel>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              value={widget.imageObjectFit ?? 'contain'}
              onChange={(_, v) => { if (v) onUpdate({ imageObjectFit: v }) }}
              sx={{ '& .MuiToggleButton-root': { fontSize: '0.65rem', py: 0.5, textTransform: 'none' } }}
            >
              <ToggleButton value="contain">{t('widgetProperties.contain')}</ToggleButton>
              <ToggleButton value="cover">{t('widgetProperties.cover')}</ToggleButton>
              <ToggleButton value="fill">{t('widgetProperties.fill')}</ToggleButton>
              <ToggleButton value="none">{t('common.none')}</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Opacity */}
          <Box>
            <SectionLabel>{t('widgetProperties.opacity', { pct: Math.round((widget.imageOpacity ?? 1) * 100) })}</SectionLabel>
            <Box
              component="input"
              type="range"
              min={0}
              max={100}
              value={Math.round((widget.imageOpacity ?? 1) * 100)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onUpdate({ imageOpacity: Number(e.target.value) / 100 })
              }
              sx={{ width: '100%', accentColor: 'primary.main', cursor: 'pointer' }}
            />
          </Box>
        </Box>
      )}

      {/* ── SVG 图标控件 ─────────────────────────────── */}
      {widget.type === 'SvgIcon' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.svgIcon')}</SectionLabel>

          {/* SVG 代码编辑 */}
          <Box>
            <SectionLabel>{t('widgetProperties.svgCode')}</SectionLabel>
            <Box
              component="textarea"
              value={widget.svgCode ?? ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ svgCode: e.target.value })}
              placeholder={'<svg viewBox="0 0 24 24">…</svg>'}
              spellCheck={false}
              sx={{
                width: '100%', minHeight: 120,
                fontFamily: 'Consolas, monospace', fontSize: '0.7rem',
                color: 'text.primary', bgcolor: 'background.paper',
                borderRadius: 1, border: '1px solid rgba(255,255,255,0.12)',
                p: 1, resize: 'vertical',
                '&:focus': { outline: 'none', borderColor: 'primary.main' },
              }}
            />
          </Box>

          {/* 图标颜色（SVG 里 fill="currentColor" 时生效） */}
          <Box>
            <SectionLabel>{t('widgetProperties.iconColor')}</SectionLabel>
            <ColorSwatchesPicker value={widget.color ?? '#ffffff'} onChange={c => onUpdate({ color: c })} />
          </Box>
        </Box>
      )}

      {/* ── Box (rectangle frame) widget ─────────────────────────── */}
      {widget.type === 'Box' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <SectionLabel>{t('widgetProperties.box')}</SectionLabel>

          {/* Fill color */}
          <Box>
            <SectionLabel>{t('widgetProperties.boxFill')}</SectionLabel>
            <ColorSwatchesPicker value={widget.boxFill ?? '#0D0D10'} onChange={c => onUpdate({ boxFill: c })} />
          </Box>

          {/* Border color */}
          <Box>
            <SectionLabel>{t('widgetProperties.boxBorderColor')}</SectionLabel>
            <ColorSwatchesPicker value={widget.boxBorderColor ?? '#252933'} onChange={c => onUpdate({ boxBorderColor: c })} />
          </Box>

          {/* Border thickness */}
          <Box>
            <SectionLabel>{t('widgetProperties.boxBorderWidth', { px: widget.boxBorderWidth ?? 1 })}</SectionLabel>
            <Box
              component="input"
              type="range"
              min={0}
              max={20}
              value={widget.boxBorderWidth ?? 1}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onUpdate({ boxBorderWidth: Number(e.target.value) })
              }
              sx={{ width: '100%', accentColor: 'primary.main', cursor: 'pointer' }}
            />
          </Box>

          {/* Corner radius */}
          <Box>
            <SectionLabel>{t('widgetProperties.boxRadius', { px: widget.boxRadius ?? 12 })}</SectionLabel>
            <Box
              component="input"
              type="range"
              min={0}
              max={100}
              value={widget.boxRadius ?? 12}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onUpdate({ boxRadius: Number(e.target.value) })
              }
              sx={{ width: '100%', accentColor: 'primary.main', cursor: 'pointer' }}
            />
          </Box>

          {/* Background animation */}
          <FormControlLabel
            control={<Switch size="small" checked={widget.boxAnimate ?? false} onChange={e => onUpdate({ boxAnimate: e.target.checked })} />}
            label={t('widgetProperties.boxAnimate')}
            sx={{ m: 0 }}
          />
          {(widget.boxAnimate ?? false) && (
            <>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('widgetProperties.boxAnimation')}</InputLabel>
                <Select
                  value={widget.boxAnimation ?? 'grid'}
                  label={t('widgetProperties.boxAnimation')}
                  onChange={e => onUpdate({ boxAnimation: e.target.value as BoxAnimation })}
                >
                  <MenuItem value="grid">{t('widgetProperties.boxAnimationGrid')}</MenuItem>
                  <MenuItem value="rain">{t('widgetProperties.boxAnimationRain')}</MenuItem>
                  <MenuItem value="blob">{t('widgetProperties.boxAnimationBlob')}</MenuItem>
                  <MenuItem value="neon">{t('widgetProperties.boxAnimationNeon')}</MenuItem>
                  <MenuItem value="cyber">{t('widgetProperties.boxAnimationCyber')}</MenuItem>
                  <MenuItem value="matrix">{t('widgetProperties.boxAnimationMatrix')}</MenuItem>
                  <MenuItem value="green">{t('widgetProperties.boxAnimationGreen')}</MenuItem>
                  <MenuItem value="scan">{t('widgetProperties.boxAnimationScan')}</MenuItem>
                  <MenuItem value="cyan">{t('widgetProperties.boxAnimationCyan')}</MenuItem>
                </Select>
              </FormControl>
              {/* Effect speed */}
              <Box>
                <SectionLabel>{t('widgetProperties.boxEffectSpeed', { speed: (widget.boxEffectSpeed ?? 1).toFixed(1) })}</SectionLabel>
                <Box
                  component="input"
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={Math.round((widget.boxEffectSpeed ?? 1) * 100)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdate({ boxEffectSpeed: Number(e.target.value) / 100 })
                  }
                  sx={{ width: '100%', accentColor: 'primary.main', cursor: 'pointer' }}
                />
              </Box>
              {/* Effect color */}
              <Box>
                <SectionLabel>{t('widgetProperties.boxEffectColor')}</SectionLabel>
                <ColorSwatchesPicker
                  value={widget.boxEffectColor ?? ''}
                  onChange={c => onUpdate({ boxEffectColor: c })}
                />
                <TextField
                  size="small"
                  fullWidth
                  label={t('widgetProperties.customHex')}
                  value={widget.boxEffectColor ?? ''}
                  onChange={e => onUpdate({ boxEffectColor: e.target.value || undefined })}
                  inputProps={{ spellCheck: false }}
                  sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                />
              </Box>
              {/* Random colors — only where the effect is random by default */}
              {boxEffectSupportsRandom(widget.boxAnimation ?? 'grid') && (
                <FormControlLabel
                  control={<Switch size="small" checked={widget.boxEffectRandom ?? false} onChange={e => onUpdate({ boxEffectRandom: e.target.checked })} />}
                  label={t('widgetProperties.boxEffectRandom')}
                  sx={{ m: 0 }}
                />
              )}
              <Box>
                <SectionLabel>{t('widgetProperties.boxEffectOpacity', { pct: widget.boxEffectOpacity ?? 100 })}</SectionLabel>
                <Box
                  component="input"
                  type="range"
                  min={0}
                  max={100}
                  value={widget.boxEffectOpacity ?? 100}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdate({ boxEffectOpacity: Number(e.target.value) })
                  }
                  sx={{ width: '100%', accentColor: 'primary.main', cursor: 'pointer' }}
                />
              </Box>
            </>
          )}
        </Box>
      )}

      {/* ── SystemInfo widget — field visibility ─────────────────── */}
      {widget.type === 'SystemInfo' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <SectionLabel>{t('widgetProperties.systemInfo')}</SectionLabel>
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowCpu      ?? true} onChange={e => onUpdate({ sysShowCpu:      e.target.checked })} />}
            label={t('widgetProperties.sysShowCpu')}      sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowGpu      ?? true} onChange={e => onUpdate({ sysShowGpu:      e.target.checked })} />}
            label={t('widgetProperties.sysShowGpu')}      sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowRamTotal ?? true} onChange={e => onUpdate({ sysShowRamTotal: e.target.checked })} />}
            label={t('widgetProperties.sysShowRamTotal')} sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowRamSpeed ?? true} onChange={e => onUpdate({ sysShowRamSpeed: e.target.checked })} />}
            label={t('widgetProperties.sysShowRamSpeed')} sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowOs       ?? true} onChange={e => onUpdate({ sysShowOs:       e.target.checked })} />}
            label={t('widgetProperties.sysShowOs')}       sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowUptime   ?? true} onChange={e => onUpdate({ sysShowUptime:   e.target.checked })} />}
            label={t('widgetProperties.sysShowUptime')}   sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowDisks    ?? true} onChange={e => onUpdate({ sysShowDisks:    e.target.checked })} />}
            label={t('widgetProperties.sysShowDisks')}    sx={{ m: 0 }}
          />

          <Divider sx={{ my: 0.5 }} />

          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowLabels ?? true} onChange={e => onUpdate({ sysShowLabels: e.target.checked })} />}
            label={t('widgetProperties.sysShowLabels')} sx={{ m: 0 }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={widget.sysShowIcons  ?? true} onChange={e => onUpdate({ sysShowIcons:  e.target.checked })} />}
            label={t('widgetProperties.sysShowIcons')}  sx={{ m: 0 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
              {t('widgetProperties.align')}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={widget.sysTextAlign ?? 'left'}
              onChange={(_, v) => v && onUpdate({ sysTextAlign: v })}
            >
              <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
              <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
              <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {(widget.sysShowIcons ?? true) && (
            <Box sx={{ mt: 0.5 }}>
              <SectionLabel>{t('widgetProperties.sysIconColor')}</SectionLabel>
              <ColorSwatchesPicker
                value={widget.sysIconColor ?? widget.accentColor ?? '#03dac6'}
                onChange={c => onUpdate({ sysIconColor: c })}
              />
            </Box>
          )}

          {(widget.sysShowDisks ?? true) && (
            <Box sx={{ mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                  {t('widgetProperties.sysDiskFormat')}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  fullWidth
                  value={widget.sysDiskFormat ?? 'model'}
                  onChange={(_, v) => v && onUpdate({ sysDiskFormat: v })}
                >
                  <ToggleButton value="model">{t('widgetProperties.sysDiskFormatModel')}</ToggleButton>
                  <ToggleButton value="name">{t('widgetProperties.sysDiskFormatName')}</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <SectionLabel>{t('widgetProperties.sysDisksToShow')}</SectionLabel>
              <Autocomplete
                multiple
                size="small"
                disableCloseOnSelect
                options={(sysInfo?.disks ?? [])
                  .filter(d => !!d.driveLetter)
                  .map(d => ({ driveLetter: d.driveLetter, label: d.label || '' }))}
                getOptionLabel={opt => opt.label ? `${opt.driveLetter} ${opt.label}`.trim() : opt.driveLetter}
                isOptionEqualToValue={(a, b) => a.driveLetter === b.driveLetter}
                value={(sysInfo?.disks ?? [])
                  .filter(d => !!d.driveLetter && (widget.sysDisksToShow ?? []).includes(d.driveLetter))
                  .map(d => ({ driveLetter: d.driveLetter, label: d.label || '' }))}
                onChange={(_, selected) => {
                  onUpdate({ sysDisksToShow: selected.map(s => s.driveLetter) })
                }}
                renderInput={params => (
                  <TextField
                    {...params}
                    placeholder={t('widgetProperties.sysDisksToShowPlaceholder')}
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Typography component="span" sx={{ fontWeight: 600 }}>{option.driveLetter}</Typography>
                      {option.label && <Typography component="span" sx={{ color: 'text.secondary' }}>{option.label}</Typography>}
                    </Box>
                  </li>
                )}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.disabled' }}>
                {t('widgetProperties.sysDisksToShowHint')}
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 0.5 }} />
          <TextStyleSection
            fontOptions={fontOptions}
            title={t('widgetProperties.label')}
            color={widget.labelColor ?? 'rgba(255,255,255,0.55)'}
            fontSize={widget.labelFontSize ?? 12}
            bold={widget.labelBold ?? false}
            fontFamily={widget.labelFontFamily ?? ''}
            italic={widget.labelItalic ?? false}
            onColorChange={c => onUpdate({ labelColor: c })}
            onFontSizeChange={s => onUpdate({ labelFontSize: s })}
            onBoldChange={b => onUpdate({ labelBold: b })}
            onFontFamilyChange={f => onUpdate({ labelFontFamily: f || undefined })}
            onItalicChange={i => onUpdate({ labelItalic: i })}
            shadow={widget.labelShadow}
            onShadowChange={s => onUpdate({ labelShadow: s })}
          />
          <Divider sx={{ my: 0.5 }} />
          <TextStyleSection
            fontOptions={fontOptions}
            title={t('widgetProperties.value')}
            color={widget.color ?? '#fff'}
            fontSize={widget.fontSize ?? 14}
            bold={widget.valueBold ?? false}
            fontFamily={widget.valueFontFamily ?? ''}
            italic={widget.valueItalic ?? false}
            onColorChange={c => onUpdate({ color: c })}
            onFontSizeChange={s => onUpdate({ fontSize: s })}
            onBoldChange={b => onUpdate({ valueBold: b })}
            onFontFamilyChange={f => onUpdate({ valueFontFamily: f || undefined })}
            onItalicChange={i => onUpdate({ valueItalic: i })}
            shadow={widget.valueShadow}
            onShadowChange={s => onUpdate({ valueShadow: s })}
          />
        </Box>
      )}

      {/* ── SensorList widget — font size + copy text ─────────────── */}
      {widget.type === 'SensorList' && (
        <Box>
          <SectionLabel>{t('widgetProperties.fontSize')}</SectionLabel>
          <Slider
            size="small"
            min={8}
            max={24}
            value={widget.fontSize ?? 11}
            onChange={(_, value) =>
              onUpdate({ fontSize: Number(value) })
            }
            sx={{ width: '100%', accentColor: 'primary.main', cursor: 'pointer' }}
          />
          <Button
            size="small"
            variant="outlined"
            fullWidth
            startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(buildSensorListText(snapshot))
                setSensorListCopied(true)
                window.setTimeout(() => setSensorListCopied(false), 1500)
              } catch { /* clipboard unavailable */ }
            }}
            sx={{ mt: 1, textTransform: 'none', justifyContent: 'flex-start' }}
          >
            {sensorListCopied ? t('widgetProperties.sensorListCopied') : t('widgetProperties.copySensorList')}
          </Button>
        </Box>
      )}

      {/* 自定义控件配置里的传感器选择器 —— 放根节点，任何控件类型都渲染 */}
      <SensorPickerDialog
        open={customSensorProp !== null}
        sensors={sortedSensors}
        selectedId={customSensorProp ? String(widget.customProps?.[customSensorProp] ?? '') : undefined}
        onSelect={s => {
          if (customSensorProp) updateCustomProp(customSensorProp, s?.id ?? '')
          setCustomSensorProp(null)
        }}
        onClose={() => setCustomSensorProp(null)}
      />
    </Box>
  )
}
