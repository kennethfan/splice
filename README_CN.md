# ⛓️ Splice — Git 冲突解决工具

> **[English](./README.md)** | A native macOS desktop application for resolving Git merge conflicts.

一款原生的 macOS 桌面应用，提供三栏可视化差异编辑器，帮你优雅地解决 Git 合并冲突。

Splice 将混乱的内联冲突标记（`<<<<<<<`、`=======`、`>>>>>>>`）替换为清晰的并排界面，让你可以直观地对比你的更改、对方的更改以及共同祖先版本，从而得到干净的合并结果。

> **IntelliJ IDEA 风格的合并工具，独立 macOS 应用** — 无需启动 IDE。

---

## ✨ 功能特性

### 🎯 核心合并体验

#### 三栏可视化面板

主界面分为三个同步滚动的面板：

| 面板 | 位置 | 显示内容 |
|------|------|----------|
| **你的版本 (Yours)** | 左侧 | 你当前分支的文件版本 |
| **结果 (Result)** | 中间 | 正在演变的合并结果 |
| **对方版本 (Theirs)** | 右侧 | 传入分支的文件版本 |

每个面板同步滚动，点击任一面板中的冲突块会在所有三个面板中高亮。可以通过 `Cmd+\` 切换显示可选的 **Base（共同祖先）** 面板。

#### 一键冲突解决

每个冲突块都配有**操作按钮**（`>>` 接受，`✕` 忽略），灵感来自 IntelliJ IDEA 的合并工具：

- **你的版本侧**: `>>` 接受你的版本，`✕` 忽略（使用对方版本）
- **对方版本侧**: `<<` 接受对方版本，`✕` 忽略（使用你的版本）
- 每个冲突每侧只需点击一次——按钮在使用后会禁用
- 后端处理时显示加载反馈（`◌` 旋转动画）

#### 魔法合并 (Magic Merge)

点击 **Magic Merge** 自动解决所有剩余冲突。Splice 使用启发式算法为每个冲突选择正确的版本，然后让你审查并修正需要手动处理的部分。Magic Merge 的结果可以一键**撤销**。

#### 撤销 / 重做

所有冲突解决操作（接受、忽略、手动编辑、魔法合并）都支持完整的撤销/重做栈（`Cmd+Z` / `Cmd+Shift+Z`）。再也不用担心选错了。

---

### ✏️ 内联编辑

Splice 支持两种编辑模式：

#### 未解决的冲突 —— 文本区域 + 预览

点击未解决冲突底部的 **`✏ Edit Inline`** 按钮，打开一个显示两个版本及其标签的文本区域：

```
// ─── 你的版本 ───
your_code_here
// ─── 对方版本 ───
their_code_here
```

编辑器包含**实时语法高亮预览**，随输入同步更新。按 `Cmd+Enter` 应用，按 `Esc` 取消。

#### 已解决的冲突 —— 内联文本区域

解决冲突后，你可以**直接在原地**继续编辑结果——点击绿色已解决文本（或 ✏ 按钮）打开内联文本区域。浮动操作栏（`✓ 保存 / ✕ 取消`）显示在底部。按 `Cmd+Enter` 保存或 `Esc` 取消。

这使得以下操作变得简单：
- 微调合并结果而无需重新解决
- 当单一方不够完善时手动融合两个版本
- 接受一方后修复格式

#### 通过对话框手动解决

对于复杂的编辑，点击 **Manual Resolve** 按钮打开完整的对话框，包含更大的编辑区域、语法高亮和原始冲突上下文。

---

### 🧑‍💻 视觉反馈

| 功能 | 描述 |
|------|------|
| **语法高亮** | 基于 highlight.js，支持所有主流语言（JavaScript、Rust、Python、Go 等） |
| **已解决冲突徽章** | 绿色 `✓ Resolved` 徽章显示在每个已解决块上方，标注解决方式（你的 / 对方的 / 两边 / 手动） |
| **冲突高亮** | 已解决行显示绿色左边框；未解决的冲突显示红/橙色；Base 面板显示浅蓝色 |
| **点击高亮** | 点击任一侧面板的冲突块，在结果面板中闪烁高亮（✨ 金色动画）对应块 |
| **加载反馈** | 按钮在后端处理时显示 `◌` 旋转动画 |
| **自动对齐** | 解决后，三个面板自动滚动到显示同一冲突块——即使内容长度不同 |
| **文件级差异** | 状态栏显示每个冲突的词级差异统计 |

---

### 🔄 Git 集成

#### `git mergetool` 支持

一键将 Splice 配置为全局 Git mergetool：

```bash
# 应用为你执行以下命令：
git config --global merge.tool splice
git config --global mergetool.splice.cmd '/Applications/Splice.app/Contents/MacOS/splice ...'
```

配置完成后，只需在任何有冲突的仓库中运行 `git mergetool` —— Splice 会自动启动并加载文件。

#### 实时冲突检测

Splice 包含一个**后台文件监听器**，可监视已配置的 Git 仓库中是否出现新的冲突标记：

1. 点击状态栏中的 **Watch** 按钮
2. 选择一个 Git 仓库目录
3. Splice 将监视该仓库，并在检测到新冲突时弹出桌面通知

监听面板列出所有已跟踪的仓库，显示待处理的冲突数量，并允许一键打开任何冲突文件。

#### Git 钩子自动启动

在状态栏中切换 **Auto-launch** 可以安装 Git 钩子，当 `git merge` 产生冲突时自动打开 Splice。无需手动运行 `git mergetool`。

#### 分支感知显示

侧面面板标题和冲突标记显示实际的 Git 分支名称：

- `你的版本 (Yours)` → `main`（你当前的分支）
- `对方版本 (Theirs)` → `feature/new-api`（正在合并的分支）
- 冲突标记使用分支名称而非通用标签

---

### ⌨️ 键盘快捷键

Splice 专为键盘优先的高效用户设计。每个操作都有对应的快捷键。随时按 **`Cmd+/`** 或 **`?`** 打开交互式快捷键覆盖层。

#### 快速参考

| 快捷键 | 操作 |
|--------|------|
| `Cmd + '` | 接受本地版本 |
| `Cmd + ;` | 接受两个版本 |
| `Cmd + .` | 接受对方版本 |
| `Cmd + M` | 魔法合并（自动解决全部） |
| `Cmd + E` | 打开当前冲突的内联编辑器 |
| `Cmd + \` | 切换 Base 面板 |
| `Tab` | 下一个冲突 |
| `Shift + Tab` | 上一个冲突 |
| `Cmd + P` | 打开冲突概览侧边栏 |
| `Cmd + O` | 打开冲突文件 |
| `Cmd + S` | 保存已解决的文件 |
| `Cmd + W` | 关闭当前标签 |
| `Cmd + Z` | 撤销上次解决 |
| `Cmd + Shift + Z` | 重做上次撤销 |
| `Cmd + Shift + D` | 切换调试面板 |
| `Cmd + /` 或 `?` | 切换快捷键覆盖层 |

#### 编辑器内快捷键

以下快捷键在内联编辑器中编辑冲突内容时生效：

| 快捷键 | 操作 |
|--------|------|
| `Cmd + Enter` | 确认/保存编辑内容 |
| `Esc` | 取消编辑，恢复原始内容 |

#### 按类别分组

| 类别 | 快捷键 | 操作 |
|------|--------|------|
| **文件** | `Cmd+O` | 打开冲突文件 |
| | `Cmd+W` | 关闭当前标签 |
| | `Cmd+S` | 保存已解决文件 |
| **导航** | `Tab` | 下一个冲突 |
| | `Shift+Tab` | 上一个冲突 |
| | `Cmd+P` | 打开冲突概览侧边栏 |
| | `Cmd+\` | 切换 Base 面板 |
| **解决** | `Cmd+'` | 接受你的版本 |
| | `Cmd+;` | 接受两个版本 |
| | `Cmd+.` | 接受对方版本 |
| | `Cmd+M` | 魔法合并 |
| | `Cmd+E` | 内联编辑当前冲突 |
| | `Cmd+Enter` | 确认内联编辑 |
| **历史** | `Cmd+Z` | 撤销上次解决 |
| | `Cmd+Shift+Z` | 重做上次撤销 |
| **帮助** | `Cmd+/` 或 `?` | 显示快捷键覆盖层 |
| **调试** | `Cmd+Shift+D` | 切换调试面板 |

---

### 📁 多文件工作流

Splice 支持通过**标签页界面**同时打开多个冲突文件：

- 每个标签页维护自己的冲突状态、撤销历史和滚动位置
- 通过键盘快捷键或鼠标点击切换标签页
- 使用 `Cmd+W` 或 × 按钮关闭标签页
- 状态栏显示所有打开文件的全局进度

---

### 🔍 冲突概览

点击**概览侧边栏**按钮（或使用快捷键）查看当前文件中所有冲突的摘要：

- 列出每个冲突及其行号和当前状态（已解决/未解决）
- 颜色编码：红色表示未解决，绿色表示已解决
- 点击任意条目直接跳转到对应冲突
- 显示总数和解决进度

---

## 📦 安装

### 通过 DMG 安装（推荐）

1. 从 [Releases](https://github.com/your-org/splice/releases) 页面下载最新的 `.dmg` 文件
2. 打开 `.dmg` 并将 `Splice.app` 拖入 `Applications` 文件夹
3. 右键点击 `Splice.app` 选择**打开**（仅首次启动，以绕过 Gatekeeper）

### 从源码构建

```bash
# 前置条件：Rust、Node.js 以及 Tauri v2 的系统依赖
# 详见：https://v2.tauri.app/start/prerequisites/

git clone https://github.com/your-org/splice.git
cd splice
npm install
npx tauri build
cp -R src-tauri/target/release/bundle/macos/Splice.app /Applications/
```

---

## 🚀 使用方法

### 快速开始

1. **打开 Splice** — 你会看到欢迎界面，包含 `Configure Global Mergetool` 按钮
2. **配置 git** — 点击按钮将 Splice 设为默认 mergetool
3. **打开冲突文件** — 按 `Cmd+O` 或点击状态栏按钮，选择包含 Git 冲突标记的文件

### 配合 `git mergetool` 使用

配置 Splice 为 mergetool 后，只需运行：

```bash
git mergetool
```

Splice 会自动启动并加载冲突文件。

### 使用文件监听器

1. 点击状态栏中的 **Watch** 按钮
2. 选择一个 Git 仓库目录
3. Splice 将监视该仓库，检测到新冲突时通知你

### 手动编辑冲突

- **未解决的冲突**：点击冲突区域底部的 `✏ Edit Inline` 按钮，在语法高亮文本区域中编辑
- **已解决的冲突**：点击绿色已解决文本任意位置，在内联文本区域中原地编辑
- 按 `Cmd+Enter` 确认，`Esc` 取消

---

## 🏗 架构

```
splice/
├── src/                          # 前端 (React + TypeScript)
│   ├── App.tsx                   # 主应用组件
│   ├── main.tsx                  # 入口文件
│   ├── components/               # React 组件
│   │   ├── BasePane.tsx          # Base（共同祖先）面板
│   │   ├── ConflictBlock.tsx     # 冲突块组件
│   │   ├── ConflictOverview.tsx  # 冲突概览侧边栏
│   │   ├── DiffText.tsx          # 词级差异可视化
│   │   ├── HoverPreview.tsx      # 悬停预览组件
│   │   ├── MagicMergeDialog.tsx  # 魔法合并结果对话框
│   │   ├── ManualResolveDialog.tsx  # 手动解决对话框
│   │   ├── ShortcutsOverlay.tsx  # 快捷键帮助覆盖层
│   │   ├── StatusBar.tsx         # 底部状态栏
│   │   ├── TabBar.tsx            # 多文件标签栏
│   │   └── WatchedRepoPanel.tsx  # 已监听仓库面板
│   ├── hooks/                    # 自定义 React Hooks
│   │   ├── useBlockDiffs.ts      # 词级差异计算
│   │   ├── useKeyboard.ts        # 键盘快捷键注册
│   │   └── useSyncScroll.ts      # 三栏同步滚动
│   ├── lib/                      # 工具库
│   │   ├── highlight.ts         # 语法高亮 (highlight.js)
│   │   ├── sound.ts             # 通知音效
│   │   └── tauri.ts             # Tauri IPC 命令绑定
│   └── styles/
│       └── splice.css           # 应用样式
├── src-tauri/                    # 后端 (Rust)
│   └── src/
│       ├── main.rs              # Tauri 应用入口
│       ├── lib.rs               # 插件注册
│       ├── commands/            # Tauri IPC 命令
│       │   ├── close_session.rs
│       │   ├── configure_mergetool.rs
│       │   ├── diff_cmd.rs
│       │   ├── get_base.rs
│       │   ├── initial_session.rs
│       │   ├── magic_merge.rs
│       │   ├── open_file.rs
│       │   ├── resolve.rs
│       │   ├── save.rs
│       │   └── undo.rs
│       ├── diff/                # 差异引擎
│       │   ├── engine.rs
│       │   └── mod.rs
│       ├── git/                 # Git 集成
│       │   ├── mergetool.rs
│       │   └── mod.rs
│       ├── parser/              # 冲突标记解析器
│       │   ├── conflict.rs
│       │   ├── lexer.rs
│       │   └── mod.rs
│       └── watcher.rs           # 文件系统监听器
└── test/                        # 测试夹具
```

### 关键设计决策

- **三栏布局** — 灵感来自 IntelliJ IDEA 的合并工具。侧面板显示 YOURS 和 THEIRS 不变，中间面板显示正在演变的 RESULT。
- **冲突标记解析** — Rust 后端解析 `<<<<<<<` / `=======` / `>>>>>>>` 标记，将其作为结构化的 `ConflictBlock` 对象呈现给前端。
- **滚动同步** — 使用 `data-conflict-id` 属性而非比例计算，确保三个面板始终对齐到同一冲突块（即使已解决内容长度不同）。
- **内联编辑** — 使用受控的 `<textarea>`，正确处理代码中的 HTML 标签。

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| **桌面框架** | [Tauri v2](https://v2.tauri.app/) |
| **前端** | React 19 + TypeScript 5.8 |
| **后端** | Rust + [git2](https://github.com/rust-lang/git2-rs) |
| **差异引擎** | [imara-diff](https://crates.io/crates/imara-diff) |
| **语法高亮** | [highlight.js](https://highlightjs.org/) 11 |
| **构建工具** | Vite 7 |
| **测试** | Vitest（前端）+ Cargo（后端） |

---

## 🔨 构建与打包

### 前置条件

- **Rust**（通过 [rustup](https://rustup.rs/) 安装）
- **Node.js** >= 18
- **macOS 系统依赖** — Xcode Command Line Tools（`xcode-select --install`）

其他平台请参考 [Tauri v2 前置条件指南](https://v2.tauri.app/start/prerequisites/)。

### 开发模式

```bash
# 安装前端依赖
npm install

# 启动开发模式（热重载）
npm run tauri:dev
# 或：bash scripts/tauri-dev.sh
```

### 生产构建

```bash
# 1. 构建前端并编译原生二进制
npx tauri build

# 2. 构建好的 .app 包位于：
#    src-tauri/target/release/bundle/macos/Splice.app

# 3. 安装到 /Applications：
cp -R src-tauri/target/release/bundle/macos/Splice.app /Applications/

# 4. 启动：
open /Applications/Splice.app
```

### 一键构建并安装

```bash
npx tauri build && cp -R src-tauri/target/release/bundle/macos/Splice.app /Applications/
```

### 构建产物

| 产物 | 路径 |
|------|------|
| **.app 包** | `src-tauri/target/release/bundle/macos/Splice.app` |
| **.dmg 镜像** | `src-tauri/target/release/bundle/dmg/Splice_0.1.0_x64.dmg` |
| **Rust 二进制** | `src-tauri/target/release/splice`（调试版在 `target/debug/splice`） |

### 安装脚本

也提供了自动化安装脚本：

```bash
bash scripts/splice-install.sh
```

该脚本将：
1. 定位或构建 Splice 二进制
2. 配置 `git` 使用 Splice 作为默认 mergetool
3. 可选地在 PATH 中创建符号链接

---

## 🧪 测试

```bash
# 前端测试（Vitest）
npx vitest run

# 后端测试（Cargo）
cd src-tauri && cargo test

# 完整类型检查
npx tsc --noEmit

# 提交前运行所有检查
npx vitest run && cd src-tauri && cargo test && cd .. && npx tsc --noEmit
```

---

## 📊 项目状态

| 检查项 | 状态 |
|--------|------|
| **TypeScript** | ✅ 零错误 |
| **前端测试** | ✅ 126/126 通过 |
| **Rust 测试** | ✅ 20/20 通过 |
| **Tauri 构建** | ✅ 成功 |

### 已修复的 Bug（10 个）

| # | 问题 | 根因 |
|---|------|------|
| 1 | **解决后内容丢失** | `lineIdx` 按显示行而非本地行前进 |
| 2 | **侧面板代码偏移** | For 循环的 `continue` 导致每冲突多跳一行 |
| 3 | **Rust 后端标记替换** | `save.rs` 中多冲突 `>>>>>>>` 行号计数差一 |
| 4 | **按钮点击无响应** | `programmaticScrollRef` RAF 竞态条件卡在 `true` |
| 5 | **安全定时器泄漏** | Effect 清理未取消旧的 500ms 定时器 |
| 6 | **撤销按钮状态未恢复** | `usedSides` ref 在撤销/重做时未清除 |
| 7 | **撤销内联编辑器未关闭** | `inlineEditId`/`inlineEditText` 在撤销/重做时未重置 |
| 8 | **撤销魔法合并按钮异常** | `handleUndoMagic` 未清除 `usedSides` |
| 9 | **内联编辑器中的 HTML 标签** | `dangerouslySetInnerHTML` 将代码 `<tags>` 解释为 HTML |
| 10 | **保存时内容丢失** | contentEditable div 因 React 重渲染被清空 |

---

## 🔜 开发路线图

- [ ] 颜色编码冲突标记（红色 = 你的版本，绿色 = 对方版本）
- [ ] 侧面面板中可折叠的冲突块
- [ ] Cmd+数字快捷键跳转到指定冲突
- [ ] 改进的差异可视化（内联词级差异）
- [ ] 暗色/亮色主题切换

---

## 📝 许可协议

APACHE 2.0
