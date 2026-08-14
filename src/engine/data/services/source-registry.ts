import type { ISourceConnector } from "../interfaces/connector.interface";
import type { AuthorityType, SourceCountry } from "../types";

/**
 * In-memory catalog of replaceable source connectors.
 */
export class SourceRegistry {
  private readonly connectors = new Map<string, ISourceConnector>();

  register(connector: ISourceConnector): void {
    this.connectors.set(connector.id, connector);
  }

  get(id: string): ISourceConnector | null {
    return this.connectors.get(id) ?? null;
  }

  list(): ISourceConnector[] {
    return [...this.connectors.values()].sort(
      (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
    );
  }

  listEnabled(): ISourceConnector[] {
    return this.list().filter((connector) => connector.enabled);
  }

  listByCountry(country: SourceCountry): ISourceConnector[] {
    return this.list().filter((connector) => connector.country === country);
  }

  listByAuthority(authorityType: AuthorityType): ISourceConnector[] {
    return this.list().filter(
      (connector) => connector.authorityType === authorityType,
    );
  }
}

export function createSourceRegistry(
  connectors: readonly ISourceConnector[] = [],
): SourceRegistry {
  const registry = new SourceRegistry();
  for (const connector of connectors) {
    registry.register(connector);
  }
  return registry;
}
