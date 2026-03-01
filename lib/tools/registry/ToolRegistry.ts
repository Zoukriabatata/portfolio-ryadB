/**
 * TOOL REGISTRY
 *
 * Singleton registry for tool definitions.
 * Tools register themselves on import via register().
 */

import type { ToolType, Tool } from '../types';
import type { ToolDefinition } from './ToolDefinition';

class ToolRegistryImpl {
  private definitions: Map<ToolType, ToolDefinition> = new Map();

  /**
   * Register a tool definition. Called by each definition module on import.
   */
  register<T extends Tool>(definition: ToolDefinition<T>): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`[ToolRegistry] Overwriting existing definition for "${definition.type}"`);
    }
    this.definitions.set(definition.type, definition as ToolDefinition);
  }

  /**
   * Get a tool definition by type.
   */
  get(type: ToolType): ToolDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Check if a tool type has a registered definition.
   */
  has(type: ToolType): boolean {
    return this.definitions.has(type);
  }

  /**
   * Get all registered definitions.
   */
  getAll(): Map<ToolType, ToolDefinition> {
    return this.definitions;
  }

  /**
   * Get all registered tool types.
   */
  getRegisteredTypes(): ToolType[] {
    return Array.from(this.definitions.keys());
  }
}

/** Singleton instance */
export const toolRegistry = new ToolRegistryImpl();
