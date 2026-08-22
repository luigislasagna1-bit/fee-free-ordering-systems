import type { Scenario } from "../scenario-types";
import { CRITICAL_A } from "./critical/index";
import { CRITICAL_B } from "./critical/part2";
import { CRITICAL_XFER } from "./critical/transfer-policy";
import { CRITICAL_STATUS } from "./critical/order-status";
import { INJECTION } from "./injection/index";
import { REGRESSION } from "./regression/index";

export const CRITICAL: Scenario[] = [...CRITICAL_A, ...CRITICAL_B, ...CRITICAL_XFER, ...CRITICAL_STATUS];
export { INJECTION, REGRESSION };

/** Every scenario known to the runner. Regressions promoted from real calls
 *  live under ./regressions and are added here. */
export const ALL_SCENARIOS: Scenario[] = [...CRITICAL, ...INJECTION, ...REGRESSION];

export function scenariosForSuite(suite: string): Scenario[] {
  if (suite === "all") return ALL_SCENARIOS;
  return ALL_SCENARIOS.filter((s) => s.suite.includes(suite as any));
}
