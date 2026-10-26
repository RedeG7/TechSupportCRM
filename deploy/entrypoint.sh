#!/bin/sh
# Banco novo (vazio): cria as tabelas pelo shared/schema.ts antes de subir -
# o server/migration.ts só ajusta um banco que já existe. Banco com dados
# (restaurado do Replit) não é tocado.
set -e
if node -e '
  const { Client } = require("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.connect()
    .then(() => c.query("select to_regclass($$public.tickets$$) as t"))
    .then(r => { c.end(); process.exit(r.rows[0].t ? 0 : 1); })
    .catch(e => { console.error(e.message); process.exit(2); });
'; then
  :
else
  echo "Banco vazio: criando as tabelas (drizzle-kit push)"
  npx drizzle-kit push --force
fi
exec node dist/index.js
