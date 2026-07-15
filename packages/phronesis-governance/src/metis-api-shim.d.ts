import type { Static, TSchema } from "typebox";

declare module "metis" {
	export interface GovernanceReadonlySessionManager {
		getBranch(): Array<{ type: string; customType?: string; data?: unknown }>;
		getSessionId(): string;
	}

	export interface GovernanceExtensionUI {
		notify(message: string, type?: "info" | "warning" | "error"): void;
		setWorkingMessage(message?: string): void;
	}

	export interface ExtensionContext {
		cwd: string;
		sessionManager: GovernanceReadonlySessionManager;
		ui: GovernanceExtensionUI;
	}

	export interface ExtensionCommandContext extends ExtensionContext {}

	export interface InputEvent {
		type: "input";
		text: string;
		images?: unknown[];
		source: "interactive" | "rpc" | "extension";
	}

	export type InputEventResult =
		| { action: "continue" }
		| { action: "transform"; text: string; images?: unknown[] }
		| { action: "handled" };

	export interface ToolDefinition<TParams extends TSchema = TSchema> {
		name: string;
		label: string;
		description: string;
		promptSnippet?: string;
		parameters: TParams;
		executionMode?: "sequential" | "parallel";
		execute(
			toolCallId: string,
			params: Static<TParams>,
			signal: AbortSignal | undefined,
			onUpdate: ((update: unknown) => void) | undefined,
			ctx: ExtensionContext,
		): Promise<{
			content: Array<{ type: "text"; text: string }>;
			details?: unknown;
		}>;
	}

	export interface ExtensionAPI {
		registerTool<TParams extends TSchema>(tool: ToolDefinition<TParams>): void;
		registerCommand(
			name: string,
			options: {
				description?: string;
				handler(args: string, ctx: ExtensionCommandContext): Promise<void>;
			},
		): void;
		on(
			event: "input",
			handler: (event: InputEvent, ctx: ExtensionContext) => Promise<InputEventResult | void> | InputEventResult | void,
		): void;
		on(
			event: "session_start" | "session_tree",
			handler: (event: { type: string }, ctx: ExtensionContext) => Promise<void> | void,
		): void;
		appendEntry<T>(customType: string, data?: T): void;
		sendMessage<T>(
			message: { customType: string; content: string; display: boolean; details?: T },
			options?: { triggerTurn?: boolean },
		): void;
	}
}