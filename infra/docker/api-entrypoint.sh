#!/bin/sh
set -e
echo "Migratsiyalar qo'llanmoqda..."
npm run --silent migrate:deploy -w @nwi/api
echo "API ishga tushmoqda..."
exec npm run --silent start -w @nwi/api
