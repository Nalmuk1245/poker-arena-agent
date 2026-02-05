import { Table } from "./server/Table";
import { TableConfig } from "./types/ArenaTypes";
import logger from "../utils/logger";

let tableCounter = 0;

/**
 * Manages table creation and lifecycle.
 */
export class TableManager {
  private tables: Map<string, Table> = new Map();

  /**
   * Create a new table with the given configuration.
   */
  createTable(config: TableConfig): Table {
    if (this.tables.has(config.tableId)) {
      throw new Error(`Table ${config.tableId} already exists`);
    }

    const table = new Table(config);
    this.tables.set(config.tableId, table);
    logger.info(`Created table "${config.tableName}" (${config.tableId}) - ${config.maxPlayers}-max, blinds ${config.smallBlind}/${config.bigBlind}`);
    return table;
  }

  /**
   * Create a practice table with default settings.
   */
  createPracticeTable(opts?: {
    maxPlayers?: number;
    smallBlind?: number;
    bigBlind?: number;
    startingStack?: number;
    actionTimeoutMs?: number;
  }): Table {
    const tableId = `practice-${++tableCounter}`;
    const config: TableConfig = {
      tableId,
      tableName: `Practice Table #${tableCounter}`,
      maxPlayers: opts?.maxPlayers ?? 6,
      smallBlind: opts?.smallBlind ?? 5,
      bigBlind: opts?.bigBlind ?? 10,
      startingStack: opts?.startingStack ?? 1000,
      actionTimeoutMs: opts?.actionTimeoutMs ?? 30000,
    };

    return this.createTable(config);
  }

  /**
   * Get a table by ID.
   */
  getTable(tableId: string): Table | null {
    return this.tables.get(tableId) || null;
  }

  /**
   * List all active tables.
   */
  listTables(): Array<{
    tableId: string;
    tableName: string;
    playerCount: number;
    maxPlayers: number;
    handNumber: number;
    phase: string;
  }> {
    return Array.from(this.tables.values()).map((table) => {
      const state = table.getTableState();
      return {
        tableId: state.config.tableId,
        tableName: state.config.tableName,
        playerCount: table.getReadyPlayerCount(),
        maxPlayers: state.config.maxPlayers,
        handNumber: table.getHandNumber(),
        phase: table.getPhase(),
      };
    });
  }

  /**
   * Remove a table.
   */
  removeTable(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;

    table.destroy();
    this.tables.delete(tableId);
    logger.info(`Removed table ${tableId}`);
    return true;
  }

  /**
   * Remove all tables.
   */
  removeAllTables(): void {
    for (const [id, table] of this.tables) {
      table.destroy();
    }
    this.tables.clear();
  }
}
