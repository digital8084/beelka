-- Keep the database migration ledger private to the migration process.
-- Application roles may append to event history but cannot rewrite or erase it.
-- Local development installs without a beelka_runtime role remain compatible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beelka_runtime') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE schema_migrations FROM beelka_runtime';
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE audit_events, order_events FROM beelka_runtime';
  END IF;
END;
$$;
