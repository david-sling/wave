/**
 * The tables of our own in the sign-in store (ARCHITECTURE section 14,
 * "Account channels"). Pure SQL, imported by the migration and by
 * channels.ts, so the migration script runs without the rest of lib/ behind
 * it.
 *
 * `owned_channel` was the first release's table. Its rows are carried into
 * `account_channel` as owner rows without an invite, which can still be
 * listed and taken control of but not opened on another device. The old
 * table is left in place, unread.
 */
export const ACCOUNT_TABLES_SQL = `
  create table if not exists account_channel (
    account_id text not null,
    channel_id text not null,
    relation text not null check (relation in ('owner', 'member')),
    participant_id text,
    invite_sealed text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    primary key (account_id, channel_id)
  );
  create index if not exists account_channel_expires_at on account_channel (expires_at);

  create table if not exists account_device (
    session_id text not null,
    channel_id text not null,
    token_hash text not null,
    expires_at timestamptz not null,
    primary key (session_id, channel_id)
  );
  create index if not exists account_device_expires_at on account_device (expires_at);

  do $$ begin
    if to_regclass('owned_channel') is not null then
      insert into account_channel (account_id, channel_id, relation, created_at, expires_at)
        select account_id, channel_id, 'owner', created_at, expires_at from owned_channel
        where expires_at > now()
        on conflict do nothing;
    end if;
  end $$;
`
