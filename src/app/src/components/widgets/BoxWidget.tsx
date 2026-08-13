import React from 'react'
import { Box } from '@mui/material'
import type { PanelWidget } from '@/types/panel'

interface Props {
  widget: PanelWidget
}

/**
 * Rectangle frame widget — a plain bordered box. Size is controlled by the
 * panel layout (drag handles); fill/border/radius are editable properties.
 */
export const BoxWidget: React.FC<Props> = ({ widget }) => (
  <Box
    sx={{
      width: '100%',
      height: '100%',
      background: widget.boxFill ?? '#0D0D10',
      border: `${widget.boxBorderWidth ?? 1}px solid ${widget.boxBorderColor ?? '#252933'}`,
      borderRadius: widget.boxRadius ?? 12,
      boxSizing: 'border-box',
    }}
  />
)
