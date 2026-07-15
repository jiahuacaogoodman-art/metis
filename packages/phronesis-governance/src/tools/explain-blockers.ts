import { Type } from "typebox";
import type { ToolDefinition } from "metis";
import { formatBlockerExplanation } from "../artifact-summary-adapter.ts";
import type { GovernanceDecision } from "../phronesis-client.ts";
import type { GovernanceToolDependencies } from "./deliberate-goal.ts";

const parameters = Type.Object({
	runId: Type.Optional(Type.String({ description: "要解释的 Phronesis runId；省略时使用当前 session 关联的 run" })),
});

export function createExplainBlockersTool(dependencies: GovernanceToolDependencies): ToolDefinition<typeof parameters> {
	return {
		name: "phronesis_explain_blockers",
		label: "解释治理阻断",
		description: "解释当前 Phronesis Coding Gate 的主要阻断项和待确认问题，不创建新 run。",
		parameters,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal) {
			if (signal?.aborted) throw new Error("Phronesis blocker inspection aborted.");
			const runId = params.runId ?? dependencies.currentRunId();
			if (!runId) {
				return { content: [{ type: "text", text: "当前 session 尚未关联 Phronesis run，因此没有可解释的治理阻断。" }] };
			}
			const inspected = await dependencies.client.inspectRun(runId);
			const decision: GovernanceDecision = { ...inspected, mode: dependencies.currentMode() ?? inspected.mode };
			dependencies.recordDecision(decision);
			return {
				content: [{ type: "text", text: formatBlockerExplanation(decision) }],
				details: { runId, blockerCount: decision.blockers.length, pendingQuestionCount: decision.unresolvedQuestions.length },
			};
		},
	};
}