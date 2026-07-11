import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { openSync, closeSync, existsSync } from "node:fs";
import type { AgentTool } from "@earendil-works/metis-agent-core";
import { Type, type Static } from "typebox";
import { Text } from "@earendil-works/metis-tui";
import { theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const subagentSchema = Type.Object({
	title: Type.String({ description: "A brief, capitalized title for the subagent's task (e.g. 'Investigate Project Structure')" }),
	task: Type.String({ description: "The task to be executed by the subagent" }),
});

export type SubagentToolInput = Static<typeof subagentSchema>;

export interface SubagentToolOptions {
	sendMessage?: (jobId: string, result: string) => void;
}

function getMetisInvocation(): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args: [] };
	}

	return { command: "metis", args: [] };
}

export function createSubagentToolDefinition(
	cwd: string,
	options?: SubagentToolOptions,
): ToolDefinition<typeof subagentSchema, undefined> {
	return {
		name: "subagent",
		label: "subagent",
		description: "Spawn a background subagent to execute a task in parallel. You MUST WAIT for the subagent to finish before proceeding. Do NOT perform other tasks. When the subagent finishes, it will automatically push a system message to wake you up with the result.",
		promptSnippet: "Delegate tasks to subagents",
		parameters: subagentSchema,
		async execute(toolCallId, { title, task }, _signal, _onUpdate, _ctx) {
			const jobId = toolCallId.slice(-6);
			
			const tempFile = path.join(cwd, `.metis-subagent-${jobId}.txt`);
			await fs.writeFile(tempFile, task, "utf-8");

			const invocation = getMetisInvocation();
			const args = [
				...invocation.args,
				"--print", 
				"Please execute the following task. CRITICAL: You MUST provide a final summary report as text output in your very last message before finishing. Do not end your turn immediately after a tool call without speaking.", 
				`@${path.basename(tempFile)}`
			];

			const outputFile = path.join(cwd, `.metis-subagent-${jobId}.log`);
			
			// Open synchronously so the file descriptor is immediately available for spawn.
			const outFd = openSync(outputFile, "a");

			const child = spawn(invocation.command, args, {
				cwd,
				detached: true,
				stdio: ["ignore", outFd, outFd],
				env: { ...process.env, METIS_OFFLINE: "1" }
			});

			try {
				closeSync(outFd);
			} catch (e) {
				// Ignore
			}

			child.on("close", async () => {
				try {
					await fs.unlink(tempFile);
				} catch (e) {
					// Ignore
				}

				if (options?.sendMessage) {
					try {
						const content = await fs.readFile(outputFile, "utf-8");
						const resultText = content.length > 4000 ? "...(truncated)...\n" + content.slice(-4000) : content;
						options.sendMessage(jobId, resultText.trim() || "(No output returned)");
					} catch (e) {
						options.sendMessage(jobId, "(Error reading output file)");
					}
				}
			});

			child.unref();

			return {
				content: [{ type: "text", text: `Subagent Job ${jobId} started in the background. You MUST WAIT for it to finish. Do NOT perform any other tool calls. Wait patiently for the system message that will automatically wake you up with the final output.` }],
				details: undefined
			};
		},
		renderCall(args, _theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const titleDisplay = args.title ? ` - ${args.title}` : "";
			text.setText(theme.fg("toolTitle", theme.bold(`Subagent${titleDisplay}`)));
			return text;
		},
		renderResult(_result, _options, _theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			// Hide the internal "started" message from the UI to keep it clean.
			text.setText("");
			return text;
		},
	};
}

export function createSubagentTool(cwd: string, options?: SubagentToolOptions): AgentTool<typeof subagentSchema> {
	return wrapToolDefinition(createSubagentToolDefinition(cwd, options));
}
