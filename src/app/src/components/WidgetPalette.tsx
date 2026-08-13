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
import type { WidgetType } from '@/types/panel'

const ITEMS: {
  type: WidgetType
  labelKey: string
  icon: React.ReactNode
  hintKey: string
}[] = [
  { type: 'SensorValue',     labelKey: 'palette.value',     icon: <NumbersIcon sx={{ fontSize: 18 }} />,      hintKey: 'palette.valueHint' },
  { type: 'SensorBar',       labelKey: 'palette.bar',        icon: <LinearScaleIcon sx={{ fontSize: 18 }} />,  hintKey: 'palette.barHint' },
  { type: 'SensorSparkline', labelKey: 'palette.sparkline',  icon: <ShowChartIcon sx={{ fontSize: 18 }} />,    hintKey: 'palette.sparklineHint' },
  { type: 'SensorGauge',     labelKey: 'palette.gauge',      icon: <SpeedIcon sx={{ fontSize: 18 }} />,        hintKey: 'palette.gaugeHint' },
  { type: 'Clock',           labelKey: 'palette.clock',      icon: <AccessTimeIcon sx={{ fontSize: 18 }} />,   hintKey: 'palette.clockHint' },
  { type: 'Text',            labelKey: 'palette.text',       icon: <TextFieldsIcon sx={{ fontSize: 18 }} />,   hintKey: 'palette.textHint' },
  { type: 'Image',           labelKey: 'palette.image',      icon: <ImageIcon sx={{ fontSize: 18 }} />,         hintKey: 'palette.imageHint' },
  { type: 'Custom',          labelKey: 'palette.custom',     icon: <CodeIcon sx={{ fontSize: 18 }} />,          hintKey: 'palette.customHint' },
]

interface Props {
  onAdd: (type: WidgetType) => void
}

export const WidgetPalette: React.FC<Props> = ({ onAdd }) => {
  const theme = useTheme()
  const { t } = useTranslation()

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

      {ITEMS.map(({ type, labelKey, icon, hintKey }) => (
        <Tooltip key={type} title={t(hintKey)} placement="right" arrow>
          <Box
            onClick={() => onAdd(type)}
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
              '&:active': {
                background: alpha(theme.palette.primary.main, 0.18),
              },
            }}
          >
            <Box sx={{ display: 'flex', color: 'inherit', flexShrink: 0 }}>
              {icon}
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
              {t(labelKey)}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}
