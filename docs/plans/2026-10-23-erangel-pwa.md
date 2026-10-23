# 艾伦格离线测距执行计划

状态：完成

用户已允许在缺少 dev-* 技能的情况下使用常规需求记录、TDD、实现和浏览器验证流程。

| 任务 | 状态 | 证据 |
| --- | --- | --- |
| 确认范围、部署账号与地图来源 | 完成 | PUBG 官方地图已下载并校验 SHA-256；GitHub 现有凭据只读验证为 Yungzzhh |
| 先编写距离、视角、手势与离线构建测试并确认失败 | 完成 | 首次 npm test 因三个实现模块缺失失败；实现后 12 项测试通过 |
| 实现手机地图交互、测距 UI、离线缓存和安装提示 | 完成 | 已实现；最终验收待浏览器验证 |
| 单元验证、生产构建、浏览器手机布局及断网验证 | 完成 | 16 项测试、类型检查和生产构建通过；Chromium 实际双指事件、500 米测距、Reset、断网刷新及冷启动通过；WebKit iPhone 模拟环境也通过触摸及离线验证 |
| 审查、提交、创建 GitHub 仓库并发布 Pages | 完成 | 已发布 Yungzzhh/pubgmap；Actions 39891818902 的 build 和 deploy 成功；npm audit 为 0 vulnerabilities |
| 线上回读与交付使用说明 | 完成 | 线上页面 HTTP 200；更新资源 SHA-256 与本地产物一致；已在实际 HTTPS 地址验证断网刷新、冷启动、500 米测距及 Reset |

## 技术选择

- Vite + TypeScript + 原生 DOM，避免运行时第三方地图和 CDN 依赖。
- 地图坐标使用归一化值；屏幕视角独立保存，两点状态重置不改变视角。
- Pointer Events 管理单指、双指手势，地图采用 `touch-action: none`。
- 构建后生成包含全部本地静态文件的版本化 Service Worker；GitHub Pages 使用相对路径。
- 使用 Node 内建测试执行器做核心逻辑 TDD，使用 Playwright CLI 对生产预览与部署地址做交互验证。

## 最终记录

- 地图原图 8192×8192，坐标边长 819200 厘米；地图几何范围及缩放均使用同一换算。
- GitHub Pages 已成功发布：`https://yungzzhh.github.io/pubgmap/`。
- 使用说明、资源来源、验收证据及真机验收边界见 `docs/changes/2026-10-23-erangel-pwa.md`。
