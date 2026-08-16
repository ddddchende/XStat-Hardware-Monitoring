<h1 align="center">XStat 硬件监控（第三方增强版）</h1>

<p align="center">
  本仓库 fork 自 <a href="https://github.com/Inside4ndroid/XStat-Hardware-Monitoring">Inside4ndroid/XStat-Hardware-Monitoring</a>
  （基线 v0.3.0，提交 <code>f3e66f8</code>），在其基础上进行了深度增强。
</p>

---
![预览](website-source/images/screenshots/54f0e3e1-3fc1-456a-864d-26df1f8a9fac.png)

## 本 fork 修改了什么

### 🟢 硬件传感器（服务端）

- **修复传感器丢失问题**：LibreHardwareMonitorLib 升级至 `0.9.7-pre700`（pre663 的 `Mutexes.Open()` 在部分环境抛 `ArgumentNullException` 导致 `Computer.Open()` 失败、传感器全部无法枚举）；恢复 340+ 路传感器通道（CPU 59 / GPU 42 / 主板 33 / 网络 67 / 内存 58 / 存储 81）
- **精确物理内存**：Total Physical Memory 改为所有内存条 SPD Capacity 求和（16+16+32=64GB），不再因 Windows 保留内存而少算
- **快速磁盘活动**：新增每块磁盘的 Activity Time / 读取 / 写入速度传感器，通过 Windows 性能计数器直读（不再走慢速串行 SMART），并按磁盘型号映射硬件名；读写速度按 ≥1 GiB/s 自动在 MB/s 与 GB/s 之间切换
- **网络总量**：新增汇总所有网卡的上传 / 下载总速度传感器
- **按需订阅**：SensorHub 新增 `Subscribe(SensorFilter)` / `SubscribeAll()` / `GetHistory()`，SensorBroadcastService 按连接订阅推送匹配传感器，实测单次推送约 50KB → 约 1KB
- **新增 REST API**：系统信息（CPU/GPU 型号、内存容量/频率、磁盘、系统版本）、自定义控件 HTML（`/api/widget`）、字体、诊断等控制器

### 🟢 面板编辑器（前端）

- **控件复制**：控件复制/粘贴
- **撤销 / 重做**：Ctrl+Z / Ctrl+Shift+Z，覆盖所有编辑操作的历史记录
- **智能对齐参考线**：拖动**和**缩放控件时吸附到其他控件的边 / 中心，带总开关
- **控件成组**：控件分组后整体移动 / 复制 / 导出 / 导入（`.xstatgroup`）；点击组成员即选中整组并显示统一父级框框；组框与组框之间优先对齐，不考虑子控件；成组 / 解组 / 复制组 / 导出组 / 导入组
- **多选编辑**：框选多控件后批量操作与统一属性编辑
- **左键选择**：点击即可选中控件
- **多面板升级**：多面板创建、切换与激活面板推送优化
- **画布属性**：新增画布级属性配置

### 🟢 新增控件

- **SVG 图标控件**：容器内渲染任意 SVG 代码，内置代码编辑器与图标颜色设置
- **系统信息控件**：显示 CPU/GPU 型号、内存容量/频率、磁盘、系统版本等，逐项开关标签 / 图标、图标颜色、磁盘选择、文本对齐
- **Box 动画控件**：9 种动态背景效果（网格、雨滴、光斑、霓虹、矩阵等）
- **Sensor Sparkline**：新增自动缩放开关，关闭后可手动固定 Y 轴最小 / 最大值

### 🟢 自定义控件增强

- **按需订阅自动推断**：静态扫描控件 HTML 中的 `.category / .type / .name === 'X'` 比较，自动推断所需传感器并订阅，无需修改控件代码；显式 `__xstatSubscribe` 声明优先；附 CUSTOM_WIDGET_GUIDE.md 使用文档
- **文件附件**：支持 `./data/…` 引用控件自带文件
- **双环境稳定渲染**：网页端走服务端 HTTP 端点（`/api/widget`），Electron 桌面编辑器走内存 srcDoc，规避 Chromium 有痕 profile 下 srcdoc iframe 不布局的渲染缺陷；内置 paint-check 空高度重建保护

### 🟢 界面与体验

- **多语言**：完整简体中文与英文界面（i18n）
- **移动端适配**：优化移动端显示、锁定页面缩放
- **字体系统**：面板自定义字体加载（本地字体注册与接口下发）
- **工作区管理**：保存 / 打开命名工作区（含多个面板）
- **导入 / 导出**：控件（`.xstatwidget`）、组（`.xstatgroup`）、面板均可导出为 JSON 并导入
- **Electron 主进程加固**：服务进程校验——`/health` 返回进程 ID 与可执行路径，不一致时自动停止旧进程并重启当前包服务（修复"前端新、后端旧"问题）；开机自启、托盘启动等启动选项

### 🟢 Android 手机端应用（Kotlin）

- **启动连接方式选择**：首次启动选择「局域网自动搜索」或「手动输入地址」，选择后自动记住，下次启动直接按保存的方式连接
- **设置页**：查看当前连接方式，一键清除配置并回到选择页
- **无按钮手势**：主界面为全屏 WebView，无任何按钮；同时按音量 + 和音量 − 即可打开设置页（单按音量键仍正常调音量）
- **多语言**：简体中文 / 英文随系统语言自动切换
- **操作提示**：连接成功后屏幕中央弹出 5 秒动画提示（淡入缩放 + 淡出），终身最多显示 3 次
- **断线自恢复**：后台每 1 秒探测 `/health`，连续 3 次失败自动回到搜索流程重新连接

---

## API 接口

服务端默认监听 `9421` 端口（C# 路由大小写不敏感）。

### HTTP REST

| 接口 | 方法 | 用途 |
|---|---|---|
| `/health` | GET | 健康检查：status / version / isAdmin / processId / executablePath（Electron 检测旧服务用） |
| `/api/sensors` | GET | 最新传感器快照（全量） |
| `/api/sensors/{category}` | GET | 按分类过滤的快照（如 `cpu`、`gpu`、`ram`） |
| `/api/config` | GET | 当前运行配置（pollIntervalMs） |
| `/api/config` | PUT | 修改轮询间隔（100–30000 ms，立即生效） |
| `/api/panel-layout` | GET | 当前面板布局 JSON（未推送过则返回 204） |
| `/api/panel-layout` | PUT | 保存布局，并向所有 SignalR 客户端推送 `LayoutUpdated` 事件 |
| `/api/widget?id={id}` | GET | 自定义控件 HTML 页（内联 `./data/` 文件，注入字体桥与 paint-check） |
| `/api/systeminfo` | GET | 静态系统信息：CPU/GPU 型号、内存容量/频率/类型、磁盘、系统版本、Uptime |
| `/api/fonts/face?name={字体名}` | GET / HEAD | 传输本机字体文件（.ttf / .otf / .woff / .woff2，允许任意跨源） |
| `/api/fonts/available` | GET | 可传输的字体名列表 |
| `/api/diag` | GET | 采集诊断：各硬件 Update 耗时、快慢通道总耗时、轮询间隔 |
| `/favicon.ico` | GET | 重定向到 `/icon.ico` |

### SignalR

- 端点：`/hubs/sensors`
- 客户端 → 服务端：`Subscribe(filter?)`（按需订阅匹配传感器）、`SubscribeAll()`（订阅全量）、`GetHistory()`（拉取历史快照）
- 服务端 → 客户端：传感器快照流（按轮询间隔推送；未订阅的旧客户端仍收全量）、`LayoutUpdated`（布局变更事件）

### 静态文件

- `/` — Web 面板入口（index.html + 打包资源）
- `/icon.ico` 等静态资源

---

## 技术栈

桌面端 Electron 33 + React 18 + Material UI 6 + TypeScript；服务端 ASP.NET Core 9 + LibreHardwareMonitorLib + SignalR；另附 Android 手机端应用（Kotlin）。

---

## 许可

MIT © 上游 [Inside4ndroid Studios](https://github.com/Inside4ndroid)，完整文本见 [LICENSE](LICENSE)。
