import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GovernanceDecision, GovernanceMode, GovernanceQuestion } from "./phronesis-client.ts";

type JsonRecord = Record<string, unknown>;

const KEY_ARTIFACTS = [
	"goal.json",
	"product-intent.json",
	"selected-route.json",
	"execution-task-graph.json",
	"coding-handoff.json",
	"pre-coding-resolution-pack.json",
	"final-thinking-report.md",
] as const;

function record(value: unknown): JsonRecord | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function texts(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(text).filter((item): item is string => Boolean(item));
}

function unique(values: Array<string | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function readJson(runDir: string, filename: string): Promise<JsonRecord | undefined> {
	const target = path.join(runDir, filename);
	if (!existsSync(target) || statSync(target).size > 10 * 1024 * 1024) return undefined;
	try {
		return record(JSON.parse(await readFile(target, "utf8")));
	} catch {
		return undefined;
	}
}

function routeId(selected: JsonRecord | undefined, handoff: JsonRecord | undefined): string | undefined {
	return text(selected?.selectedStrategyId) ?? text(selected?.selectedRouteId) ?? text(handoff?.selectedRouteId);
}

function routeTitle(selected: JsonRecord | undefined, handoff: JsonRecord | undefined): string | undefined {
	return text(selected?.selectedTitle) ?? text(selected?.selectedRouteTitle) ?? text(handoff?.selectedRouteTitle);
}

function questions(values: string[]): GovernanceQuestion[] {
	return unique(values)
		.filter((value) => !/Critic:|Selected route has/i.test(value))
		.map((question, index) => {
			const match = question.match(/^([A-Za-z]+-\d+)\s*[:：]\s*(.+)$/);
			return match ? { id: match[1], question: match[2].trim() } : { id: `Q-${index + 1}`, question };
		});
}

function taskRecords(graph: JsonRecord | undefined): JsonRecord[] {
	return Array.isArray(graph?.tasks) ? graph.tasks.map(record).filter((item): item is JsonRecord => Boolean(item)) : [];
}

function decisionNotes(selected: JsonRecord | undefined, selectedRouteTitle: string | undefined): string[] {
	const candidates = [
		...texts(selected?.selectionRationale),
		...texts(selected?.rationale),
		text(selected?.selectionNarrative),
		text(selected?.whySelected),
	];
	if (selectedRouteTitle) candidates.unshift(`当前路线：${selectedRouteTitle}`);
	return unique(candidates).slice(0, 8);
}

async function changeAreas(runDir: string): Promise<{ allowed: string[]; forbidden: string[] }> {
	const packagesDir = path.join(runDir, "coding-task-packages");
	if (!existsSync(packagesDir) || !statSync(packagesDir).isDirectory()) return { allowed: [], forbidden: [] };
	const allowed: string[] = [];
	const forbidden: string[] = [];
	for (const filename of readdirSync(packagesDir)) {
		if (!filename.endsWith(".json")) continue;
		const task = await readJson(packagesDir, filename);
		allowed.push(...texts(task?.allowedChangeAreas));
		forbidden.push(...texts(task?.forbiddenChangeAreas));
	}
	return { allowed: unique(allowed), forbidden: unique(forbidden) };
}

export function validateGovernanceDecision(decision: GovernanceDecision): GovernanceDecision {
	if (!decision.runId || !decision.goal || typeof decision.canProceedToCoding !== "boolean") {
		throw new Error("GovernanceDecision is missing required identity or gate fields.");
	}
	for (const field of [
		"blockers",
		"unresolvedQuestions",
		"importantDecisions",
		"allowedChangeAreas",
		"forbiddenChangeAreas",
		"acceptanceCriteria",
		"artifactPaths",
	] as const) {
		if (!Array.isArray(decision[field])) throw new Error(`GovernanceDecision.${field} must be an array.`);
	}
	return decision;
}

export async function buildGovernanceDecisionFromRun(
	runDirInput: string,
	mode: GovernanceMode,
): Promise<GovernanceDecision> {
	const runDir = path.resolve(runDirInput);
	if (!existsSync(runDir) || !statSync(runDir).isDirectory()) throw new Error(`Phronesis run directory not found: ${runDir}`);

	const [goal, selected, graph, handoff, preCoding] = await Promise.all([
		readJson(runDir, "goal.json"),
		readJson(runDir, "selected-route.json"),
		readJson(runDir, "execution-task-graph.json"),
		readJson(runDir, "coding-handoff.json"),
		readJson(runDir, "pre-coding-resolution-pack.json"),
	]);
	const areas = await changeAreas(runDir);
	const runId = text(goal?.runId) ?? path.basename(runDir);
	const rawGoal = text(goal?.rawGoal) ?? text(handoff?.goal) ?? "未记录目标";
	const selectedRouteId = routeId(selected, handoff);
	const selectedRouteTitle = routeTitle(selected, handoff);

	const selectedGate = selected?.canProceedToCoding === true;
	const graphGate = graph?.canProceedToCoding !== false;
	const handoffGate = handoff?.canProceedToCoding !== false;
	const canProceedToCoding = selectedGate && graphGate && handoffGate;
	const routeStatus = text(handoff?.handoffStatus) ?? text(selected?.selectionStatus);
	const status = canProceedToCoding
		? routeStatus === "conditional"
			? "conditional"
			: "ready"
		: routeStatus === "conditional"
			? "conditional"
			: "blocked";

	const directBlockers = unique([
		...texts(selected?.blockingReasons),
		...texts(graph?.globalBlockingReasons),
		...texts(handoff?.requiredBeforeCoding),
	]);
	const blockers = status === "blocked" ? unique([...directBlockers, ...texts(preCoding?.blockingReasons)]) : directBlockers;
	const unresolvedQuestionTexts = unique([
		...texts(selected?.requiredClarificationsBeforeCoding),
		...texts(graph?.requiredClarificationsBeforeCoding),
		...texts(preCoding?.requiredClarifications),
		...texts(preCoding?.unresolvedTechnicalQuestions),
	]);
	const acceptanceCriteria = unique([
		...taskRecords(graph).flatMap((task) => texts(task.acceptanceCriteria)),
		...texts(handoff?.acceptanceTestStrategy),
	]).slice(0, 20);
	const artifactPaths = KEY_ARTIFACTS.map((filename) => path.join(runDir, filename)).filter(existsSync);

	return validateGovernanceDecision({
		runId,
		goal: rawGoal,
		mode,
		status,
		selectedRouteId,
		selectedRouteTitle,
		canProceedToCoding,
		blockers,
		unresolvedQuestions: questions(unresolvedQuestionTexts),
		importantDecisions: decisionNotes(selected, selectedRouteTitle),
		allowedChangeAreas: areas.allowed,
		forbiddenChangeAreas: areas.forbidden,
		acceptanceCriteria,
		recommendedNextAction: unresolvedQuestionTexts.length > 0
			? "先回答未决问题；只有 Phronesis 重新确认后，才按有条件任务范围继续。"
			: canProceedToCoding
			? "按已批准范围让 Metis 继续实现，并保留测试与验收证据。"
			: "先回答未决问题并解决阻断项，再让 Phronesis 重新评估 Coding Gate。",
		artifactPaths,
	});
}

const MODE_LABELS: Record<GovernanceMode, string> = {
	"fast-path": "快速路径",
	governed: "治理路径",
	"full-deliberation": "完整思辨",
};

export function formatGovernanceDecision(decision: GovernanceDecision): string {
	const gate = decision.canProceedToCoding
		? decision.status === "conditional"
			? "有条件可进入编码（仍须满足条件）"
			: "可进入编码"
		: "暂不可进入编码";
	const route = decision.selectedRouteTitle
		? `${decision.selectedRouteId ? `${decision.selectedRouteId} - ` : ""}${decision.selectedRouteTitle}`
		: "尚未选定";
	const lines = [
		"## Phronesis 治理摘要",
		"",
		`- 当前目标：${decision.goal}`,
		`- 思辨级别：${MODE_LABELS[decision.mode]}${decision.triageReason ? `（${decision.triageReason}）` : ""}`,
		`- Phronesis Run：${decision.runId}`,
		`- 当前路线：${route}`,
		`- Coding Gate：${gate}`,
	];

	if (decision.blockers.length > 0) {
		lines.push("", "### 主要阻断项", ...decision.blockers.slice(0, 5).map((item) => `- ${item}`));
	}
	if (decision.unresolvedQuestions.length > 0) {
		lines.push(
			"",
			"### 需要你确认",
			...decision.unresolvedQuestions.slice(0, 5).map((item) => `- ${item.id}：${item.question}`),
		);
	}
	lines.push("", `### 推荐下一步\n${decision.recommendedNextAction}`);
	return lines.join("\n");
}

export function formatBlockerExplanation(decision: GovernanceDecision): string {
	if (
		decision.canProceedToCoding &&
		decision.status === "ready" &&
		decision.blockers.length === 0 &&
		decision.unresolvedQuestions.length === 0
	) {
		return `Phronesis Run ${decision.runId} 当前没有 Coding Gate 阻断项。`;
	}
	const lines = [
		decision.status === "conditional"
			? `## 当前仍需满足哪些编码条件（Run ${decision.runId}）`
			: `## 为什么当前不能进入编码（Run ${decision.runId}）`,
		"",
		...decision.blockers.slice(0, 5).map((item) => `- ${item}`),
	];
	if (decision.unresolvedQuestions.length > 0) {
		lines.push("", "需要补充的信息：", ...decision.unresolvedQuestions.slice(0, 5).map((item) => `- ${item.id}：${item.question}`));
	}
	lines.push("", `下一步：${decision.recommendedNextAction}`);
	return lines.join("\n");
}

export function toGovernanceModelContext(decision: GovernanceDecision): string {
	const blockers = decision.blockers.slice(0, 5).join("；") || "无";
	const questions = decision.unresolvedQuestions
		.slice(0, 5)
		.map((item) => `${item.id}:${item.question}`)
		.join("；") || "无";
	return [
		"[Phronesis 治理上下文（压缩摘要，不含完整 artifacts）]",
		`runId=${decision.runId}`,
		`级别=${decision.mode}`,
		`路线=${decision.selectedRouteId ?? "未选定"}:${decision.selectedRouteTitle ?? "未选定"}`,
		`可进入编码=${decision.canProceedToCoding ? "是" : "否"}`,
		`主要阻断=${blockers}`,
		`待确认=${questions}`,
		`约束：保持产品范围与已选路线，不自行重新解释需求。`,
	].join("\n");
}