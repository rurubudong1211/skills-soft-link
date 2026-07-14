# Skills 软链接

> 在 Windows 上集中登记多个 Skills 源目录，并通过 NTFS Junction 将一级子目录分发到 Codex、Agents 或其他本机目标目录，无需复制和重复维护文件。

[![Version](https://img.shields.io/badge/version-0.1.0-2563eb)](package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4)](https://www.microsoft.com/windows)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)](https://tauri.app/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

适合同时维护个人 Skills、项目 Skills 和实验目录的 Windows 用户。当前版本为 `v0.1.0`，提供可运行的桌面端 MVP，并支持构建 MSI、NSIS 和便携版 ZIP 发布包；可直接从源码启动：

```powershell
git clone https://github.com/rurubudong1211/skills-soft-link.git
cd skills-soft-link
npm ci
npm run dev
```

## 项目亮点

- **一份源文件，多处使用**：为源子目录创建 Junction，不复制目录内容，后续修改会直接反映到所有连接位置。
- **多个源目录统一查看**：登记个人、团队或实验目录，在同一个界面中切换、搜索和筛选一级内容。
- **批量分发前预检**：创建前识别已连接项与同名冲突；无冲突项继续执行，单项失败不会回滚已成功项。
- **连接关系可追踪**：只扫描应用记住的目标目录，展示每个源子目录当前连接到了哪里，避免全盘搜索。
- **删除边界明确**：移除连接只删除目标目录中的 Junction 入口，不修改源目录内容。

## 工作方式

```text
源目录
├── skill-a/  ── Junction ──> 目标目录 A/skill-a
├── skill-b/  ── Junction ──> 目标目录 B/skill-b
└── README.md（仅展示，不分发）
```

应用只把源目录下的**一级子目录**作为可分发项；一级文件会显示在列表中，但不会被创建为链接。Windows 桌面端底层使用 NTFS Junction，界面统一称为“软链接”。

## 环境要求

- Windows 10/11
- Node.js `20.19+` 或 `22.12+`
- Rust stable 工具链
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime

建议先确认本机环境：

```powershell
node --version
npm --version
rustc --version
cargo --version
```

## 快速开始

### 启动桌面应用

```powershell
npm ci
npm run dev
```

桌面模式会读取本机目录，并能够创建或移除 Junction。

### 只预览界面

```powershell
npm run dev:renderer
```

浏览器模式使用内置演示数据，不会读取或修改本机文件系统，适合调试 React 界面和交互。

## 使用流程

1. 点击“添加源目录”，选择包含 Skills 子目录的本机目录。
2. 在源条目列表中搜索、筛选并勾选需要分发的一级子目录。
3. 点击“分发”，选择已有目标目录或浏览一个新目录。
4. 检查预检结果；已连接项和名称冲突项会被跳过。
5. 执行创建后，可在连接详情中打开目标目录或移除已有软链接。

典型目标目录包括：

- Codex 全局 Skills 目录
- 项目内的 `.agents/skills` 目录
- 测试不同 Skills 组合的临时目录
- 外接磁盘上的便携式 Skills 目录

## 操作边界

- 源目录只读取一级文件和一级目录，不递归展示内部内容。
- 源子目录不要求包含 `SKILL.md`，应用不会校验其是否为有效 Skill。
- 目标位置存在同名文件、普通目录或指向其他位置的链接时，该项会标记为冲突并跳过。
- 批量创建允许部分成功，不会因为单项失败而回滚其他已创建链接。
- 应用只扫描已知目标目录，不执行全盘搜索。
- 外部磁盘变化不会被后台监听，需要手动刷新或重新切换源目录。
- 移除源目录登记不会删除源目录，也不会清理已经创建的软链接。
- 忘记目标路径只会移除应用中的路径记录，不会删除目标目录中的内容。
- 移除软链接只删除目标目录中的 Junction 入口，源子目录及其文件保持不变。

## 配置存储

应用会把源目录、自定义名称和已知目标目录记录在可执行文件同目录的 `settings.json` 中。旧版本配置若位于系统应用配置目录，首次启动时会自动复制到新位置，并保留旧文件以便回退。

配置只记录路径和名称；软链接关系以当前磁盘状态为准，不保存历史快照。

## 项目结构

```text
skills-soft-link/
├── src/                        # React 界面、类型与 Tauri API 封装
├── src-tauri/
│   ├── src/lib.rs              # 目录扫描、配置持久化与 Junction 操作
│   ├── capabilities/           # Tauri 窗口权限
│   ├── icons/                  # 桌面与安装包图标
│   ├── wix/                    # 中文 MSI 本地化资源
│   ├── Cargo.toml              # Rust 依赖与包信息
│   └── tauri.conf.json         # 窗口、构建与 Windows 打包配置
├── scripts/                    # MSI 命名规范化与便携版打包脚本
├── docs/prototype-brief.md     # 原型设计说明
├── CONTEXT.md                  # 领域术语与行为边界
├── DESIGN.md                   # 视觉设计规范
├── PRODUCT.md                  # 产品定位与原则
├── package.json                # 前端依赖与开发脚本
└── vite.config.ts              # Vite 配置
```

## 开发与验证

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动可访问本机文件系统的桌面开发版 |
| `npm run dev:renderer` | 仅启动 Vite 浏览器预览 |
| `npm run check` | 执行 TypeScript 类型检查 |
| `npm run build:renderer` | 构建前端生产资源 |
| `npm run tauri:build` | 构建 MSI 与 NSIS 安装包 |
| `npm run package:windows` | 规范化 MSI、NSIS 命名并生成便携版 ZIP |
| `npm run build` | 完整发布构建：MSI、NSIS 安装包与便携版 ZIP |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 测试 |

完整检查：

```powershell
npm run check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

完整发布构建完成后，Windows 产物位于：

```text
src-tauri/target/release/bundle/
├── msi/skills-soft-link_0.1.0_x64.msi
├── nsis/skills-soft-link_0.1.0_x64-setup.exe
└── portable/skills-soft-link_0.1.0_x64-Portable.zip
```

## 技术栈

- [Tauri 2](https://tauri.app/)：桌面应用外壳与前后端命令调用
- [React 19](https://react.dev/)：界面与交互状态
- [TypeScript 5](https://www.typescriptlang.org/)：前端类型系统
- [Vite 8](https://vite.dev/)：开发服务器与前端构建
- [Rust](https://www.rust-lang.org/)：文件系统操作与配置持久化
- [`junction`](https://crates.io/crates/junction)：Windows NTFS Junction 创建、读取与删除

## 贡献

欢迎通过 [Issues](https://github.com/rurubudong1211/skills-soft-link/issues) 反馈问题或提出改进建议。提交 Pull Request 前，请至少运行 TypeScript 检查、前端构建和 Rust 测试。

## License

本项目基于 [MIT License](LICENSE) 开源。
