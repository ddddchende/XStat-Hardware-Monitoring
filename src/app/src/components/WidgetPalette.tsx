import React from 'react'
import { Box, Typography, Tooltip, alpha, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import NumbersIcon       from '@mui/icons-material/Numbers'
import LinearScaleIcon   from '@mui/icons-material/LinearScale'
import ShowChartIcon     from '@mui/icons-material/ShowChart'
import SpeedIcon         from '@mui/icons-material/Speed'
import AccessTimeIcon    from '@mui/icons-material/AccessTime'
import TextFieldsIcon    from '@mui/icons-material/TextFields'
import CodeIcon          from '@mui/icons-material/Code'
import ImageIcon         from '@mui/icons-material/Image'
import CropSquareIcon    from '@mui/icons-material/CropSquare'
import InfoIcon          from '@mui/icons-material/Info'
import CategoryIcon      from '@mui/icons-material/Category'
import ListAltIcon       from '@mui/icons-material/ListAlt'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import type { WidgetType, PanelWidget } from '@/types/panel'
import { ICON_CATEGORIES, ICONS, iconToDataUrl } from '@/data/iconLibrary'

interface PaletteItem {
  type: WidgetType
  labelKey: string
  icon: React.ReactNode
  hintKey: string
}

interface PaletteGroup {
  key: string
  labelKey: string
  items: PaletteItem[]
}

const GROUPS: PaletteGroup[] = [
  {
    key: 'sensor', labelKey: 'paletteGroup.sensor',
    items: [
      { type: 'SensorValue',     labelKey: 'palette.value',     icon: <NumbersIcon sx={{ fontSize: 18 }} />,      hintKey: 'palette.valueHint' },
      { type: 'SensorBar',       labelKey: 'palette.bar',        icon: <LinearScaleIcon sx={{ fontSize: 18 }} />,  hintKey: 'palette.barHint' },
      { type: 'SensorSparkline', labelKey: 'palette.sparkline',  icon: <ShowChartIcon sx={{ fontSize: 18 }} />,    hintKey: 'palette.sparklineHint' },
      { type: 'SensorGauge',     labelKey: 'palette.gauge',      icon: <SpeedIcon sx={{ fontSize: 18 }} />,        hintKey: 'palette.gaugeHint' },
      { type: 'SensorList',      labelKey: 'palette.sensorList', icon: <ListAltIcon sx={{ fontSize: 18 }} />,      hintKey: 'palette.sensorListHint' },
    ],
  },
  {
    key: 'basic', labelKey: 'paletteGroup.basic',
    items: [
      { type: 'Clock', labelKey: 'palette.clock', icon: <AccessTimeIcon sx={{ fontSize: 18 }} />, hintKey: 'palette.clockHint' },
      { type: 'Text',  labelKey: 'palette.text',  icon: <TextFieldsIcon sx={{ fontSize: 18 }} />, hintKey: 'palette.textHint' },
      { type: 'Box',   labelKey: 'palette.box',   icon: <CropSquareIcon sx={{ fontSize: 18 }} />, hintKey: 'palette.boxHint' },
      { type: 'SystemInfo', labelKey: 'palette.systemInfo', icon: <InfoIcon sx={{ fontSize: 18 }} />, hintKey: 'palette.systemInfoHint' },
    ],
  },
  {
    key: 'media', labelKey: 'paletteGroup.media',
    items: [
      { type: 'Image', labelKey: 'palette.image', icon: <ImageIcon sx={{ fontSize: 18 }} />, hintKey: 'palette.imageHint' },
    ],
  },
]

const CUSTOM_ITEM: PaletteItem = {
  type: 'Custom', labelKey: 'palette.custom',
  icon: <CodeIcon sx={{ fontSize: 18 }} />, hintKey: 'palette.customHint',
}

interface Props {
  onAdd: (type: WidgetType, overrides?: Partial<PanelWidget>) => void
  onImportWidget?: (data: { version?: number; widget: PanelWidget }) => void
}

export const WidgetPalette: React.FC<Props> = ({ onAdd, onImportWidget }) => {
  const theme = useTheme()
  const { t } = useTranslation()

  const renderItem = (it: PaletteItem) => (
    <Tooltip key={it.type} title={t(it.hintKey)} placement="right" arrow>
      <Box
        onClick={() => onAdd(it.type)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25,
          px: 1.25, py: 0.9, borderRadius: 1.5,
          cursor: 'pointer',
          color: 'text.secondary',
          border: '1px solid transparent',
          transition: 'all 0.15s',
          '&:hover': {
            background: alpha(theme.palette.primary.main, 0.1),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
            color: 'primary.light',
          },
          '&:active': { background: alpha(theme.palette.primary.main, 0.18) },
        }}
      >
        <Box sx={{ display: 'flex', color: 'inherit', flexShrink: 0 }}>{it.icon}</Box>
        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
          {t(it.labelKey)}
        </Typography>
      </Box>
    </Tooltip>
  )

  const GroupLabel = ({ children, withIcon }: { children: React.ReactNode; withIcon?: boolean }) => (
    <Typography
      variant="caption"
      sx={{
        px: 0.75, mt: 1, mb: 0.25, color: 'text.disabled',
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        display: 'flex', alignItems: 'center', gap: 0.5,
      }}
    >
      {withIcon && <CategoryIcon sx={{ fontSize: 13 }} />}
      {children}
    </Typography>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', p: 1, gap: 0.25 }}>
      <Typography
        variant="caption"
        sx={{
          px: 0.75, mb: 0.5, color: 'text.disabled',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
          display: 'block',
        }}
      >
        {t('palette.addWidget')}
      </Typography>

      {onImportWidget && (
        <Box sx={{ px: 0.75, mb: 0.5 }}>
          <Box
            component="label"
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.25,
              px: 1.25, py: 0.9, borderRadius: 1.5,
              cursor: 'pointer', color: 'text.secondary',
              border: '1px solid transparent',
              transition: 'all 0.15s',
              '&:hover': {
                background: alpha(theme.palette.primary.main, 0.1),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                color: 'primary.light',
              },
            }}
          >
            <UploadFileIcon sx={{ fontSize: 18 }} />
            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
              {t('palette.importWidget')}
            </Typography>
            <input type="file" accept=".xstatwidget,.json" hidden onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                try {
                  const data = JSON.parse(reader.result as string)
                  if (data && data.widget) onImportWidget(data)
                } catch { /* ignore invalid file */ }
              }
              reader.readAsText(file)
              e.target.value = ''
            }} />
          </Box>
        </Box>
      )}

      {GROUPS.map(g => (
        <Box key={g.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <GroupLabel>{t(g.labelKey)}</GroupLabel>
          {g.items.map(renderItem)}
        </Box>
      ))}

      {/* Advanced */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <GroupLabel>{t('paletteGroup.advanced')}</GroupLabel>
        {renderItem(CUSTOM_ITEM)}
      </Box>

      {/* Icons — built-in SVG library, inserted as Image widgets */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <GroupLabel withIcon>{t('palette.icons')}</GroupLabel>
        {ICON_CATEGORIES.map(cat => {
          const icons = ICONS.filter(i => i.category === cat.key)
          if (!icons.length) return null
          return (
            <Box key={cat.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="caption" sx={{ px: 0.75, color: 'text.disabled', fontSize: '0.65rem' }}>
                {t(cat.labelKey)}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0.5, px: 0.5 }}>
                {icons.map(icon => (
                  <Tooltip key={icon.id} title={icon.name} placement="top" arrow>
                    <Box
                      component="img"
                      src={iconToDataUrl(icon)}
                      alt={icon.name}
                      onClick={() => onAdd('Image', { imageDataUrl: iconToDataUrl(icon) })}
                      sx={{
                        width: '100%', aspectRatio: '1 / 1', p: 0.5,
                        cursor: 'pointer', opacity: 0.85,
                        borderRadius: 1,
                        border: '1px solid transparent',
                        '&:hover': {
                          opacity: 1,
                          background: alpha(theme.palette.primary.main, 0.1),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
                        },
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
