# 贡献指南

感谢你参与 Metis 开发。本文面向核心功能开发者、Extension 作者和 Package 维护者，说明如何理解项目、实施修改、验证结果并提交贡献。

如果你使用 AI 编码智能体协助开发，请同时阅读 [AGENTS.md](AGENTS.md)。该文件为智能体提供仓库地图、执行顺序和验证要求。

## 开始之前

- 使用 Node.js `>=22.19.0`。
- 先搜索相关 Issue、文档和现有实现，避免重复功能。
- 保持改动聚焦；不要顺手重写无关模块。
- 不要提交 API Key、Token、会话日志、`.env`、`dist/` 或本地索引。
- Extension 具有当前用户的完整系统权限，只运行和分发可信代码。

## 本地开发

```bash
git clone https://github.com/Wholiver/metis.git
cd metis
npm install
npm run build
npm test
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 清理 `dist/`、编译 TypeScript、复制运行时资源。 |
| `npm test` | 运行完整 Vitest 测试。 |
| `npm test -- test/example.test.ts` | 运行指定测试文件。 |
| `npm run clean` | 删除构建输出。 |
| `npm run build:binary` | 构建独立二进制和资源。 |

如果构建或测试挂起，不要直接宣称通过。记录停留阶段、相关进程和已尝试的恢复方式，然后在 Pull Request 中说明。

## 仓库结构

| 路径 | 责任 |
| --- | --- |
| `src/main.ts` | CLI 启动、参数处理、运行模式选择与顶层编排。 |
| `src/core/` | Agent Session、SDK、设置、模型注册、资源加载和核心运行时。 |
| `src/core/tools/` | 模型可调用的内置工具。 |
| `src/core/extensions/` | Extension 加载、生命周期事件、注册 API 和执行器。 |
| `src/core/builtins/` | Dream 等内置能力。 |
| `src/modes/interactive/` | 交互式终端模式、组件、主题和渲染。 |
| `src/modes/print-mode.ts` | Print 与 JSON 输出模式。 |
| `src/modes/rpc/` | RPC 服务端、客户端和进程集成。 |
| `src/index.ts` | 公共 SDK 与类型导出。 |
| `vendor/` | 本仓库使用的本地依赖包；除非任务明确涉及，不要随意修改。 |
| `test/` | Vitest 测试与必要夹具。 |
| `docs/` | 用户、Extension、Package、SDK 与平台文档。 |
| `examples/extensions/` | 可运行的 Extension 示例。 |

修改公共类型或导出时，检查 `src/index.ts`、SDK、RPC 和相关文档是否需要同步。

## 核心功能开发流程

1. **确认需求**：列出用户要求、兼容性限制和验收条件。
2. **定位实现**：优先查找现有抽象、调用方和测试，避免重复实现。
3. **设计最小改动**：明确状态归属、错误边界、取消行为和不同运行模式的影响。
4. **实施**：遵循现有 TypeScript、ESM、命名和错误处理模式。
5. **测试**：覆盖成功、失败、取消、空输入、边界输入和回归路径。
6. **复核需求**：完成前逐项对照原始需求和后续补充。
7. **更新文档**：用户可见行为、配置、命令、API 或 Extension 接口发生变化时必须更新文档。

涉及资源路径时使用 `src/config.ts` 中的路径函数，不要依赖 `__dirname` 推断软件包资源位置。

## Extension（插件）接入

Metis 中的插件接口称为 **Extension**。Extension 是 TypeScript 或 JavaScript 模块，可以：

- 注册模型可调用的工具；
- 注册 `/command`、快捷键和 CLI Flag；
- 监听并拦截 Session、Agent、Model、Tool 等生命周期事件；
- 添加交互式 UI、状态栏、Widget 和自定义渲染；
- 保存自定义 Session 状态；
- 接入 Webhook、CI、文件监听器或外部服务。

### 最小 Extension

创建 `.metis/extensions/hello.ts`：

```typescript
import type { ExtensionAPI } from "metis";
import { Type } from "typebox";

export default function (metis: ExtensionAPI) {
  metis.registerTool({
    name: "hello",
    label: "Hello",
    description: "Return a greeting",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  metis.registerCommand("hello", {
    description: "Show a greeting",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello, ${args || "world"}!`, "info");
    },
  });
}
```

快速加载：

```bash
node dist/cli.js -e ./.metis/extensions/hello.ts
```

自动发现位置：

| 位置 | 作用域 |
| --- | --- |
| `~/.metis/agent/extensions/*.ts` | 所有项目。 |
| `~/.metis/agent/extensions/*/index.ts` | 所有项目，目录形式。 |
| `.metis/extensions/*.ts` | 当前可信项目。 |
| `.metis/extensions/*/index.ts` | 当前可信项目，目录形式。 |

自动发现的 Extension 可以通过 `/reload` 热重载。项目级 Extension 只会在用户信任项目后加载。

### Extension 开发要求

- 为 Tool 参数提供明确、严格的 TypeBox Schema。
- 尊重 `AbortSignal`，长任务应支持取消。
- 错误信息必须说明失败原因和恢复方式，不要静默吞错。
- 危险写入、删除、提权或外部发布操作需要清晰确认边界。
- 同时考虑 `tui`、`print`、`json` 和 `rpc` 模式；UI 不可用时提供降级行为。
- 长期资源在 `session_shutdown` 等生命周期中释放。
- 第三方运行时依赖放在 `dependencies`，不要只放在 `devDependencies`。

完整接口见 [docs/extensions.md](docs/extensions.md)，自定义模型提供商见 [docs/custom-provider.md](docs/custom-provider.md)。

## 分发 Metis Package

Package 可以同时分发 Extensions、Skills、Prompt Templates 和 Themes。推荐结构：

```text
my-metis-package/
  package.json
  extensions/
  skills/
  prompts/
  themes/
```

`package.json` 示例：

```json
{
  "name": "my-metis-package",
  "keywords": ["metis-package"],
  "metis": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  },
  "peerDependencies": {
    "metis": "*",
    "typebox": "*"
  }
}
```

安装和测试：

```bash
metis install ./my-metis-package
metis install -l ./my-metis-package
metis list
metis update --extensions
metis remove ./my-metis-package
```

`-l` 写入项目设置；不带 `-l` 时写入用户设置。npm、git、URL 和本地路径均可作为安装来源。完整格式见 [docs/packages.md](docs/packages.md)。

## 测试要求

按改动风险选择测试，不要只运行最方便的一项：

- 核心运行时：构建、类型检查、相关单元测试、失败与取消路径。
- CLI：参数组合、TTY/非 TTY、退出码、stdin/stdout/stderr。
- TUI：键盘操作、布局、窄终端、明暗主题和不可交互环境。
- Extension：加载、重载、事件顺序、工具结果、取消、错误与不同 Mode。
- Package：本地安装、生产依赖、资源发现、启用/禁用和卸载。
- 文档与 SVG：链接、示例命令、XML、明暗模式和移动端缩放。

修复 Bug 时先添加能够复现问题的测试，再验证修复后测试通过。

## Pull Request

提交前确认：

- [ ] 改动范围与 Issue/需求一致，没有无关重构。
- [ ] 新行为有测试，原有测试没有被无理由删除或放宽。
- [ ] `npm run build` 和相关测试通过；无法运行时已说明原因。
- [ ] 用户可见变化已更新 README、`docs/` 或示例。
- [ ] 没有提交 Secret、日志、生成目录或本地状态。
- [ ] PR 描述包含改动原因、用户影响、验证方式和已知限制。

提交信息使用 Conventional Commits，例如：

```text
feat(extensions): add tool cancellation hook
fix(rpc): preserve request error details
docs: add package integration guide
```
