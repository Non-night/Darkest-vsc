# For_the_Darkest_Dungeon 完整功能与实现细节说明

> 审计日期：2026-08-14  
> 源项目：`C:\Users\1\source\repos\For_the_Darkest_Dungeon`  
> 文档输出：`C:\Users\1\.vscode\extensions\darkest-vsc-extension\For_the_Darkest_Dungeon_功能说明.md`

## 1. 审计范围、方法与结论口径

本说明以**实际代码执行路径**为依据，不以 README、注释、命名或待办事项单独推断功能。审计时逐文件读取了源项目中排除 `.vs`、`bin`、`obj` 生成目录后的全部手写源码和项目配置，包括：

- 35 个手写 C# 文件，共 8,847 个物理行；
- `For_the_Darkest_Dungeon.csproj`、解决方案、VSIX 清单、`.pkgdef`、程序集信息；
- `README.md`、`TodoList.md`、项目约束文件；
- 关键静态表 `DarkestData.cs` 的所有初始化内容；
- 着色、补全、命令过滤、注释切换、颜色预览、语法检查和错误列表同步的实际实现。

核对方法包括逐行阅读、用 Roslyn 提取类/成员/调用结构、提取所有 `ErrorTag` 创建点及其条件，并把**当前源文件** `DarkestData.cs` 链接到临时分析项目中执行，以展开所有集合和映射。分析项目仅位于文档输出目录的临时子目录，未将工具、生成文件或改动写入源项目。

本文中的“支持”“会触发”“会报错”均指当前源码能够实际走到的行为。若注释、README 与代码不一致，以代码为准，并在“实现边界与不一致”章节单独标出。

## 2. 项目定位与发布配置

这是一个面向 Darkest Dungeon 文本数据格式的 Visual Studio VSIX 编辑器扩展，核心能力是：

1. 按文件类型注册专用 ContentType；
2. 对 Header、关键字、字符串、数字、布尔、注释及 Effect 语义类别着色；
3. 提供 Header、关键字和参数值补全，并支持自定义的模糊匹配；
4. 对 Effect 与 Info-like 文件执行语法/语义检查；
5. 将编辑器错误标签同步到 Visual Studio Error List；
6. 提供 `Ctrl+/` 批量注释切换；
7. 对 Colours 文件显示颜色预览并提供点击调色盘。

### 2.1 构建与安装元数据

| 项目 | 实际值 |
|---|---|
| 项目类型 | Visual Studio VSIX |
| 目标框架 | .NET Framework 4.7.2 |
| 最低 Visual Studio 版本 | 17.0 |
| VSIX 安装目标 | Visual Studio `[17.0,19.0)`，amd64 |
| VSIX 版本 | 3.1.1 |
| VSIX 语言 | `zh-Hans` |
| Publisher | `No_night` |
| VS Core Editor 依赖 | `[17.0,18.0)` |
| AssemblyVersion / FileVersion | 1.0.0.0 |
| 主要 SDK 包 | Microsoft.VisualStudio.SDK 17.14.40265、Microsoft.VSSDK.BuildTools 17.14.2120 |
| UI 技术 | WPF（颜色选择窗口与编辑器装饰） |

VSIX 清单版本 `3.1.1` 与程序集版本 `1.0.0.0` 是两套独立元数据，当前并未同步。

`DarkestFileExtension.pkgdef` 还把普通 `.darkest` 扩展映射到 Visual Studio 文本编辑器工厂；具体语法功能则继续依赖文件名后缀到 ContentType 的注册。

## 3. ContentType 与文件名匹配

`DefinitionDarkest/DarkestContentType.cs` 通过 MEF 导出五类 ContentType 和对应文件扩展名：

| 文件名后缀 | ContentType | 主要功能 |
|---|---|---|
| `.effects.darkest` | `darkest-effect` | Effect 着色、Effect 补全、Effect 错误检查、错误列表、注释切换 |
| `.info.darkest` | `darkest-info` | Info 着色、上下文补全、Info-like 错误检查、错误列表、注释切换 |
| `.art.darkest` | `darkest-art` | Art 着色、上下文补全、Info-like 错误检查、错误列表、注释切换 |
| `.override.darkest` | `darkest-override` | Override 着色、上下文补全、Info-like 错误检查、错误列表、注释切换 |
| `.colours.darkest` | `darkest-colours` | Colours 着色、颜色预览、点击调色、注释切换，并挂接 Effect 风格命令过滤层 |

注意：实际后缀是复数 `.effects.darkest`。README 写成 `*.effect.darkest`，同时把 `override.darkest` 拼成了 `override.darest`，均与注册代码不一致。

## 4. 包初始化与选项页

### 4.1 VSIX 包

`For_the_Darkest_DungeonPackage` 继承 `AsyncPackage`，允许后台加载。初始化过程中切换到 UI 线程并设置静态 `Instance`，供其他组件查询选项页。包注册两个 Tools → Options 页面：

- `GeneralOptionsPage`
- `ColoursOptionsPage`

### 4.2 通用设置

`GeneralOptionsPage.EnableCtrlSlashToggleComment`：

- 默认值：`true`；
- 控制扩展自己的 `Ctrl+/` 注释切换逻辑；
- 关闭后，命令过滤器不执行自定义注释切换，原按键继续由后续命令链处理。

### 4.3 Colours 设置

`ColoursOptionsPage` 提供：

- `EnableAutomaticColorPreview = true`：控制 `.rgba` 后方的自动色块预览；
- `EnableColorPickerOnClick = true`：控制点击色块后是否打开颜色选择器。

## 5. 编辑器挂接架构

`TextViewCreationListener.cs` 为不同 ContentType 创建命令过滤器，并把命令过滤器加入 Visual Studio 文本视图的 OLE 命令链：

| ContentType | 命令过滤器 |
|---|---|
| Effect | `EffectCommandFilter` |
| Info | `InfoCommandFilter` |
| Art | `ArtCommandFilter` |
| Override | `OverrideCommandFilter` |
| Colours | `EffectCommandFilter` |

每个视图同时建立 `DarkestToggleCommentCommandFilter`，从而让五类文件都具备注释切换能力。

Colours 绑定的是 Effect 风格的“何时触发补全”命令层，但代码中没有一个绑定到 `darkest-colours` 的 Effect CompletionSource Provider。因此不能把它描述成“Colours 有完整 Effect 补全”；实际候选能否出现取决于编辑器中是否存在可用的 CompletionSource。

分类器和 Error Tagger 通过 `buffer.Properties.GetOrCreateSingletonProperty` 按 TextBuffer 缓存，避免同一缓冲区重复创建相同实例。

## 6. 语法着色系统

### 6.1 分类类型与默认显示

`Classification/ClassificationTypes.cs` 注册通用分类与 Effect 专项分类：

| 分类名 | 用途 / 默认表现 |
|---|---|
| `darkest.number` | 数字、负数、小数、百分比 |
| `darkest.header` | Header；默认 SteelBlue、粗体 |
| `darkest.unquoted` | 无引号字符串 |
| `darkest.string` | 双引号字符串 |
| `darkest.bool` | 布尔值 |
| `darkest.comment` | `//` 注释 |
| `darkest.effects.keyword.core` | Effect 核心关键字，粗体 |
| `darkest.effects.keyword.prop` | Effect 普通关键字 |
| `darkest.info.keyword` | Info-like / Colours 关键字 |
| `darkest.error` | 着色级未知关键字，默认黄色 |
| bleed | `#B10000` |
| poison | `#BDC241` |
| heal | `#87C241` |
| stun | `#C99C45` |
| riposte | `#C3630F` |
| buff | `#5EC9D6` |
| kill | 红色 |
| summon | `#7FFFD4` |

### 6.2 共同词法特征

分类器将一行切分成代码区和注释区。当前实现用 `//` 的首次出现位置截断；它不判断 `//` 是否位于双引号内，因此字符串内部的 `//` 也会被当成注释开始。注释拥有优先处理地位，后续 token 不再按字符串或关键字解释。

布尔着色仅接受以下大小写形式：

- `true` / `false`
- `True` / `False`
- `TRUE` / `FALSE`

数字识别支持负数、小数和百分号形式。带双引号内容使用字符串分类，其他参数文本可落入无引号字符串分类。

### 6.3 EffectClassifier

Effect 着色的实际行为：

- Header 正则搜索 `effect:`，没有限定必须位于行首，因此代码区任意位置出现该文本都可能得到 Header 色；
- Effect 关键字正则为 `\.[a-zA-Z_]+`，关键字主体不包含数字；
- `.name`、`.target`、`.on_hit`、`.on_miss` 属于核心关键字；
- 其余合法关键字按普通属性或语义类别上色；
- Dot、Heal、Stun、Riposte、Buff、Kill、Summon 相关关键字使用各自专项分类；
- 不在 `DarkestEffectsData.AllKeywords` 中的点号关键字使用 `darkest.error`，这只是黄色分类，不等同于 Error Tagger 的红色波浪线；
- 字符串、数字、布尔和注释按通用分类处理。

### 6.4 InfoBaseClassifier

`InfoClassifier`、`ArtClassifier`、`OverrideClassifier` 只是绑定不同 ContentType，实际着色都由 `InfoBaseClassifier` 完成。

其行为包括：

- 识别允许字母、数字、下划线的 Header 和点号关键字；
- 静态关键字只要存在于**任意一个 Header 的关键字列表**中，即使用 Info keyword 色；
- 分类器本身不检查该关键字是否属于当前 Header；上下文归属错误由 `InfoBaseErrorTagger` 报告；
- 对动态 `.xxx_effects` 有两个专门的着色错误判定分支；
- Header、关键字、字符串、数字、布尔、无引号参数、注释按各自分类返回。

### 6.5 ColoursClassifier

Colours 着色独立实现：

- Header 只匹配可缩进且位于行首的 `colour:`；
- 所有形如 `.keyword` 的 token 都使用 `darkest.info.keyword`，不通过静态表判断合法性；
- 支持把 `#RGB`、`#RRGGBB` 识别为无引号颜色值；
- 其他字符串、数字、布尔和注释沿用通用风格；
- Colours 没有绑定语法 Error Tagger，也不会进入 Legacy Error List Provider。

## 7. 补全命令触发层

### 7.1 BaseDarkestCommandFilter

基础命令过滤器处理 `TYPECHAR`、Tab 和 Enter：

- Tab/Enter 时，如果补全会话中已有选中项，则提交候选并吞掉命令；
- 如果没有选择项，则关闭会话，再把原命令传给下一层；
- 对普通字符输入，先让编辑器真正写入字符，再根据写入后的快照和光标位置决定是否开启/重建补全；
- 输入 `.` 时，仅当点号位于行首或前一个字符是空白才触发；
- 一个合法关键字 token 必须以 `.` 开头、内部不能有第二个点号，并且起点必须在行首或空白之后；
- 后续普通输入仅接受字母、数字、下划线；
- fuzzy 输入过程中会重建 CompletionSession，使候选随输入变化；
- 空格触发逻辑和 Header 触发逻辑由具体子类决定。

这些边界用于避免在 `abc.hp`、`.hp.abc` 一类文本中错误弹出关键字补全。

### 7.2 Info / Art / Override 命令触发

三类文件共同继承 `BaseSharedInfoLikeCommandFilter`：

- 当行内尚无冒号，输入的是 Header 字母/数字/下划线前缀时，可触发 Header 补全；
- 输入空格后，如果前一 token 是有固定值表的关键字，会触发参数候选；
- 输入空格后也支持两个连续枚举参数关键字：
  - `.disabled_popup_text_types`
  - `.disabled_act_out_combat_start_turn_types`

### 7.3 Effect 命令触发

`EffectCommandFilter` 在输入空格后检查当前行最后一个关键字：如果该关键字存在于 `KeywordToValuesMap`，触发参数值补全。非点号 token 的后续输入如果已经存在补全会话，也会重建会话以更新 fuzzy 结果。

## 8. 模糊补全算法

`FuzzyCompletionCache` 对检索词和候选进行规范化：删除点号与下划线，再转换为小写。排序规则是：

1. 规范化后的前缀匹配优先；
2. 其次接受按字符顺序出现的子序列匹配；
3. fuzzy 不是编辑距离，不处理字符交换或拼写替换；
4. 结果去重；
5. 中间输入暂时没有命中时，会尽量保留仍被认为合理的候选；
6. 缓存字典以候选列表对象本身作为键，而不是以候选内容值作为键。

例如规范化后，输入字符只要按顺序存在于候选中即可命中，中间可以隔字符。`FuzzyCompletionSet` 在重新计算时替换可写候选集合，并始终强制选中第一项，因此按 Enter/Tab 通常会提交排序首项。

## 9. Effect 补全源

`EffectCompletionSourceProvider` / Effect CompletionSource 提供两类候选：

### 9.1 参数值补全

- 参数值补全优先于关键字补全；
- 候选取自 `DarkestEffectsData.KeywordToValuesMap`；
- 支持已经输入部分值时的 fuzzy 过滤；
- 只有静态表中有映射的关键字才有参数候选；
- 补全值表与错误校验值表不完全相同，例如布尔错误校验额外接受部分大小写变体。

### 9.2 关键字补全

- 从 `AllKeywords` 提供候选；
- 检查点号必须是合法 token 起点，防止 `abc.hp`、`.hp.` 等伪上下文；
- 向上和向下定位当前 `effect:` 块；
- 当前块已经出现的关键字会从候选中排除；
- 五个 Dot 关键字整体互斥：
  - `.dotBleed`
  - `.dotPoison`
  - `.dotStress`
  - `.dotHpHeal`
  - `.dotShuffle`
- 当前 Effect 块只要已经出现上述任意一个，其他 Dot 候选就隐藏；
- 块扫描会先按 `//` 截断每行。

源码中存在 `TryGetEffectKeywordValueFromCurrentLine` 辅助方法，但没有实际调用路径，当前不构成用户可见功能。

## 10. Info / Art / Override 补全源

三者的 Provider 仅负责绑定 ContentType，实际逻辑集中在 `InfoBaseCompletionSourceProvider`：

### 10.1 Header 补全

- 候选来自 67 个静态 Header；
- 当前行无冒号并输入 Header 前缀时提供；
- Header 可以缩进。

### 10.2 当前 Header 的关键字补全

- 向上查找当前活跃 Header；
- 查找时跳过空行与整行注释；
- 只从该 Header 对应的关键字列表提供候选；
- 同一 Header 块中已经使用的关键字会被排除；
- 若 token 以点号开头，关键字补全优先于参数补全。

### 10.3 固定参数值补全

- 使用 `KeywordValueMap` 和布尔/技能类型等上下文规则；
- 根据当前已输入参数做 fuzzy 过滤；
- 参数补全通常优先，但点号 token 明确表示正在输入关键字时例外。

### 10.4 连续多参数补全

对两个 disabled 枚举列表关键字：

- 识别当前正在输入的参数；
- 对当前参数做 fuzzy；
- 排除本行/本参数序列中已经输入的值；
- 完成一个值并输入空格后，继续给出剩余候选。

## 11. Ctrl+/ 注释切换

`DarkestToggleCommentCommandFilter` 同时接入主键盘事件和 OLE 命令链，覆盖五种 ContentType。实际规则：

1. 监听主键盘 `Ctrl + OemQuestion`，即常见键盘布局上的 `Ctrl+/`；
2. 设置项关闭时不执行；
3. 无选择区域时只处理光标所在行；
4. 有选择区域时处理选择覆盖的全部行；
5. 如果选择末尾恰好落在下一行行首，则下一行不计入；
6. 空行或纯空白行跳过；
7. 如果所有非空行都已在首个非空白位置以 `//` 开头，则统一删除这两个字符；
8. 否则给所有非空行统一添加 `//`；
9. 所有行修改置于一个 Undo Transaction，可一次撤销；
10. 如果选区全为空白，命令返回成功但不产生文本修改。

注释符插入在每行首个非空白字符前，因此会保留原缩进。

## 12. Colours 颜色预览与调色盘

### 12.1 .rgba 解析

`ColoursColorAdornmentTagger` 使用正则：

`\.rgba\s+(?<args>[^\r\n/]*)`

因此：

- 只处理一行中 `Regex.Match` 找到的第一个 `.rgba`；
- 参数遇到斜杠即停止，`//` 后内容不参与；
- 支持 `#RGB`；
- 支持 `#RRGGBB`；
- 支持四个 0–255 整数 `R G B A`；
- 无法解析或超出范围时不创建预览。

### 12.2 编辑器内色块

成功解析后，在参数范围末尾放置一个零长度 `IntraTextAdornment`：

- 色块 12×12；
- 左边距 4；
- 灰色边框；
- Tooltip 显示 RGBA；
- GetTags 每次遍历 `snapshot.Lines` 的整个文档，而不只扫描请求的 spans；
- 缓冲区任意修改都会通知整个文件的 `TagsChanged`。

### 12.3 点击编辑

当 `EnableColorPickerOnClick` 开启时：

- 点击色块打开自定义 WPF `ColorPickerWindow`；
- 原参数 Span 使用 `SpanTrackingMode.EdgeInclusive` 翻译到当前快照；
- 用户确认后，用 `#RRGGBB` 替换整个原参数区域；
- Alpha 参与预览和 Tooltip，但确认写回时被丢弃，不写入十六进制值；
- 取消则不修改文本。

### 12.4 ColorPickerWindow

窗口约 320×400，包含：

- 240×180 色板；
- 顶部颜色预览；
- R/G/B 三个滑块；
- 确定和取消按钮。

色板横向按白→红→黄→绿→青→蓝→洋红变化，纵向叠加至黑。鼠标在色板上拖动会更新 RGB 和预览。`FromHueAndBrightness` 将 Hue 分成六段计算 RGB。

## 13. Effect 语法与语义检查

`EffectErrorTagger` 不只是关键字表校验，还实现行结构、字符串、跨块关系、参数合法性及兼容性提示。

### 13.1 刷新范围

缓冲区变化时：

- 如果换行数变化，或修改行包含 `effect:` / 冒号，则从修改行刷新到文件尾；
- 否则只刷新发生变化的行。

这是为了在 Header/块边界变化时重算后续上下文，同时降低普通字符输入时的刷新范围。

### 13.2 通用词法检查

- `//` 具有最高优先级，即使位于引号中仍开始注释；
- 空行和整行注释跳过；
- 行内注释产生 Warning，提示尽量避免以防游戏识别错误；
- CJK 统一表意文字 A–H、兼容汉字及中文/全角标点产生 SyntaxError；连续非法字符合并成一个 Span；
- 单行双引号数量为奇数时产生 SyntaxError；
- 起始引号前若紧贴非空白普通字符，产生 SyntaxError；
- 结束引号后紧贴点号，产生 Warning；
- 结束引号后紧贴其他非空白字符，产生 SyntaxError；
- 冒号定位会排除完整双引号字符串内部的冒号。

### 13.3 Effect 块结构

- 一行没有冒号，且向上找不到所属 `effect:`，整行报“此行不属于任何 effect”；
- 无冒号但位于 Effect 块内：
  - 行内存在关键字时给 Warning，建议单条 Effect 不内部换行；
  - 没有关键字则报 SyntaxError“错误内容”；
- 有冒号但 Header 不是 `effect:` 时，报无效 Header；
- 未知关键字报 SyntaxError；
- 位于字符串内的点号文本和数字前点号形成的伪关键字会被排除。

### 13.4 .name

- 接受引号值或无引号值；
- 无引号值若包含空白，报 SyntaxError；
- 长度统计排除空白；
- 长度等于 64：Warning；
- 长度大于 64：SyntaxError。

### 13.5 heal / cure 兼容规则

- 如果同一行前面出现 `.heal`，后面又出现 `.healstress`，在 `.heal` 位置报 SyntaxError；
- `.cure` 总是给 Suggestion，建议使用 `.cure_bleed` / `.cure_poison`；
- 如果后面还存在 `.cure_disease`，再产生 SyntaxError。

### 13.6 Dot 互斥

五个 Dot 关键字不能在同一行混用。检测到不同种类时，后出现者报 SyntaxError。错误信息给出的最终覆盖优先级为：

`腐蚀 > 流血 > 恐惧 > 延迟扰乱 > 愈合`

### 13.7 .buff_ids 与 .set_monster_class_ids

两者使用相近的多字符串检查：

- 解析时最多取得 9 个参数；
- 参数包含空白：`.buff_ids` 给 Warning，`.set_monster_class_ids` 给 SyntaxError；
- 单项长度排除空白和引号；
- 等于 64：Warning；超过 64：SyntaxError；
- 参数超过 8 个：两者均 SyntaxError；`.buff_ids` 文案额外建议改用分行；
- 参数恰好为 8 个：Suggestion。

### 13.8 .spawn_target_actor_base_class_id

该规则检查当前关键字之前是否已经出现 `.target`，若有则报 SyntaxError。实际实现只在**当前行的 codeText 中向前扫描字符**，并不跨行搜索整个 Effect 块。

### 13.9 .skill_instant true

- 比较 `true` 时大小写敏感；
- 扫描整个 Effect 块；
- 要求块中至少存在一个 `.target`，且其参数不是 `target` 或 `target_enemy_group`；
- 不满足时对 `.skill_instant` 报 SyntaxError。

### 13.10 .use_item_id / .use_item_type

Effect 块中出现 `.use_item_id` 时，整个块必须同时存在 `.use_item_type`。当前规则只检查后者关键字是否存在，不验证其参数是否缺失或有效。

### 13.11 Buff 三元关系

对同一 Effect 块第一次找到的 `.buff_type`、`.buff_amount`、`.buff_sub_type` 参数执行：

- 有 `.buff_type` 参数时必须存在 `.buff_amount`；
- `MustHaveSubBuffTypes` 中的 type 必须有 `.buff_sub_type`；
- type 在映射表中时，sub type 必须属于对应集合；
- type 不属于 `SubFreeBuffTypes`、也没有映射，却提供了 sub type 时，报该 type 不支持 sub type；
- 规则只取相关关键字第一次出现的参数。

### 13.12 守护规则

针对 `.guard`、`.clearguarded`、`.clearguarding`：

- 当前关键字参数必须精确为 `"1"`；
- 同块中 `.on_hit` 或 `.on_miss` 的第一个值只要大小写不敏感等于 true，即视为启用；
- 如果存在任意 `.chance`，百分数形式小于 100，或非百分数形式小于 1，则给 Warning，提示守护不能被 chance 制约；
- `double.TryParse` 使用当前进程文化，不固定为 InvariantCulture，因此小数点解析可能受系统区域设置影响。

### 13.13 其他专项提示

- `.daze`：总是给 Suggestion；
- `.affliction_blockable_chance`：给 Suggestion，提示潜在崩溃风险。

### 13.14 固定参数合法性

只对 `KeywordToValuesMap` 中的 69 个关键字检查**首个参数**：

- 普通字符串布尔接受 true/false 的全小写、首字母大写、全大写；
- `DoubleBoolKeywords` 同时接受数字布尔和字符串布尔变体；
- 数字布尔值如果放在引号中，报 SyntaxError；
- 缺少参数本身不会由这段固定值校验直接报错；
- 普通表外值报 SyntaxError。

特判如下：

- `.steal_buff_source_type bsrc_district`：Warning；
- `.steal_buff_source_type bsrc_skill`：Warning；
- `.steal_buff_source_type` 的其他表外自定义源：允许但 Warning，提示会视为 `combat_end`；
- `.steal_buff_stat_type` 只有 `hp_dot_bleed`、`hp_dot_poison`、`hp_dot_heal`、`stress_dot`、`shuffle_dot` 不警告，其他值即使位于合法表中也给 Warning，描述为“超级真驱散”；
- `.buff_duration_type none`：Warning，提示在 Effect 中会视为 `round`；
- `.dotSource` / `.buff_source_type` 的表外值允许，但 Warning，提示会视为 `combat_end`。

所有 Effect 静态关键字、值表和 Buff 映射见附录 A。

## 14. Info / Art / Override 语法与语义检查

三类文件分别由轻量 Provider 绑定 ContentType，真正逻辑统一位于 `InfoBaseErrorTagger`。

### 14.1 刷新策略

每次缓冲修改会执行两阶段刷新：

1. 立即刷新变化位置所属 Header 块；
2. 延迟 250ms 防抖后刷新整个文件。

快速块范围通过向上查找最近 Header，并向下延伸到下一个 Header 前一行。若向上找不到 Header，则从变化行前两行开始。源码注释有“300ms”描述，但实际调用是 `Task.Delay(250)`。

### 14.2 基础词法检查

- `//` 仍具有最高优先级，即使在引号中；
- 行内注释直接报 SyntaxError，比 Effect 的 Warning 更严格；
- 中文/CJK/中文标点报 SyntaxError；
- 单行引号数量为奇数报 SyntaxError；
- 引号前后紧贴普通字符或关键字的规则与 Effect 相同；
- Header 正则为 `^[ \t]*(?<header>[a-zA-Z0-9_]+:)`，允许缩进；
- 未知 Header 整行报 SyntaxError。

### 14.3 Header 上下文

- 普通行向上查找最近 Header；
- 查找结果不要求先属于 `AllHeaders`，因此未知 Header 自身会报错，其下内容仍可能以该文本作为上下文继续检查；
- 完全找不到 Header 时，只有行内存在合法形式的点号关键字才报“缺少 Header”；
- 单独的参数续行不包含点号关键字时不会因此报错。

### 14.4 关键字归属与动态 _effects

- 当前 Header 列表中存在的关键字合法；
- 关键字存在于其他 Header、但当前 Header 不允许时，报“不属于当前 Header”；
- 完全未知的静态关键字报 SyntaxError；
- 未知关键字如果以 `_effects` 结尾，只允许出现在四种技能 Header：
  - `riposte_skill:`
  - `skill:`
  - `combat_skill:`
  - `combat_move_skill:`
- 动态关键字 body 不能以这四类 Header 中任一已有关键字去掉点号后的文本开头，比较不区分大小写；
- 动态关键字 body 如果含数字，并且向前找到的上一个合法点号关键字是 `.target`，报错；
- `.was_killed_effects` 即使被上下文判为合法，也额外报 SyntaxError，建议改用 `.was_killed_by_hero_effects`。

### 14.5 death_class 整文件冲突

在文件任意 `death_class:` 上下文中，只要分别出现：

- `.monster_class_id`
- `.random_monster_class_ids`

就认为冲突，不要求两者位于同一个 `death_class:` 块。两个关键字位置都会收到 SyntaxError。检查会扫描整文件，最后只返回与本次请求 spans 相交的标签。

### 14.6 跨行参数解析

从当前关键字尾部开始解析参数，可跨越后续行，直到遇到：

- 下一个关键字；
- 下一个 Header；
- 文件末尾。

双引号参数保存引号内部文本，无引号参数按空白分隔。实际代码用直接 `IndexOf("//")` 截断，所以即使注释标记位于字符串中也会截断，这与源码中“字符串内部 // 不算注释”的文字描述不一致。

### 14.7 参数检查顺序

同一关键字按以下顺序执行，因此同一位置可能叠加多个标签：

1. 单字符串长度规则；
2. 多字符串数量与长度规则；
3. 仅参数数量规则；
4. 固定参数值规则。

### 14.8 固定值规则

`GetValuesForKeyword` 的选择顺序：

1. 直接关键字值表；
2. 四类技能 Header 的 `.type` 使用 `SKILL_TYPE`；
3. 被判断为布尔关键字时使用 BOOL 值表。

细节：

- BOOL 接受全小写、首字母大写、全大写；
- BOOL 多于一个参数时，在第二个参数位置报 SyntaxError；
- 固定值参数中含空白时报 SyntaxError；
- 非布尔候选使用区分大小写的 `Contains`；
- 四类技能 Header 的 `.type` 使用表外自定义值时，不报 SyntaxError，而给 Suggestion，提示自定义非友方技能会失去近战/远程增益和 Trigger；
- 其他表外值报 SyntaxError。

### 14.9 连续枚举参数

`.disabled_popup_text_types`：

- 最大参数数取其固定值表数量，当前为 54；
- 表外值报错；
- 重复值报错；
- 参数含空白报错。

`.disabled_act_out_combat_start_turn_types`：

- 硬编码最大 4 个参数，尽管静态值表有 15 项；
- 表外、重复、含空白均报错。

### 14.10 单字符串长度

规则表分为 32、64、128、512 字符四组：

- 理论上只允许一个参数；
- 第二个参数位置报 SyntaxError；
- 长度统计排除空白；
- 等于上限给 Warning；
- 超过上限给 SyntaxError。

mode 特判：

- `mode: .id`；
- 四类技能 Header 的 `.valid_modes`；
- 长度大于 32给 Warning，大于 64给 SyntaxError；
- 不是“恰好等于 32才警告”。

### 14.11 多字符串数量与长度

- 静态规则表为每个 Header/关键字给出最大参数数和单项最大长度；
- 动态技能 `_effects` 使用最多 6 个参数、每项 64 字符；
- 超过最大参数数通常为 SyntaxError；
- `.damage_heal_base_class_ids`、`.incompatible_class_ids` 超量只给 Warning，并建议分行；
- `spawn: .effects` 参数超过最大数的一半即给 Warning；
- 单参数长度等于上限给 Warning，超过上限给 SyntaxError。

### 14.12 仅参数数量规则

`MaxArgumentCountRules` 为 30 个 Header/关键字组合设置最大数量。超量时在第一个多出的参数处产生 SyntaxError。完整表见附录 B。

## 15. Error List 同步与导航

`DarkestLegacyErrorListProvider` 把编辑器 Error Tag 转换为 Visual Studio 传统 Error List 条目。

### 15.1 覆盖范围

只绑定：

- Effect
- Info
- Art
- Override

不绑定 Colours。

### 15.2 生命周期与刷新

- 使用静态共享 `ErrorListProvider`，ProviderName 为 `Darkest Dungeon`；
- 每个 TextBuffer 创建一个 `ErrorTaskSink` 并存入 Buffer.Properties；
- 按 ContentType 获取对应 Tagger；
- 初始创建后切换 UI 线程并执行全文刷新；
- 监听 Tagger 的 `TagsChanged`；
- 代码中直接监听 `_buffer.Changed` 的订阅已被注释，实际刷新依赖 Tagger 通知；
- 收到通知后使用 300ms 防抖，再切换 UI 线程重建该文档全部 ErrorTask；
- 刷新前先删除本 Sink 的旧任务；
- 对非当前 Snapshot 的 Span 使用 `SpanTrackingMode.EdgeInclusive` 翻译。

### 15.3 严重性映射

| ErrorTag 类型 | Error List |
|---|---|
| Warning | Warning |
| Suggestion | Message |
| 其他 / SyntaxError | Error |

消息优先使用 ErrorTag 的 ToolTip 字符串，否则使用 ErrorType。Category 为 `CodeSense`。

### 15.4 导航与关闭

双击错误条目时：

1. `VsShellUtilities.OpenDocument` 打开文件；
2. 设置目标行列；
3. 调用 `CenterLines` 把目标行置于视图中央。

编辑器关闭时会取消待处理任务、解绑 `TagsChanged`，并在 UI 线程删除该 Sink 的 ErrorTask。`_errorListProvider.Show()` 已被注释，因此扩展不会强制弹出 Error List。

## 16. 静态数据规模

### 16.1 Effect 数据

| 集合 | 数量 |
|---|---:|
| CoreKeywords | 4 |
| RiposteKeywords | 6 |
| BuffKeywords | 25 |
| SummonKeywords | 9 |
| AllKeywords | 138 |
| KeywordToValuesMap | 69 |
| TargetValues | 8 |
| CurioResultValues | 4 |
| KeyStatusValues | 5 |
| BuffTypeValues | 87 |
| BuffSubTypeValues | 63 |
| BuffDurationTypeValues | 12 |
| BuffSourceValues | 35 |
| HealSourceValues | 14 |
| DamageTypeValues | 26 |
| DamageSourceValues | 15 |
| NumBoolValues | 2 |
| StrBoolValues（补全） | 2 |
| StrBoolValuesForError | 6 |
| DoubleBoolKeywords | 1 |
| DoubleBoolValuesForError | 8 |
| BuffTypeToSubTypesMap | 12 |
| MustHaveSubBuffTypes | 5 |
| SubFreeBuffTypes | 3 |

### 16.2 Info-like 数据

| 集合 | 数量 |
|---|---:|
| AllHeaders | 67 |
| InfoContextMap | 67 |
| KeywordValueMap | 4 |
| SingleString32 | 8 |
| SingleString64 | 85 |
| SingleString128 | 1 |
| SingleString512 | 2 |
| MultiStringLengthRules | 42 |
| MaxArgumentCountRules | 30 |

附录使用当前 `DarkestData.cs` 的实际初始化结果生成，而非手工根据变量名或注释整理。

## 17. 实现边界、潜在缺口与文档不一致

以下内容不是推测，而是代码路径体现出的边界：

1. **README 后缀陈旧/拼写错误**：实际为 `.effects.darkest` 和 `.override.darkest`；README 写成 `.effect.darkest`、`.override.darest`。
2. **Colours 无错误检查**：有着色和色块功能，但未绑定 Error Tagger / Error List。
3. **Colours 补全能力有限**：挂了 Effect 命令过滤器，却没有 Colours 专用 CompletionSource，不能保证弹出 Effect 候选。
4. **注释优先于字符串**：多个分类器和错误检查器都直接查找首个 `//`，字符串里的 `//` 也会截断。
5. **分类合法不等于上下文合法**：Info-like 分类器只看关键字是否存在于任意 Header；当前 Header 是否允许由 Error Tagger 判断。
6. **Effect Header 着色不限制行首**：`effect:` 出现在代码区其他位置也可能着色。
7. **Effect 关键字着色正则不含数字**，而 Info-like 关键字正则允许数字。
8. **Effect 块边界辅助并非完全统一**：补全源、错误检查中的不同辅助函数对 `effect:` 的识别条件存在差别，边缘格式可能出现补全上下文与错误上下文不一致。
9. **`.spawn_target_actor_base_class_id` 只做同行前向检查**，不是整块跨行检查。
10. **`.skill_instant true` 大小写敏感**，与其他部分布尔值允许多种大小写的规则不一致。
11. **守护 chance 数字解析受当前文化影响**，没有固定小数点文化。
12. **固定参数校验通常只检查首个参数**，缺参数也不一定由固定值规则报错。
13. **跨行参数注释实现与注释文字冲突**：实现仍会把引号内 `//` 当注释。
14. **disabled act-out 最大数不取静态表大小**：值表 15 项，但检查硬编码最多 4 项。
15. **death_class 冲突是整文件级**：两个关键字不必位于同一 Header 块也会冲突。
16. **Error List 不自动显示**：刷新和导航有效，但主动 Show 调用被注释。
17. **版本号不同步**：VSIX 为 3.1.1，程序集为 1.0.0.0。
18. **无自动化测试项目/测试文件**：当前仓库中未发现手写测试，规则正确性主要依赖实现本身。
19. **TodoList 不描述功能**：其唯一内容是一个 Codex resume 标识，不构成待办功能定义。

## 18. 文件到功能的映射

### 18.1 根目录与配置

| 文件 | 实际职责 |
|---|---|
| `For_the_Darkest_Dungeon.csproj` | VSIX 项目、目标框架、SDK/程序集引用、编译文件清单 |
| `For_the_Darkest_Dungeon.sln` | Visual Studio 解决方案 |
| `source.extension.vsixmanifest` | VSIX 身份、版本、安装目标、依赖、资产 |
| `DarkestFileExtension.pkgdef` | `.darkest` 到文本编辑器的注册 |
| `For_the_Darkest_DungeonPackage.cs` | AsyncPackage 初始化与选项页注册 |
| `GeneralOptionsPage.cs` | Ctrl+/ 功能开关 |
| `ColoursOptionsPage.cs` | 色块预览与点击调色开关 |
| `TextViewCreationListener.cs` | 文本视图创建时挂接各命令过滤器与注释过滤器 |
| `Properties/AssemblyInfo.cs` | 程序集标题、COM、GUID、版本元数据 |
| `README.md` | 简短项目说明；后缀文字与当前代码有差异 |
| `TodoList.md` | 当前仅含 resume 标识，无实现逻辑 |

### 18.2 DefinitionDarkest

| 文件 | 实际职责 |
|---|---|
| `DarkestContentType.cs` | 五类 ContentType、文件后缀、分类器/补全/Error Provider 的 MEF 绑定基础 |
| `DarkestData.cs` | Effect 和 Info-like 的全部 Header、关键字、候选值、长度/数量规则、Buff 映射 |

### 18.3 Classification

| 文件 | 实际职责 |
|---|---|
| `ClassificationTypes.cs` | 注册全部 ClassificationType 与默认格式颜色 |
| `EffectClassifier.cs` | Effect 行词法着色和未知关键字黄色标记 |
| `InfoBaseClassifier.cs` | Info/Art/Override 共用着色实现 |
| `InfoClassifier.cs` | 将共用分类器绑定到 Info |
| `ArtClassifier.cs` | 将共用分类器绑定到 Art |
| `OverrideClassifier.cs` | 将共用分类器绑定到 Override |
| `ColoursClassifier.cs` | colour Header、关键字、十六进制颜色等着色 |
| `ColoursColorAdornmentTagger.cs` | `.rgba` 色块、Adornment、WPF 调色盘、点击写回 |

### 18.4 Completion

| 文件 | 实际职责 |
|---|---|
| `BaseDarkestCommandFilter.cs` | TYPECHAR/Tab/Enter、补全会话、token 边界和触发基础 |
| `BaseSharedInfoLikeCommandFilter.cs` | Info-like Header、空格参数、连续参数触发 |
| `EffectCommandFilter.cs` | Effect 参数值与 fuzzy 会话触发 |
| `InfoCommandFilter.cs` | Info 命令层绑定 |
| `ArtCommandFilter.cs` | Art 命令层绑定 |
| `OverrideCommandFilter.cs` | Override 命令层绑定 |
| `FuzzyCompletionCache.cs` | 规范化、前缀/子序列匹配、排序、缓存 |
| `FuzzyCompletionSet.cs` | 可更新候选集合与首项强制选择 |
| `EffectCompletionSourceProvider.cs` | Effect 关键字/值候选、块去重、Dot 互斥 |
| `InfoBaseCompletionSourceProvider.cs` | Info-like Header、上下文关键字、固定值和连续参数候选 |
| `InfoCompletionSourceProvider.cs` | 绑定 Info CompletionSource |
| `ArtCompletionSourceProvider.cs` | 绑定 Art CompletionSource |
| `OverrideCompletionSourceProvider.cs` | 绑定 Override CompletionSource |
| `DarkestToggleCommentCommandFilter.cs` | 五类文件的 Ctrl+/ 批量注释/取消注释 |

### 18.5 Error

| 文件 | 实际职责 |
|---|---|
| `EffectErrorTagger.cs` | Effect 全部词法、结构、参数与跨关键字语义检查 |
| `InfoBaseErrorTagger.cs` | Info/Art/Override 共用 Header、关键字、参数、长度和冲突检查 |
| `InfoErrorTagger.cs` | 将共用 Error Tagger 绑定到 Info |
| `ArtErrorTagger.cs` | 将共用 Error Tagger 绑定到 Art |
| `OverrideErrorTagger.cs` | 将共用 Error Tagger 绑定到 Override |
| `DarkestLegacyErrorListProvider.cs` | 把 ErrorTag 同步为 Error List 任务并支持双击导航 |

## 19. 总体数据流

`文件名后缀 → ContentType → 文本视图/缓冲区 MEF 组件`，随后分成三条主要路径：

1. **显示路径**：Classifier 读取 SnapshotSpan → 返回分类 Span → Visual Studio 使用分类格式绘制；Colours 另有 Adornment Tagger 绘制行内色块。
2. **输入路径**：CommandFilter 接管字符/Tab/Enter → 判断 token 与上下文 → 创建 CompletionSession → CompletionSource 提供候选 → FuzzyCompletionSet 过滤排序并提交。
3. **诊断路径**：ErrorTagger 监听缓冲变化 → 生成 ErrorTag → Legacy Error List Provider 防抖汇总 → 创建 ErrorTask → 双击导航回原文件。

注释切换是独立的输入命令路径，直接在单个 Undo Transaction 中编辑选中行。

---

﻿## 附录 A：Effect 静态语法数据

### 核心关键字（4 项）

`.name`、`.target`、`.on_hit`、`.on_miss`

### 反击关键字（6 项）

`.riposte`、`.riposte_on_miss_chance_add`、`.riposte_on_hit_chance_add`、`.riposte_on_miss_chance_multiply`、`.riposte_on_hit_chance_multiply`、`.riposte_effect`

### Buff 关键字（25 项）

`.combat_stat_buff`、`.buff_ids`、`.buff_amount`、`.buff_type`、`.buff_sub_type`、`.buff_duration_type`、`.buff_source_type`、`.buff_is_clear_debuff_valid`、`.damage_low_multiply`、`.damage_low_add`、`.damage_high_multiply`、`.damage_high_add`、`.max_hp_multiply`、`.max_hp_add`、`.attack_rating_add`、`.attack_rating_multiply`、`.crit_chance_add`、`.crit_chance_multiply`、`.defense_rating_add`、`.defense_rating_multiply`、`.protection_rating_add`、`.protection_rating_multiply`、`.speed_rating_add`、`.speed_rating_multiply`、`.guard`

### 召唤关键字（9 项）

`.summon_monsters`、`.summon_chances`、`.summon_ranks`、`.summon_limits`、`.summon_count`、`.summon_erase_data_on_roll`、`.summon_can_spawn_loot`、`.summon_rank_is_previous_monster_class`、`.summon_does_roll_initiatives`

### 全部 Effect 关键字（138 项）

`.name`、`.target`、`.curio_result_type`、`.chance`、`.on_hit`、`.on_miss`、`.queue`、`.dotBleed`、`.dotPoison`、`.dotStress`、`.dotHpHeal`、`.healstress`、`.stress`、`.combat_stat_buff`、`.damage_low_multiply`、`.damage_low_add`、`.damage_high_multiply`、`.damage_high_add`、`.max_hp_multiply`、`.max_hp_add`、`.attack_rating_add`、`.attack_rating_multiply`、`.crit_chance_add`、`.crit_chance_multiply`、`.defense_rating_add`、`.defense_rating_multiply`、`.protection_rating_add`、`.protection_rating_multiply`、`.speed_rating_add`、`.speed_rating_multiply`、`.buff_ids`、`.duration`、`.heal`、`.heal_percent`、`.can_crit_heal`、`.cure`、`.cure_bleed`、`.cure_poison`、`.clearDotStress`、`.tag`、`.untag`、`.stun`、`.unstun`、`.keyStatus`、`.riposte`、`.riposte_on_miss_chance_add`、`.riposte_on_hit_chance_add`、`.riposte_on_miss_chance_multiply`、`.riposte_on_hit_chance_multiply`、`.riposte_effect`、`.clear_riposte`、`.guard`、`.clearguarding`、`.clearguarded`、`.torch_decrease`、`.torch_increase`、`.item`、`.curio`、`.dotShuffle`、`.push`、`.pull`、`.shuffletarget`、`.shuffleparty`、`.instant_shuffle`、`.buff_amount`、`.buff_type`、`.buff_sub_type`、`.buff_duration_type`、`.steal_buff_stat_type`、`.steal_buff_source_type`、`.swap_source_and_target`、`.kill`、`.immobilize`、`.unimmobilize`、`.control`、`.uncontrol`、`.kill_enemy_types`、`.monsterType`、`.capture`、`.capture_remove_from_party`、`.disease`、`.remove_vampire`、`.summon_monsters`、`.summon_chances`、`.summon_ranks`、`.summon_limits`、`.summon_count`、`.summon_erase_data_on_roll`、`.summon_can_spawn_loot`、`.summon_rank_is_previous_monster_class`、`.summon_does_roll_initiatives`、`.crit_doesnt_apply_to_roll`、`.virtue_blockable_chance`、`.affliction_blockable_chance`、`.set_mode`、`.can_apply_on_death`、`.apply_once`、`.rank_target`、`.clear_rank_target`、`.performer_rank_target`、`.apply_with_result`、`.initiative_change`、`.source_heal_type`、`.skill_instant`、`.actor_dot`、`.health_damage`、`.bark`、`.set_monster_class_id`、`.set_monster_class_ids`、`.set_monster_class_chances`、`.set_monster_class_reset_hp`、`.set_monster_class_reset_buffs`、`.set_monster_class_carry_over_hp_min_percent`、`.set_monster_class_clear_initative`、`.set_monster_class_clear_monster_brain_cooldowns`、`.set_monster_class_reset_scale`、`.has_description`、`.stealth`、`.unstealth`、`.clear_debuff`、`.health_damage_blocks`、`.dotSource`、`.buff_source_type`、`.use_item_id`、`.use_item_type`、`.skips_endless_wave_curio`、`.spawn_target_actor_base_class_id`、`.clearvirtue`、`.riposte_validate`、`.buff_is_clear_debuff_valid`、`.refreshes_skill_uses`、`.cure_disease`、`.individual_target_actor_rolls`、`.damage_type`、`.damage_source_type`、`.damage_source_data`、`.daze`、`.undaze`

### target 候选值（8 项）

`performer`、`performer_group`、`performer_group_other`、`target`、`target_group`、`target_group_other`、`target_enemy_group`、`global`

### curio result 候选值（4 项）

`positive`、`negative`、`neutral`、`none`

### key status 候选值（5 项）

`tagged`、`poisoned`、`bleeding`、`stunned`、`dazed`

### buff type 候选值（87 项）

`hp_heal_amount`、`hp_heal_percent`、`hp_heal_received_percent`、`combat_stat_multiply`、`combat_stat_add`、`resistance`、`poison_chance`、`bleed_chance`、`stress_dmg_percent`、`stress_dmg_received_percent`、`stress_heal_percent`、`stress_heal_received_percent`、`party_surprise_chance`、`monsters_surprise_chance`、`ambush_chance`、`scouting_chance`、`starving_damage_percent`、`upgrade_discount`、`damage_received_percent`、`debuff_chance`、`resolve_check_percent`、`stun_chance`、`move_chance`、`remove_negative_quirk_chance`、`food_consumption_percent`、`resolve_xp_bonus_percent`、`activity_side_effect_chance`、`vampire_evolution_duration`、`quirk_evolution_death_immune`、`disable_combat_skill_attribute`、`guard_blocked`、`tag_blocked`、`ignore_protection`、`ignore_stealth`、`crit_received_chance`、`riposte`、`tag`、`guarded`、`vampire`、`stealth`、`hp_dot_bleed`、`hp_dot_poison`、`hp_dot_heal`、`stress_dot`、`shuffle_dot`、`torch_increase_percent`、`torch_decrease_percent`、`torchlight_burn_percent`、`stress_on_miss`、`stress_from_idle_in_town`、`shard_reward_percent`、`shard_consume_percent`、`damage_reflect_percent`、`hp_dot_bleed_duration_received_percent`、`hp_dot_bleed_duration_percent`、`hp_dot_bleed_amount_received_percent`、`hp_dot_bleed_amount_percent`、`hp_dot_poison_duration_received_percent`、`hp_dot_poison_duration_percent`、`hp_dot_poison_amount_received_percent`、`hp_dot_poison_amount_percent`、`stress_dot_duration_received_percent`、`stress_dot_duration_percent`、`stress_dot_amount_received_percent`、`stress_dot_amount_percent`、`hp_heal_dot_duration_received_percent`、`hp_heal_dot_duration_percent`、`hp_heal_dot_amount_received_percent`、`hp_heal_dot_amount_percent`、`shuffle_dot_duration_received_percent`、`shuffle_dot_duration_percent`、`guard_duration_received_percent`、`guard_duration_percent`、`cure_bleed_received_chance`、`cure_poison_received_chance`、`cure_bleed_chance`、`cure_poison_chance`、`random_target_friendly_chance`、`random_target_attack_chance`、`transfer_debuff_from_attacker_chance`、`transfer_buff_from_attacker_chance`、`quirk_tag_evolution_duration`、`deathblow_chance`、`heartattack_stress_heal_percent`、`ignore_guard`、`buff_duration_percent`、`riposte_duration_percent`

### buff sub type 候选值（63 项）

`max_hp`、`damage_low`、`damage_high`、`attack_rating`、`crit_chance`、`defense_rating`、`protection_rating`、`speed_rating`、`riposte_on_hit_chance`、`riposte_on_miss_chance`、`stun`、`move`、`poison`、`bleed`、`disease`、`debuff`、`death_blow`、`trap`、`armour`、`weapon`、`combat_skill`、`camping_skill`、`add_currency`、`remove_currency`、`add_trinket`、`remove_trinket`、`activity_lock`、`apply_buff`、`go_missing`、`heal`、`buff`、`tag`、`stress`、`guard`、`daze`、`hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`hunger`、`hero_crit`、`hero_killing_blow`、`mode`、`control`、`unkown`、`town_idle`、`quest_fail`、`pass`、`camping_relieve_stress`、`camping_eat`、`tile`、`retreat`、`capture`、`monster_crit`

### buff duration type 候选值（12 项）

`round`、`combat_end`、`quest_end`、`quest_complete`、`quest_not_complete`、`activity_end`、`idle_start_town_visit`、`till_removed`、`none`、`before_turn`、`after_turn`、`after_round`

### buff source 候选值（35 项）

`bsrc_skill`、`bsrc_notspecified`、`bsrc_affliction`、`bsrc_virtue`、`bsrc_item`、`bsrc_curio`、`bsrc_disease`、`bsrc_riposte`、`bsrc_campingskill`、`bsrc_quirk`、`bsrc_trinket`、`bsrc_trinket_set`、`bsrc_instantSkill`、`bsrc_guard`、`bsrc_deathsdoor`、`bsrc_deathsdoor_recovery`、`bsrc_deathsdoor_recovery_heart_attack`、`bsrc_quest_failure`、`bsrc_companion`、`bsrc_stun`、`bsrc_town`、`bsrc_district`、`bsrc_torchsettings`、`bsrc_crit`、`bsrc_trinket_additional_effect`、`bsrc_battle_modifier`、`bsrc_never_again`、`bsrc_vampire`、`bsrc_town_event`、`bsrc_flashback_start`、`bsrc_flashback_result`、`bsrc_completed_darkest_dungeon_quest_party_hero`、`bsrc_quest_modifier`、`bsrc_last_hero`、`combat_end`

### heal source 候选值（14 项）

`hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`curio`

### damage type 候选值（26 项）

`unknown`、`trap`、`obstacle`、`hunger`、`attack`、`bleed`、`healing`、`poisoned`、`captor`、`ddexit`、`townexit`、`death`、`heartattack`、`theblood`、`effect`、`quirkevolutiondeath`、`reflect`、`riposte`、`additionaleffect`、`supply`、`quest_item`、`trinket`、`estate_currency`、`journal_page`、`torch`、`shovel`

### damage source 候选值（15 项）

`unknown`、`hunger`、`trap`、`obstacle`、`friendly`、`monster`、`hero`、`friendly_quirk_actout`、`friendly_trait_actout`、`item`、`effect`、`quirk`、`reflect`、`trinket`、`estate`

### 数字布尔值（2 项）

`0`、`1`

### 字符串布尔值（补全）（2 项）

`false`、`true`

### 字符串布尔值（错误校验）（6 项）

`false`、`true`、`False`、`True`、`FALSE`、`TRUE`

### 双布尔关键字（1 项）

`.set_monster_class_reset_hp`

### 双布尔允许值（错误校验）（8 项）

`0`、`1`、`false`、`true`、`False`、`True`、`FALSE`、`TRUE`

### 强制要求 buff_sub_type 的 buff_type（5 项）

`combat_stat_multiply`、`combat_stat_add`、`resistance`、`activity_side_effect_chance`、`disable_combat_skill_attribute`

### 禁止/无需 buff_sub_type 的 buff_type（3 项）

`upgrade_discount`、`riposte`、`quirk_tag_evolution_duration`

### Effect 关键字固定参数映射（69 项）

| 关键字 | 候选/合法值 |
|---|---|
| `.target` | `performer`、`performer_group`、`performer_group_other`、`target`、`target_group`、`target_group_other`、`target_enemy_group`、`global` |
| `.curio_result_type` | `positive`、`negative`、`neutral`、`none` |
| `.keyStatus` | `tagged`、`poisoned`、`bleeding`、`stunned`、`dazed` |
| `.buff_type` | `hp_heal_amount`、`hp_heal_percent`、`hp_heal_received_percent`、`combat_stat_multiply`、`combat_stat_add`、`resistance`、`poison_chance`、`bleed_chance`、`stress_dmg_percent`、`stress_dmg_received_percent`、`stress_heal_percent`、`stress_heal_received_percent`、`party_surprise_chance`、`monsters_surprise_chance`、`ambush_chance`、`scouting_chance`、`starving_damage_percent`、`upgrade_discount`、`damage_received_percent`、`debuff_chance`、`resolve_check_percent`、`stun_chance`、`move_chance`、`remove_negative_quirk_chance`、`food_consumption_percent`、`resolve_xp_bonus_percent`、`activity_side_effect_chance`、`vampire_evolution_duration`、`quirk_evolution_death_immune`、`disable_combat_skill_attribute`、`guard_blocked`、`tag_blocked`、`ignore_protection`、`ignore_stealth`、`crit_received_chance`、`riposte`、`tag`、`guarded`、`vampire`、`stealth`、`hp_dot_bleed`、`hp_dot_poison`、`hp_dot_heal`、`stress_dot`、`shuffle_dot`、`torch_increase_percent`、`torch_decrease_percent`、`torchlight_burn_percent`、`stress_on_miss`、`stress_from_idle_in_town`、`shard_reward_percent`、`shard_consume_percent`、`damage_reflect_percent`、`hp_dot_bleed_duration_received_percent`、`hp_dot_bleed_duration_percent`、`hp_dot_bleed_amount_received_percent`、`hp_dot_bleed_amount_percent`、`hp_dot_poison_duration_received_percent`、`hp_dot_poison_duration_percent`、`hp_dot_poison_amount_received_percent`、`hp_dot_poison_amount_percent`、`stress_dot_duration_received_percent`、`stress_dot_duration_percent`、`stress_dot_amount_received_percent`、`stress_dot_amount_percent`、`hp_heal_dot_duration_received_percent`、`hp_heal_dot_duration_percent`、`hp_heal_dot_amount_received_percent`、`hp_heal_dot_amount_percent`、`shuffle_dot_duration_received_percent`、`shuffle_dot_duration_percent`、`guard_duration_received_percent`、`guard_duration_percent`、`cure_bleed_received_chance`、`cure_poison_received_chance`、`cure_bleed_chance`、`cure_poison_chance`、`random_target_friendly_chance`、`random_target_attack_chance`、`transfer_debuff_from_attacker_chance`、`transfer_buff_from_attacker_chance`、`quirk_tag_evolution_duration`、`deathblow_chance`、`heartattack_stress_heal_percent`、`ignore_guard`、`buff_duration_percent`、`riposte_duration_percent` |
| `.steal_buff_stat_type` | `hp_heal_amount`、`hp_heal_percent`、`hp_heal_received_percent`、`combat_stat_multiply`、`combat_stat_add`、`resistance`、`poison_chance`、`bleed_chance`、`stress_dmg_percent`、`stress_dmg_received_percent`、`stress_heal_percent`、`stress_heal_received_percent`、`party_surprise_chance`、`monsters_surprise_chance`、`ambush_chance`、`scouting_chance`、`starving_damage_percent`、`upgrade_discount`、`damage_received_percent`、`debuff_chance`、`resolve_check_percent`、`stun_chance`、`move_chance`、`remove_negative_quirk_chance`、`food_consumption_percent`、`resolve_xp_bonus_percent`、`activity_side_effect_chance`、`vampire_evolution_duration`、`quirk_evolution_death_immune`、`disable_combat_skill_attribute`、`guard_blocked`、`tag_blocked`、`ignore_protection`、`ignore_stealth`、`crit_received_chance`、`riposte`、`tag`、`guarded`、`vampire`、`stealth`、`hp_dot_bleed`、`hp_dot_poison`、`hp_dot_heal`、`stress_dot`、`shuffle_dot`、`torch_increase_percent`、`torch_decrease_percent`、`torchlight_burn_percent`、`stress_on_miss`、`stress_from_idle_in_town`、`shard_reward_percent`、`shard_consume_percent`、`damage_reflect_percent`、`hp_dot_bleed_duration_received_percent`、`hp_dot_bleed_duration_percent`、`hp_dot_bleed_amount_received_percent`、`hp_dot_bleed_amount_percent`、`hp_dot_poison_duration_received_percent`、`hp_dot_poison_duration_percent`、`hp_dot_poison_amount_received_percent`、`hp_dot_poison_amount_percent`、`stress_dot_duration_received_percent`、`stress_dot_duration_percent`、`stress_dot_amount_received_percent`、`stress_dot_amount_percent`、`hp_heal_dot_duration_received_percent`、`hp_heal_dot_duration_percent`、`hp_heal_dot_amount_received_percent`、`hp_heal_dot_amount_percent`、`shuffle_dot_duration_received_percent`、`shuffle_dot_duration_percent`、`guard_duration_received_percent`、`guard_duration_percent`、`cure_bleed_received_chance`、`cure_poison_received_chance`、`cure_bleed_chance`、`cure_poison_chance`、`random_target_friendly_chance`、`random_target_attack_chance`、`transfer_debuff_from_attacker_chance`、`transfer_buff_from_attacker_chance`、`quirk_tag_evolution_duration`、`deathblow_chance`、`heartattack_stress_heal_percent`、`ignore_guard`、`buff_duration_percent`、`riposte_duration_percent` |
| `.buff_sub_type` | `max_hp`、`damage_low`、`damage_high`、`attack_rating`、`crit_chance`、`defense_rating`、`protection_rating`、`speed_rating`、`riposte_on_hit_chance`、`riposte_on_miss_chance`、`stun`、`move`、`poison`、`bleed`、`disease`、`debuff`、`death_blow`、`trap`、`armour`、`weapon`、`combat_skill`、`camping_skill`、`add_currency`、`remove_currency`、`add_trinket`、`remove_trinket`、`activity_lock`、`apply_buff`、`go_missing`、`heal`、`buff`、`tag`、`stress`、`guard`、`daze`、`hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`hunger`、`hero_crit`、`hero_killing_blow`、`mode`、`control`、`unkown`、`town_idle`、`quest_fail`、`pass`、`camping_relieve_stress`、`camping_eat`、`tile`、`retreat`、`capture`、`monster_crit` |
| `.buff_duration_type` | `round`、`combat_end`、`quest_end`、`quest_complete`、`quest_not_complete`、`activity_end`、`idle_start_town_visit`、`till_removed`、`none`、`before_turn`、`after_turn`、`after_round` |
| `.buff_source_type` | `bsrc_skill`、`bsrc_notspecified`、`bsrc_affliction`、`bsrc_virtue`、`bsrc_item`、`bsrc_curio`、`bsrc_disease`、`bsrc_riposte`、`bsrc_campingskill`、`bsrc_quirk`、`bsrc_trinket`、`bsrc_trinket_set`、`bsrc_instantSkill`、`bsrc_guard`、`bsrc_deathsdoor`、`bsrc_deathsdoor_recovery`、`bsrc_deathsdoor_recovery_heart_attack`、`bsrc_quest_failure`、`bsrc_companion`、`bsrc_stun`、`bsrc_town`、`bsrc_district`、`bsrc_torchsettings`、`bsrc_crit`、`bsrc_trinket_additional_effect`、`bsrc_battle_modifier`、`bsrc_never_again`、`bsrc_vampire`、`bsrc_town_event`、`bsrc_flashback_start`、`bsrc_flashback_result`、`bsrc_completed_darkest_dungeon_quest_party_hero`、`bsrc_quest_modifier`、`bsrc_last_hero`、`combat_end` |
| `.steal_buff_source_type` | `bsrc_skill`、`bsrc_notspecified`、`bsrc_affliction`、`bsrc_virtue`、`bsrc_item`、`bsrc_curio`、`bsrc_disease`、`bsrc_riposte`、`bsrc_campingskill`、`bsrc_quirk`、`bsrc_trinket`、`bsrc_trinket_set`、`bsrc_instantSkill`、`bsrc_guard`、`bsrc_deathsdoor`、`bsrc_deathsdoor_recovery`、`bsrc_deathsdoor_recovery_heart_attack`、`bsrc_quest_failure`、`bsrc_companion`、`bsrc_stun`、`bsrc_town`、`bsrc_district`、`bsrc_torchsettings`、`bsrc_crit`、`bsrc_trinket_additional_effect`、`bsrc_battle_modifier`、`bsrc_never_again`、`bsrc_vampire`、`bsrc_town_event`、`bsrc_flashback_start`、`bsrc_flashback_result`、`bsrc_completed_darkest_dungeon_quest_party_hero`、`bsrc_quest_modifier`、`bsrc_last_hero`、`combat_end` |
| `.dotSource` | `bsrc_skill`、`bsrc_notspecified`、`bsrc_affliction`、`bsrc_virtue`、`bsrc_item`、`bsrc_curio`、`bsrc_disease`、`bsrc_riposte`、`bsrc_campingskill`、`bsrc_quirk`、`bsrc_trinket`、`bsrc_trinket_set`、`bsrc_instantSkill`、`bsrc_guard`、`bsrc_deathsdoor`、`bsrc_deathsdoor_recovery`、`bsrc_deathsdoor_recovery_heart_attack`、`bsrc_quest_failure`、`bsrc_companion`、`bsrc_stun`、`bsrc_town`、`bsrc_district`、`bsrc_torchsettings`、`bsrc_crit`、`bsrc_trinket_additional_effect`、`bsrc_battle_modifier`、`bsrc_never_again`、`bsrc_vampire`、`bsrc_town_event`、`bsrc_flashback_start`、`bsrc_flashback_result`、`bsrc_completed_darkest_dungeon_quest_party_hero`、`bsrc_quest_modifier`、`bsrc_last_hero`、`combat_end` |
| `.source_heal_type` | `hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`curio` |
| `.damage_type` | `unknown`、`trap`、`obstacle`、`hunger`、`attack`、`bleed`、`healing`、`poisoned`、`captor`、`ddexit`、`townexit`、`death`、`heartattack`、`theblood`、`effect`、`quirkevolutiondeath`、`reflect`、`riposte`、`additionaleffect`、`supply`、`quest_item`、`trinket`、`estate_currency`、`journal_page`、`torch`、`shovel` |
| `.damage_source_type` | `unknown`、`hunger`、`trap`、`obstacle`、`friendly`、`monster`、`hero`、`friendly_quirk_actout`、`friendly_trait_actout`、`item`、`effect`、`quirk`、`reflect`、`trinket`、`estate` |
| `.combat_stat_buff` | `0`、`1` |
| `.cure` | `0`、`1` |
| `.cure_bleed` | `0`、`1` |
| `.cure_poison` | `0`、`1` |
| `.clearDotStress` | `0`、`1` |
| `.tag` | `0`、`1` |
| `.untag` | `0`、`1` |
| `.unstun` | `0`、`1` |
| `.riposte` | `0`、`1` |
| `.clear_riposte` | `0`、`1` |
| `.guard` | `0`、`1` |
| `.clearguarding` | `0`、`1` |
| `.clearguarded` | `0`、`1` |
| `.item` | `0`、`1` |
| `.curio` | `0`、`1` |
| `.dotShuffle` | `0`、`1` |
| `.kill` | `0`、`1` |
| `.immobilize` | `0`、`1` |
| `.unimmobilize` | `0`、`1` |
| `.uncontrol` | `0`、`1` |
| `.capture` | `0`、`1` |
| `.capture_remove_from_party` | `0`、`1` |
| `.remove_vampire` | `0`、`1` |
| `.summon_does_roll_initiatives` | `0`、`1` |
| `.performer_rank_target` | `0`、`1` |
| `.stealth` | `0`、`1` |
| `.unstealth` | `0`、`1` |
| `.clear_debuff` | `0`、`1` |
| `.clearvirtue` | `0`、`1` |
| `.cure_disease` | `0`、`1` |
| `.daze` | `0`、`1` |
| `.undaze` | `0`、`1` |
| `.on_hit` | `false`、`true` |
| `.on_miss` | `false`、`true` |
| `.queue` | `false`、`true` |
| `.can_crit_heal` | `false`、`true` |
| `.swap_source_and_target` | `false`、`true` |
| `.crit_doesnt_apply_to_roll` | `false`、`true` |
| `.can_apply_on_death` | `false`、`true` |
| `.apply_once` | `false`、`true` |
| `.apply_with_result` | `false`、`true` |
| `.skill_instant` | `false`、`true` |
| `.set_monster_class_reset_buffs` | `false`、`true` |
| `.set_monster_class_clear_initative` | `false`、`true` |
| `.set_monster_class_clear_monster_brain_cooldowns` | `false`、`true` |
| `.set_monster_class_reset_scale` | `false`、`true` |
| `.has_description` | `false`、`true` |
| `.skips_endless_wave_curio` | `false`、`true` |
| `.riposte_validate` | `false`、`true` |
| `.buff_is_clear_debuff_valid` | `false`、`true` |
| `.refreshes_skill_uses` | `false`、`true` |
| `.individual_target_actor_rolls` | `false`、`true` |
| `.summon_can_spawn_loot` | `false`、`true` |
| `.set_monster_class_reset_hp` | `false`、`true` |
| `.summon_erase_data_on_roll` | `false`、`true` |
| `.summon_rank_is_previous_monster_class` | `false`、`true` |

### buff_type → buff_sub_type 映射（12 项）

| buff_type | 允许的 buff_sub_type |
|---|---|
| `hp_heal_amount` | `hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`curio` |
| `hp_heal_percent` | `hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`curio` |
| `hp_heal_received_percent` | `hero_skill`、`hero_skill_multi_target`、`monster_skill`、`monster_skill_multi_target`、`camp_skill`、`camp_skill_multi_target`、`companion`、`eat`、`act_out`、`damage_heal`、`effect`、`flashback`、`dot`、`curio` |
| `combat_stat_multiply` | `max_hp`、`damage_low`、`damage_high`、`attack_rating`、`crit_chance`、`defense_rating`、`protection_rating`、`speed_rating`、`riposte_on_hit_chance`、`riposte_on_miss_chance` |
| `combat_stat_add` | `max_hp`、`damage_low`、`damage_high`、`attack_rating`、`crit_chance`、`defense_rating`、`protection_rating`、`speed_rating`、`riposte_on_hit_chance`、`riposte_on_miss_chance` |
| `resistance` | `stun`、`move`、`poison`、`bleed`、`disease`、`debuff`、`death_blow`、`trap` |
| `stress_dmg_percent` | `hunger`、`death_blow`、`hero_crit`、`hero_killing_blow`、`mode`、`control`、`unkown`、`town_idle`、`quest_fail`、`pass`、`camping_relieve_stress`、`camping_eat`、`tile`、`retreat`、`effect`、`capture`、`monster_crit` |
| `stress_dmg_received_percent` | `hunger`、`death_blow`、`hero_crit`、`hero_killing_blow`、`mode`、`control`、`unkown`、`town_idle`、`quest_fail`、`pass`、`camping_relieve_stress`、`camping_eat`、`tile`、`retreat`、`effect`、`capture`、`monster_crit` |
| `stress_heal_percent` | `hunger`、`death_blow`、`hero_crit`、`hero_killing_blow`、`mode`、`control`、`unkown`、`town_idle`、`quest_fail`、`pass`、`camping_relieve_stress`、`camping_eat`、`tile`、`retreat`、`effect`、`capture`、`monster_crit` |
| `stress_heal_received_percent` | `hunger`、`death_blow`、`hero_crit`、`hero_killing_blow`、`mode`、`control`、`unkown`、`town_idle`、`quest_fail`、`pass`、`camping_relieve_stress`、`camping_eat`、`tile`、`retreat`、`effect`、`capture`、`monster_crit` |
| `activity_side_effect_chance` | `add_currency`、`remove_currency`、`add_trinket`、`remove_trinket`、`activity_lock`、`apply_buff`、`go_missing` |
| `disable_combat_skill_attribute` | `heal`、`buff`、`debuff`、`bleed`、`poison`、`stun`、`tag`、`stress`、`move`、`guard`、`daze` |

## 附录 B：Info / Art / Override 静态语法数据

### 全部 Header（67 项）

`display_modifier:`、`riposte_skill:`、`rendering:`、`controlled:`、`health_bar:`、`mode:`、`hp_reaction:`、`death_reaction:`、`crit:`、`additional_effect:`、`display:`、`commonfx:`、`battle_backdrop:`、`wave_background:`、`stats:`、`skill:`、`personality:`、`loot:`、`tag:`、`enemy_type:`、`defending_area_pos_offset:`、`initiative:`、`monster_brain:`、`captor_empty:`、`captor_full:`、`life_link:`、`shared_health:`、`shape_shifter:`、`torchlight_modifier:`、`battle_modifier:`、`death_class:`、`death_damage:`、`life_time:`、`controller:`、`battle_stage:`、`companion:`、`skill_reaction:`、`audio_modifier:`、`spawn:`、`mash_modifier:`、`torch_settings:`、`kill_quirk:`、`tutorial:`、`wave_spawning:`、`colour_grade:`、`resistances:`、`weapon:`、`armour:`、`combat_skill:`、`combat_move_skill:`、`id_index:`、`sorting_index:`、`generation:`、`skill_selection:`、`incompatible_party_member:`、`deaths_door:`、`last_hero:`、`extra_battle_loot:`、`extra_curio_loot:`、`extra_shard_bonus:`、`extra_stack_limit:`、`progression:`、`overstressed_modifier:`、`activity_modifier:`、`quirk_modifier:`、`act_out_display:`、`restriction:`

### Header → 关键字映射（67 项）

| Header | 允许关键字 |
|---|---|
| `display_modifier:` | `.disable_halos`、`.disabled_popup_text_types`、`.use_centre_skill_announcement`、`.disable_health`、`.anim_override`、`.show_spawn_fx` |
| `riposte_skill:` | `.id`、`.dmg`、`.atk`、`.def`、`.move`、`.crit`、`.level`、`.type`、`.starting_cooldown`、`.per_battle_limit`、`.per_turn_limit`、`.is_continue_turn`、`.launch`、`.target`、`.self_target_valid`、`.extra_targets_chance`、`.extra_targets_count`、`.is_crit_valid`、`.effect`、`.valid_modes`、`.ignore_stealth`、`.ignore_guard`、`.can_miss`、`.can_be_riposted`、`.ignore_protection`、`.required_performer_hp_range`、`.rank_damage_modifiers`、`.heal`、`.can_crit_heal`、`.generation_guaranteed`、`.is_user_selected_targets`、`.is_knowledgeable`、`.is_monster_rerank_valid_on_attack`、`.is_monster_rerank_valid_on_friendly_presentation_end`、`.is_monster_rerank_valid_on_friendly_post_result`、`.is_stall_invalidating`、`.refresh_after_each_wave`、`.damage_heal_base_class_ids`、`.ignore_deathsdoor`、`.icon`、`.anim`、`.fx`、`.targfx`、`.targheadfx`、`.targchestfx`、`.misstargfx`、`.misstargheadfx`、`.misstargchestfx`、`.area_pos_offset`、`.target_area_pos_offset`、`.reset_source_stance`、`.reset_target_stance`、`.can_display_selection`、`.hide_performer_health`、`.condensed_tooltip_effects`、`.condensed_tooltip_stats`、`.condensed_tooltip_type`、`.condensed_tooltip_effects_per_line`、`.nil`、`.custom_target_anim`、`.has_crit_vo`、`.custom_idle_anim_name`、`.custom_idle_round_duration`、`.can_display_skill_name`、`.can_display_performer_selection_after_turn` |
| `rendering:` | `.sort_position_z_rank_override` |
| `controlled:` | `.target_rank` |
| `health_bar:` | `.type` |
| `mode:` | `.id`、`.is_raid_default`、`.bark_override_id`、`.stress_damage_per_turn`、`.battle_complete_combat_skill_id`、`.affliction_combat_skill_id`、`.always_guard_actor_base_class_ids`、`.is_targetable`、`.keep_rounds_in_ranks` |
| `hp_reaction:` | `.hp_ratio`、`.is_under`、`.effects` |
| `death_reaction:` | `.target_allies`、`.target_enemies`、`.effects` |
| `crit:` | `.effects`、`.is_valid_effects_target` |
| `additional_effect:` | `.is_valid_trinket_target`、`.is_valid_trinket_attacker` |
| `display:` | `.size` |
| `commonfx:` | `.deathfx` |
| `battle_backdrop:` | `.background_name`、`.animation`、`.isFlat` |
| `wave_background:` | `.background_name`、`.animation` |
| `stats:` | `.hp`、`.prot`、`.def`、`.spd`、`.stun_resist`、`.move_resist`、`.poison_resist`、`.bleed_resist`、`.disease_resist`、`.debuff_resist`、`.death_blow_resist`、`.trap_resist` |
| `skill:` | `.id`、`.dmg`、`.atk`、`.def`、`.move`、`.crit`、`.level`、`.type`、`.starting_cooldown`、`.per_battle_limit`、`.per_turn_limit`、`.is_continue_turn`、`.launch`、`.target`、`.self_target_valid`、`.extra_targets_chance`、`.extra_targets_count`、`.is_crit_valid`、`.effect`、`.valid_modes`、`.ignore_stealth`、`.ignore_guard`、`.can_miss`、`.can_be_riposted`、`.ignore_protection`、`.required_performer_hp_range`、`.rank_damage_modifiers`、`.heal`、`.can_crit_heal`、`.generation_guaranteed`、`.is_user_selected_targets`、`.is_knowledgeable`、`.is_monster_rerank_valid_on_attack`、`.is_monster_rerank_valid_on_friendly_presentation_end`、`.is_monster_rerank_valid_on_friendly_post_result`、`.is_stall_invalidating`、`.refresh_after_each_wave`、`.damage_heal_base_class_ids`、`.ignore_deathsdoor`、`.icon`、`.anim`、`.fx`、`.targfx`、`.targheadfx`、`.targchestfx`、`.misstargfx`、`.misstargheadfx`、`.misstargchestfx`、`.area_pos_offset`、`.target_area_pos_offset`、`.reset_source_stance`、`.reset_target_stance`、`.can_display_selection`、`.hide_performer_health`、`.condensed_tooltip_effects`、`.condensed_tooltip_stats`、`.condensed_tooltip_type`、`.condensed_tooltip_effects_per_line`、`.nil`、`.custom_target_anim`、`.has_crit_vo`、`.custom_idle_anim_name`、`.custom_idle_round_duration`、`.can_display_skill_name`、`.can_display_performer_selection_after_turn` |
| `death_damage:` | `.target_base_class_id`、`.target_damage` |
| `personality:` | `.prefskill` |
| `loot:` | `.code`、`.count`、`.raid_finish_quirk_class_id` |
| `tag:` | `.id` |
| `enemy_type:` | `.id` |
| `defending_area_pos_offset:` | `.offset` |
| `initiative:` | `.number_of_turns_per_round`、`.hide_indicator` |
| `monster_brain:` | `.id` |
| `captor_empty:` | `.performing_monster_captor_base_class`、`.captor_full_monster_class`、`.capture_effects`、`.reset_hp`、`.count_captor_full_damage` |
| `captor_full:` | `.captor_empty_monster_class`、`.release_on_death`、`.release_on_prisoner_at_deaths_door`、`.release_on_prisoner_affliction`、`.switch_class_on_death`、`.release_effects`、`.per_turn_damage_percent`、`.per_turn_stress_damage`、`.has_prisoner_overlay`、`.unique_first_action_sfx`、`.reset_hp`、`.use_previous_monster_class_hp`、`.add_current_hp`、`.use_bark_offset` |
| `life_link:` | `.base_class`、`.class`、`.does_spawn_loot`、`.is_death_class_valid` |
| `shared_health:` | `.id` |
| `shape_shifter:` | `.monster_class_ids`、`.monster_class_chances`、`.monster_class_valid_ranks`、`.round_frequency`、`.fx_name` |
| `torchlight_modifier:` | `.min`、`.max` |
| `battle_modifier:` | `.disable_stall_penalty`、`.does_count_towards_stall_penalty`、`.accelerate_stall_penalty`、`.can_surprise`、`.can_be_surprised`、`.always_surprise`、`.always_be_surprised`、`.can_relieve_stress_from_crit`、`.can_relieve_stress_from_killing_blow`、`.can_be_summon_rank`、`.does_count_as_monster_size_for_monster_brain`、`.does_count_as_guardable_for_monster_brain`、`.can_be_missed`、`.can_be_hit`、`.is_valid_friendly_target`、`.can_be_damaged_directly`、`.can_be_random_target`、`.can_be_guarded`、`.remove_on_retreat`、`.living_other_enemy_buffs`、`.living_hero_buff_instance_ids`、`.disabled_act_out_combat_start_turn_types` |
| `death_class:` | `.monster_class_id`、`.random_monster_class_ids`、`.random_monster_class_chances`、`.use_previous_monster_hp`、`.is_valid_on_bleed_dot`、`.is_valid_on_blight_dot`、`.is_valid_on_crit`、`.reset_scale_anim`、`.on_change_sfx`、`.type`、`.can_die_from_damage`、`.carry_over_hp_min_percent`、`.clear_monster_brain_cooldowns`、`.change_class_effects` |
| `life_time:` | `.alive_round_limit`、`.does_check_for_loot` |
| `controller:` | `.stress_per_controlled_turn`、`.uncontrol_effects` |
| `battle_stage:` | `.id` |
| `companion:` | `.monster_class`、`.heal_per_turn_percent`、`.buffs` |
| `skill_reaction:` | `.was_hit_performer_effects`、`.was_hit_target_effects`、`.was_killed_other_monsters_effects`、`.was_killed_by_hero_effects`、`.was_killed_all_heroes_effects`、`.was_killed_effects` |
| `audio_modifier:` | `.intensity`、`.variation_count`、`.ambience_parameter_ids`、`.ambience_parameter_values` |
| `spawn:` | `.effects`、`.wave_effects` |
| `mash_modifier:` | `.disable_additional_mash_for_infestation_sequence_on_death` |
| `torch_settings:` | `.torch_settings_id` |
| `kill_quirk:` |  |
| `tutorial:` | `.id` |
| `wave_spawning:` | `.prefers_front` |
| `colour_grade:` | `.name` |
| `resistances:` | `.stun`、`.move`、`.poison`、`.bleed`、`.disease`、`.debuff`、`.death_blow`、`.trap` |
| `weapon:` | `.name`、`.atk`、`.dmg`、`.crit`、`.spd`、`.icon`、`.upgradeRequirementCode` |
| `armour:` | `.name`、`.def`、`.prot`、`.hp`、`.spd`、`.icon`、`.upgradeRequirementCode` |
| `combat_skill:` | `.id`、`.dmg`、`.atk`、`.def`、`.move`、`.crit`、`.level`、`.type`、`.starting_cooldown`、`.per_battle_limit`、`.per_turn_limit`、`.is_continue_turn`、`.launch`、`.target`、`.self_target_valid`、`.extra_targets_chance`、`.extra_targets_count`、`.is_crit_valid`、`.effect`、`.valid_modes`、`.ignore_stealth`、`.ignore_guard`、`.can_miss`、`.can_be_riposted`、`.ignore_protection`、`.required_performer_hp_range`、`.rank_damage_modifiers`、`.heal`、`.can_crit_heal`、`.generation_guaranteed`、`.is_user_selected_targets`、`.is_knowledgeable`、`.is_monster_rerank_valid_on_attack`、`.is_monster_rerank_valid_on_friendly_presentation_end`、`.is_monster_rerank_valid_on_friendly_post_result`、`.is_stall_invalidating`、`.refresh_after_each_wave`、`.damage_heal_base_class_ids`、`.ignore_deathsdoor`、`.icon`、`.anim`、`.fx`、`.targfx`、`.targheadfx`、`.targchestfx`、`.misstargfx`、`.misstargheadfx`、`.misstargchestfx`、`.area_pos_offset`、`.target_area_pos_offset`、`.reset_source_stance`、`.reset_target_stance`、`.can_display_selection`、`.hide_performer_health`、`.condensed_tooltip_effects`、`.condensed_tooltip_stats`、`.condensed_tooltip_type`、`.condensed_tooltip_effects_per_line`、`.nil`、`.custom_target_anim`、`.has_crit_vo`、`.custom_idle_anim_name`、`.custom_idle_round_duration`、`.can_display_skill_name`、`.can_display_performer_selection_after_turn` |
| `combat_move_skill:` | `.id`、`.dmg`、`.atk`、`.def`、`.move`、`.crit`、`.level`、`.type`、`.starting_cooldown`、`.per_battle_limit`、`.per_turn_limit`、`.is_continue_turn`、`.launch`、`.target`、`.self_target_valid`、`.extra_targets_chance`、`.extra_targets_count`、`.is_crit_valid`、`.effect`、`.valid_modes`、`.ignore_stealth`、`.ignore_guard`、`.can_miss`、`.can_be_riposted`、`.ignore_protection`、`.required_performer_hp_range`、`.rank_damage_modifiers`、`.heal`、`.can_crit_heal`、`.generation_guaranteed`、`.is_user_selected_targets`、`.is_knowledgeable`、`.is_monster_rerank_valid_on_attack`、`.is_monster_rerank_valid_on_friendly_presentation_end`、`.is_monster_rerank_valid_on_friendly_post_result`、`.is_stall_invalidating`、`.refresh_after_each_wave`、`.damage_heal_base_class_ids`、`.ignore_deathsdoor`、`.icon`、`.anim`、`.fx`、`.targfx`、`.targheadfx`、`.targchestfx`、`.misstargfx`、`.misstargheadfx`、`.misstargchestfx`、`.area_pos_offset`、`.target_area_pos_offset`、`.reset_source_stance`、`.reset_target_stance`、`.can_display_selection`、`.hide_performer_health`、`.condensed_tooltip_effects`、`.condensed_tooltip_stats`、`.condensed_tooltip_type`、`.condensed_tooltip_effects_per_line`、`.nil`、`.custom_target_anim`、`.has_crit_vo`、`.custom_idle_anim_name`、`.custom_idle_round_duration`、`.can_display_skill_name`、`.can_display_performer_selection_after_turn` |
| `id_index:` | `.index` |
| `sorting_index:` | `.index` |
| `generation:` | `.is_generation_enabled`、`.number_of_positive_quirks_min`、`.number_of_positive_quirks_max`、`.number_of_negative_quirks_min`、`.number_of_negative_quirks_max`、`.number_of_class_specific_camping_skills`、`.number_of_shared_camping_skills`、`.number_of_random_combat_skills`、`.number_of_cards_in_deck`、`.card_chance`、`.reduce_number_of_cards_in_deck_hero_class_id`、`.reduce_number_of_cards_in_deck_amount`、`.town_event_dependency` |
| `skill_selection:` | `.can_select_combat_skills`、`.number_of_selected_combat_skills_max` |
| `incompatible_party_member:` | `.id`、`.hero_tag` |
| `deaths_door:` | `.buffs`、`.recovery_buffs`、`.recovery_heart_attack_buffs`、`.enter_effects`、`.enter_effect_round_cooldown` |
| `last_hero:` | `.buffs` |
| `extra_battle_loot:` | `.code`、`.count` |
| `extra_curio_loot:` | `.code`、`.count` |
| `extra_shard_bonus:` | `.amount` |
| `extra_stack_limit:` | `.id` |
| `progression:` | `.has_caretaker_goals` |
| `overstressed_modifier:` | `.override_trait_type_ids`、`.override_trait_type_chances` |
| `activity_modifier:` | `.override_valid_activity_ids`、`.override_stress_removal_amount_low`、`.override_stress_removal_amount_high` |
| `quirk_modifier:` | `.incompatible_class_ids` |
| `act_out_display:` | `.attack_friendly_anim`、`.attack_friendly_fx`、`.attack_friendly_targchestfx`、`.attack_friendly_sfx` |
| `restriction:` | `.enabled_dlc` |

### 固定参数值表（4 项）

| 数据表键 | 候选/合法值 |
|---|---|
| `BOOL` | `true`、`false` |
| `.disabled_act_out_combat_start_turn_types` | `nothing`、`bark_stress`、`change_pos`、`ignore_command`、`random_command`、`retreat_from_combat`、`attack_friendly`、`attack_self`、`mark_self`、`stress_heal_self`、`stress_heal_party`、`buff_random_party_member`、`buff_party`、`heal_self`、`consume_item` |
| `SKILL_TYPE` | `melee`、`ranged`、`move`、`teleport` |
| `.disabled_popup_text_types` | `actor_dot_complete`、`pass`、`hp_heal_dot_onset`、`hp_heal_dot`、`hp_heal_dot_crit`、`miss`、`no_damage`、`crit_damage`、`damage`、`death_avoided`、`deathblow`、`hero_heal`、`hero_heal_crit`、`monster_heal`、`monster_heal_crit`、`stress_reduce`、`stress_damage`、`resist`、`move_resist`、`disease_resist`、`buff`、`debuff`、`debuff_resist`、`stun`、`stun_resist`、`stun_clear`、`poison`、`poison_resist`、`bleed`、`bleed_resist`、`cured`、`cure_failed`、`tagged`、`guard`、`guard_failed`、`riposte`、`full`、`heart_attack`、`heal_failed`、`vampire`、`vampire_resist`、`stress_dot`、`stress_dot_resist`、`shuffle_dot`、`shuffle_dot_resist`、`health_damage_block_onset`、`health_damage_block`、`tag_block`、`damage_reflect`、`control_resist`、`refresh_skills`、`daze`、`daze_resist`、`guard_break` |

### 单字符串 32 字符规则（8 项）

| Header | 关键字 | 最大长度 |
|---|---|---:|
| `display_modifier:` | `.anim_override` | 32 |
| `mode:` | `.bark_override_id` | 32 |
| `shape_shifter:` | `.monster_class_ids` | 32 |
| `death_class:` | `.type` | 32 |
| `incompatible_party_member:` | `.id` | 32 |
| `extra_battle_loot:` | `.code` | 32 |
| `extra_curio_loot:` | `.code` | 32 |
| `restriction:` | `.enabled_dlc` | 32 |

### 单字符串 64 字符规则（85 项）

| Header | 关键字 | 最大长度 |
|---|---|---:|
| `riposte_skill:` | `.id` | 64 |
| `riposte_skill:` | `.type` | 64 |
| `riposte_skill:` | `.anim` | 64 |
| `riposte_skill:` | `.fx` | 64 |
| `riposte_skill:` | `.targfx` | 64 |
| `riposte_skill:` | `.targheadfx` | 64 |
| `riposte_skill:` | `.targchestfx` | 64 |
| `riposte_skill:` | `.misstargfx` | 64 |
| `riposte_skill:` | `.misstargheadfx` | 64 |
| `riposte_skill:` | `.misstargchestfx` | 64 |
| `riposte_skill:` | `.custom_target_anim` | 64 |
| `health_bar:` | `.type` | 64 |
| `commonfx:` | `.deathfx` | 64 |
| `commonfx:` | `.id` | 64 |
| `battle_backdrop:` | `.background_name` | 64 |
| `battle_backdrop:` | `.animation` | 64 |
| `wave_background:` | `.background_name` | 64 |
| `wave_background:` | `.animation` | 64 |
| `skill:` | `.id` | 64 |
| `skill:` | `.type` | 64 |
| `skill:` | `.anim` | 64 |
| `skill:` | `.fx` | 64 |
| `skill:` | `.targfx` | 64 |
| `skill:` | `.targheadfx` | 64 |
| `skill:` | `.targchestfx` | 64 |
| `skill:` | `.misstargfx` | 64 |
| `skill:` | `.misstargheadfx` | 64 |
| `skill:` | `.misstargchestfx` | 64 |
| `skill:` | `.custom_target_anim` | 64 |
| `loot:` | `.code` | 64 |
| `loot:` | `.raid_finish_quirk_class_id` | 64 |
| `tag:` | `.id` | 64 |
| `enemy_type:` | `.id` | 64 |
| `monster_brain:` | `.id` | 64 |
| `captor_empty:` | `.performing_monster_captor_base_class` | 64 |
| `captor_empty:` | `.captor_full_monster_class` | 64 |
| `captor_full:` | `.captor_empty_monster_class` | 64 |
| `life_link:` | `.base_class` | 64 |
| `life_link:` | `.class` | 64 |
| `shared_health:` | `.id` | 64 |
| `death_class:` | `.monster_class_id` | 64 |
| `death_damage:` | `.target_base_class_id` | 64 |
| `battle_stage:` | `.id` | 64 |
| `companion:` | `.monster_class` | 64 |
| `torch_settings:` | `.torch_settings_id` | 64 |
| `tutorial:` | `.id` | 64 |
| `colour_grade:` | `.name` | 64 |
| `weapon:` | `.name` | 64 |
| `weapon:` | `.icon` | 64 |
| `armour:` | `.name` | 64 |
| `armour:` | `.icon` | 64 |
| `combat_skill:` | `.id` | 64 |
| `combat_skill:` | `.icon` | 64 |
| `combat_skill:` | `.type` | 64 |
| `combat_skill:` | `.anim` | 64 |
| `combat_skill:` | `.fx` | 64 |
| `combat_skill:` | `.targfx` | 64 |
| `combat_skill:` | `.targheadfx` | 64 |
| `combat_skill:` | `.targchestfx` | 64 |
| `combat_skill:` | `.misstargfx` | 64 |
| `combat_skill:` | `.misstargheadfx` | 64 |
| `combat_skill:` | `.misstargchestfx` | 64 |
| `combat_skill:` | `.custom_target_anim` | 64 |
| `combat_move_skill:` | `.id` | 64 |
| `combat_move_skill:` | `.icon` | 64 |
| `combat_move_skill:` | `.type` | 64 |
| `combat_move_skill:` | `.anim` | 64 |
| `combat_move_skill:` | `.fx` | 64 |
| `combat_move_skill:` | `.targfx` | 64 |
| `combat_move_skill:` | `.targheadfx` | 64 |
| `combat_move_skill:` | `.targchestfx` | 64 |
| `combat_move_skill:` | `.misstargfx` | 64 |
| `combat_move_skill:` | `.misstargheadfx` | 64 |
| `combat_move_skill:` | `.misstargchestfx` | 64 |
| `combat_move_skill:` | `.custom_target_anim` | 64 |
| `generation:` | `.reduce_number_of_cards_in_deck_hero_class_id` | 64 |
| `generation:` | `.town_event_dependency` | 64 |
| `incompatible_party_member:` | `.hero_tag` | 64 |
| `extra_stack_limit:` | `.id` | 64 |
| `overstressed_modifier:` | `.id` | 64 |
| `act_out_display:` | `.attack_friendly_anim` | 64 |
| `act_out_display:` | `.attack_friendly_fx` | 64 |
| `act_out_display:` | `.attack_friendly_targchestfx` | 64 |
| `act_out_display:` | `.attack_friendly_sfx` | 64 |
| `mode:` | `.id` | 64 |

### 单字符串 128 字符规则（1 项）

| Header | 关键字 | 最大长度 |
|---|---|---:|
| `shape_shifter:` | `.fx_name` | 128 |

### 单字符串 512 字符规则（2 项）

| Header | 关键字 | 最大长度 |
|---|---|---:|
| `mode:` | `.battle_complete_combat_skill_id` | 512 |
| `mode:` | `.affliction_combat_skill_id` | 512 |

### 多字符串数量与长度规则（42 项）

| Header | 关键字 | 最大参数数 | 单参数最大长度 |
|---|---|---:|---:|
| `skill:` | `.effect` | 8 | 64 |
| `skill:` | `.valid_modes` | 4 | 64 |
| `skill:` | `.damage_heal_base_class_ids` | 4 | 64 |
| `riposte_skill:` | `.effect` | 8 | 64 |
| `riposte_skill:` | `.valid_modes` | 4 | 64 |
| `riposte_skill:` | `.damage_heal_base_class_ids` | 4 | 64 |
| `combat_skill:` | `.effect` | 8 | 64 |
| `combat_skill:` | `.valid_modes` | 4 | 64 |
| `combat_skill:` | `.damage_heal_base_class_ids` | 4 | 64 |
| `combat_move_skill:` | `.effect` | 8 | 64 |
| `combat_move_skill:` | `.valid_modes` | 4 | 64 |
| `combat_move_skill:` | `.damage_heal_base_class_ids` | 4 | 64 |
| `mode:` | `.always_guard_actor_base_class_ids` | 4 | 64 |
| `hp_reaction:` | `.effects` | 4 | 64 |
| `death_reaction:` | `.effects` | 4 | 64 |
| `crit:` | `.effects` | 4 | 64 |
| `captor_empty:` | `.capture_effects` | 4 | 64 |
| `captor_full:` | `.release_effects` | 4 | 64 |
| `battle_modifier:` | `.living_other_enemy_buffs` | 8 | 64 |
| `battle_modifier:` | `.living_hero_buff_instance_ids` | 8 | 64 |
| `death_class:` | `.random_monster_class_ids` | 4 | 64 |
| `death_class:` | `.change_class_effects` | 4 | 64 |
| `controller:` | `.uncontrol_effects` | 4 | 64 |
| `companion:` | `.buffs` | 8 | 64 |
| `skill_reaction:` | `.was_hit_performer_effects` | 4 | 64 |
| `skill_reaction:` | `.was_hit_target_effects` | 4 | 64 |
| `skill_reaction:` | `.was_killed_other_monsters_effects` | 4 | 64 |
| `skill_reaction:` | `.was_killed_by_hero_effects` | 4 | 64 |
| `skill_reaction:` | `.was_killed_all_heroes_effects` | 4 | 64 |
| `skill_reaction:` | `.was_killed_effects` | 4 | 64 |
| `audio_modifier:` | `.ambience_parameter_ids` | 4 | 64 |
| `spawn:` | `.effects` | 4 | 31 |
| `spawn:` | `.wave_effects` | 4 | 64 |
| `deaths_door:` | `.buffs` | 8 | 64 |
| `deaths_door:` | `.recovery_buffs` | 8 | 64 |
| `deaths_door:` | `.recovery_heart_attack_buffs` | 8 | 64 |
| `deaths_door:` | `.enter_effects` | 8 | 64 |
| `last_hero:` | `.buffs` | 8 | 64 |
| `overstressed_modifier:` | `.override_trait_type_ids` | 8 | 64 |
| `activity_modifier:` | `.override_valid_activity_ids` | 10 | 64 |
| `quirk_modifier:` | `.incompatible_class_ids` | 10 | 64 |
| `shape_shifter:` | `.monster_class_ids` | 4 | 32 |

### 仅参数数量规则（30 项）

| Header | 关键字 | 最大参数数 |
|---|---|---:|
| `skill:` | `.heal` | 2 |
| `skill:` | `.move` | 2 |
| `skill:` | `.rank_damage_modifiers` | 4 |
| `skill:` | `.area_pos_offset` | 2 |
| `skill:` | `.target_area_pos_offset` | 2 |
| `skill:` | `.required_performer_hp_range` | 2 |
| `riposte_skill:` | `.heal` | 2 |
| `riposte_skill:` | `.move` | 2 |
| `riposte_skill:` | `.rank_damage_modifiers` | 4 |
| `riposte_skill:` | `.area_pos_offset` | 2 |
| `riposte_skill:` | `.target_area_pos_offset` | 2 |
| `riposte_skill:` | `.required_performer_hp_range` | 2 |
| `combat_skill:` | `.heal` | 2 |
| `combat_skill:` | `.move` | 2 |
| `combat_skill:` | `.rank_damage_modifiers` | 4 |
| `combat_skill:` | `.area_pos_offset` | 2 |
| `combat_skill:` | `.target_area_pos_offset` | 2 |
| `combat_skill:` | `.required_performer_hp_range` | 2 |
| `combat_move_skill:` | `.heal` | 2 |
| `combat_move_skill:` | `.move` | 2 |
| `combat_move_skill:` | `.rank_damage_modifiers` | 4 |
| `combat_move_skill:` | `.area_pos_offset` | 2 |
| `combat_move_skill:` | `.target_area_pos_offset` | 2 |
| `combat_move_skill:` | `.required_performer_hp_range` | 2 |
| `defending_area_pos_offset:` | `.offset` | 2 |
| `shape_shifter:` | `.monster_class_chances` | 4 |
| `death_class:` | `.random_monster_class_chances` | 4 |
| `audio_modifier:` | `.ambience_parameter_values` | 4 |
| `weapon:` | `.dmg` | 2 |
| `overstressed_modifier:` | `.override_trait_type_chances` | 8 |
