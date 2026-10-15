import { runStandby } from "./relay-standby-core.mjs";

try {
  const mode = process.argv[2] ?? "standby";
  const secret = mode === "probe" ? undefined : process.env.CNX_FLIGHTS_RELAY_SECRET;
  await runStandby({ mode, secret });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
