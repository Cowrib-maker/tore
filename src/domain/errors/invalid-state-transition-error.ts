import { DomainError } from "./domain-error";

export class InvalidStateTransitionError extends DomainError {
  constructor(
    entity: string,
    from: string,
    to: string,
    message?: string,
  ) {
    super(
      message ??
        `${entity} cannot transition from '${from}' to '${to}'`,
      "INVALID_STATE_TRANSITION",
      409,
    );
    this.name = "InvalidStateTransitionError";
  }
}
