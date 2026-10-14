# PostgreSQL Role Separation

This is the deployment contract for databases where Beelka's API runs with restricted privileges. CI exercises these roles against a fresh PostgreSQL 16 database; the commands below are illustrative templates, not production credentials.

## Roles and responsibilities

| Role | Responsibility | Required boundary |
|---|---|---|
| `beelka_migrator` | Owns schema objects and applies checksum-verified SQL migrations | No superuser, database creation, or role creation privileges |
| `beelka_runtime` | API database reads and writes | No DDL, no ownership of application tables, no update/delete of append-only events, no access to the migration ledger |
| DBA/provisioning identity | Creates roles and grants | Used only during controlled provisioning; never configured as the API connection |

Use separate random credentials and a private database network. Never reuse CI fixture passwords in staging or production.

## Provisioning a new database

Run as an authorized PostgreSQL database administrator, substituting the database name and generated passwords:

```sql
CREATE ROLE beelka_migrator
  LOGIN PASSWORD '<unique-migration-secret>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE ROLE beelka_runtime
  LOGIN PASSWORD '<unique-runtime-secret>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE beelka TO beelka_migrator, beelka_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO beelka_migrator;
GRANT USAGE ON SCHEMA public TO beelka_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE beelka_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO beelka_runtime;
```

The default privileges give the runtime role DML on new application tables created by the migration owner. Migration `0005_runtime_role_privileges.sql` removes runtime access to `schema_migrations` and UPDATE/DELETE on `audit_events` and `order_events`.

Run migrations with the migration identity and the API with the runtime identity:

```dotenv
DATABASE_URL=postgresql://beelka_runtime:<runtime-secret>@<private-db-host>:5432/beelka
DATABASE_SSL=true
MIGRATION_DATABASE_URL=postgresql://beelka_migrator:<migration-secret>@<private-db-host>:5432/beelka
MIGRATION_DATABASE_SSL=true
```

Apply `npm run db:migrate` from the controlled release process with `MIGRATION_DATABASE_URL` configured. Do not expose migration credentials to the app's runtime environment when deployment tooling can keep them separate.

## Existing database cutover

Do not simply switch an existing database to `beelka_migrator` without checking ownership. Objects created by an earlier database owner will remain owned by that role, and the migration runner may be unable to record migrations or change grants.

For an existing database:
1. Take a verified backup and test restore before changing ownership or privileges.
2. Inventory ownership of `schema_migrations`, all application tables, and the append-only trigger function.
3. Plan and execute a reviewed one-time ownership transfer using a DBA identity; avoid broad `REASSIGN OWNED` when the old role owns unrelated objects.
4. Apply pending migrations as `beelka_migrator`.
5. Connect as `beelka_runtime` and verify the privilege checks below before deploying the API.

This repository's CI verifies the role contract on disposable, newly created schemas. It does not prove ownership conversion on an existing customer database or authorize a production cutover.

## Evidence required in CI

The PostgreSQL integration test connects as `beelka_runtime` and checks that:
- the runtime role is not a superuser and does not own the append-only history table;
- it can read and append audit/order events;
- it cannot UPDATE or DELETE those events;
- it cannot read the migration ledger;
- PostgreSQL rejects direct UPDATE/DELETE statements with SQLSTATE `42501`.

The append-only triggers remain defense in depth. The privilege boundary matters because a table owner or superuser could bypass ordinary grants. When introducing any new append-only table, revoke UPDATE/DELETE for `beelka_runtime` in the same migration and add a negative privilege test.

## Development compatibility

For local development, `MIGRATION_DATABASE_URL` falls back to `DATABASE_URL` when unset, so a single local database role can still run the scaffold. That convenience is not the deployment posture. Staging/production must use separate roles and prove the privilege tests before release.
