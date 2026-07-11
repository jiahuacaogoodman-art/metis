import type { AgentTool } from "@earendil-works/metis-agent-core";
import { appendFile as fsAppendFile, mkdir as fsMkdir, readFile as fsReadFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { resolveToCwd } from "./path-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const logSchema = Type.Object({
	content: Type.String({
		description: "High-density task completion summary in 3-10 Markdown lines",
	}),
});

export type LogToolInput = Static<typeof logSchema>;

export interface LogToolOptions {
	/**
	 * Optional custom append operation for tests or alternate storage backends.
	 */
	appendFile?: (absolutePath: string, content: string) => Promise<void>;
	/**
	 * Optional custom read operation for tests or alternate storage backends.
	 */
	readFile?: (absolutePath: string) => Promise<string>;
	/**
	 * Optional custom mkdir operation for tests or alternate storage backends.
	 */
	mkdir?: (dir: string) => Promise<void>;
}

const defaultLogOperations = {
	appendFile: (path: string, content: string) => fsAppendFile(path, content, "utf-8"),
	readFile: (path: string) => fsReadFile(path, "utf-8"),
	mkdir: (dir: string) => fsMkdir(dir, { recursive: true }).then(() => {}),
};

function buildLogPath(cwd: string, sessionId: string): string {
	return resolveToCwd(join(".temp", `${sessionId}_log.md`), cwd);
}

function formatLocalTimestamp(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function createLogToolDefinition(
	cwd: string,
	options?: LogToolOptions,
): ToolDefinition<typeof logSchema, undefined> {
	const ops = {
		appendFile: options?.appendFile ?? defaultLogOperations.appendFile,
		readFile: options?.readFile ?? defaultLogOperations.readFile,
		mkdir: options?.mkdir ?? defaultLogOperations.mkdir,
	};

	return {
		name: "log",
		label: "log",
		description:
			"Append one timestamped, high-density completion summary to today's working log in .temp.",
		promptSnippet: "Append task completion summary",
			promptGuidelines: [
				"Keep today's working log in .temp/<sessionId>_log.md and let dream consolidate it later.",
				"Call log once when a task finishes; do not write step-by-step progress notes.",
				"Write 3-10 concise lines: completed work, only material decision/issue, verification, and remaining or blocked work. Preserve useful technical detail; omit routine narration and raw tool output.",
				"When a material error occurred, include it even if resolved: error, root cause or diagnosis, and fix/workaround. This gives dream evidence for reusable lessons. If none occurred, omit any error line entirely.",
			],
			parameters: logSchema,
			async execute(_toolCallId, { content }, signal, _onUpdate, ctx) {
				const sessionId = ctx.sessionManager.getSessionId();
				const absolutePath = buildLogPath(cwd, sessionId);
				const dir = dirname(absolutePath);
			const loggedContent = `## [${formatLocalTimestamp()}] Task summary\n${content}`;

			return withFileMutationQueue(absolutePath, async () => {
				const throwIfAborted = (): void => {
					if (signal?.aborted) throw new Error("Operation aborted");
				};

				throwIfAborted();
				await ops.mkdir(dir);
				throwIfAborted();

				let prefix = "";
				try {
					const existing = await ops.readFile(absolutePath);
					if (existing.trim().length > 0) {
						prefix = existing.endsWith("\n") ? "\n" : "\n\n";
					}
				} catch {
					// Fresh log file. Append without prefix.
				}
				throwIfAborted();

					await ops.appendFile(absolutePath, `${prefix}${loggedContent}${loggedContent.endsWith("\n") ? "" : "\n"}`);
				throwIfAborted();

				return {
					content: [{ type: "text", text: `Successfully appended ${content.length} bytes to ${absolutePath}` }],
					details: undefined,
				};
			});
		},
	};
}

export function createLogTool(cwd: string, options?: LogToolOptions): AgentTool<typeof logSchema> {
	return wrapToolDefinition(createLogToolDefinition(cwd, options));
}
