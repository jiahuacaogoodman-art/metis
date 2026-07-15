import type { GovernanceMode } from "./phronesis-client.ts";

export interface IntentTriageResult {
	mode: GovernanceMode;
	reason: string;
	matchedSignals: string[];
	requestedMode?: GovernanceMode;
}

const MODE_RANK: Record<GovernanceMode, number> = {
	"fast-path": 0,
	governed: 1,
	"full-deliberation": 2,
};

const FULL_SIGNALS: Array<[RegExp, string]> = [
	[/从零|重新设计|架构重构|系统重构|平台重构/i, "从零建设或架构重构"],
	[/做一个|构建一个|开发一个|建设一个/i, "完整产品建设"],
	[/医院|医疗|金融|支付|合规|隐私|高风险/i, "高风险领域"],
	[/数据迁移|数据库迁移|主数据迁移/i, "数据迁移"],
	[/多(?:条|种)技术路线|路线权衡|技术选型|架构选型/i, "多路线权衡"],
	[/权限体系|身份系统|审批体系|跨系统集成/i, "关键治理边界"],
];

const GOVERNED_SIGNALS: Array<[RegExp, string]> = [
	[/API|接口|数据库|数据模型|schema|权限|认证|鉴权/i, "API、数据或权限变更"],
	[/集成|第三方|外部系统|消息队列|webhook/i, "外部集成"],
	[/多文件|多个文件|前后端|跨模块/i, "跨文件或跨模块变更"],
	[/需求不清|不确定|可能|方案/i, "需求或方案存在歧义"],
	[/新增功能|实现功能|支持.+功能/i, "非局部功能开发"],
];

const FAST_SIGNALS: Array<[RegExp, string]> = [
	[/小 bug|小问题|拼写|错别字|文案|注释/i, "明确的低风险修复"],
	[/单文件|只改.+文件|仅修改.+文件/i, "范围限制为单文件"],
	[/null|undefined|边界条件|错误信息/i, "局部缺陷信号"],
];

function matches(goal: string, rules: Array<[RegExp, string]>): string[] {
	return rules.filter(([pattern]) => pattern.test(goal)).map(([, label]) => label);
}

export function triageIntent(goalInput: string): IntentTriageResult {
	const goal = goalInput.trim();
	if (!goal) return { mode: "governed", reason: "目标为空，必须先澄清。", matchedSignals: ["缺少目标"] };

	const full = matches(goal, FULL_SIGNALS);
	if (full.length > 0) {
		return {
			mode: "full-deliberation",
			reason: `检测到${full.join("、")}，需要路线竞争、评审和 Coding Gate。`,
			matchedSignals: full,
		};
	}

	const governed = matches(goal, GOVERNED_SIGNALS);
	if (governed.length > 0) {
		return {
			mode: "governed",
			reason: `检测到${governed.join("、")}，应保留治理摘要，但无需自动运行完整 deliberation。`,
			matchedSignals: governed,
		};
	}

	const fast = matches(goal, FAST_SIGNALS);
	if (fast.length > 0) {
		return {
			mode: "fast-path",
			reason: `任务边界明确且风险较低（${fast.join("、")}），可沿用 Metis 原生执行流程。`,
			matchedSignals: fast,
		};
	}

	return {
		mode: "governed",
		reason: "任务不是明确的局部修复，也没有足够信号证明需要完整路线辩论，先按 governed 处理。",
		matchedSignals: ["默认中等治理"],
	};
}

export function applyRequestedDeliberationLevel(
	automatic: IntentTriageResult,
	requestedMode?: GovernanceMode,
): IntentTriageResult {
	if (!requestedMode) return automatic;
	if (MODE_RANK[requestedMode] < MODE_RANK[automatic.mode]) {
		return {
			...automatic,
			requestedMode,
			reason: `${automatic.reason} 手动请求的 ${requestedMode} 低于自动风险等级，已拒绝降级。`,
			matchedSignals: [...automatic.matchedSignals, "拒绝风险降级"],
		};
	}
	return {
		...automatic,
		mode: requestedMode,
		requestedMode,
		reason: `${automatic.reason} 已手动升级为 ${requestedMode}。`,
		matchedSignals: [...automatic.matchedSignals, "手动升级"],
	};
}

export function parseDeliberationLevel(value: string | undefined): GovernanceMode | undefined {
	if (value === "fast-path" || value === "governed" || value === "full-deliberation") return value;
	return undefined;
}

export function isBlockerFollowUp(text: string): boolean {
	return /为什么.*(?:blocked|阻断|不能编码)|(?:blocked|阻断).*(?:原因|为什么)|解释.*阻断/i.test(text.trim());
}