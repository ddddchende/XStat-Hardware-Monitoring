import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
  Slider,
  TextField,
  Button,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  alpha,
  useTheme,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import OpenInBrowserIcon from '@mui/icons-material/OpenInBrowser'
import { QRCodeSVG } from 'qrcode.react'
import { useAppSettings } from '@/hooks/useAppSettings'
import i18n from '@/i18n'

// 档位：250ms–5s，250ms 步进。主要档位显示文字，其余只显示刻度点。
const POLL_MARKS = [
  { value: 250,  label: '250ms' },
  { value: 500,  label: '500ms' },
  { value: 750 },
  { value: 1000, label: '1s'    },
  { value: 1500, label: '1.5s'  },
  { value: 2000, label: '2s'    },
  { value: 2500, label: '2.5s'  },
  { value: 3000, label: '3s'    },
  { value: 3500, label: '3.5s'  },
  { value: 4000, label: '4s'    },
  { value: 4500, label: '4.5s'  },
  { value: 5000, label: '5s'    },
]

export const Settings: React.FC = () => {
  const theme = useTheme()
  const { t } = useTranslation()
  const [panelUrl, setPanelUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { settings, setPollIntervalMs } = useAppSettings()
  const [portInput, setPortInput] = useState<string>('9421')
  const [portSaving, setPortSaving] = useState(false)
  const [portSaved, setPortSaved] = useState(false)
  const [startMinimized, setStartMinimized] = useState(false)
  const [startWithWindows, setStartWithWindows] = useState(false)

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang)
    try { localStorage.setItem('xstat:lang', lang) } catch { /* ignore */ }
  }

  useEffect(() => {
    window.xstat?.service?.getPanelUrl?.().then(setPanelUrl)
    window.xstat?.service?.getPort?.().then(p => setPortInput(String(p)))
    window.xstat?.settings?.getStartMinimized?.().then(setStartMinimized)
    window.xstat?.settings?.getStartWithWindows?.().then(setStartWithWindows)
  }, [])

  const applyPort = async () => {
    const n = parseInt(portInput, 10)
    if (isNaN(n) || n < 1024 || n > 65535) return
    setPortSaving(true)
    try {
      const newPort = await window.xstat.service.setPort(n)
      setPortInput(String(newPort))
      setPortSaved(true)
      setTimeout(() => setPortSaved(false), 3000)
      window.xstat?.service?.getPanelUrl?.().then(setPanelUrl)
      // The service restarts on the new port — reload once it is ready so every
      // connection (SignalR, panel-layout, fonts, systeminfo) uses the new port.
      await waitForServiceReady(newPort)
      window.location.reload()
    } finally {
      setPortSaving(false)
    }
  }

  /** Poll /health on the new port until the restarted service responds. */
  const waitForServiceReady = (port: number, timeoutMs = 15000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    return new Promise(resolve => {
      const check = async () => {
        try {
          const res = await fetch(`http://localhost:${port}/health`, { cache: 'no-cache' })
          if (res.ok) return resolve()
        } catch { /* not ready yet */ }
        if (Date.now() > deadline) return resolve()
        setTimeout(check, 400)
      }
      check()
    })
  }

  const copyUrl = () => {
    if (!panelUrl) return
    navigator.clipboard.writeText(panelUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        {t('settings.title')}
      </Typography>

      <Typography variant="overline" color="text.secondary">{t('settings.service')}</Typography>
      <List disablePadding sx={{ mb: 2 }}>
        <ListItem>
          <ListItemText
            primary={t('settings.servicePort')}
            secondary={t('settings.servicePortDesc')}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              value={portInput}
              onChange={e => { setPortSaved(false); setPortInput(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Enter') applyPort() }}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', style: { width: 70, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={applyPort}
              disabled={portSaving}
              sx={{ minWidth: 70, borderRadius: 1.5, fontSize: '0.72rem' }}
            >
              {portSaving ? <CircularProgress size={14} /> : portSaved ? t('settings.restarted') : t('settings.apply')}
            </Button>
          </Box>
        </ListItem>
        <Divider />
        <ListItem sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
          <ListItemText
            primary={t('settings.pollInterval')}
            secondary={t('settings.pollIntervalDesc')}
            sx={{ mb: 1, width: '100%' }}
          />
          <Box sx={{ width: '100%', px: 1 }}>
            <Slider
              value={settings.pollIntervalMs}
              onChange={(_, v) => setPollIntervalMs(v as number)}
              min={250}
              max={5000}
              step={null}
              marks={POLL_MARKS}
              valueLabelDisplay="auto"
              valueLabelFormat={v => v >= 1000 ? `${v / 1000}s` : `${v}ms`}
              size="small"
              sx={{ color: 'primary.main' }}
            />
          </Box>
        </ListItem>
      </List>

      {/* ── LAN Web Panel ───────────────────────────────────────────── */}
      <Typography variant="overline" color="text.secondary">{t('settings.lanWebPanel')}</Typography>
      <Box
        sx={{
          mt: 1,
          mb: 3,
          p: 2,
          borderRadius: 2,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
          background: alpha(theme.palette.primary.main, 0.05),
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('settings.lanDesc')}
        </Typography>

        {panelUrl ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* URL row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  flex: 1,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1.5,
                  background: alpha(theme.palette.background.paper, 0.6),
                  border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: 'primary.main',
                  userSelect: 'text',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                }}
              >
                {panelUrl}
              </Box>
              <Tooltip title={copied ? t('settings.copied') : t('settings.copyUrl')}>
                <IconButton size="small" onClick={copyUrl}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('settings.openInBrowser')}>
                <IconButton
                  size="small"
                  onClick={() => { if (panelUrl) window.open(panelUrl, '_blank') }}
                >
                  <OpenInBrowserIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* QR code */}
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  background: '#ffffff',
                  display: 'inline-flex',
                }}
              >
                <QRCodeSVG
                  value={panelUrl}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#0f0f11"
                  level="M"
                />
              </Box>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled">
            {t('settings.loadingLan')}
          </Typography>
        )}
      </Box>

      <Typography variant="overline" color="text.secondary">{t('settings.display')}</Typography>
      <List disablePadding>
        <ListItem>
          <FormControlLabel
            control={
              <Switch
                checked={startMinimized}
                onChange={e => {
                  setStartMinimized(e.target.checked)
                  window.xstat?.settings?.setStartMinimized?.(e.target.checked)
                }}
                color="primary"
              />
            }
            label={t('settings.startMinimized')}
          />
        </ListItem>
        <Divider />
        <ListItem>
          <FormControlLabel
            control={
              <Switch
                checked={startWithWindows}
                onChange={e => {
                  setStartWithWindows(e.target.checked)
                  window.xstat?.settings?.setStartWithWindows?.(e.target.checked)
                }}
                color="primary"
              />
            }
            label={t('settings.startWithWindows')}
          />
        </ListItem>
      </List>

      {/* ── Language ───────────────────────────────────────────── */}
      <Typography variant="overline" color="text.secondary">{t('settings.language')}</Typography>
      <FormControl fullWidth size="small" sx={{ mt: 1, mb: 2 }}>
        <InputLabel id="language-select-label">{t('settings.language')}</InputLabel>
        <Select
          labelId="language-select-label"
          id="language-select"
          value={i18n.language?.startsWith('zh') ? 'zh' : 'en'}
          label={t('settings.language')}
          onChange={e => handleLanguageChange(e.target.value)}
        >
          <MenuItem value="en">{t('settings.langEn')}</MenuItem>
          <MenuItem value="zh">{t('settings.langZh')}</MenuItem>
        </Select>
      </FormControl>

      <Box sx={{ mt: 4 }}>
        <Typography variant="caption" color="text.disabled">
          {t('settings.footer')}
        </Typography>
      </Box>
    </Box>
  )
}

