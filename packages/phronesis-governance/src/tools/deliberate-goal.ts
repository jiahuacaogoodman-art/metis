import { Type } from "typebox";
import type { ToolDefinition } from "metis";
import { formatGovernanceDecision } from "../artifact-summary-adapter.ts";
import { applyRequestedDeliberationLevel, parseDeliberationLevel, triageIntent } from "../intent-triage.ts";
import type { GovernanceDecision, PhronesisClient } from "../phronesis-client.ts";

export interface GovernanceToolDependencies {
	client: PhronesisClient;
	recordDecision: (decision: GovernanceDecision) => void;
	currentRunId: () => string | undefined;
	currentMode: () => GovernanceDecision["mode"] | undefined;
}

const parameters = Type.Object({
	goal: Type.String({ description: "需要 Phronesis 规划的软件目标" }),
	level: Type.Optional(
		Type.Union(
			[Type.Literal("fast-path"), Type.Literal("governed"), Type.Literal("full-deliberation")],
			{ description: "可选的手动思辨级别；只能升级自动风险等级" },
		),
	),
});

export function createDeliberateGoalTool(dependencies: GovernanceToolDependencies): ToolDefinition<typeof parameters> {
	return {
		name: "phronesis_deliberate",
		label: "Phronesis 规划",
		description: "让 Phronesis 对复杂软件目标进行产品意图、路线竞争、评审与 Coding Gate 规划。",
		promptSnippet: "对从零系统、架构重构或高风险需求运行 Phronesis 治理规划。",
		parameters,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Phronesis planning aborted.");
			const triage = applyRequestedDeliberationLevel(triageIntent(params.goal), parseDeliberationLevel(params.level));
			const planned = await dependencies.client.startPlanning({
				goal: params.goal,
				workspace: ctx.cwd,
				sessionId: ctx.sessionManager.getSessionId(),
			});
			const decision = { ...planned, mode: triage.mode, triageReason: triage.reason };
			dependencies.recordDecision(decision);
			return {
				content: [{ type: "text", text: formatGovernanceDecision(decision) }],
				details: {
					runId: decision.runId,
					mode: decision.mode,
					status: decision.status,
					canProceedToCoding: decision.canProceedToCoding,
					blockerCount: decision.blockers.length,
				},
			};
		},
	};
}