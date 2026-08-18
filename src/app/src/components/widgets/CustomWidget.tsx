import React, { useRef, useEffect, useState, useContext, useMemo } from 'react'
import type { PanelWidget, CustomTextStyle } from '@/types/panel'
import type { HardwareSnapshot, SensorReading } from '@/types/sensors'
import { PanelSubscriptionContext } from '@/panel/PanelSubscriptionContext'
import { getServiceBase } from '@/utils/getServiceBase'

interface Props {
  widget: PanelWidget
  snapshot: HardwareSnapshot | null
}

/**
 * Replace static ./data/{filename} occurrences with their data URLs, and inject
 * a tiny bootstrap so window.__xstatFiles is populated at runtime via postMessage.
 * 编辑器（file:// 环境，控件走 srcDoc 内存 HTML）使用；web 端由服务端 /api/widget 静态替换。
 */
function applyFiles(html: string, files?: Record<string, string>): string {
  const entries = Object.entries(files ?? {})
  if (entries.length === 0) return html

  let result = html
  for (const [name, dataUrl] of entries) {
    result = result.split(`./data/${name}`).join(dataUrl)
  }

  const bootstrap = '<script>(function(){'
    + 'window.__xstatFiles={};'
    + 'try{'
    +   'var sd=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");'
    +   'if(sd&&sd.set){'
    +     'Object.defineProperty(HTMLImageElement.prototype,"src",{'
    +       'get:sd.get,'
    +       'set:function(v){'
    +         'if(typeof v==="string"&&v.indexOf("./data/")===0){var f=window.__xstatFiles[v.slice(7)];if(f){sd.set.call(this,f);return;}}'
    +         'sd.set.call(this,v);'
    +       '},configurable:true'
    +     '});'
    +   '}'
    + '}catch(e){}'
    + 'try{'
    +   'var bd=Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype,"backgroundImage");'
    +   'if(bd&&bd.set){'
    +     'Object.defineProperty(CSSStyleDeclaration.prototype,"backgroundImage",{'
    +       'get:bd.get,'
    +       'set:function(v){'
    +         'if(typeof v==="string"&&v.indexOf("./data/")!==-1){'
    +           'var i=v.indexOf("./data/"),e,fn,f;'
    +           'while(i!==-1){'
    +             'e=v.indexOf(")",i);if(e===-1)break;'
    +             'fn=v.slice(i+7,e).split(\'"\').join("").split("\'").join("").trim();'
    +             'f=window.__xstatFiles[fn];'
    +             'if(f){v=v.slice(0,i)+f+v.slice(e);}'
    +             'i=v.indexOf("./data/",i+(f?f.length:1));'
    +           '}'
    +         '}'
    +         'bd.set.call(this,v);'
    +       '},configurable:true'
    +     '});'
    +   '}'
    + '}catch(e){}'
    + 'window.addEventListener("message",function(e){if(e.data&&e.data.files)Object.assign(window.__xstatFiles,e.data.files);},false);'
    + '})();<\/script>'
  if (result.includes('</head>')) {
    result = result.replace('</head>', bootstrap + '</head>')
  } else if (result.includes('<body')) {
    result = result.replace(/<body[^>]*>/, m => m + bootstrap)
  } else {
    result = bootstrap + result
  }
  return result
}

/**
 * 注入"字体桥"脚本：父页面把字体预加载成 data URL 后经 postMessage 传入，
 * 本脚本把控件文档里所有同名 @font-face 的 src 替换为 data URL，并直接注册
 * FontFace。字体从此不发起任何网络请求 —— 彻底绕过跨源 CORS / 反代缓存 /
 * 证书 / 移动端 WebView 对异步跨源字体的应用缺陷，任何环境都能显示。
 */
function injectFontBridge(html: string): string {
  const bridge = '<script>(function(){'
    + 'var fontMap={},patched={},registered={};'
    + 'window.addEventListener("message",function(e){'
    +   'if(e.data&&e.data.__xstatFonts){'
    +     'var m=e.data.__xstatFonts;'
    +     'for(var k in m){if(m.hasOwnProperty(k))fontMap[k]=m[k];}'
    +     'patch();registerFaces();'
    +     // Font bridge must not keep polling forever (mobile frame-rate cost).
    // A few short follow-ups cover @font-face rules the widget injects after
    // its own script runs, then it stops.
    +     'var n=0;var t=setInterval(function(){patch();registerFaces();if(++n>=8)clearInterval(t);},120);'
    +   '}'
    + '},false);'
    + 'function patch(){'
    +   'try{'
    +     'for(var i=0;i<document.styleSheets.length;i++){'
    +       'var rules=document.styleSheets[i].cssRules;'
    +       'if(!rules)continue;'
    +       'for(var j=0;j<rules.length;j++){'
    +         'var r=rules[j];'
    +         'if(r.type===CSSRule.FONT_FACE_RULE&&r.style&&fontMap[r.style.fontFamily]&&!patched[r.style.fontFamily]){'
    +           'patched[r.style.fontFamily]=1;'
    +           'r.style.setProperty("src","url(\'"+fontMap[r.style.fontFamily]+"\')","important");'
    +         '}'
    +       '}'
    +     '}'
    +   '}catch(e){}'
    + '}'
    + 'function registerFaces(){'
    +   'setTimeout(function(){'
    +     'try{'
    +       'for(var k in fontMap){'
    +         'if(fontMap.hasOwnProperty(k)&&!registered[k]){'
    +           'registered[k]=1;'
    +           '(function(fam,u){'
    +             'var ff=new FontFace(fam,"url("+u+")");'
    +             'ff.load().then(function(f){try{document.fonts.add(f);}catch(e){}}).catch(function(){});'
    +           '})(k,fontMap[k]);'
    +         '}'
    +       '}'
    +     '}catch(e){}'
    +   '},200);'
    + '}'
    + '})();<\/script>'
  if (html.includes('</head>')) return html.replace('</head>', bridge + '</head>')
  if (html.includes('<body')) return html.replace(/<body[^>]*>/, m => m + bridge)
  return bridge + html
}

/**
 * 注入"绘制自检"脚本：iframe 加载后 400ms 向父页面报告自身高度。
 * Chromium 偶发对 srcdoc iframe 不执行布局（高度为 0 → 控件空白），父页面据此强制重建恢复。
 */
function injectPaintCheck(html: string): string {
  const check = '<script>setTimeout(function(){try{var h=window.innerHeight||document.documentElement.offsetHeight||0;'
    + 'window.parent.postMessage({__xstatPaintCheck:h},\'*\');}catch(e){}},400);<\/script>'
  if (html.includes('</head>')) return html.replace('</head>', check + '</head>')
  if (html.includes('<body')) return html.replace(/<body[^>]*>/, m => m + check)
  return check + html
}

/**
 * 自定义控件按需订阅协议
 * ------------------------------------------------
 * 未声明订阅的控件收到面板已订阅的传感器子集（跟随面板其余控件，避免整个面板
 * 退化为全量推送）。控件可以在脚本里通过 window.parent.postMessage 声明自己
 * 需要的传感器，之后父页面只转发匹配的子集（同时上报服务端，减小 ws 流量）：
 *
 *   // 1) 按 id / name 精确或包含匹配
 *   window.parent.postMessage({ __xstatSubscribe: ['cpu/intelcpu/0/power/0'] }, '*');
 *
 *   // 2) 按字段条件匹配（category/type/name/id/hardwareName/unit，不区分大小写包含匹配）
 *   window.parent.postMessage({ __xstatSubscribe: [{ category: 'CPU', type: 'Power' }] }, '*');
 *
 *   // 3) 不需要实时数据
 *   window.parent.postMessage({ __xstatSubscribe: [] }, '*');
 *
 * iframe 重建后控件脚本会重新执行，父页面会重新等待声明（300ms 超时后按未声明处理）。
 */
type SubscribeRule = string | Record<string, string>

function matchesRule(rule: SubscribeRule, s: SensorReading): boolean {
  if (typeof rule === 'string') {
    return s.id === rule || s.id.includes(rule) || s.name === rule
  }
  for (const [key, want] of Object.entries(rule)) {
    const got = (s as unknown as Record<string, unknown>)[key]
    if (typeof got === 'string') {
      if (!got.toLowerCase().includes(want.toLowerCase())) return false
    } else if (got !== want) {
      return false
    }
  }
  return true
}

function filterSensors(sensors: SensorReading[], rules: SubscribeRule[]): SensorReading[] {
  if (rules.length === 0) return []
  return sensors.filter(s => rules.some(r => matchesRule(r, s)))
}

const SENSOR_CATEGORIES = ['CPU', 'GPU', 'RAM', 'Storage', 'Network', 'Motherboard', 'Battery', 'PSU', 'EC', 'Other']
const SENSOR_TYPES = ['Temperature', 'Clock', 'Load', 'Voltage', 'Power', 'Fan', 'Flow', 'Data', 'SmallData', 'Throughput', 'Control', 'Level', 'Factor']

/**
 * 自动推断控件需要的传感器 —— 保持用户编辑的 HTML 原文不变。
 * 静态扫描脚本里对传感器字段的比较写法（s.category === 'CPU' && s.type === 'Power'、
 * x.name === 'cpu package'、!== 排除式等），提取 category/type/name 组合成订阅规则：
 *   - 同时出现 category 与 type → 笛卡尔积组合成 {category, type}（精确）
 *   - 只有 category / 只有 type → 单独规则
 *   - name 比较 → {name} 规则
 * 提取范围保守（宁可多订阅几个，也不让控件因缺数据显示 --）。
 * 控件显式声明 __xstatSubscribe 时以显式声明为准，覆盖推断结果。
 */
function inferSubscription(html: string): SubscribeRule[] {
  const cats: string[] = []
  const types: string[] = []
  const names: string[] = []
  const add = (arr: string[], v: string) => { if (!arr.some(x => x.toLowerCase() === v.toLowerCase())) arr.push(v) }

  // 匹配 .category === 'X' / .type === 'X' / .name === 'X'（含 != / !==）
  const re = /\.(category|type|name)\s*(?:==|===|!=|!==)\s*['"]([^'"]+)['"]/gi
  for (const m of html.matchAll(re) ?? []) {
    const field = m[1].toLowerCase()
    const val = m[2]
    if (field === 'category') {
      if (SENSOR_CATEGORIES.some(c => c.toLowerCase() === val.toLowerCase())) add(cats, val)
    } else if (field === 'type') {
      if (SENSOR_TYPES.some(t => t.toLowerCase() === val.toLowerCase())) add(types, val)
    } else {
      add(names, val)
    }
  }

  // 兜底：keywords.some(k => name === k) 这类数组匹配写法没有 `.name === 'X'` 字面量，
  // 额外提取脚本里所有含传感器关键词的字符串字面量作为 name 规则。
  // 误提取的字符串（CSS 类、字体名、SVG 路径等）匹配不到任何传感器，无害。
  // 单关键词字面量（'CPU'、'used'、'total'… 多为变量名/注释）会被过滤——它们要么已由
  // category/type 组合规则覆盖，要么太宽泛匹配一堆无关传感器。
  const NAME_HINTS = ['memory', 'gpu', 'cpu', 'power', 'clock', 'speed', 'fan', 'voltage', 'load', 'temp',
    'used', 'total', 'free', 'available', 'core', 'package', 'dram', 'vram', 'nvidia', 'amd', 'intel',
    'throughput', 'download', 'upload', 'sensor', 'usage']
  const nameRe = /['"]([A-Za-z][A-Za-z0-9 _\-()]{1,40})['"]/g
  for (const m of html.matchAll(nameRe) ?? []) {
    const v = m[1]
    if (!NAME_HINTS.some(k => v.toLowerCase().includes(k))) continue
    const words = v.split(/[\s_\-()]+/).filter(Boolean)
    if (words.length === 1 && NAME_HINTS.includes(v.toLowerCase())) continue // 单关键词过滤
    add(names, v)
  }

  const rules: SubscribeRule[] = []
  if (cats.length && types.length) {
    for (const c of cats) for (const t of types) rules.push({ category: c, type: t })
  } else if (cats.length) {
    for (const c of cats) rules.push({ category: c })
  } else if (types.length) {
    for (const t of types) rules.push({ type: t })
  }
  for (const n of names) rules.push({ name: n })
  return rules
}

/**
 * 控件声明的可配置属性（约定式 schema）。
 * 控件 HTML 里写 `window.__xstatConfig = [ ... ]` 数组字面量，属性面板据此
 * 生成表单，值存 widget.customProps 并随 sensors 一起 postMessage 注入：
 *
 *   window.__xstatConfig = [
 *     { key: 'ringColor', label: '圆环颜色', type: 'color',   default: '#03dac6' },
 *     { key: 'unit',      label: '单位',     type: 'text',    default: '°C' },
 *     { key: 'decimals',  label: '小数位',   type: 'number',  default: 1, min: 0, max: 3 },
 *     { key: 'showBg',    label: '显示背景', type: 'boolean', default: true },
 *     { key: 'variant',   label: '样式',     type: 'select',  options: ['a','b'], default: 'a' },
 *     { key: 'speed',     label: '速度',     type: 'slider',  min: 0, max: 10, step: 0.5, default: 1 },
 *     { key: 'valueStyle', label: '数值样式', type: 'textstyle' }
 *   ];
 *
 * type: color | text | number | boolean | select | slider | sensor | textstyle
 * 可选字段：label / default / min / max / step / options
 * sensor：值 = 传感器 id，属性面板用传感器选择器；运行时 props[key] 即 id，控件脚本据此在 sensors 里查找（父页面会自动订阅该传感器）。
 * textstyle：值 = 文本样式对象 { color, fontSize, bold, fontFamily, italic, textShadow }，
 *   属性面板渲染与系统内置组件相同的文本样式编辑器（颜色/字号/粗体/斜体/字体/阴影），
 *   控件脚本通过 props[key].color / props[key].fontSize 等自行应用。
 */
export interface CustomPropSchema {
  key: string
  label?: string
  type: 'color' | 'text' | 'number' | 'boolean' | 'select' | 'slider' | 'sensor' | 'textstyle'
  default?: string | number | boolean | CustomTextStyle
  min?: number
  max?: number
  step?: number
  options?: string[]
}

/** 提取 __xstatConfig 数组字面量 → schema。失败（非字面量/语法错误）返回 []，绝不执行控件代码。 */
export function extractPropSchema(html: string): CustomPropSchema[] {
  const marker = '__xstatConfig'
  const idx = html.indexOf(marker)
  if (idx === -1) return []
  const eq = html.indexOf('=', idx + marker.length)
  if (eq === -1) return []
  const start = html.indexOf('[', eq)
  if (start === -1) return []
  // 平衡括号扫描（跳过字符串/转义），拿到完整数组字面量 —— 避免非贪婪正则
  // 在嵌套 options:[...] 处提前截断。
  let depth = 0
  let inStr: string | null = null
  let end = -1
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") inStr = ch
    else if (ch === '[') depth++
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return []
  try {
    // 宽松转 JSON：所有单引号字符串 → 双引号（覆盖 default:'x' 与数组元素 'a','b'）；
    // 无引号键名 → 加双引号。
    const json = html
      .slice(start, end + 1)
      .replace(/'((?:[^'\\]|\\.)*)'/g, '"$1"')
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.filter((x: unknown): x is CustomPropSchema =>
      !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).key === 'string')
  } catch {
    return []
  }
}

/**
 * Renders user-authored HTML/CSS/JS inside a sandboxed iframe.
 * XStat posts the current sensor snapshot to the iframe via window.postMessage
 * on every poll tick so the user's script can reactively update the UI.
 *
 * Rendering: the widget HTML is served by the XStat service as a real HTTP page
 * (/api/widget?id=…) and loaded via iframe src= — Chrome field trials can
 * silently leave opaque-origin srcdoc iframes at zero layout (content in DOM but
 * never painted → blank widget), while real URL loads are unaffected. The
 * iframe's document.baseURI is http://…, so the common font-injection snippet
 * resolves to the service origin correctly.
 *
 * Security: sandbox="allow-scripts" — no allow-same-origin, so the iframe
 * cannot access parent DOM, localStorage, cookies, or run elevated code.
 */
export const CustomWidget: React.FC<Props> = ({ widget, snapshot }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // 仅由绘制自检失败时自增（重建 iframe），避免其他路径的频繁重建
  const [renderToken, setRenderToken] = useState(0)
  // null = 订阅未决（等待控件声明）；'all' = 未声明 → 发全量（兼容旧控件）；SubscribeRule[] = 已声明的订阅规则
  const [subscribe, setSubscribe] = useState<SubscribeRule[] | 'all' | null>(null)
  // 控件显式声明的订阅（__xstatSubscribe）—— 优先于自动推断
  const [explicit, setExplicit] = useState<SubscribeRule[] | null>(null)
  // 自动推断的订阅：静态扫描控件 HTML 的查找逻辑，无需用户修改原文
  const inferred = useMemo(() => inferSubscription(widget.customHtml ?? ''), [widget.customHtml])
  // 在 LAN 面板（PanelApp）中把订阅上抛给面板层，汇总成服务端订阅（减小 ws 流量）；
  // 编辑器等没有 Provider 的场景下为 noop，无副作用。
  const registerSubscribe = useContext(PanelSubscriptionContext)
  // 绘制自检重试计数（防止空白重建死循环）
  const retryCountRef = useRef(0)

  // 订阅状态变化时通知面板层聚合服务端订阅：
  //  - 显式声明（__xstatSubscribe）→ 以其为准
  //  - 否则用自动推断的规则；推断为空（纯静态控件）→ 不贡献，跟随面板其余控件子集。
  // 另外总把「传感器绑定」（__xstatConfig 里 type:'sensor' 且已选）的 id 并入订阅，
  // 确保选中的传感器一定被推送，控件脚本用 props[key] 即可 find 到。
  const sensorIds = useMemo(() => {
    if (widget.type !== 'Custom') return []
    const ids: string[] = []
    for (const p of extractPropSchema(widget.customHtml ?? '')) {
      if (p.type !== 'sensor') continue
      const v = widget.customProps?.[p.key]
      if (typeof v === 'string' && v.trim()) ids.push(v.trim())
    }
    return ids
  }, [widget.type, widget.customHtml, widget.customProps])

  useEffect(() => {
    const base = explicit ?? inferred
    const rules = sensorIds.length ? [...base, ...sensorIds] : base
    registerSubscribe(widget.id, rules.length ? rules : null)
  }, [explicit, inferred, sensorIds, widget.id, registerSubscribe])

  // 监听 iframe 回发的订阅声明 + 绘制自检（sandbox 下父页面读不到 iframe 内部变量，只能靠 postMessage 上行）
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const data = e.data as { __xstatSubscribe?: unknown; __xstatPaintCheck?: number } | null
      if (!data) return
      if (Array.isArray(data.__xstatSubscribe)) {
        const rules = data.__xstatSubscribe as SubscribeRule[]
        setSubscribe(rules)
        setExplicit(rules)
      }
      if (typeof data.__xstatPaintCheck === 'number') {
        if (data.__xstatPaintCheck === 0 && retryCountRef.current < 2) {
          // iframe 未执行布局（高度 0 → 空白）：重建强制恢复
          retryCountRef.current += 1
          setRenderToken(t => t + 1)
        } else if (data.__xstatPaintCheck > 0) {
          retryCountRef.current = 0
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // web 端（http 页面）：控件 HTML 由服务端 /api/widget 提供（真实 HTTP 加载，
  // 规避 Chromium 对 srcdoc iframe 的渲染缺陷）。v 为内容哈希，HTML 变化时强制重载。
  // Electron 编辑器（file://）：改用 srcDoc 加载内存 HTML（不依赖服务端 /api/widget，
  // 服务启动时序/面板切换不影响预览，且编辑内容实时反映）。
  const isWeb = !!window.location.origin && window.location.origin.startsWith('http')
  const widgetSrc = useMemo(() => {
    if (!isWeb) return ''
    const base = window.location.origin
    const v = hashString(widget.customHtml ?? '') + '|' + Object.keys(widget.customFiles ?? {}).length
    return `${base}/api/widget?id=${encodeURIComponent(widget.id)}&v=${v}`
  }, [isWeb, widget.id, widget.customHtml, widget.customFiles])

  const widgetDoc = useMemo(() => {
    if (isWeb) return undefined
    return injectPaintCheck(applyFiles(injectFontBridge(widget.customHtml ?? ''), widget.customFiles))
  }, [isWeb, widget.customHtml, widget.customFiles])

  // Preload fonts referenced by the widget as data URLs (same-origin fetch, no
  // CORS) and ship them into the iframe; the font bridge rewrites @font-face
  // src so the iframe never needs a cross-origin font request.
  const [fontDataUrls, setFontDataUrls] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    let cancelled = false
    const htmlNames = extractFontNames(widget.customHtml ?? '')
    const propNames = extractCustomPropFonts(widget)
    const names = [...new Set([...htmlNames, ...propNames])]
    if (names.length === 0) { setFontDataUrls({}); return }
    const result: Record<string, string> = {}
    Promise.all(names.map(async (n) => {
      const d = await fetchFontDataUrl(n)
      if (d && !cancelled) result[n] = d
    })).then(() => {
      if (!cancelled) setFontDataUrls(result)
    })
    return () => { cancelled = true }
  }, [widget.customHtml, widget.customProps])

  // Deliver fonts to the iframe after it loads (and again on rebuild / when data arrives).
  useEffect(() => {
    const win = iframeRef.current?.contentWindow
    if (win && fontDataUrls) win.postMessage({ __xstatFonts: fontDataUrls }, '*')
  }, [fontDataUrls, renderToken, isWeb])

  // iframe 重建（绘制自检重试）后重新等待订阅声明
  useEffect(() => {
    setSubscribe(null)
    const timer = setTimeout(() => setSubscribe(s => (s === null ? 'all' : s)), 300)
    return () => clearTimeout(timer)
  }, [renderToken])

  // 按订阅规则把快照过滤后转发给 iframe；未决期不发数据，避免向已订阅控件泄漏全量
  useEffect(() => {
    const win = iframeRef.current?.contentWindow
    if (!win || !snapshot || subscribe === null) return
    const sensors = subscribe === 'all' ? snapshot.sensors : filterSensors(snapshot.sensors, subscribe)
    // props：属性面板改的可配置属性（__xstatConfig 声明），控件脚本用 e.data.props.xxx 读取
    win.postMessage({ sensors, props: widget.customProps ?? {} }, '*')
  }, [snapshot, subscribe, widget.customProps])

  return (
    <iframe
      ref={iframeRef}
      key={renderToken}
      sandbox="allow-scripts"
      {...(isWeb ? { src: widgetSrc } : { srcDoc: widgetDoc })}
      onLoad={() => {
        const win = iframeRef.current?.contentWindow
        if (!win) return
        // Send files ONCE on load so window.__xstatFiles is populated;
        // sensor data flows via the subscription effect above (never files again).
        win.postMessage({ sensors: [], files: widget.customFiles ?? {}, props: widget.customProps ?? {} }, '*')
        // Fonts (data URLs) if already resolved — otherwise the font effect delivers them.
        if (fontDataUrls) win.postMessage({ __xstatFonts: fontDataUrls }, '*')
        // 轻量重绘兜底：微调 opacity 使 iframe 生成新合成层
        const el = iframeRef.current
        if (el) {
          requestAnimationFrame(() => {
            el.style.opacity = '0.999'
            requestAnimationFrame(() => { el.style.opacity = '1' })
          })
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        background: 'transparent',
      }}
      title="xstat-custom-widget"
    />
  )
}

/** 简单字符串哈希（djb2）—— 用于控件内容版本号，HTML 变化时 iframe 强制重新加载 */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

// ── Font bridging (data-URL fonts for the sandboxed iframe) ──────────────────
// Custom widgets reference fonts like /api/fonts/face?name=X (often built at
// runtime via document.baseURI). The sandbox iframe then loads the font as a
// cross-origin resource, which some mobile WebViews fail to apply over HTTPS
// even with correct CORS headers. To make fonts work everywhere, the parent
// page fetches them same-origin (no CORS), converts to data URLs and ships them
// into the iframe via postMessage; the injected font bridge rewrites @font-face
// src to the data URL, so no network request happens inside the iframe at all.

/** Extract fontFamily values from customProps for textstyle-type custom props. */
function extractCustomPropFonts(widget: PanelWidget): string[] {
  const names = new Set<string>()
  for (const p of extractPropSchema(widget.customHtml ?? '')) {
    if (p.type !== 'textstyle') continue
    const ts = widget.customProps?.[p.key]
    if (ts && typeof ts === 'object' && 'fontFamily' in ts) {
      const ff = (ts as CustomTextStyle).fontFamily
      if (ff && ff.trim()) names.add(ff.trim())
    }
  }
  return [...names]
}

/** Extract font family names referenced in a widget's HTML (api/fonts or encodeURIComponent patterns). */
function extractFontNames(html: string): string[] {
  const names = new Set<string>()
  const decode = (s: string) => {
    if (!s.includes('%')) return s
    try { return decodeURIComponent(s) } catch { return s }
  }
  const re1 = /encodeURIComponent\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of html.matchAll(re1) ?? []) names.add(decode(m[1]))
  const re2 = /\/api\/fonts\/face\?name=([^&'")\s]+)/g
  for (const m of html.matchAll(re2) ?? []) names.add(decode(m[1]))
  const re3 = /name\s*=\s*['"]([^'"]+)['"]\s*format\(/g
  for (const m of html.matchAll(re3) ?? []) names.add(decode(m[1]))
  // CSS 声明：font-family: 'X' / font-family: X —— 取第一个字体（逗号前），
  // 用户只需在样式里引用字体名，不再需要手动注入远程 @font-face 脚本。
  // 系统字体（Inter/Courier New…）若服务端没有会快速 404 → null，无害。
  const re4 = /font-family\s*:\s*['"]?([^'";,{}]+)['"]?/gi
  for (const m of html.matchAll(re4) ?? []) {
    const v = m[1].trim()
    if (v) names.add(v)
  }
  return [...names]
}

/**
 * Fetch a font same-origin (no CORS needed) and convert it to a data URL.
 * Cached per family across the whole panel, so multiple widgets referencing the
 * same font only fetch/encode it once (huge win on mobile where each widget
 * iframe would otherwise re-download and re-encode the font file).
 */
const fontDataUrlCache = new Map<string, Promise<string | null>>()
function fetchFontDataUrl(family: string): Promise<string | null> {
  let p = fontDataUrlCache.get(family)
  if (!p) {
    p = (async () => {
      try {
        const base = await getServiceBase()
        const res = await fetch(`${base}/api/fonts/face?name=${encodeURIComponent(family)}`)
        if (!res.ok) return null
        const blob = await res.blob()
        return await new Promise<string | null>((resolve) => {
          const fr = new FileReader()
          fr.onload = () => resolve(fr.result as string)
          fr.onerror = () => resolve(null)
          fr.readAsDataURL(blob)
        })
      } catch {
        return null
      }
    })()
    fontDataUrlCache.set(family, p)
  }
  return p
}
