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
| 拖动卡顿 | 脚本重计算 | 250ms 触发，避免重活 |

## 7. 调试

- `console.log(sensors)` 在 DevTools iframe 上下文查看实时数据
- 列出所有传感器：`console.log(sensors.map(s=>s.id+'  '+s.name).join('\n'))`
- 属性面板「传感器列表」按钮可浏览并复制名称
