import { LEAVE_META } from "./types";
import type { LeaveType } from "./types";

export { isHrOrAdmin } from "./types";

export function leaveNameOf(code: string): string {
  return LEAVE_META[code as LeaveType]?.name ?? code;
}
