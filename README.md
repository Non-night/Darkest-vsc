# Darkest Dungeon Modding Support

为 Darkest Dungeon 模组 `.darkest` 文件提供语法着色、智能补全、语义诊断、批量注释和 RGBA 颜色预览。

> This is an unofficial community extension for Darkest Dungeon modding. It is not affiliated with or endorsed by the game's developers or publishers. Related names, trademarks, and game assets belong to their respective owners.

## 支持的文件

| 文件后缀 | 语言模式 | 主要支持 |
| --- | --- | --- |
| `.effects.darkest` | Darkest Effect | 着色、关键字及固定参数补全、完整诊断 |
| `.info.darkest` | Darkest Info | Header/关键字/参数补全、动态 `_effects` 着色、完整诊断 |
| `.art.darkest` | Darkest Art | Header/关键字/参数补全、完整诊断 |
| `.override.darkest` | Darkest Override | Header/关键字/参数补全、完整诊断 |
| `.colours.darkest` | Darkest Colours | 着色、RGBA 色块、颜色选择器和 Hover |

## 主要功能

### 语法着色

- 为五类 `.darkest` 文件提供独立 TextMate 语法。
- 区分 Header、关键字、参数、数字、字符串和注释。
- Effect 文件为流血、中毒、治疗、眩晕、处决、反击、Buff 和召唤等关键字提供专项颜色。
- Info-like 文件识别当前 Header 下的动态 `_effects` 关键字；无法匹配的动态关键字会使用当前主题的警告色标记。
- 默认深色与浅色主题分别使用低饱和、高对比度配色；其他主题沿用主题自身的 TextMate 配色，避免固定颜色破坏可读性。

### 智能补全

- Effect：138 个关键字，以及 69 组关键字固定参数值上下文。
- Info / Art / Override：67 个 Header，并按当前 Header 提供关键字、固定参数值和连续参数补全。
- 同时支持前缀匹配和子序列模糊匹配。

### 诊断

- 检查关键字、参数值、参数数量、字符串长度和块结构。
- 检查 Effect 专项关系，例如 Buff 组合、Dot 互斥、守护、治疗与 cure、物品参数和即时技能规则。
- 检查 Info / Art / Override 的 Header 上下文、关键字归属、动态 `_effects`、跨行参数和整文件冲突。
- 诊断结果显示在 VS Code 的“问题”面板中，并支持导航到对应位置。
- 编辑后使用 250 ms 防抖自动刷新，也可以手动刷新。

### 注释

在支持的文件中使用：

- Windows / Linux：`Ctrl+/`
- macOS：`Cmd+/`

扩展会以 `//` 对当前行或多行选区进行批量注释与取消注释。

### Colours 颜色支持

- 在 `.colours.darkest` 的 `.rgba` 参数旁显示 VS Code 原生颜色预览。
- 支持 `#RGB`、`#RRGGBB` 和四段 0–255 数字 RGBA。
- Hover 显示解析后的 RGBA 信息。
- 可通过原生颜色选择器写回 `#RRGGBB`。

## 命令

打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）后可以使用：

| 命令 | 说明 |
| --- | --- |
| `Darkest Dungeon: 切换行注释` | 对当前行或选区切换 `//` 注释 |
| `Darkest Dungeon: 刷新诊断` | 立即重新检查已打开的支持文件 |

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `darkestDungeon.enableCtrlSlashToggleComment` | `true` | 启用扩展提供的 Ctrl/Cmd+/ 批量注释切换 |
| `darkestDungeon.colours.enableAutomaticColorPreview` | `true` | 显示 `.rgba` 参数的颜色预览 |
| `darkestDungeon.colours.enableColorPickerOnClick` | `true` | 允许颜色选择器写回颜色值 |

## 安装

### 从 VSIX 安装

1. 下载 `.vsix` 文件。
2. 在 VS Code 中打开“扩展”视图。
3. 点击右上角 `...`，选择“从 VSIX 安装...”。
4. 选择下载的 `.vsix`，按提示重新加载窗口。

也可以使用命令行：

```powershell
code --install-extension darkest-dungeon-3.1.2.vsix
```

### 从源代码测试

```powershell
npm test
vsce package
```

项目不需要安装运行时 npm 依赖。

## 已知限制

- Colours 使用 VS Code 原生 `DocumentColorProvider`。关闭颜色选择写回后，扩展可以阻止生成新的颜色文本，但无法完全禁止 VS Code 自身的颜色选择弹层出现。
- 诊断规则来自当前扩展内置数据；游戏或模组格式发生变化后，可能需要更新扩展。

## 隐私

扩展不包含遥测、网络请求或数据上传逻辑。语法分析、补全、诊断和颜色解析均在本地完成。

## 问题反馈

请通过本仓库的 [GitHub Issues](https://github.com/Non-night/Darkest-vsc/issues) 提交问题，并附上：

- 文件类型；
- 可以复现问题的最小文本；
- VS Code 与扩展版本；
- 实际结果和期望结果。

## 许可证

插件代码和文档以 [MIT License](LICENSE) 发布。此许可证不授予任何第三方游戏名称、商标、美术、音频或其他游戏资产的使用权。
