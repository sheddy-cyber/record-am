-- Migration to add total_discounts to daily_summaries
ALTER TABLE daily_summaries
ADD COLUMN IF NOT EXISTS total_discounts NUMERIC(12,2) DEFAULT 0;
