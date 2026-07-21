# Runlu Warehouse AI V5.4.0 — Cloud Setup

## One-time Supabase setup

1. Open the Supabase project dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `supabase_setup.sql` into the query.
4. Tap **Run**. The script creates the protected data table, private file bucket, timestamp trigger, and Row Level Security policies.
5. Publish all files in this ZIP to the existing GitHub Pages site.

## First/original phone

1. Open **Settings > Cloud Sync**.
2. Enter an app-login email and a new password (minimum 8 characters), then choose **Create App Login**.
3. Confirm the email if Supabase requests it, then choose **Sign In**.
4. Download an Upgrade Backup as an additional safety copy.
5. Choose **Upload This Device** once.

## Replacement or additional phone

1. Open the same published app address.
2. Open **Settings > Cloud Sync** and sign in with the same app-login account.
3. Choose **Download Cloud Data**.
4. The device retains an offline local copy and synchronizes subsequent changes automatically.

## Security notes

- The embedded Publishable key is intended for browser applications and is protected by Row Level Security.
- Never place a Supabase secret key, service-role key, database password, or dashboard password in `index.html`.
- Each authenticated app user can access only rows and private files stored under that user's ID.
- Keep periodic JSON backups even after cloud synchronization is enabled.

