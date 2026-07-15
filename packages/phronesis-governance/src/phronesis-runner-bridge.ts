import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface BridgeRequest {
	action: "start";
	goal: string;
	workspace: string;
	sessionId: string;
	parentRunId?: string;
}

function argument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

function thinkingMode(): "rule" | "hybrid" | "llm" {
	const value = process.env.PHRONESIS_THINK_MODE ?? "hybrid";
	return value === "rule" || value === "llm" ? value : "hybrid";
}

const inputPath = argument("--input");
const outputPath = argument("--output");

async function main(): Promise<void> {
	const root = process.cwd();
	const envLoader = path.join(root, "scripts", "load-env.mjs");
	await import(pathToFileURL(envLoader).href).catch(() => undefined);

	const request = JSON.parse(await readFile(inputPath, "utf8")) as BridgeRequest;
	if (request.action !== "start" || typeof request.goal !== "string" || !request.goal.trim()) {
		throw new Error("Invalid bridge request");
	}

	const moduleUrl = pathToFileURL(path.join(root, "src", "run-manager.ts")).href;
	const module = (await import(moduleUrl)) as {
		RunManager: new () => {
			run(goal: string, options: { mode: "rule" | "hybrid" | "llm"; online: boolean }): Promise<{
					runId: string;
					runDir: string;
				}>;
		};
	};
	const result = await new module.RunManager().run(request.goal.trim(), {
		mode: thinkingMode(),
		online: process.env.PHRONESIS_ONLINE === "1",
	});
	await writeFile(outputPath, `${JSON.stringify({ ok: true, runId: result.runId, runDir: result.runDir })}\n`, "utf8");
}

await main().catch(async (error: unknown) => {
	const message = error instanceof Error ? error.message : "Unknown Phronesis bridge failure";
	await writeFile(
		outputPath,
		`${JSON.stringify({ ok: false, error: { code: "PHRONESIS_RUN_FAILED", message: message.slice(0, 1_000) } })}\n`,
		"utf8",
	).catch(() => undefined);
});