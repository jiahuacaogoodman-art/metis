import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import dreamMode from "../../../src/core/builtins/dream-mode.ts";
import { createAgentSessionServices } from "../../../src/core/agent-session-services.ts";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

describe("dream builtin registration", () => {
	let tempRoot: string | undefined;
	let previousAgentDir = process.env.METIS_CODING_AGENT_DIR;

	afterEach(() => {
		if (tempRoot && rmSync) {
			rmSync(tempRoot, { recursive: true, force: true });
		}
		tempRoot = undefined;
		if (previousAgentDir === undefined) {
			delete process.env.METIS_CODING_AGENT_DIR;
		} else {
			process.env.METIS_CODING_AGENT_DIR = previousAgentDir;
		}
		spawnMock.mockReset();
		vi.restoreAllMocks();
	});

	it("loads dream as builtin session extension", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "metis-dream-builtin-"));
		const cwd = join(tempRoot, "project");
		const agentDir = join(tempRoot, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		process.env.METIS_CODING_AGENT_DIR = agentDir;

		const services = await createAgentSessionServices({ cwd, agentDir });
		const extensions = services.resourceLoader.getExtensions().extensions;

		expect(extensions).toHaveLength(1);
		expect(extensions[0]?.commands.has("dream")).toBe(true);
		expect(extensions[0]?.handlers.has("session_start")).toBe(true);
		expect(extensions[0]?.handlers.has("session_shutdown")).toBe(true);
	});

	it("keeps dream builtin when project trust preloads extensions", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "metis-dream-trust-"));
		const cwd = join(tempRoot, "project");
		const agentDir = join(tempRoot, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		process.env.METIS_CODING_AGENT_DIR = agentDir;

		const services = await createAgentSessionServices({
			cwd,
			agentDir,
			resourceLoaderReloadOptions: {
				resolveProjectTrust: async () => true,
			},
		});
		const extensions = services.resourceLoader.getExtensions().extensions;

		expect(extensions).toHaveLength(1);
		expect(extensions[0]?.path).toBe("<builtin:dream>");
		expect(extensions[0]?.commands.has("dream")).toBe(true);
	});

	it("shows dream status even when disabled", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "metis-dream-status-"));
		const cwd = join(tempRoot, "project");
		const agentDir = join(tempRoot, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		process.env.METIS_CODING_AGENT_DIR = agentDir;

		const handlers = new Map<string, Array<(event: unknown, ctx: any) => void>>();
		const metis = {
			registerCommand: vi.fn(),
			on(event: string, handler: (event: unknown, ctx: any) => void) {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
		};

		dreamMode(metis as any);

		const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as any);
		vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
		const setStatus = vi.fn();
		const sessionStartHandlers = handlers.get("session_start") ?? [];

		expect(sessionStartHandlers).toHaveLength(1);
		await sessionStartHandlers[0]?.({}, {
			cwd,
			hasPendingMessages: () => false,
			isIdle: () => true,
			sessionManager: { getCwd: () => cwd },
			ui: { setStatus, notify: vi.fn() },
		});

		expect(setStatus).toHaveBeenCalledWith("dream", "🌙 Dream: Off");
		expect(setIntervalSpy).toHaveBeenCalled();
	});

	it("retries automatic dreaming after backoff without retrying on every startup", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "metis-dream-once-"));
		const cwd = join(tempRoot, "project");
		const agentDir = join(tempRoot, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(join(cwd, ".temp"), { recursive: true });
		process.env.METIS_CODING_AGENT_DIR = agentDir;
		writeFileSync(join(tempRoot, "dream_state.json"), JSON.stringify({ enabled: true, lastDreamDate: "2000-01-01" }));
		const sourceLog = join(cwd, ".temp", "yesterday_log.md");
		writeFileSync(sourceLog, "Resolved a difficult provider retry bug.");

		const handlers = new Map<string, Array<(event: unknown, ctx: any) => void>>();
		const metis = {
			registerCommand: vi.fn(),
			on(event: string, handler: (event: unknown, ctx: any) => void) {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
		};
		const spawned: EventEmitter[] = [];
		spawnMock.mockImplementation(() => {
			const child = new EventEmitter() as EventEmitter & { unref: () => void };
			child.unref = vi.fn();
			spawned.push(child);
			return child;
		});
		vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as any);
		vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);

		dreamMode(metis as any);
		const setStatus = vi.fn();
		const notify = vi.fn();
		const ctx = {
			cwd,
			hasPendingMessages: () => false,
			isIdle: () => true,
			sessionManager: {
				getBranch: () => [],
				getCwd: () => cwd,
				getSessionId: () => "test-session",
			},
			ui: { setStatus, notify },
		};
		const sessionStart = handlers.get("session_start")?.[0];
		expect(sessionStart).toBeDefined();

		await sessionStart?.({}, ctx);
		expect(spawnMock).toHaveBeenCalledTimes(2);
		expect(setStatus).toHaveBeenLastCalledWith("dream", "💤 Dreaming...");
		const childArgs = spawnMock.mock.calls[1]?.[1] as string[];
		const systemPrompt = childArgs[childArgs.indexOf("--system-prompt") + 1];
		const taskPrompt = childArgs[childArgs.indexOf("-p") + 1];
		expect(systemPrompt).toContain("[METIS DREAM CONSOLIDATION WORKER]");
		expect(systemPrompt).toContain("Do not read the Dream child session's own .temp log");
		expect(systemPrompt).toContain("[Weight: 5]");
		expect(systemPrompt).toContain("more than 3 full days before today");
		expect(systemPrompt).toContain("update only lastDreamDate");
		expect(taskPrompt).toContain(sourceLog);
		expect(taskPrompt).not.toContain("test-session_log.md");
		expect(JSON.parse(readFileSync(join(tempRoot, "dream_state.json"), "utf-8"))).toMatchObject({
			enabled: true,
			lastDreamAttemptDate: expect.any(String),
		});

		spawned[1]?.emit("exit", 1);
		expect(setStatus).toHaveBeenLastCalledWith("dream", "⚠️ Dream: Retry scheduled");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("failed (exit code 1"));
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Retrying automatically in 5 minutes"));

		await sessionStart?.({}, ctx);
		expect(spawnMock).toHaveBeenCalledTimes(2);

		const failedState = JSON.parse(readFileSync(join(tempRoot, "dream_state.json"), "utf-8"));
		expect(failedState).toMatchObject({
			dreamAttemptCount: 1,
			nextDreamRetryAt: expect.any(String),
		});
		vi.spyOn(Date, "now").mockReturnValue(Date.parse(failedState.nextDreamRetryAt) + 1);

		await sessionStart?.({}, ctx);
		expect(spawnMock).toHaveBeenCalledTimes(4);
		expect(setStatus).toHaveBeenLastCalledWith("dream", "💤 Dreaming...");

		spawned[3]?.emit("exit", 0);
		expect(setStatus).toHaveBeenLastCalledWith("dream", "🌙 Dream: Done");
		expect(JSON.parse(readFileSync(join(tempRoot, "dream_state.json"), "utf-8"))).not.toHaveProperty(
			"nextDreamRetryAt",
		);
	});

	it("does not start a second dream while another process holds the lock", async () => {
		tempRoot = mkdtempSync(join(tmpdir(), "metis-dream-lock-"));
		const cwd = join(tempRoot, "project");
		const agentDir = join(tempRoot, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		process.env.METIS_CODING_AGENT_DIR = agentDir;
		writeFileSync(join(tempRoot, "dream_state.json"), JSON.stringify({ enabled: true, lastDreamDate: "2000-01-01" }));
		writeFileSync(
			join(tempRoot, "dream.lock"),
			JSON.stringify({ pid: 123, startedAt: new Date().toISOString(), token: "other-process" }),
		);

		const handlers = new Map<string, Array<(event: unknown, ctx: any) => void>>();
		dreamMode({
			registerCommand: vi.fn(),
			on(event: string, handler: (event: unknown, ctx: any) => void) {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			},
		} as any);
		vi.spyOn(globalThis, "setInterval").mockReturnValue(1 as any);
		vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
		const setStatus = vi.fn();

		await handlers.get("session_start")?.[0]?.({}, {
			cwd,
			hasPendingMessages: () => false,
			isIdle: () => true,
			sessionManager: { getBranch: () => [], getCwd: () => cwd, getSessionId: () => "test-session" },
			ui: { setStatus, notify: vi.fn() },
		});

		expect(spawnMock).not.toHaveBeenCalled();
		expect(setStatus).toHaveBeenLastCalledWith("dream", "💤 Dreaming...");
	});
});
