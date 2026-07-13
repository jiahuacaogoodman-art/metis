<p align="center">
  <img src="src/modes/interactive/assets/metis-pixel-mark.svg" width="144" alt="Metis 像素标志" />
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <strong>帮助编程模型更快完成任务、记住重要信息，并验证最终结果。</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么选择-metis">为什么选择 Metis</a> ·
  <a href="#它为什么更可靠">可靠性</a>
</p>

---

## 快速开始

需要 Node.js `>=22.19.0` 和 npm。

```bash
npm i -g @wholiver_hu/metis@rc
metis
```

查看可用的命令行选项：

```bash
metis --help
```

## 为什么选择 Metis

Metis 是面向编程模型的 Agent 工作层。它不替换模型，而是为模型提供更好的搜索、记忆、执行和自检方式。

这意味着更少的重复上下文、更少遗漏的要求，以及更多真正完成并验证过的任务。

<p align="center">
  <img src="docs/images/metis-speed.zh-CN.svg" width="100%" alt="Metis 与 OpenCode 的用户实测任务完成时间对比" />
</p>

在一次使用相同任务的用户实测中：

- **Metis 用时 1 分 30 秒。**
- **OpenCode 用时 3 分 30 秒。**
- 该次测试中没有观察到准确率差异。

在这次对比中，Metis 使用的时间减少了约 57%。这只是一次用户测试，并非通用基准；实际结果会受到任务、模型、工具和运行环境影响。

## 它为什么更可靠

<p align="center">
  <img src="docs/images/metis-capabilities.zh-CN.svg" width="100%" alt="Metis 的记忆、Dream、搜索和验证能力" />
</p>

### Memory 与 Lessons

Metis 会在开始技术任务前检查自己的知识地图。它可以复用之前会话中的相关决策、项目知识和技术经验，不必每次都从头发现。

### Dream

Dream 会整理已完成的工作，把有价值的记录归纳为结构化记忆和技术经验。临时任务上下文能够转化为可复用知识，低价值细节则可以被清理。

### 先搜索，再行动

Metis 会先调查，再修改。它先搜索代码仓库，并在需要时通过 Web 搜索核对权威文档、已知解决方案、版本说明或安全信息。

### 日志与验证

Metis 会记录有意义的错误和任务完成摘要。在宣布完成之前，它会把结果与用户最初的 Prompt 对比，逐项检查要求、限制条件和后续补充；如果项目提供构建、测试或功能检查，也会运行相关验证。

这些机制让同一个编程模型获得更完整的上下文、更少的假设，以及更可靠的任务闭环，从而提升实际编码表现。

## 工作方式

<p align="center">
  <img src="docs/images/metis-workflow.zh-CN.svg" width="100%" alt="Metis 工作流：理解、执行、验证" />
</p>

1. **理解** — 阅读需求、回忆相关经验，并调查代码仓库。
2. **执行** — 进行聚焦修改，同时保留有用的工作记录。
3. **验证** — 测试结果，并与用户最初的要求进行对比。

<details>
<summary><strong>开发者信息</strong></summary>

### 接口

Metis 支持交互式终端、Print 和 JSON 输出、RPC 集成，以及面向 Node.js 应用的 SDK。

软件包从 `@wholiver_hu/metis` 导出 SDK，从 `@wholiver_hu/metis/rpc-entry` 导出 RPC 入口。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 编译 TypeScript 并复制运行时资源。 |
| `npm test` | 运行 Vitest 测试。 |
| `npm run clean` | 删除编译输出。 |
| `npm run build:binary` | 构建独立二进制文件。 |

</details>

## 参与贡献

欢迎参与 Metis 开发。核心功能开发、Extension 接入、Package 分发、测试与 AI 辅助开发说明见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。

## 许可证

本项目使用 [MIT License](https://opensource.org/license/mit)。
