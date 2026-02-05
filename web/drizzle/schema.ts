import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Connected vibers are tracked in memory, but we persist history/metadata
export const vibers = sqliteTable("vibers", {
  id: text("id").primaryKey(), // Viber's self-reported ID
  name: text("name").notNull(),
  platform: text("platform"), // darwin, linux, win32
  version: text("version"),
  capabilities: text("capabilities", { mode: "json" }).$type<string[]>(),
  lastConnected: integer("last_connected", { mode: "timestamp" }),
  lastDisconnected: integer("last_disconnected", { mode: "timestamp" }),
  totalTasks: integer("total_tasks").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Spaces synced from vibers
export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  viberId: text("viber_id")
    .references(() => vibers.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name"),
  goal: text("goal"),
  status: text("status"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Task submissions and history
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  viberId: text("viber_id")
    .references(() => vibers.id, { onDelete: "cascade" })
    .notNull(),
  spaceId: text("space_id"),
  goal: text("goal").notNull(),
  status: text("status").default("pending"), // pending, running, completed, error
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// Chat messages (user interactions with vibers)
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  viberId: text("viber_id")
    .references(() => vibers.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});



// Export types
export type Viber = typeof vibers.$inferSelect;
export type NewViber = typeof vibers.$inferInsert;
export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
