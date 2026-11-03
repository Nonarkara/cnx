import { DurableObject } from "cloudflare:workers";
import { authorizePin, initializePinStorage } from "./governor-pin-policy.mjs";

/** Exactly one instance, named governor-pin-v1, owns this credential's budget. */
export class GovernorPinGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    initializePinStorage(ctx.storage);
  }

  async authorize(pin) {
    return authorizePin(this.ctx.storage, this.env.CNX_GOVERNOR_PIN, pin);
  }
}
