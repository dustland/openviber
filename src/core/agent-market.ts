/**
 * Agent Market - Template system for agent discovery and instantiation
 *
 * The Agent Market provides access to pre-configured agent templates from
 * viber/defaults/agents/ directory. Users can browse, preview, and instantiate
 * these templates into their space.
 */

import { AgentConfig } from "./config";
import { getServerDataAdapter } from "../data/factory";

/**
 * Agent template metadata - extends AgentConfig with market-specific fields
 */
export interface AgentTemplate extends AgentConfig {
  // Market-specific metadata
  category?: string; // e.g., "assistant", "developer", "analyst", "creative"
  tags?: string[]; // Search tags
  author?: string; // Template author
  version?: string; // Template version
  icon?: string; // Icon identifier (emoji or icon name)

  // Usage information
  usageExamples?: string[]; // Example use cases
  requirements?: string[]; // Required tools, API keys, etc.

  // Template variables (for customization during instantiation)
  variables?: {
    name: string;
    description: string;
    type: "text" | "number" | "boolean" | "select";
    default?: any;
    options?: string[]; // For select type
    required?: boolean;
  }[];

  // Ratings and stats (future)
  downloads?: number;
  rating?: number;

  // Protection - hide sensitive details from competitors
  protected?: boolean; // If true, hide system prompts and detailed configurations

  // Ownership
  isCustom?: boolean; // If true, this is a user-created agent (editable)

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Market category definition (from hub/categories.yaml)
 */
export interface MarketCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  order?: number;
}

/**
 * AgentMarket - Manages the agent template marketplace
 */
export class AgentMarket {
  /**
   * Get agent categories from hub configuration
   */
  static async getCategories(): Promise<MarketCategory[]> {
    try {
      const defaultsStorage = (
        await import("./storage")
      ).Storage.getDefaultsStorage();
      const defaultsData = await defaultsStorage.readYaml("categories.yaml");

      // Extract agent subcategories
      const agentsCategory = defaultsData?.categories?.find(
        (c: any) => c.id === "agents"
      );

      if (agentsCategory?.subcategories) {
        return agentsCategory.subcategories.map((sub: any, index: number) => ({
          id: sub.id,
          name: sub.name,
          icon: sub.icon,
          order: index + 1,
        }));
      }

      return this.getDefaultCategories();
    } catch (error) {
      console.warn("[AgentMarket] Failed to load categories from hub:", error);
      return this.getDefaultCategories();
    }
  }

  /**
   * Get default categories if hub config not available
   */
  private static getDefaultCategories(): MarketCategory[] {
    return [
      { id: "assistant", name: "助手", icon: "MessageSquare", order: 1 },
      { id: "developer", name: "开发者", icon: "Code", order: 2 },
      { id: "analyst", name: "分析师", icon: "TrendingUp", order: 3 },
      { id: "creative", name: "创意", icon: "Palette", order: 4 },
    ];
  }

  /**
   * Get all available agent templates from .viber/defaults/agents/ and custom agents from config
   */
  static async getAllTemplates(): Promise<AgentTemplate[]> {
    try {
      // Initialize market if needed
      await this.ensureMarketInitialized();

      const { Storage } = await import("./storage");
      const defaultsStorage = Storage.getDefaultsStorage();
      const rootStorage = Storage.getRootStorage();
      const configStorage = Storage.getConfigStorage();

      const templates: AgentTemplate[] = [];

      // Read default templates from defaults/agents/ directory
      const defaultFiles = await defaultsStorage.list("agents");
      for (const file of defaultFiles) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          try {
            const config = await defaultsStorage.readYaml(`agents/${file}`);

            // Load prompt file if specified
            if (config.promptFile) {
              try {
                const promptContent = await defaultsStorage.readTextFile(
                  `prompts/${config.promptFile}`
                );
                config.systemPrompt = promptContent;
              } catch (error) {
                console.warn(`Failed to load prompt for ${file}:`, error);
              }
            }

            templates.push({ ...config, isCustom: false } as AgentTemplate);
          } catch (error) {
            console.warn(`Failed to load template ${file}:`, error);
          }
        }
      }

      // Read custom agents from ~/.viber/agents/ directory
      try {
        const customFiles = await rootStorage.list("agents").catch(() => []);
        for (const file of customFiles) {
          if (file.endsWith(".yaml") || file.endsWith(".yml")) {
            try {
              const config = await rootStorage.readYaml(`agents/${file}`);
              // Ensure unique ID by prefixing with "custom-" if not already prefixed
              const uniqueId = config.id?.startsWith("custom-")
                ? config.id
                : `custom-${config.id || file.replace(/\.(yaml|yml)$/, "")}`;

              templates.push({
                ...config,
                id: uniqueId,
                isCustom: true,
              } as AgentTemplate);
            } catch (error) {
              console.warn(`Failed to load custom agent ${file}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn("[AgentMarket] No custom agents found:", error);
      }

      return templates;
    } catch (error) {
      console.error("[AgentMarket] Failed to load templates:", error);
      return [];
    }
  }

  /**
   * Ensure market is initialized with default templates
   */
  private static async ensureMarketInitialized(): Promise<void> {
    try {
      const { Storage } = await import("./storage");
      const defaultsStorage = Storage.getDefaultsStorage();

      // Check if agents directory exists
      const files = await defaultsStorage.list("agents").catch(() => []);
      if (files.length > 0) {
        return; // Already initialized
      }

      console.log(
        "[AgentMarket] Initializing market with default templates..."
      );

      // Copy templates from source defaults
      const fs = await import("fs/promises");
      const path = await import("path");

      const sourceAgentsDir = path.join(
        process.cwd(),
        "src",
        "viber",
        "defaults",
        "agents"
      );
      const sourcePromptsDir = path.join(
        process.cwd(),
        "src",
        "viber",
        "defaults",
        "prompts"
      );

      // Create directories
      await defaultsStorage.mkdir("agents");
      await defaultsStorage.mkdir("prompts");

      // Copy agent files
      const agentFiles = await fs.readdir(sourceAgentsDir);
      for (const file of agentFiles) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content = await fs.readFile(
            path.join(sourceAgentsDir, file),
            "utf8"
          );
          await defaultsStorage.writeFile(`agents/${file}`, content);
          console.log(`[AgentMarket] Copied template: ${file}`);
        }
      }

      // Copy prompt files
      try {
        const promptFiles = await fs.readdir(sourcePromptsDir);
        for (const file of promptFiles) {
          if (file.endsWith(".md")) {
            const content = await fs.readFile(
              path.join(sourcePromptsDir, file),
              "utf8"
            );
            await defaultsStorage.writeFile(`prompts/${file}`, content);
            console.log(`[AgentMarket] Copied prompt: ${file}`);
          }
        }
      } catch (error) {
        console.warn("[AgentMarket] No default prompts found");
      }

      console.log("[AgentMarket] Market initialization complete");
    } catch (error) {
      console.error("[AgentMarket] Failed to initialize market:", error);
    }
  }

  /**
   * Get templates by category
   */
  static async getTemplatesByCategory(
    categoryId: string
  ): Promise<AgentTemplate[]> {
    const allTemplates = await this.getAllTemplates();
    return allTemplates.filter((t) => t.category === categoryId);
  }

  /**
   * Search templates by keyword
   */
  static async searchTemplates(keyword: string): Promise<AgentTemplate[]> {
    const allTemplates = await this.getAllTemplates();
    const lowerKeyword = keyword.toLowerCase();

    return allTemplates.filter(
      (template) =>
        template.name?.toLowerCase().includes(lowerKeyword) ||
        template.description?.toLowerCase().includes(lowerKeyword) ||
        template.tags?.some((tag) =>
          tag.toLowerCase().includes(lowerKeyword)
        ) ||
        template.id?.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * Get a specific template by ID
   */
  static async getTemplate(templateId: string): Promise<AgentTemplate | null> {
    try {
      await this.ensureMarketInitialized();

      const { Storage } = await import("./storage");
      const defaultsStorage = Storage.getDefaultsStorage();

      const config = await defaultsStorage.readYaml(
        `agents/${templateId}.yaml`
      );

      // Load prompt file if specified
      if (config.promptFile) {
        try {
          const promptContent = await defaultsStorage.readTextFile(
            `prompts/${config.promptFile}`
          );
          config.systemPrompt = promptContent;
        } catch (error) {
          console.warn(`Failed to load prompt for ${templateId}:`, error);
        }
      }

      return config as AgentTemplate;
    } catch (error) {
      console.error(
        `[AgentMarket] Failed to load template ${templateId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Instantiate a template into a space agent
   * @param templateId - ID of the template to instantiate
   * @param customization - Custom values for template variables
   * @returns AgentConfig ready to be used
   */
  static async instantiateTemplate(
    templateId: string,
    customization?: Record<string, any>
  ): Promise<AgentConfig> {
    const template = await this.getTemplate(templateId);

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Start with the template as base
    const agentConfig: AgentConfig = {
      id: customization?.id || template.id,
      name: customization?.name || template.name,
      description: customization?.description || template.description,
      llm: template.llm,
      promptFile: customization?.promptFile || template.promptFile,
      systemPrompt: template.systemPrompt,
      tools: customization?.tools || template.tools,
      personality: template.personality,
      examples: template.examples,
    };

    // Apply template variable substitutions if needed
    if (template.variables && customization) {
      // Process variables (e.g., replace placeholders in prompt)
      if (agentConfig.systemPrompt) {
        let prompt = agentConfig.systemPrompt;

        for (const variable of template.variables) {
          const value = customization[variable.name] ?? variable.default;
          if (value !== undefined) {
            prompt = prompt.replace(
              new RegExp(`{{${variable.name}}}`, "g"),
              String(value)
            );
          }
        }

        agentConfig.systemPrompt = prompt;
      }
    }

    return agentConfig;
  }

  /**
   * Save an agent instance to user's config
   * This creates an instance from a template
   */
  static async saveAgentInstance(agentConfig: AgentConfig): Promise<void> {
    const { Storage } = await import("./storage");
    const rootStorage = Storage.getRootStorage();
    const configStorage = Storage.getConfigStorage();

    // Ensure agents directory exists in root storage
    await rootStorage.mkdir("agents");

    // Generate unique ID if not provided
    const agentId = agentConfig.id || `agent-${Date.now()}`;
    const agentData = {
      ...agentConfig,
      id: agentId,
      createdAt: agentConfig.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save agent config to ~/.viber/agents/
    await rootStorage.writeYaml(`agents/${agentId}.yaml`, agentData);

    // Save prompt if it exists and isn't already saved
    if (agentConfig.systemPrompt && agentConfig.promptFile) {
      await configStorage.mkdir("prompts");
      const promptPath = `prompts/${agentConfig.promptFile}`;

      // Only save if it doesn't exist (avoid overwriting custom prompts)
      const exists = await configStorage.exists(promptPath);
      if (!exists) {
        await configStorage.writeFile(promptPath, agentConfig.systemPrompt);
      }
    }

    console.log(`[AgentMarket] Saved agent instance: ${agentId}`);
  }

  /**
   * Get template statistics (for future use)
   */
  static async getTemplateStats(templateId: string): Promise<{
    downloads: number;
    rating: number;
    reviews: number;
  }> {
    // Placeholder for future implementation
    // Could track usage, ratings, etc.
    return {
      downloads: 0,
      rating: 0,
      reviews: 0,
    };
  }

  /**
   * Check if a template is installed in user's config
   */
  static async isTemplateInstalled(templateId: string): Promise<boolean> {
    try {
      const adapter = getServerDataAdapter();
      const agents = await adapter.getAgents();
      return agents.some((agent) => agent.id === templateId);
    } catch {
      return false;
    }
  }

  /**
   * Get featured templates (for homepage/dashboard)
   */
  static async getFeaturedTemplates(
    limit: number = 6
  ): Promise<AgentTemplate[]> {
    const allTemplates = await this.getAllTemplates();
    // For now, just return the first N templates
    // In the future, could have a "featured" flag in the template metadata
    return allTemplates.slice(0, limit);
  }
}
