-- Add config_sync_state column to viber_nodes table
-- This stores the node's config validation results so the web UI can show them
-- even across gateway restarts.

ALTER TABLE viber_nodes
ADD COLUMN IF NOT EXISTS config_sync_state jsonb DEFAULT '{}';

COMMENT ON COLUMN viber_nodes.config_sync_state IS 'Config sync state from node (configVersion, lastConfigPullAt, validations)';
