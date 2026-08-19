import React from 'react'
import type { PanelWidget } from '@/types/panel'
import type { HardwareSnapshot } from '@/types/sensors'
import type { HistoryPoint } from '@/hooks/useSensorHistory'
import { SensorValueWidget }     from './widgets/SensorValueWidget'
import { SensorBarWidget }       from './widgets/SensorBarWidget'
import { SensorSparklineWidget } from './widgets/SensorSparklineWidget'
import { SensorGaugeWidget }     from './widgets/SensorGaugeWidget'
import { ClockWidget }           from './widgets/ClockWidget'
import { TextWidget }            from './widgets/TextWidget'
import { CustomWidget }          from './widgets/CustomWidget'
import { ImageWidget }           from './widgets/ImageWidget'
import { BoxWidget }             from './widgets/BoxWidget'
import { SystemInfoWidget }      from './widgets/SystemInfoWidget'
import { SensorListWidget }      from './widgets/SensorListWidget'
import { SvgIconWidget }         from './widgets/SvgIconWidget'

interface Props {
  widget: PanelWidget
  snapshot: HardwareSnapshot | null
  history: Map<string, HistoryPoint[]>
  panelId: string
}

export const WidgetRenderer: React.FC<Props> = ({ widget, snapshot, history, panelId }) => {
  switch (widget.type) {
    case 'SensorValue':
      return <SensorValueWidget widget={widget} snapshot={snapshot} />
    case 'SensorBar':
      return <SensorBarWidget widget={widget} snapshot={snapshot} />
    case 'SensorSparkline':
      return <SensorSparklineWidget widget={widget} snapshot={snapshot} history={history} />
    case 'SensorGauge':
      return <SensorGaugeWidget widget={widget} snapshot={snapshot} />
    case 'Clock':
      return <ClockWidget widget={widget} />
    case 'Text':
      return <TextWidget widget={widget} />
    case 'Custom':
      return <CustomWidget widget={widget} snapshot={snapshot} panelId={panelId} />
    case 'Image':
      return <ImageWidget widget={widget} />
    case 'Box':
      return <BoxWidget widget={widget} />
    case 'SystemInfo':
      return <SystemInfoWidget widget={widget} />
    case 'SensorList':
      return <SensorListWidget widget={widget} snapshot={snapshot} />
    case 'SvgIcon':
      return <SvgIconWidget widget={widget} />
    default:
      return null
  }
}
