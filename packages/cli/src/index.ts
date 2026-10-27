export const name = "@omniharmonic/openspace-cli";

export {
  type Budgets,
  type CheckOptions,
  type CheckReport,
  DEFAULT_BUDGETS,
  type Finding,
  formatReport,
  runCheck,
} from "./check";
export { createProgram, run, VERSION } from "./program";
