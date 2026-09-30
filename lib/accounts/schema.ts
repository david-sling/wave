/**
 * The one table of our own in the sign-in store (ARCHITECTURE section 14,
 * "Ownership"). Pure SQL, imported by the migration and by owned.ts, so the
 * migration script can run without the rest of lib/ behind it.
 */
export const OWNED_CHANNEL_TABLE_SQL = `
  create table if not exists owned_channel (
    account_id text not null,
    channel_id text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    primary key (account_id, channel_id)
  );
  create index if not exists owned_channel_expires_at on owned_channel (expires_at);
`
