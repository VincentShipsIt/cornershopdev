#!/bin/sh
set -eu

bun run db:migrate:deploy
bun run workflow:migrate
exec node server.js
