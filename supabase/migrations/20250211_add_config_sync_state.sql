-- Add config_sync_state column to viber_nodes table
-- This stores the node's config validation results so the web UI can show them
-- even across gateway restarts.

ALTER TABLE viber_nodes
ADD COLUMN IF NOT EXISTS config_sync_state jsonb DEFAULT '{}';

-- Add index for querying nodes by config sync status
CREATE INDEX IF NOT EXISTS idx_viber_nodes_config_sync_state
ON viber_nodes USING gin (config_sync_state);

-- Add comment
COMMENT ON COLUMN viber_nodes.config_sync_state IS 'Config sync state from the node: configVersion, lastConfigPullAt, validations[]';
