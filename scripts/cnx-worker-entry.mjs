// Preserve OpenNext's handler while exporting the single-credential PIN gate.
import worker from "../.open-next/worker.js";
export { GovernorPinGate } from "./governor-pin-gate.mjs";
export default worker;
