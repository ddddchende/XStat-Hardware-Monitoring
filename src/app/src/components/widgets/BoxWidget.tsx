import React from 'react'
import { Box } from '@mui/material'
import type { PanelWidget } from '@/types/panel'
import { BoxEffectLayer } from './boxEffects'

interface Props {
  widget: PanelWidget
}

/**
 * Rectangle frame widget — a plain bordered box. Size is controlled by the
 * panel layout (drag handles); fill/border/radius are editable properties.
 * Optional toggleable background animation (`boxAnimate` + `boxAnimation`,
 * see boxEffects.tsx for the preset list); `boxEffectOpacity` (0–100) adjusts
 * the effect layer's opacity without affecting the fill/border.
 */
export const BoxWidget: React.FC<Props> = ({ widget }) => {
  const fill    = widget.boxFill ?? '#0D0D10'
  const borderW = widget.boxBorderWidth ?? 1
  const borderC = widget.boxBorderColor ?? '#252933'
  const radius  = widget.boxRadius ?? 12
  const animate = widget.boxAnimate ?? false
  const effect  = widget.boxAnimation ?? 'grid'
  const opacity = Math.max(0, Math.min(100, widget.boxEffectOpacity ?? 100)) / 100

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: fill,
        border: `${borderW}px solid ${borderC}`,
        borderRadius: radius,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {animate && (
        <Box sx={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none', overflow: 'hidden' }}>
          <BoxEffectLayer effect={effect} color={widget.boxEffectColor || undefined} random={widget.boxEffectRandom ?? false} speed={widget.boxEffectSpeed ?? 1} />
        </Box>
      )}
    </Box>
  )
}
