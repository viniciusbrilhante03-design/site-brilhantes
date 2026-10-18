-- Add missing columns for MongoDB compatibility
ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_reason TEXT DEFAULT '';

ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '';
ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS cancel_reason TEXT DEFAULT '';

-- Update _TABLE_META in mongo_compat.py will reference these
