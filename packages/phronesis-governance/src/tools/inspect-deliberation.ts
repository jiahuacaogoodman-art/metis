import { Type } from "typebox";
import type { ToolDefinition } from "metis";
import { formatGovernanceDecision } from "../artifact-summary-adapter.ts";
import type { GovernanceDecision } from "../phronesis-client.ts";
import type { GovernanceToolDependencies } from "./deliberate-goal.ts";

const parameters = Type.Object({
	runId: Type.Optional(Type.String({ description: "要查看的 Phronesis runId；省略时使用当前 session 关联的 run" })),
});

export function createInspectDeliberationTool(dependencies: GovernanceToolDependencies): ToolDefinition<typeof parameters> {
	return {
		name: "phronesis_inspect",
		label: "查看 Phronesis 规划",
		description: "读取既有 Phronesis run 的治理摘要，不创建新 run。",
		parameters,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal) {
			if (signal?.aborted) throw new Error("Phronesis inspection aborted.");
			const runId = params.runId ?? dependencies.currentRunId();
			if (!runId) {
				return { content: [{ type: "text", text: "当前 session 尚未关联 Phronesis run。请先使用 /plan。" }] };
			}
			const inspected = await dependencies.client.inspectRun(runId);
			const decision: GovernanceDecision = { ...inspected, mode: dependencies.currentMode() ?? inspected.mode };
			dependencies.recordDecision(decision);
			return {
				content: [{ type: "text", text: formatGovernanceDecision(decision) }],
				details: { runId, status: decision.status, canProceedToCoding: decision.canProceedToCoding },
			};
		},
	};
}