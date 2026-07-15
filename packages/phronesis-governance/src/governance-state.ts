import type { GovernanceDecision, GovernanceMode, GovernanceStatus } from "./phronesis-client.ts";

export const GOVERNANCE_STATE_ENTRY = "phronesis-governance-linkage";
export const DECISION_SUMMARY_VERSION = 1;

export interface GovernanceSessionLinkage {
	phronesisRunId: string;
	governanceMode: GovernanceMode;
	gateStatus: GovernanceStatus;
	selectedRouteId?: string;
	pendingQuestionIds: string[];
	decisionSummaryVersion: number;
}

export interface BranchEntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

function validMode(value: unknown): value is GovernanceMode {
	return value === "fast-path" || value === "governed" || value === "full-deliberation";
}

function validStatus(value: unknown): value is GovernanceStatus {
	return value === "ready" || value === "conditional" || value === "blocked" || value === "failed";
}

export function isGovernanceSessionLinkage(value: unknown): value is GovernanceSessionLinkage {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.phronesisRunId === "string" &&
		validMode(candidate.governanceMode) &&
		validStatus(candidate.gateStatus) &&
		Array.isArray(candidate.pendingQuestionIds) &&
		candidate.pendingQuestionIds.every((item) => typeof item === "string") &&
		typeof candidate.decisionSummaryVersion === "number"
	);
}

export function linkageFromDecision(decision: GovernanceDecision): GovernanceSessionLinkage {
	return {
		phronesisRunId: decision.runId,
		governanceMode: decision.mode,
		gateStatus: decision.status,
		selectedRouteId: decision.selectedRouteId,
		pendingQuestionIds: decision.unresolvedQuestions.map((question) => question.id),
		decisionSummaryVersion: DECISION_SUMMARY_VERSION,
	};
}

export function restoreGovernanceLinkage(entries: readonly BranchEntryLike[]): GovernanceSessionLinkage | undefined {
	let restored: GovernanceSessionLinkage | undefined;
	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === GOVERNANCE_STATE_ENTRY && isGovernanceSessionLinkage(entry.data)) {
			restored = { ...entry.data, pendingQuestionIds: [...entry.data.pendingQuestionIds] };
		}
	}
	return restored;
}