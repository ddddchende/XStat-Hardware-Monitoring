import React from 'react'
import type { PanelWidget } from '@/types/panel'

interface Props {
  widget: PanelWidget
}

/** 默认图标：星形，fill 用 currentColor（跟随控件的颜色属性） */
export const DEFAULT_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
  <path d="M12 2l2.92 6.26L21.5 9.27l-4.75 4.63 1.12 6.53L12 17.06 6.13 20.43l1.12-6.53L2.5 9.27l6.58-1.01L12 2z"/>
</svg>`

/**
 * 自定义 SVG 图标控件：一个透明的容器，把用户编写的 SVG 代码原样渲染并铺满容器。
 * SVG 建议带 viewBox 且宽高用 100%（或省略宽度高度），这样会跟随控件尺寸缩放。
 * 图标颜色：SVG 里用 fill="currentColor" 时，会跟随属性面板的"颜色"设置。
 */
export const SvgIconWidget: React.FC<Props> = ({ widget }) => {
  const svg = widget.svgCode?.trim() || DEFAULT_SVG
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: widget.color ?? '#ffffff',
        overflow: 'hidden',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
