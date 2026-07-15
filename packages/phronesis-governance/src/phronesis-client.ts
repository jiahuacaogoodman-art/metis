import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGovernanceDecisionFromRun, validateGovernanceDecision } from "./artifact-summary-adapter.ts";

export type GovernanceMode = "fast-path" | "governed" | "full-deliberation";
export type GovernanceStatus = "ready" | "conditional" | "blocked" | "failed";

export interface GovernanceQuestion {
	id: string;
	question: string;
}

export interface GovernanceDecision {
	runId: string;
	goal: string;
	mode: GovernanceMode;
	status: GovernanceStatus;
	selectedRouteId?: string;
	selectedRouteTitle?: string;
	canProceedToCoding: boolean;
	blockers: string[];
	unresolvedQuestions: GovernanceQuestion[];
	importantDecisions: string[];
	allowedChangeAreas: string[];
	forbiddenChangeAreas: string[];
	acceptanceCriteria: string[];
	recommendedNextAction: string;
	artifactPaths: string[];
	triageReason?: string;
	parentRunId?: string;
}

export interface PhronesisClient {
	startPlanning(input: { goal: string; workspace: string; sessionId: string }): Promise<GovernanceDecision>;
	continuePlanning(input: { runId: string; userMessage: string }): Promise<GovernanceDecision>;
	inspectRun(runId: string): Promise<GovernanceDecision>;
}

interface BridgeRequest {
	action: "start";
	goal: string;
	workspace: string;
	sessionId: string;
	parentRunId?: string;
}

interface BridgeResult {
	ok: boolean;
	runId?: string;
	runDir?: string;
	error?: { code?: string; message?: string };
}

export interface CliJsonPhronesisClientOptions {
	phronesisRoot?: string;
	timeoutMs?: number;
	pnpmCommand?: string;
	env?: NodeJS.ProcessEnv;
}

export class PhronesisClientError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.code = code;
		this.name = "PhronesisClientError";
	}
}

const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_ERROR_PREVIEW = 2_000;

function asPositiveInteger(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function packageRootFromModule(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function resolvePhronesisRoot(explicitRoot?: string): string {
	const metisRoot = packageRootFromModule();
	const candidates = [
		explicitRoot,
		process.env.PHRONESIS_ROOT,
		path.resolve(metisRoot, "../Phronesis"),
		path.resolve(metisRoot, "../deliberative-thinking-agent-core"),
		path.resolve(process.cwd(), "../Phronesis"),
		path.resolve(process.cwd(), "../deliberative-thinking-agent-core"),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		const resolved = path.resolve(candidate);
		if (existsSync(path.join(resolved, "package.json")) && existsSync(path.join(resolved, "src", "run-manager.ts"))) {
			return resolved;
		}
	}

	throw new PhronesisClientError(
		"PHRONESIS_ROOT_NOT_FOUND",
		"未找到 Phronesis。请设置 PHRONESIS_ROOT 指向 Phronesis 仓库根目录。",
	);
}

function resolveBridgePath(): string {
	const sourcePath = fileURLToPath(new URL("./phronesis-runner-bridge.ts", import.meta.url));
	if (existsSync(sourcePath)) return sourcePath;
	const builtPath = fileURLToPath(new URL("./phronesis-runner-bridge.js", import.meta.url));
	if (existsSync(builtPath)) return builtPath;
	throw new PhronesisClientError("PHRONESIS_BRIDGE_NOT_FOUND", "Phronesis 结构化桥接器不存在。");
}

function resolveLocalTsxCli(root: string): string | undefined {
	const direct = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
	if (existsSync(direct)) return direct;
	const pnpmStore = path.join(root, "node_modules", ".pnpm");
	if (!existsSync(pnpmStore)) return undefined;
	const candidates = readdirSync(pnpmStore)
		.filter((entry) => entry.startsWith("tsx@"))
		.sort()
		.reverse()
		.map((entry) => path.join(pnpmStore, entry, "node_modules", "tsx", "dist", "cli.mjs"));
	return candidates.find(existsSync);
}

function assertRunId(runId: string): void {
	if (!RUN_ID_PATTERN.test(runId)) {
		throw new PhronesisClientError("INVALID_RUN_ID", "Phronesis runId 格式无效。");
	}
}

function safeErrorPreview(value: string): string {
	return value.replace(/(authorization|api[-_ ]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, MAX_ERROR_PREVIEW);
}

export class CliJsonPhronesisClient implements PhronesisClient {
	private readonly options: CliJsonPhronesisClientOptions;

	constructor(options: CliJsonPhronesisClientOptions = {}) {
		this.options = options;
	}

	async startPlanning(input: { goal: string; workspace: string; sessionId: string }): Promise<GovernanceDecision> {
		const goal = input.goal.trim();
		if (!goal) throw new PhronesisClientError("MISSING_GOAL", "规划目标不能为空。");
		const result = await this.runBridge({ action: "start", ...input, goal });
		return this.decisionFromBridgeResult(result, "full-deliberation");
	}

	async continuePlanning(input: { runId: string; userMessage: string }): Promise<GovernanceDecision> {
		assertRunId(input.runId);
		const current = await this.inspectRun(input.runId);
		const clarification = input.userMessage.trim();
		if (!clarification) throw new PhronesisClientError("MISSING_CLARIFICATION", "补充信息不能为空。");

		const result = await this.runBridge({
			action: "start",
			goal: `${current.goal}\n\n用户补充信息：${clarification}`,
			workspace: "",
			sessionId: "continued-planning",
			parentRunId: input.runId,
		});
		const decision = await this.decisionFromBridgeResult(result, current.mode);
		return { ...decision, parentRunId: input.runId };
	}

	async inspectRun(runId: string): Promise<GovernanceDecision> {
		assertRunId(runId);
		const root = resolvePhronesisRoot(this.options.phronesisRoot);
		const runDir = path.join(root, ".runs", runId);
		return buildGovernanceDecisionFromRun(runDir, "full-deliberation");
	}

	private async decisionFromBridgeResult(result: BridgeResult, mode: GovernanceMode): Promise<GovernanceDecision> {
		if (!result.ok || !result.runId || !result.runDir) {
			throw new PhronesisClientError(
				result.error?.code ?? "PHRONESIS_BRIDGE_FAILED",
				result.error?.message
					? safeErrorPreview(result.error.message)
					: "Phronesis 未返回有效的结构化运行结果。",
			);
		}
		assertRunId(result.runId);
		const decision = await this.inspectRun(result.runId);
		return validateGovernanceDecision({ ...decision, mode });
	}

	private async runBridge(request: BridgeRequest): Promise<BridgeResult> {
		const root = resolvePhronesisRoot(this.options.phronesisRoot);
		const tempDir = await mkdtemp(path.join(tmpdir(), "metis-phronesis-"));
		const inputPath = path.join(tempDir, "request.json");
		const outputPath = path.join(tempDir, "response.json");
		await writeFile(inputPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600 });

		try {
			await this.spawnBridge(root, inputPath, outputPath);
			const raw = await readFile(outputPath, "utf8").catch(() => "");
			if (!raw) {
				throw new PhronesisClientError("PHRONESIS_EMPTY_RESULT", "Phronesis 桥接器没有生成结构化结果文件。");
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				throw new PhronesisClientError("PHRONESIS_RESULT_PARSE_FAILED", "Phronesis 结构化结果不是有效 JSON。");
			}
			if (!parsed || typeof parsed !== "object" || typeof (parsed as BridgeResult).ok !== "boolean") {
				throw new PhronesisClientError("PHRONESIS_RESULT_SCHEMA_FAILED", "Phronesis 结构化结果未通过校验。");
			}
			return parsed as BridgeResult;
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	private async spawnBridge(root: string, inputPath: string, outputPath: string): Promise<void> {
		const timeoutMs = this.options.timeoutMs ?? asPositiveInteger(process.env.PHRONESIS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
		const configuredPnpm = this.options.pnpmCommand ?? process.env.PHRONESIS_PNPM_COMMAND;
		const localTsxCli = configuredPnpm ? undefined : resolveLocalTsxCli(root);
		const command = localTsxCli ? process.execPath : (configuredPnpm ?? "pnpm");
		const args = localTsxCli
			? [localTsxCli, resolveBridgePath(), "--input", inputPath, "--output", outputPath]
			: ["exec", "tsx", resolveBridgePath(), "--input", inputPath, "--output", outputPath];

		await new Promise<void>((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: root,
				env: { ...process.env, ...this.options.env },
				shell: false,
				stdio: ["ignore", "ignore", "pipe"],
			});
			let stderr = "";
			let timedOut = false;
			let forceKillTimer: NodeJS.Timeout | undefined;
			child.stderr?.setEncoding("utf8");
			child.stderr?.on("data", (chunk: string) => {
				if (stderr.length < MAX_ERROR_PREVIEW) stderr += chunk;
			});

			const timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
				forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
				forceKillTimer.unref();
			}, timeoutMs);
			timer.unref();

			child.once("error", (error) => {
				clearTimeout(timer);
				if (forceKillTimer) clearTimeout(forceKillTimer);
				reject(new PhronesisClientError("PHRONESIS_SPAWN_FAILED", `无法启动 Phronesis：${safeErrorPreview(error.message)}`));
			});
			child.once("close", (code) => {
				clearTimeout(timer);
				if (forceKillTimer) clearTimeout(forceKillTimer);
				if (timedOut) {
					reject(new PhronesisClientError("PHRONESIS_TIMEOUT", `Phronesis 规划超过 ${timeoutMs}ms。`));
					return;
				}
				if (code !== 0) {
					reject(
						new PhronesisClientError(
							"PHRONESIS_PROCESS_FAILED",
							`Phronesis 进程退出码 ${code ?? "unknown"}${stderr ? `：${safeErrorPreview(stderr)}` : ""}`,
						),
					);
					return;
				}
				resolve();
			});
		});
	}
}