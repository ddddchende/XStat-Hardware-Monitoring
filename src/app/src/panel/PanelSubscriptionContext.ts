import { createContext } from 'react'

// 自定义控件声明订阅的规则（与 CustomWidget.tsx 的 SubscribeRule 一致）：
//   字符串 = id/name 精确或 id 包含匹配；对象 = 字段（category/type/name/…）大小写不敏感包含匹配
export type PanelSubscribeRule = string | Record<string, string>

// widgetId → 该自定义控件对服务端订阅的贡献：
//   - 规则数组：控件只需要这些传感器
//   - 'all'   ：控件未声明订阅（旧控件，靠 find 任意查找）→ 面板需要全量推送
//   - null    ：移除贡献（控件未决或卸载）
export const PanelSubscriptionContext = createContext<
  (widgetId: string, rules: PanelSubscribeRule[] | 'all' | null) => void
>(() => {})
