import type { ExtensionAPI, ExtensionContext } from "metis";
import {
	formatBlockerExplanation,
	formatGovernanceDecision,
	toGovernanceModelContext,
} from "./artifact-summary-adapter.ts";
import {
	GOVERNANCE_STATE_ENTRY,
	linkageFromDecision,
	restoreGovernanceLinkage,
	type GovernanceSessionLinkage,
} from "./governance-state.ts";
import {
	applyRequestedDeliberationLevel,
	isBlockerFollowUp,
	parseDeliberationLevel,
	triageIntent,
	type IntentTriageResult,
} from "./intent-triage.ts";
import {
	CliJsonPhronesisClient,
	type GovernanceDecision,
	type GovernanceMode,
	type PhronesisClient,
} from "./phronesis-client.ts";
import { createDeliberateGoalTool, type GovernanceToolDependencies } from "./tools/deliberate-goal.ts";
import { createExplainBlockersTool } from "./tools/explain-blockers.ts";
import { createInspectDeliberationTool } from "./tools/inspect-deliberation.ts";

const SUMMARY_MESSAGE_TYPE = "phronesis-governance-summary";

export interface PhronesisGovernanceExtensionOptions {
	client?: PhronesisClient;
}

interface PlanArguments {
	goal: string;
	requestedMode?: GovernanceMode;
}

function parsePlanArguments(raw: string): PlanArguments {
	const levelMatch = raw.match(/(?:^|\s)--level(?:=|\s+)(fast-path|governed|full-deliberation)(?=\s|$)/);
	const requestedMode = parseDeliberationLevel(levelMatch?.[1]);
	const goal = levelMatch ? `${raw.slice(0, levelMatch.index)} ${raw.slice((levelMatch.index ?? 0) + levelMatch[0].length)}`.trim() : raw.trim();
	return { goal: goal.replace(/^['"]|['"]$/g, "").trim(), requestedMode };
}

function compactMessageDetails(decision: GovernanceDecision) {
	return {
		runId: decision.runId,
		mode: decision.mode,
		status: decision.status,
		selectedRouteId: decision.selectedRouteId,
		canProceedToCoding: decision.canProceedToCoding,
		blockerCount: decision.blockers.length,
		pendingQuestionIds: decision.unresolvedQuestions.map((item) => item.id),
	};
}

export function createPhronesisGovernanceExtension(options: PhronesisGovernanceExtensionOptions = {}) {
	return function phronesisGovernanceExtension(metis: ExtensionAPI): void {
		const client = options.client ?? new CliJsonPhronesisClient();
		let linkage: GovernanceSessionLinkage | undefined;
		let lastTriage: IntentTriageResult | undefined;

		function restore(ctx: ExtensionContext): void {
			linkage = restoreGovernanceLinkage(ctx.sessionManager.getBranch());
		}

		function recordDecision(decision: GovernanceDecision): void {
			linkage = linkageFromDecision(decision);
			metis.appendEntry(GOVERNANCE_STATE_ENTRY, linkage);
		}

		function show(content: string, decision?: GovernanceDecision): void {
			metis.sendMessage(
				{
					customType: SUMMARY_MESSAGE_TYPE,
					content,
					display: true,
					details: decision ? compactMessageDetails(decision) : undefined,
				},
				{ triggerTurn: false },
			);
		}

		async function inspectLinkedRun(): Promise<GovernanceDecision | undefined> {
			if (!linkage) return undefined;
			const inspected = await client.inspectRun(linkage.phronesisRunId);
			const decision = { ...inspected, mode: linkage.governanceMode };
			recordDecision(decision);
			return decision;
		}

		async function plan(
			goal: string,
			ctx: ExtensionContext,
			requestedMode?: GovernanceMode,
		): Promise<GovernanceDecision> {
			lastTriage = applyRequestedDeliberationLevel(triageIntent(goal), requestedMode);
			const planned = await client.startPlanning({
				goal,
				workspace: ctx.cwd,
				sessionId: ctx.sessionManager.getSessionId(),
			});
			const decision = { ...planned, mode: lastTriage.mode, triageReason: lastTriage.reason };
			recordDecision(decision);
			return decision;
		}

		const toolDependencies: GovernanceToolDependencies = {
			client,
			recordDecision,
			currentRunId: () => linkage?.phronesisRunId,
			currentMode: () => linkage?.governanceMode,
		};
		metis.registerTool(createDeliberateGoalTool(toolDependencies));
		metis.registerTool(createInspectDeliberationTool(toolDependencies));
		metis.registerTool(createExplainBlockersTool(toolDependencies));

		metis.registerCommand("plan", {
			description: "运行 Phronesis 规划；可用 --level full-deliberation 手动升级",
			handler: async (args, ctx) => {
				const parsed = parsePlanArguments(args);
				if (!parsed.goal) {
					ctx.ui.notify("用法：/plan [--level governed|full-deliberation] <软件目标>", "warning");
					return;
				}
				ctx.ui.setWorkingMessage("Phronesis 正在规划…");
				try {
					const decision = await plan(parsed.goal, ctx, parsed.requestedMode);
					show(formatGovernanceDecision(decision), decision);
				} catch (error) {
					const message = error instanceof Error ? error.message : "未知错误";
					ctx.ui.notify(`Phronesis 规划失败：${message}`, "error");
				} finally {
					ctx.ui.setWorkingMessage();
				}
			},
		});

		metis.registerCommand("blockers", {
			description: "解释当前 session 关联的 Phronesis Coding Gate 阻断项",
			handler: async (_args, ctx) => {
				try {
					const decision = await inspectLinkedRun();
					if (!decision) {
						ctx.ui.notify("当前 session 尚未关联 Phronesis run。", "warning");
						return;
					}
					show(formatBlockerExplanation(decision), decision);
				} catch (error) {
					ctx.ui.notify(`读取 Phronesis 阻断信息失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
				}
			},
		});

		metis.registerCommand("governance", {
			description: "显示当前治理级别、run linkage、路线与 Coding Gate",
			handler: async (_args, ctx) => {
				try {
					const decision = await inspectLinkedRun();
					if (decision) {
						show(formatGovernanceDecision(decision), decision);
						return;
					}
					if (lastTriage) {
						show(`当前尚无 Phronesis run。最近一次意图分流为 ${lastTriage.mode}：${lastTriage.reason}`);
						return;
					}
					ctx.ui.notify("当前 session 尚无 Phronesis 治理状态。", "info");
				} catch (error) {
					ctx.ui.notify(`读取 Phronesis 治理状态失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
				}
			},
		});

		metis.on("session_start", (_event, ctx) => restore(ctx));
		metis.on("session_tree", (_event, ctx) => restore(ctx));

		metis.on("input", async (event, ctx) => {
			if (event.source === "extension") return { action: "continue" };

			if (isBlockerFollowUp(event.text) && linkage) {
				try {
					const decision = await inspectLinkedRun();
					if (decision) show(formatBlockerExplanation(decision), decision);
				} catch (error) {
					ctx.ui.notify(`读取同一 Phronesis run 失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
				}
				return { action: "handled" };
			}

			lastTriage = triageIntent(event.text);
			if (lastTriage.mode === "fast-path") return { action: "continue" };
			if (lastTriage.mode === "governed") {
				return {
					action: "transform",
					text: `${event.text}\n\n[Phronesis 意图分流] 级别=governed；原因=${lastTriage.reason}；沿用 Metis 原生 Agent Loop，不启动完整路线辩论。`,
					images: event.images,
				};
			}

			ctx.ui.setWorkingMessage("Phronesis 正在进行完整思辨…");
			try {
				const decision = await plan(event.text, ctx, "full-deliberation");
				if (!decision.canProceedToCoding || decision.unresolvedQuestions.length > 0) {
					show(formatGovernanceDecision(decision), decision);
					return { action: "handled" };
				}
				return {
					action: "transform",
					text: `${event.text}\n\n${toGovernanceModelContext(decision)}`,
					images: event.images,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : "未知错误";
				show(`Phronesis 规划失败：${message}\n\n本次没有生成治理决策，请检查 PHRONESIS_ROOT 与运行配置。`);
				return { action: "handled" };
			} finally {
				ctx.ui.setWorkingMessage();
			}
		});
	};
}

export default createPhronesisGovernanceExtension();