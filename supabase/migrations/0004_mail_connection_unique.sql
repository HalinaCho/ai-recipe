-- One mailbox connects to a household exactly once. Without this, the
-- Gmail OAuth callback had to do a select-then-update-or-insert, which
-- races against a concurrent callback (a double-clicked connect button is
-- enough) and can duplicate a connection — which would then double-count
-- every order mail into inventory.
--
-- Re-connecting the same mailbox is an intentional update of the stored
-- credential, so this constraint lets the callback use a real upsert.

alter table mail_connection
  add constraint mail_connection_household_provider_address_key
  unique (household_id, provider, email_address);
