-- Remove proxy_sender_id column from messages table
-- Proxy messaging no longer swaps sender_id; the proxy account sends as itself.
-- is_proxy flag is kept to mark messages sent from a proxy account.

-- 1. Drop the CHECK constraint that required proxy_sender_id when is_proxy = true
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_proxy_consistency;

-- 2. Drop the proxy_sender_id column (and its FK)
ALTER TABLE messages DROP COLUMN IF EXISTS proxy_sender_id;
