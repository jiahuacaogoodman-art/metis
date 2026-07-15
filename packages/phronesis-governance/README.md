# Phronesis Governance for Metis

该扩展把 Metis 对话与 Phronesis 规划运行连接起来。第一阶段只提供意图分流、规划调用、治理摘要、阻断解释和 session-to-run linkage。

## 运行

```bash
export PHRONESIS_ROOT=/absolute/path/to/Phronesis
export PHRONESIS_THINK_MODE=hybrid
export PHRONESIS_TIMEOUT_MS=900000

metis -e ./packages/phronesis-governance/src/index.ts
```

扩展优先使用 Phronesis 本地安装的 `tsx`，并通过 `spawn` 参数数组调用结构化桥接器。它不解析 Phronesis 的人类可读 stdout，也不会拼接 shell 命令。

## 对话入口

- `/plan <目标>`：显式运行规划。
- `/plan --level full-deliberation <目标>`：手动升级思辨级别。
- `/governance`：读取当前 session 关联的治理摘要。
- `/blockers`：读取同一个 Phronesis run 并解释 Coding Gate 阻断项。

自动分流包括 `fast-path`、`governed` 和 `full-deliberation`。只有明显复杂的新系统目标会在 input event 中自动运行完整 Phronesis pipeline。

## Session linkage

扩展只在 Metis session 中保存以下精简字段：

- `phronesisRunId`
- `governanceMode`
- `gateStatus`
- `selectedRouteId`
- `pendingQuestionIds`
- `decisionSummaryVersion`

完整 Phronesis artifacts 仍保留在 Phronesis run 目录中。Resume 会从当前 branch 恢复 linkage；fork 只继承分叉点之前已经存在的 linkage。

## 本阶段边界

本扩展不注册 `tool_call` 阻断器，不修改 Metis 内置 `read`、`edit`、`write`、`bash` 工具，也不调用 Phronesis Native Coding Runtime。真正文件修改仍由 Metis 原生工具执行。