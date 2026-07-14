# Skills 软链接

基于 Tauri 2、React 和 TypeScript 的 Windows 桌面工具，用于登记多个源目录，把其中的一级子目录分发到任意目标目录，并查看或移除已有软链接。

Windows 端使用 NTFS Junction。应用不会复制源目录；移除软链接只会删除目标目录中的链接入口，不会修改源目录内容。

## 开发

环境要求：Node.js 20+、Rust stable、Windows WebView2。

```powershell
npm install
npm run tauri dev
```

只预览 React 界面时可运行 `npm run dev`。浏览器预览使用隔离的演示数据，不会读取或修改磁盘。

## 构建

```powershell
npm run tauri build
```

构建结果位于 `src-tauri/target/release/bundle`。

## 操作边界

- 源目录只读取一级文件和一级目录；一级文件仅展示。
- 创建前逐项预检：已连接项和名称冲突项会跳过，其余项继续。
- 批量创建允许部分成功，不回滚已成功项。
- 应用只扫描已知目标目录，不执行全盘搜索。
- 外部磁盘变化只在手动刷新或切换源目录时重新扫描。
