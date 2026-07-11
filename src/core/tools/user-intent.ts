import type { AgentTool } from "@earendil-works/metis-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { readUserIntent } from "../user-intent.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const userIntentSchema = Type.Object({});

export type UserIntentToolInput = Static<typeof userIntentSchema>;

export function createUserIntentToolDefinition(cwd: string): ToolDefinition<typeof userIntentSchema, undefined> {
	return {
		name: "user_intent",
		label: "user_intent",
		description: "Retrieve the complete saved user-intent history for the current session.",
		promptSnippet: "Retrieve saved user-intent history",
		promptGuidelines: [
			"Call user_intent when saved requirements are unclear after compaction, resume, or interruption.",
			"Before declaring a task complete, compare the current result against saved requirements in user_intent; newer timestamped requirements take priority when they conflict.",
		],
		parameters: userIntentSchema,
		async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const sessionId = ctx.sessionManager.getSessionId();
			const content = await readUserIntent(cwd, sessionId);
			return {
				content: [{ type: "text", text: content ?? "No user intent has been saved for this session." }],
				details: undefined,
			};
		},
	};
}

export function createUserIntentTool(cwd: string): AgentTool<any> {
	return wrapToolDefinition(createUserIntentToolDefinition(cwd));
}
