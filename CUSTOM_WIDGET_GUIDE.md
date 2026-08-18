# XStat 自定义组件编写指南

XStat 的「自定义」组件把用户编写的完整 HTML 文档放进沙箱 iframe 渲染，XStat 通过 `window.postMessage` 推送实时传感器数据。

## 目录

- [1. 机制](#1-机制)
- [2. 编写规范](#2-编写规范)
- [3. 自适应与缩放](#3-自适应与缩放核心最易踩坑)
- [4. 完整示例](#4-完整自适应示例圆环控件)
- [5. JS 动态自适应](#5-js-动态自适应复杂控件备用)
- [6. 常见问题](#6-常见问题)
- [7. 调试](#7-调试)
- [8. 传感器速查表](#8-传感器名称速查表给-ai-画组件用)
- [9. 按需订阅](#9-按需订阅与自动推断)
- [10. 可配置属性](#10-可配置属性属性面板映射)

---

## 1. 机制

| 特性 | 说明 |
|---|---|
| **沙箱** | `sandbox="allow-scripts"`（无同源），不能访问父窗口 DOM / localStorage / cookie |
| **数据推送** | 每次轮询（默认 250ms）发 `postMessage({ sensors, props })` |
| **画布缩放** | 父容器 `transform: scale(zoom)`，内容无需处理 |
| **控件 resize** | iframe `width/height:100%` 跟随，**内容必须用相对单位** |

---

## 2. 编写规范

### 基本要求

1. **完整 HTML 文档**：
   ```html
   <!DOCTYPE html>
   <html>
   <head><meta charset="UTF-8"><style>…</style></head>
   <body>…<script>…</script></body>
   </html>
   ```

2. **body 透明填满**：
   ```css
   body {
     background: transparent;
     overflow: hidden;
     height: 100vh;
     display: flex;
     align-items: center;
     justify-content: center;
   }
   ```

3. **监听 message 取数据**：
   ```js
   window.addEventListener('message', function(e) {
     var sensors = e.data && e.data.sensors;
     if (!sensors) return;
     var s = sensors.find(function(x) { return x.name === 'CPU Package'; });
     if (s) {
       document.getElementById('value').textContent =
         s.value != null ? s.value.toFixed(1) : '--';
     }
   });
   ```

4. **传感器结构**：`{ id, name, category, type, value, unit, hardwareName }`
   - 按 `name` 查找，重名时用 `id`
   - `value` 可能为 `null`，必须判空

5. **附加文件**：用 `./data/文件名` 引用，运行时自动替换为 data URL

6. **不要用 ES module**（`import/export`），用普通 `<script>`

### 字体使用

**直接用 `font-family` 引用，无需手动注入 `@font-face`**：

```css
/* ✅ 正确：直接写字体名 */
.value { font-family: '方正粗雅宋长简体'; }
```

XStat 会自动：
1. 扫描 HTML 和 `textstyle` 属性提取字体名
2. 同源获取字体文件转 data URL
3. 注入控件文档（fontBridge）
4. 在任何环境（桌面 / 局域网 / APK / 反代域名）都能显示

> 字体来自 XStat 服务所在电脑上安装的字体；电脑上没有的字体名会自动回退到系统字体。

---

## 3. 自适应与缩放（核心，最易踩坑）

> 用户最常报的问题："控件缩放时无法跟随放大" —— 根因几乎都是**写死了 px**。

### 必须遵守

| 规则 | 错误示例 | 正确示例 |
|---|---|---|
| 禁止固定 px | `width:200px; font-size:14px;` | `width:60vmin; font-size:3vmin;` |
| 用 vh / vw / vmin | — | `1vh = 容器高度的 1%` |
| 字号相对 | `font-size: 14px` | `font-size: 6vh` 或 `3vmin` |
| SVG 自动缩放 | 固定尺寸 | `viewBox + width:100%` |

### 缩放类型区分

| 操作 | 机制 | 内容需做什么 |
|---|---|---|
| 画布滚轮 zoom | 父级 `transform: scale` | 无需处理 |
| 拖 handle resize | iframe 容器尺寸变 | **必须用 vh/vw/vmin** |

### 代码对比

```css
/* ❌ 错误：固定 px，resize 不跟随 */
.widget-wrapper { width: 200px; height: 200px; }
.value { font-size: 36px; }

/* ✅ 正确：相对单位，resize 跟随 */
.widget-wrapper { width: 60vmin; height: 60vmin; }
.value { font-size: 6vmin; }
```

---

## 4. 完整自适应示例（圆环控件）

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: transparent;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: Inter, system-ui, sans-serif;
    color: #fff;
  }
  .ring { width: 70vmin; height: 70vmin; }
  #label { font-size: 2.5vmin; color: rgba(255,255,255,0.45); margin-bottom: 1vmin; }
  #value { font-size: 7vmin; font-weight: 700; fill: #03dac6; }
  #unit  { font-size: 3vmin; fill: rgba(255,255,255,0.5); }
</style>
</head>
<body>
  <div id="label">CPU Package</div>
  <svg class="ring" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
    <circle id="arc" cx="50" cy="50" r="42" fill="none" stroke="#03dac6" stroke-width="8"
            stroke-linecap="round" transform="rotate(-90 50 50)"
            stroke-dasharray="264" stroke-dashoffset="264"/>
    <text id="value" x="50" y="48" text-anchor="middle" dominant-baseline="middle">--</text>
    <text id="unit"  x="50" y="62" text-anchor="middle" dominant-baseline="middle">°C</text>
  </svg>
  <script>
    var C = 2 * Math.PI * 42;
    window.addEventListener('message', function(e) {
      var sensors = e.data && e.data.sensors;
      if (!sensors) return;
      var s = sensors.find(function(x) { return x.name === 'CPU Package'; });
      if (!s) return;
      var v = s.value != null ? s.value : 0;
      document.getElementById('value').textContent = s.value != null ? v.toFixed(1) : '--';
      document.getElementById('unit').textContent = s.unit || '';
      document.getElementById('label').textContent = s.name;
      var pct = Math.max(0, Math.min(1, v / 100));
      document.getElementById('arc').setAttribute('stroke-dashoffset', C * (1 - pct));
    });
  </script>
</body>
</html>
```

---

## 5. JS 动态自适应（复杂控件备用）

当纯 CSS 相对单位不够时：

```js
function layout() {
  var w = window.innerWidth, h = window.innerHeight;
  document.documentElement.style.fontSize = (Math.min(w, h) / 100) + 'px';
  // 之后用 rem 单位，1rem = 容器短边的 1%
}
window.addEventListener('resize', layout);
new ResizeObserver(layout).observe(document.body);
layout();
```

---

## 6. 常见问题

| 问题 | 原因 | 修复 |
|---|---|---|
| resize 控件内容不跟随 | 固定 px | 改 vh / vw / vmin |
| `toFixed` 报错 | value 为 null | `s.value != null ? … : '--'` |
| `import` 报错 | 用了 ES module | 改普通 `<script>` |
| 文件不显示 | 路径非 `./data/文件名` | 用 `./data/` 前缀 |
| 控件白屏 | body 不透明 / height 非 100vh | `background:transparent; height:100vh;` |
| 字体没生效 | ① 手动注入远程 `@font-face` ② 字体名拼写错误 ③ `textstyle` 属性字体未生效 | ① 删掉注入段，只用 `font-family` ② 核对字体名 ③ 新版已自动处理 |
| 拖动卡顿 | 脚本重计算 | 250ms 触发，避免重活 |

---

## 7. 调试

```js
// 查看实时数据
console.log(sensors);

// 列出所有传感器
console.log(sensors.map(s => s.id + '  ' + s.name).join('\n'));
```

属性面板「传感器列表」按钮可浏览并复制名称。

---

## 8. 传感器名称速查表（给 AI 画组件用）

> 传感器用 `name` 查找。**通用传感器名称跨机器稳定**，可直接写死；硬件特定名称按当前机器实测为准。同一类传感器的 `name` 会重复，此时改用 `id` 或 `category + type + hardwareName` 组合查找。

### CPU（Intel 通用）

| name | type | unit |
|---|---|---|
| CPU Total / CPU Core Max | Load | % |
| CPU Package | Temperature | °C |
| Core Max / Core Average | Temperature | °C |
| P-Core #N | Clock / Temperature / Voltage | MHz / °C / V |
| Bus Speed | Clock | MHz |
| CPU Package / CPU Cores / CPU Memory | Power | W |
| CPU Core | Voltage | V |

### GPU（NVIDIA 通用）

| name | type | unit |
|---|---|---|
| GPU Core / GPU Hot Spot / GPU Memory Junction | Temperature | °C |
| GPU Core / GPU Memory | Clock | MHz |
| GPU Core | Load | % |
| GPU Fan 1 / GPU Fan 2 | Fan / Control | RPM / % |
| GPU Core Voltage | Voltage | V |
| GPU Package | Power | W |
| GPU Memory Total / Free / Used | SmallData | MB |
| GPU PCIe Rx / Tx | Throughput | Mbps |

### RAM / 内存

| name | type | unit |
|---|---|---|
| Memory Used / Memory Available | Data | GB |
| Memory | Load | % |
| Total Physical Memory | Data | GB |

### Storage / 硬盘

| name | type | unit |
|---|---|---|
| Temperature | Temperature | °C |
| Life | Level | % |
| Used Space | Load | % |
| Free Space / Total Space | Data | GB |
| Read Rate / Write Rate | Throughput | Mbps |

### Network / 网络

| name | type | unit |
|---|---|---|
| Upload Speed / Download Speed | Throughput | Mbps |
| Network Utilization | Load | % |
| Data Uploaded / Data Downloaded | Data | GB |

### 查找要点

- `value` 可能为 `null`，渲染前务必判空
- `unit` 已含单位符号，直接显示即可
- 百分比类（Load）范围 0–100，可直接做进度条
- 实时数据在 `/api/sensors`（JSON）可核对

---

## 9. 按需订阅与自动推断

> XStat 会按需推送：控件收到的 `sensors` 只是服务端按"面板实际用到的传感器"过滤后的子集。

### 自动推断（无需手动配置）

XStat 自动扫描控件 HTML 里的查找逻辑：
- 识别 `s.category === 'CPU'`、`s.type === 'Power'` 等字段比较
- 兜底识别数组匹配写法

### 控件显示 `--` 的排查

自动推断能覆盖绝大多数常规写法。若一直显示 `--`，可能是**非标准写法**导致推断失败：
- 条件写在别的变量/函数里
- 用 `indexOf` / `includes` 等运行时方式匹配

### 显式声明兜底

```js
// 按字段条件匹配
window.parent.postMessage({
  __xstatSubscribe: [
    { category: 'CPU', type: 'Power' },
    { name: 'GPU Memory Total' }
  ]
}, '*');

// 按 id
window.parent.postMessage({ __xstatSubscribe: ['cpu/intelcpu/0/power/0'] }, '*');

// 不需要实时数据
window.parent.postMessage({ __xstatSubscribe: [] }, '*');
```

> 放在控件脚本**顶部**即可；iframe 重建后脚本会重新执行。

---

## 10. 可配置属性（属性面板映射）

想让控件的某些值在**右侧属性面板**里直接修改，在控件 HTML 里声明 `__xstatConfig` 数组：

```html
<script>
  window.__xstatConfig = [
    { key: 'ringColor', label: '圆环颜色', type: 'color', default: '#03dac6' },
    { key: 'unit', label: '单位', type: 'text', default: '°C' },
    { key: 'decimals', label: '小数位', type: 'number', default: 1, min: 0, max: 3 },
    { key: 'showBg', label: '显示背景', type: 'boolean', default: true },
    { key: 'variant', label: '样式', type: 'select', options: ['扁平', '圆环'], default: '扁平' },
    { key: 'speed', label: '速度', type: 'slider', min: 0, max: 10, step: 0.5, default: 1 },
    { key: 'valueStyle', label: '数值样式', type: 'textstyle' }
  ];
</script>
```

### 字段说明

| type | 表单控件 | 支持字段 |
|---|---|---|
| `color` | 颜色选择器 | `default` |
| `text` | 文本框 | `default` |
| `number` | 数字输入 | `default` / `min` / `max` / `step` |
| `boolean` | 开关 | `default` |
| `select` | 分段按钮 / 下拉 | `options` / `default` |
| `slider` | 滑块 | `default` / `min` / `max` / `step` |
| `sensor` | 传感器选择器 | `default`（传感器 id） |
| `textstyle` | 文本样式编辑器 | `default`（部分字段） |

通用字段：`key`（必填）、`label`（显示名，缺省用 key）。

### 在脚本里读取

```js
window.addEventListener('message', function (e) {
  var sensors = e.data && e.data.sensors;
  var props = (e.data && e.data.props) || {};
  if (sensors) {
    document.getElementById('ring').style.color = props.ringColor || '#03dac6';
    document.getElementById('unit').textContent = props.unit || '';
    document.getElementById('bg').style.display = props.showBg ? '' : 'none';
  }
});
```

> 要点：
> - `props` 的值为「属性面板里改过的值」，没改过的项不会出现 —— 用 `props.xxx || 默认值` 兜底
> - `__xstatConfig` 必须是**字面量数组**，解析失败只会不显示表单

### textstyle 类型

`textstyle` 的值是一个文本样式对象：

```js
{
  color: '#f1f5f9',
  fontSize: 32,
  bold: false,
  italic: false,
  fontFamily: '方正粗雅宋长简体',
  textShadow: { enabled: true, color: '#000000', opacity: 100, blur: 8, distance: 4, angle: 45 }
}
```

> **字体自动注入**：`textstyle` 的 `fontFamily` 修改后，XStat 会自动检测变化并注入字体到 iframe，无需手动处理。

辅助函数一次性应用样式：

```js
function xstatParseColor(c) {
  c = String(c || '#000000').trim();
  var m = c.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = c.match(/^#([0-9a-fA-F]{3})$/);
  if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
  m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { var p = m[1].split(',').map(function (x) { return parseFloat(x.trim()) || 0 }); return [p[0], p[1], p[2]]; }
  return [0, 0, 0];
}
function xstatShadowCss(s) {
  if (!s || !s.enabled) return '';
  var a = (s.angle != null ? s.angle : 45) * Math.PI / 180;
  var d = s.distance != null ? s.distance : 4;
  var o = (s.opacity != null ? s.opacity : 100) / 100;
  var b = s.blur != null ? s.blur : 8;
  var rgb = xstatParseColor(s.color);
  return (Math.cos(a) * d).toFixed(1) + 'px ' + (Math.sin(a) * d).toFixed(1) + 'px ' + b + 'px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + o + ')';
}
function xstatApplyText(el, s) {
  if (!el || !s) return;
  if (s.color) el.style.color = s.color;
  if (s.fontSize != null) el.style.fontSize = s.fontSize + 'px';
  if (s.bold != null) el.style.fontWeight = s.bold ? 'bold' : 'normal';
  if (s.italic != null) el.style.fontStyle = s.italic ? 'italic' : 'normal';
  if (s.fontFamily) el.style.fontFamily = s.fontFamily;
  el.style.textShadow = xstatShadowCss(s.textShadow);
}

// 使用
xstatApplyText(document.getElementById('value'), props.valueStyle);
```

### 实用技巧

**① 字号比例缩放**

```js
// rem 基准控件
var curScale = 1;
function fitContent() {
  document.documentElement.style.fontSize = (window.innerHeight / 100) * curScale + 'px';
}
// message 里：curScale = props.fontScale != null ? Number(props.fontScale) : 1; fitContent();

// vmin 单位控件
document.documentElement.style.zoom = props.fontScale != null ? Number(props.fontScale) : 1;
```

**② 换主题色（CSS 变量）**

```css
.wrap { --theme: #1aff40; --glow: rgba(26, 255, 64, 0.6); }
```
```js
var wrap = document.querySelector('.wrap');
if (wrap && props.themeColor) {
  var c = props.themeColor;
  wrap.style.setProperty('--theme', c);
  var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  wrap.style.setProperty('--glow', 'rgba(' + r + ',' + g + ',' + b + ',0.6)');
}
```

**③ 多样式切换**

```html
<style>
  .wrap.neon  { background: linear-gradient(135deg,#0f2027,#203a43); color: #00ff88; }
  .wrap.paper { background: #f5f0e6; color: #222; }
</style>
<script>
  window.__xstatConfig = [
    { key: 'variant', label: '样式', type: 'select', options: ['霓虹', '纸张'], default: '霓虹' }
  ];
</script>
<script>
  window.addEventListener('message', function (e) {
    var props = (e.data && e.data.props) || {};
    var map = { '霓虹': 'neon', '纸张': 'paper' };
    var wrap = document.getElementById('wrap');
    var v = props.variant != null ? props.variant : '霓虹';
    wrap.className = 'wrap ' + (map[v] || 'neon');
  });
</script>
```

**④ 传感器选择**

```html
<script>
  window.__xstatConfig = [
    { key: 'sensor', label: '传感器', type: 'sensor' },
    { key: 'decimals', label: '小数位', type: 'number', default: 1, min: 0, max: 3 }
  ];
</script>
<script>
  window.addEventListener('message', function (e) {
    var props = (e.data && e.data.props) || {};
    var sensors = (e.data && e.data.sensors) || [];

    var target = null;
    if (props.sensor) {
      target = sensors.find(function (s) { return s.id === props.sensor; });
    }
    if (!target) {
      target = sensors.find(function (s) { return s.category === 'CPU' && s.type === 'Power'; });
    }

    if (target && target.value != null) {
      var dec = props.decimals != null ? Number(props.decimals) : 1;
      document.getElementById('value').textContent = target.value.toFixed(dec);
    }
  });
</script>
```

> 要点：`type: 'sensor'` 的值是传感器 `id`，XStat 会自动订阅选中的传感器。
