import type { AgentTool } from "@earendil-works/metis-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { appendUserIntent, getUserIntentPath } from "../user-intent.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const rememberUserIntentSchema = Type.Object({
	content: Type.String({ description: "Verbatim current user prompt to preserve as an active task requirement" }),
});

export type RememberUserIntentToolInput = Static<typeof rememberUserIntentSchema>;

export function createRememberUserIntentToolDefinition(
	cwd: string,
): ToolDefinition<typeof rememberUserIntentSchema, undefined> {
	return {
		name: "remember_user_intent",
		label: "remember_user_intent",
		description: "Append a verbatim, material user requirement to the current session's intent history.",
		promptSnippet: "Save a material user requirement",
		promptGuidelines: [
			"For each user prompt, decide whether it creates, materially changes, or adds constraints to the active task. If it does, call remember_user_intent exactly once with the user's prompt copied verbatim.",
			"Do not call remember_user_intent for pure continuation requests, acknowledgements, greetings, or status questions.",
		],
		parameters: rememberUserIntentSchema,
		async execute(_toolCallId, { content }, signal, _onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const sessionId = ctx.sessionManager.getSessionId();
			await appendUserIntent(cwd, sessionId, content);
			if (signal?.aborted) throw new Error("Operation aborted");
			return {
				content: [{ type: "text", text: `Saved user intent to ${getUserIntentPath(cwd, sessionId)}.` }],
				details: undefined,
			};
		},
	};
}

export function createRememberUserIntentTool(cwd: string): AgentTool<any> {
	return wrapToolDefinition(createRememberUserIntentToolDefinition(cwd));
}
