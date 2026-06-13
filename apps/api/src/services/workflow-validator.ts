import type { WorkflowValidationResult } from '@mantleagents/shared';

export interface AgentConfigForRules {
  max_trade_size_pct?: number | null;
  stop_loss_pct?: number | null;
  [key: string]: unknown;
}

interface WorkflowNode {
  name?: string;
  type?: string;
  parameters?: Record<string, unknown>;
}

function getNodes(workflowJson: unknown): WorkflowNode[] | null {
  if (
    workflowJson == null ||
    typeof workflowJson !== 'object' ||
    !Array.isArray((workflowJson as Record<string, unknown>).nodes)
  ) {
    return null;
  }
  return (workflowJson as { nodes: WorkflowNode[] }).nodes;
}

export function validateWorkflow(
  workflowJson: unknown,
  userConfig: AgentConfigForRules,
): WorkflowValidationResult {
  const issues: string[] = [];

  const nodes = getNodes(workflowJson);
  if (!nodes) {
    return { passed: false, issues: ['workflow structure invalid'] };
  }

  const nodeNames = nodes.map((n) => n.name ?? '');

  if (!nodeNames.some((n) => n === 'Guardrail Check')) {
    issues.push('missing required node: Guardrail Check');
  }

  const hasExecuteTrade = nodeNames.some((n) => n === 'Execute Trade');
  if (hasExecuteTrade && !nodeNames.some((n) => n === 'Risk Check')) {
    issues.push('missing required node: Risk Check (required when Execute Trade is present)');
  }

  const guardrailNode = nodes.find((n) => n.name === 'Guardrail Check');
  if (guardrailNode?.parameters) {
    const params = guardrailNode.parameters;

    const maxValuePerTx =
      params.maxValuePerTx != null ? Number(params.maxValuePerTx) : null;
    const maxTradeLimit =
      userConfig.max_trade_size_pct != null ? Number(userConfig.max_trade_size_pct) : null;

    if (maxValuePerTx != null && maxTradeLimit != null && maxValuePerTx > maxTradeLimit) {
      issues.push(
        `maxValuePerTx (${maxValuePerTx}) exceeds user limit (${maxTradeLimit}% of portfolio)`,
      );
    }

    const stopLossPct =
      params.stopLossPct != null ? Number(params.stopLossPct) : null;
    const stopLossLimit =
      userConfig.stop_loss_pct != null ? Number(userConfig.stop_loss_pct) : null;

    if (stopLossPct != null && stopLossLimit != null && stopLossPct > stopLossLimit) {
      issues.push(
        `stopLossPct (${stopLossPct}) exceeds user limit (${stopLossLimit})`,
      );
    }
  }

  return { passed: issues.length === 0, issues };
}
