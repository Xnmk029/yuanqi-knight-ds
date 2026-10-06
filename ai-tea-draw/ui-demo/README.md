# 茶绘 UI Demo

基于 Krita、Procreate、Clip Studio Paint、Concepts 和 Sketchbook 官方手册考察实现的独立画板原型。

## 使用

在 ai-tea-draw 目录执行：

    npm run ui:demo

打开 http://127.0.0.1:5890/。顶部可切换桌面与触屏布局，打开竞品考察和布局思路。手机直接打开同一地址即可自适应。

    npm run verify:ui-demo

浏览器验证使用已安装的 Chrome 或 Edge 及项目已有 playwright-core。报告与截图位于 verification/ui-demo/。没有新增运行依赖。

## 文件

- index.html：画板、辅助面板、竞品考察及演示流程。
- demo.css：桌面、平板、手机和专注画布布局。
- demo.js：SVG 绘图、对象编辑、手势、本地保存与演示发布。
- research.js：交互式竞品考察、布局示意和官方来源。
- research.md：完整考察、设计推断、范围与正式接入约束。

绘图和导出可实际使用；人物、房间、Agent 气泡和审核是本地演示。它与当前运行的正式茶绘服务使用独立端口和存储。
