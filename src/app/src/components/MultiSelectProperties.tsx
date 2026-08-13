import React from 'react'
import { Box, Typography, Divider, Button, alpha, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import ContentCopyIcon     from '@mui/icons-material/ContentCopy'
import DeleteOutlineIcon   from '@mui/icons-material/DeleteOutline'

interface Props {
  count: number
  onDuplicate: () => void
  onRemove: () => void
}

// Shown in the properties panel when several widgets are selected at once.
export const MultiSelectProperties: React.FC<Props> = ({ count, onDuplicate, onRemove }) => {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
        {t('panelEditor.widgetsSelected', { count })}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
        {t('panelEditor.multiSelectHint')}
      </Typography>

      <Divider sx={{ my: 0.5 }} />

      <Button
        size="small"
        startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
        onClick={onDuplicate}
        sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
      >
        {t('panelEditor.duplicateSelected')}
      </Button>
      <Button
        size="small"
        color="error"
        startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
        onClick={onRemove}
        sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
      >
        {t('panelEditor.deleteSelected')}
      </Button>

      <Divider sx={{ my: 0.5 }} />

      <Box
        sx={{
          px: 1, py: 0.75, borderRadius: 1.5,
          background: alpha(theme.palette.primary.main, 0.08),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
        }}
      >
        <Typography variant="caption" sx={{ color: 'primary.light' }}>
          {t('panelEditor.multiSelectTip')}
        </Typography>
      </Box>
    </Box>
  )
}
