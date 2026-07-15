import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	buildGovernanceDecisionFromRun,
	formatBlockerExplanation,
	formatGovernanceDecision,
	toGovernanceModelContext,
} from "../packages/phronesis-governance/src/artifact-summary-adapter.ts";
import {
	GOVERNANCE_STATE_ENTRY,
	linkageFromDecision,
	restoreGovernanceLinkage,
} from "../packages/phronesis-governance/src/governance-state.ts";
import { createPhronesisGovernanceExtension } from "../packages/phronesis-governance/src/index.ts";
import { triageIntent } from "../packages/phronesis-governance/src/intent-triage.ts";
import type { GovernanceDecision, PhronesisClient } from "../packages/phronesis-governance/src/phronesis-client.ts";

function decision(overrides: Partial<GovernanceDecision> = {}): GovernanceDecision {
	return {
		runId: "run-medical-rotation",
		goal: "做一个医院实习轮转管理系统",
		mode: "full-deliberation",
		status: "blocked",
		selectedRouteId: "S1",
		selectedRouteTitle: "院内运营优先路线",
		canProceedToCoding: false,
		blockers: ["科室容量规则尚未确认", "带教责任边界尚未确认"],
		unresolvedQuestions: [
			{ id: "ME-001", question: "每个科室每周期可接收多少实习生？" },
			{ id: "ME-002", question: "请假后补轮转由谁审批？" },
		],
		importantDecisions: ["优先采用院内运营路线"],
		allowedChangeAreas: [],
		forbiddenChangeAreas: ["package.json"],
		acceptanceCriteria: ["容量冲突可检测"],
		recommendedNextAction: "先确认容量和审批规则。",
		artifactPaths: ["/tmp/run/final-thinking-report.md"],
		...overrides,
	};
}

function fakeExtensionApi() {
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const entries: Array<{ type: string; customType: string; data: unknown }> = [];
	const messages: Array<{ content: string; details?: unknown }> = [];
	const api = {
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		on(event: string, handler: (...args: any[]) => any) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage(message: { content: string; details?: unknown }) {
			messages.push(message);
		},
	};
	return { api, tools, commands, handlers, entries, messages };
}

function fakeContext(branch: Array<{ type: string; customType?: string; data?: unknown }> = []) {
	return {
		cwd: "/tmp/example-workspace",
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "metis-session-1",
		},
		ui: {
			notify: vi.fn(),
			setWorkingMessage: vi.fn(),
		},
	};
}

describe("Phronesis governance intent triage", () => {
	it("classifies a scoped single-file fix as fast-path", () => {
		const result = triageIntent("修复 src/parser.ts 中 null 时崩溃的小 bug，只改这个文件");
		expect(result.mode).toBe("fast-path");
		expect(result.reason).toContain("风险较低");
	});

	it("classifies a hospital internship rotation system as full-deliberation", () => {
		const result = triageIntent("做一个医院实习轮转管理系统");
		expect(result.mode).toBe("full-deliberation");
		expect(result.matchedSignals).toContain("高风险领域");
	});
});

describe("Phronesis governance summaries and extension behavior", () => {
	it("renders blockers and questions naturally without injecting artifact bodies", () => {
		const summary = formatGovernanceDecision(decision());
		expect(summary).toContain("科室容量规则尚未确认");
		expect(summary).toContain("每个科室每周期可接收多少实习生");
		expect(summary).not.toContain("final-thinking-report.md");

		const context = toGovernanceModelContext(decision());
		expect(context).toContain("压缩摘要");
		expect(context).not.toContain("/tmp/run");
	});

	it("uses the same run for blocker follow-up and does not register a tool-call blocker", async () => {
		const startPlanning = vi.fn(async () => decision());
		const inspectRun = vi.fn(async () => decision());
		const client: PhronesisClient = {
			startPlanning,
			continuePlanning: vi.fn(async () => decision()),
			inspectRun,
		};
		const fake = fakeExtensionApi();
		createPhronesisGovernanceExtension({ client })(fake.api as never);
		const ctx = fakeContext();
		const inputHandler = fake.handlers.get("input")?.[0];
		expect(inputHandler).toBeTypeOf("function");

		const first = await inputHandler?.(
			{ type: "input", text: "做一个医院实习轮转管理系统", source: "interactive" },
			ctx,
		);
		expect(first).toEqual({ action: "handled" });
		expect(startPlanning).toHaveBeenCalledTimes(1);
		expect(fake.messages.at(-1)?.content).toContain("Coding Gate");

		const second = await inputHandler?.({ type: "input", text: "为什么 blocked", source: "interactive" }, ctx);
		expect(second).toEqual({ action: "handled" });
		expect(startPlanning).toHaveBeenCalledTimes(1);
		expect(inspectRun).toHaveBeenCalledWith("run-medical-rotation");
		expect(fake.messages.at(-1)?.content).toContain("为什么当前不能进入编码");
		expect(fake.handlers.has("tool_call")).toBe(false);
	});

	it("registers only opt-in governance tools and commands", () => {
		const fake = fakeExtensionApi();
		const client: PhronesisClient = {
			startPlanning: vi.fn(async () => decision()),
			continuePlanning: vi.fn(async () => decision()),
			inspectRun: vi.fn(async () => decision()),
		};
		createPhronesisGovernanceExtension({ client })(fake.api as never);
		expect([...fake.tools.keys()].sort()).toEqual(
			["phronesis_deliberate", "phronesis_explain_blockers", "phronesis_inspect"].sort(),
		);
		expect([...fake.commands.keys()].sort()).toEqual(["blockers", "governance", "plan"].sort());
		expect(fake.handlers.has("tool_call")).toBe(false);
	});

	it("does not start full Phronesis planning for governed input", async () => {
		const client: PhronesisClient = {
			startPlanning: vi.fn(async () => decision()),
			continuePlanning: vi.fn(async () => decision()),
			inspectRun: vi.fn(async () => decision()),
		};
		const fake = fakeExtensionApi();
		createPhronesisGovernanceExtension({ client })(fake.api as never);
		const inputHandler = fake.handlers.get("input")?.[0];
		const result = await inputHandler?.(
			{ type: "input", text: "给现有 API 增加一个可选字段", source: "interactive" },
			fakeContext(),
		);
		expect(result.action).toBe("transform");
		expect(result.text).toContain("级别=governed");
		expect(client.startPlanning).not.toHaveBeenCalled();
	});
});

describe("Phronesis session linkage", () => {
	it("persists and restores only compact linkage fields", () => {
		const linkage = linkageFromDecision(decision());
		const restored = restoreGovernanceLinkage([{ type: "custom", customType: GOVERNANCE_STATE_ENTRY, data: linkage }]);
		expect(restored?.phronesisRunId).toBe("run-medical-rotation");
		expect(restored?.pendingQuestionIds).toEqual(["ME-001", "ME-002"]);
		const serialized = JSON.stringify(restored);
		expect(serialized).not.toContain("artifactPaths");
		expect(serialized).not.toContain("final-thinking-report");
		expect(serialized).not.toContain("科室容量规则");
	});

	it("fork linkage can advance without overwriting the parent branch", () => {
		const parentLink = linkageFromDecision(decision({ runId: "parent-run" }));
		const parentBranch = [{ type: "custom", customType: GOVERNANCE_STATE_ENTRY, data: parentLink }];
		const childLink = linkageFromDecision(decision({ runId: "child-run", selectedRouteId: "S2" }));
		const childBranch = [...parentBranch, { type: "custom", customType: GOVERNANCE_STATE_ENTRY, data: childLink }];

		expect(restoreGovernanceLinkage(parentBranch)?.phronesisRunId).toBe("parent-run");
		expect(restoreGovernanceLinkage(childBranch)?.phronesisRunId).toBe("child-run");
		expect((parentBranch[0].data as { phronesisRunId: string }).phronesisRunId).toBe("parent-run");
	});

	it("restores the inherited run on session_start and inspects it without creating a run", async () => {
		const inherited = linkageFromDecision(decision({ runId: "inherited-run" }));
		const branch = [{ type: "custom", customType: GOVERNANCE_STATE_ENTRY, data: inherited }];
		const client: PhronesisClient = {
			startPlanning: vi.fn(async () => decision()),
			continuePlanning: vi.fn(async () => decision()),
			inspectRun: vi.fn(async () => decision({ runId: "inherited-run" })),
		};
		const fake = fakeExtensionApi();
		createPhronesisGovernanceExtension({ client })(fake.api as never);
		const ctx = fakeContext(branch);
		await fake.handlers.get("session_start")?.[0]?.({ type: "session_start", reason: "fork" }, ctx);
		await fake.handlers.get("input")?.[0]?.({ type: "input", text: "为什么阻断", source: "interactive" }, ctx);

		expect(client.inspectRun).toHaveBeenCalledWith("inherited-run");
		expect(client.startPlanning).not.toHaveBeenCalled();
	});
});

describe("Phronesis artifact adapter", () => {
	it("maps a Phronesis run into a compact GovernanceDecision", async () => {
		const runDir = mkdtempSync(path.join(tmpdir(), "phronesis-governance-run-"));
		writeFileSync(
			path.join(runDir, "goal.json"),
			JSON.stringify({ runId: "fixture-run", rawGoal: "做一个医院实习轮转管理系统" }),
		);
		writeFileSync(
			path.join(runDir, "selected-route.json"),
			JSON.stringify({
				selectedStrategyId: "S1",
				selectedTitle: "院内运营路线",
				selectionStatus: "blocked",
				canProceedToCoding: false,
				blockingReasons: ["科室容量证据不足"],
				requiredClarificationsBeforeCoding: ["ME-001: 每科容量是多少？"],
			}),
		);
		writeFileSync(
			path.join(runDir, "execution-task-graph.json"),
			JSON.stringify({
				canProceedToCoding: false,
				tasks: [{ id: "capacity", acceptanceCriteria: ["容量冲突可检测"] }],
			}),
		);
		writeFileSync(
			path.join(runDir, "coding-handoff.json"),
			JSON.stringify({ canProceedToCoding: false, handoffStatus: "blocked", requiredBeforeCoding: [] }),
		);

		const mapped = await buildGovernanceDecisionFromRun(runDir, "full-deliberation");
		expect(mapped.runId).toBe("fixture-run");
		expect(mapped.canProceedToCoding).toBe(false);
		expect(mapped.blockers).toContain("科室容量证据不足");
		expect(mapped.unresolvedQuestions).toEqual([{ id: "ME-001", question: "每科容量是多少？" }]);
		expect(mapped.acceptanceCriteria).toContain("容量冲突可检测");
	});

	it("keeps a conditional handoff conditional when clarification questions remain", async () => {
		const runDir = mkdtempSync(path.join(tmpdir(), "phronesis-governance-conditional-"));
		writeFileSync(path.join(runDir, "goal.json"), JSON.stringify({ runId: "conditional-run", rawGoal: "复杂系统" }));
		writeFileSync(
			path.join(runDir, "selected-route.json"),
			JSON.stringify({
				selectedStrategyId: "S1",
				selectionStatus: "selected",
				canProceedToCoding: true,
				blockingReasons: [],
				requiredClarificationsBeforeCoding: ["ME-001: 用户规模是多少？"],
			}),
		);
		writeFileSync(path.join(runDir, "execution-task-graph.json"), JSON.stringify({ canProceedToCoding: true, tasks: [] }));
		writeFileSync(
			path.join(runDir, "coding-handoff.json"),
			JSON.stringify({ handoffStatus: "conditional", canProceedToCoding: true, requiredBeforeCoding: [] }),
		);

		const mapped = await buildGovernanceDecisionFromRun(runDir, "full-deliberation");
		expect(mapped.status).toBe("conditional");
		expect(mapped.canProceedToCoding).toBe(true);
		expect(mapped.unresolvedQuestions).toEqual([{ id: "ME-001", question: "用户规模是多少？" }]);
		expect(formatGovernanceDecision(mapped)).toContain("有条件可进入编码");
		expect(formatBlockerExplanation(mapped)).toContain("用户规模是多少");
		expect(formatBlockerExplanation(mapped)).not.toContain("没有 Coding Gate 阻断项");
	});
});