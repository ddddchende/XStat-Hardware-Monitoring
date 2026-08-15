# XStat 自定义组件编写指南

XStat 的「自定义」组件把用户编写的完整 HTML 文档放进沙箱 iframe 渲染，XStat 通过 `window.postMessage` 推送实时传感器数据。

## 1. 机制

- **沙箱**：`sandbox="allow-scripts"`（无同源），**不能**访问父窗口 DOM / localStorage / cookie，只能收消息
- **数据**：每次轮询（默认 250ms）XStat 向 iframe 发 `postMessage({ sensors: [...] })`
- **画布缩放（zoom）**：父容器 `transform: scale(zoom)`，iframe 视觉自动跟随缩放，内容无需干预
- **控件 resize**：widget 容器尺寸变化，iframe `width/height:100%` 跟随，**内容必须用相对单位**才会跟随

## 2. 编写规范

1. **完整 HTML 文档**：`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>…</style></head><body>…<script>…</script></body></html>`
2. **body 透明填满**：`background:transparent; overflow:hidden; height:100vh; display:flex; align-items:center; justify-content:center;`
3. **监听 message 取数据，不要自己 fetch**：
   ```js
   window.addEventListener('message', function(e) {
     var sensors = e.data && e.data.sensors;
     if (!sensors) return;
     var s = sensors.find(function(x) { return x.name === 'CPU Package'; });
     if (s) {
       document.getElementById('value').textContent =
         s.value != null ? s.value.toFixed(1) : '--';   // value 可能为 null
     }
   });
   ```
4. **传感器结构**：`{ id, name, category, type, value, unit, hardwareName }`；按 `name` 查找，重名时用 `id`；`value` 可能为 null 必须判空
5. **附加文件**：用 `./data/文件名` 引用（`<img src>` / CSS `background-image` 均可），运行时自动替换为 data URL
6. **不要用 ES module**（`import/export`），用普通 `<script>`
7. **字体：直接用 `font-family` 引用，不要手动注入远程 `@font-face`**：

   ```css
   /* ✅ 正确：直接写字体名，XStat 自动处理 */
   .value { font-family: '方正粗雅宋长简体'; }
   ```

   ```html
   <!-- ❌ 错误（旧方案，已废弃）：手动注入远程字体脚本。
        会在手机上多发起一次字体网络请求，导致加载卡顿；
        且 WebView 反代域名下跨源字体可能不应用 -->
   <script>
     (function () {
       var m = document.baseURI.match(/^https?:\/\/[^/]+/);
       var base = m ? m[0] : 'http://localhost:9421';
       var url = base + '/api/fonts/face?name=' + encodeURIComponent('方正粗雅宋长简体');
       var s = document.createElement('style');
       s.textContent = "@font-face{font-family:'方正粗雅宋长简体';src:url('" + url + "') format('truetype');}";
       document.head.appendChild(s);
     })();
   </script>
   ```

   控件里只需写 `font-family: '字体名'`，XStat 会自动：扫描 HTML 提取字体名 → 同源获取字体文件转 data URL → 注入控件文档（fontBridge）→ 在任何环境（桌面 / 局域网 APK / 反代域名手机浏览器）都能显示。字体来自 XStat 服务所在电脑上安装的字体；电脑上没有的字体名会自动回退到系统字体。

## 3. 自适应与缩放（核心，最易踩坑）

> 用户最常报的问题："控件缩放时无法跟随放大" —— 根因几乎都是**写死了 px**。

### 必须遵守
- **禁止固定 px**：`width:200px; height:200px; font-size:14px;` 这类会导致 resize 控件时内容不跟随容器变化
- **用 vh / vw / vmin**：iframe 内 `1vh = 容器高度的 1%`，`1vw = 容器宽度的 1%`，`1vmin = min(vh,vw)`。容器 resize 时这些单位自动跟随
- **字号相对**：`font-size: 6vh` 或 `3vmin`，而非 `14px`
- **尺寸相对**：`width: 80%; height: 80%;` 或 `width: 60vh;`，而非 `200px`
- **SVG 用 viewBox + width/height:100%**：矢量自动缩放，最省心
- **复杂控件**：用 `ResizeObserver` 监听 `document.body` 尺寸，JS 动态计算并重绘

### 缩放类型区分
| 操作 | 机制 | 内容需做什么 |
|---|---|---|
| 画布滚轮 zoom | 父级 `transform: scale` | 无需处理，视觉自动缩放 |
| 拖 handle resize 控件 | iframe 容器尺寸变 | **必须用 vh/vw/vmin**，否则不跟随 |

### 反例 → 正例
```css
/* ❌ 错误：固定 px，resize 不跟随 */
.widget-wrapper { width: 200px; height: 200px; }
.value { font-size: 36px; }

/* ✅ 正确：相对单位，resize 跟随 */
.widget-wrapper { width: 60vmin; height: 60vmin; }
.value { font-size: 6vmin; }
```

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
  /* 全部用 vmin —— 跟随容器较短边缩放 */
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
    var C = 2 * Math.PI * 42; // 周期长 ≈ 264
    window.addEventListener('message', function(e) {
      var sensors = e.data && e.data.sensors;
      if (!sensors) return;
      var s = sensors.find(function(x) { return x.name === 'CPU Package'; });
      if (!s) return;
      var v = s.value != null ? s.value : 0;
      document.getElementById('value').textContent = s.value != null ? v.toFixed(1) : '--';
      document.getElementById('unit').textContent = s.unit || '';
      document.getElementById('label').textContent = s.name;
      // 假设 0~100，按比例填充弧
      var pct = Math.max(0, Math.min(1, v / 100));
      document.getElementById('arc').setAttribute('stroke-dashoffset', C * (1 - pct));
    });
  </script>
</body>
</html>
```

## 5. JS 动态自适应（复杂控件备用）

当纯 CSS 相对单位不够（如需按比例重排）时：

```js
function layout() {
  var w = window.innerWidth, h = window.innerHeight;
  document.documentElement.style.fontSize = (Math.min(w, h) / 100) + 'px';
  // 之后用 rem 单位，1rem = 容器短边的 1%
  // 重绘 canvas / 复杂布局...
}
window.addEventListener('resize', layout);
new ResizeObserver(layout).observe(document.body);
layout();
```

## 6. 常见坑

| 问题 | 原因 | 修复 |
|---|---|---|
| resize 控件内容不跟随 | 固定 px | 改 vh / vw / vmin |
| `toFixed` 报错 | value 为 null | `s.value != null ? … : '--'` |
| `import` 报错 | 用了 ES module | 改普通 `<script>` |
| 文件不显示 | 路径非 `./data/文件名` | 用 `./data/` 前缀 |
| 控件白屏 | body 不透明 / height 非 100vh | `background:transparent; height:100vh;` |
| 字体没生效（回退系统字体） | ① 手动注入了远程 `@font-face` 脚本（旧方案，移动端会卡）② 字体名拼写与电脑上安装的不一致 | ① 删掉注入段，只用 `font-family` ② 核对字体名（可在属性面板的字体选择器里复制准确名称） |
| 拖动卡顿 | 脚本重计算 | 250ms 触发，避免重活 |

## 7. 调试

- `console.log(sensors)` 在 DevTools iframe 上下文查看实时数据
- 列出所有传感器：`console.log(sensors.map(s=>s.id+'  '+s.name).join('\n'))`
- 属性面板「传感器列表」按钮可浏览并复制名称

## 8. 传感器名称速查表（给 AI 画组件用）

> 传感器用 `name` 查找。**通用传感器名称（CPU Total / CPU Package / Core Max / GPU Core / Memory 等）跨机器稳定**，可直接写死在组件里；硬件特定名称（P-Core #N、盘名、网卡名）按当前机器实测为准。同一类传感器（多核/多盘/多网卡）的 `name` 会重复，此时改用 `id`（唯一路径）或 `category + type + hardwareName` 组合查找。
>
> 组件里用 `category`（CPU/GPU/RAM/Storage/Network/…）+ `type`（Load/Temperature/Clock/Power/Voltage/Data/Throughput/…）判断传感器种类。常用查找写法见第 2 节。

### CPU（i7-12700K 实测，通用名称跨 Intel CPU 稳定）

| name | type | unit |
|---|---|---|
| CPU Total | Load | % |
| CPU Core Max | Load | % |
| CPU Core #N Thread #1 / #2 | Load | % |
| CPU Package | Temperature | °C |
| Core Max | Temperature | °C |
| Core Average | Temperature | °C |
| P-Core #N | Temperature | °C |
| P-Core #N Distance to TjMax | Temperature | °C |
| P-Core #N | Clock | MHz |
| Bus Speed | Clock | MHz |
| CPU Package | Power | W |
| CPU Cores / CPU Memory / CPU Platform | Power | W |
| CPU Core | Voltage | V |
| P-Core #N | Voltage | V |

### GPU（RTX 3080 实测，NVIDIA 通用）

| name | type | unit |
|---|---|---|
| GPU Core | Temperature | °C |
| GPU Hot Spot | Temperature | °C |
| GPU Memory Junction | Temperature | °C |
| GPU Core | Clock | MHz |
| GPU Memory | Clock | MHz |
| GPU Core | Load | % |
| GPU Memory Controller / GPU Video Engine / GPU Bus / GPU Power / GPU Board Power | Load | % |
| GPU Fan 1 / GPU Fan 2 | Fan | RPM |
| GPU Fan 1 / GPU Fan 2 | Control | % |
| GPU Core Voltage | Voltage | V |
| GPU Package | Power | W |
| GPU Memory Total / Free / Used | SmallData | MB |
| D3D Dedicated Memory Used / D3D Shared Memory Used | SmallData | MB |
| D3D 3D / D3D Compute_0 / D3D Compute_1 / D3D Cuda / D3D VR / D3D Video Decode / D3D Video Encode / D3D Copy / D3D Overlay / D3D Graphics_1 / D3D Security / D3D Optical Flow Accelerator 0 | Load | % |
| GPU PCIe Rx / GPU PCIe Tx | Throughput | Mbps |

### RAM / 内存

| name | type | unit | 说明 |
|---|---|---|---|
| Memory Used | Data | GB | 「Total Memory」控制器（物理内存） |
| Memory Available | Data | GB | 同上 |
| Memory | Load | % | 同上 |
| Total Physical Memory | Data | GB | 同上（合成，= Used + Available） |
| Memory Used / Memory Available / Memory / Total Physical Memory | Data/Load | GB/% | 「Virtual Memory」控制器（虚拟内存） |
| Capacity | Data | GB | 每条内存条 |
| tCKAVGmin / tCKAVGmax / tAA / tRCD / tRP / tRAS / tRC / tRFC1 / tRFC2 / tRFC4 / tFAW / tRRD_S / tRRD_L / tCCD_L / tWR / tWTR_S / tWTR_L | Timing | — | 内存时序（每条内存条） |

### Motherboard / 主板（Nuvoton NCT6798D 实测，型号随主板不同）

| name | type | unit |
|---|---|---|
| Fan #1 ~ Fan #7 | Control | % |
| Fan #1 ~ Fan #7 | Fan | RPM |
| Vcore / AVCC / +3.3V / +3V Standby / CMOS Battery / CPU Termination | Voltage | V |
| Voltage #2 / #5 / #6 / #7 / #11 / #13 / #14 / #15 | Voltage | V |
| Temperature #1 / #2 / #3 / #4 / #6 | Temperature | °C |

### Storage / 硬盘（每个盘一组，hardwareName 区分）

| name | type | unit |
|---|---|---|
| Temperature / Warning Temperature / Critical Temperature | Temperature | °C |
| Life | Level | % |
| Used Space | Load | % |
| Read Activity / Write Activity / Total Activity | Load | % |
| Free Space / Total Space / Data Read / Data Written | Data | GB |
| Read Rate / Write Rate | Throughput | Mbps |
| Power On Count | Factor | × |
| Power On Hours | Factor | × |

### Network / 网络（每个网卡一组，hardwareName 区分，如 以太网 / WLAN）

| name | type | unit |
|---|---|---|
| Upload Speed / Download Speed | Throughput | Mbps |
| Network Utilization | Load | % |
| Data Uploaded / Data Downloaded | Data | GB |

### 查找要点

- `value` 可能为 `null`（传感器暂时不可用），渲染前务必判空：`s.value != null ? … : '--'`
- `unit` 已含单位符号（`°C` / `%` / `MHz` / `GB` / `W` / `V` / `RPM` / `Mbps` / `×`），直接显示即可
- 百分比类（Load）合理范围 0–100，可直接做进度条/仪表；温度/频率/功率按需设 max
- 实时数据在 `/api/sensors`（JSON）可人工核对当前机器实际有哪些传感器

## 9. 按需订阅与自动推断

> XStat 会按需推送：**控件收到的 `sensors` 只是服务端按"面板实际用到的传感器"过滤后的子集**，而不是全部 300+ 个传感器（减小 LAN 带宽和内存开销）。

### 自动推断（无需手动配置）

面板加载时，XStat **自动扫描控件 HTML 里的查找逻辑**，推断它需要哪些传感器：

- 识别 `s.category === 'CPU'`、`s.type === 'Power'`、`s.name === 'cpu package'` 这类字段比较（含 `!==` 排除式），组合成精确规则
- 兜底识别 `keywords.some(k => name === k)` 这类数组匹配写法（提取含传感器关键词的多词字符串）
- 显式声明（见下）优先于自动推断

### 控件显示 `--` 的排查

自动推断能覆盖绝大多数常规写法。若控件一直显示 `--`（拿不到数据），大概率是**非标准写法**导致推断抓不到，例如：

- 条件写在别的变量/函数里，与 `sensors` 无直接字段比较
- 用 `indexOf` / `includes` / 动态拼接等运行时方式匹配
- 混淆、压缩过的脚本

### 显式声明兜底（罕见情况）

推断失败时，在控件脚本里**主动声明自己需要的传感器**即可，一行代码：

```html
<script>
  // 按字段条件匹配：category/type/name/id/hardwareName/unit（大小写不敏感包含匹配）
  window.parent.postMessage({
    __xstatSubscribe: [
      { category: 'CPU', type: 'Power' },   // 例如 CPU 功耗
      { name: 'GPU Memory Total' }          // 例如按名称
    ]
  }, '*');
</script>
```

也支持按 id：

```js
window.parent.postMessage({ __xstatSubscribe: ['cpu/intelcpu/0/power/0'] }, '*');
```

不需要实时数据时可声明空数组（几乎零开销）：

```js
window.parent.postMessage({ __xstatSubscribe: [] }, '*');
```

> 提示：`window.parent.postMessage({ __xstatSubscribe: [...] }, '*')` 放在控件脚本**顶部**（其余查找逻辑之前）即可；控件 iframe 重建后脚本会重新执行，父页面会自动重新读取声明。
