INSERT OR IGNORE INTO settings (key, value) VALUES ('s3_region', 'auto');
UPDATE settings
SET value = 'auto'
WHERE key = 's3_region' AND TRIM(value) = '';
