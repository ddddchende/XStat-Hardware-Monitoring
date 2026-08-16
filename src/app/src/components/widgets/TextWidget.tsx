import React from 'react'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { PanelWidget } from '@/types/panel'
import { textShadowCss } from '@/utils/textShadow'

interface Props {
  widget: PanelWidget
}

export const TextWidget: React.FC<Props> = ({ widget }) => {
  const { t } = useTranslation()
  const color      = widget.color ?? '#ffffff'
  const text       = widget.text || t('widget.textDefault')
  const align      = widget.textAlign ?? 'left'
  const fontWeight = widget.fontWeight ?? 'normal'
  const fontSize   = widget.fontSize ?? 14
  const fontFamily = widget.fontFamily ?? undefined
  const italic     = widget.italic ?? false
  const textShadow = textShadowCss(widget.textShadow)

  return (
    <Box
      sx={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center',
        px: 1.5, py: 0.75,
      }}
    >
      <Typography
        sx={{
          fontSize, color, fontWeight,
          fontStyle: italic ? 'italic' : 'normal',
          fontFamily,
          textAlign: align,
          width: '100%',
          wordBreak: 'break-word',
          userSelect: 'none',
          lineHeight: 1.3,
          textShadow,
        }}
      >
        {text}
      </Typography>
    </Box>
  )
}
