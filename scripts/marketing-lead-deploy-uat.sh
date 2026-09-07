#!/usr/bin/env bash
# Run on the existing UAT host with an exact, already-tested Git SHA.
# Modes are deliberately separate so every destructive boundary has evidence.
set -euo pipefail
umask 077

mode=${1:?prepare, migrate, or activate}
release_sha=${2:?full Git SHA}
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || exit 2

app=/srv/kivisense-crm-uat
release_short=${release_sha:0:12}
release=/srv/kivisense-crm-uat-releases/$release_short
archive=/srv/kivisense-crm-uat-releases/$release_short.tar.gz
image=kivisense-crm-uat:$release_short
preflight=kivisense-crm-marketing-preflight-$release_short
network=sowind-crm-test_default

test -d "$app/storage"
test -f "$release/backend/Dockerfile"
test -f "$release/DEPLOYED_COMMIT"
test "$(<"$release/DEPLOYED_COMMIT")" = "$release_sha"

protected_snapshot() {
  docker inspect sowind-crm-backend-1 sowind-crm-test-backend-1 \
    --format '{{.Name}} {{.Image}} {{.State.StartedAt}}'
}

legacy_counts() {
  docker exec sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N kivisense_crm_uat -e "SELECT '\''organizations'\'', COUNT(*) FROM organizations UNION ALL SELECT '\''contacts'\'', COUNT(*) FROM contacts UNION ALL SELECT '\''opportunities'\'', COUNT(*) FROM crm_leads UNION ALL SELECT '\''contact_followups'\'', COUNT(*) FROM contact_followups UNION ALL SELECT '\''opportunity_followups'\'', COUNT(*) FROM lead_followups UNION ALL SELECT '\''tasks'\'', COUNT(*) FROM crm_tasks UNION ALL SELECT '\''attachments'\'', COUNT(*) FROM crm_attachments UNION ALL SELECT '\''customer_plans'\'', COUNT(*) FROM organization_nurtures;"'
}

migration_count() {
  docker exec sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N kivisense_crm_uat -e "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"'
}

if [[ "$mode" = prepare ]]; then
  test ! -e "$release/PREPARE_PASS"
  backup=/srv/kivisense-crm-backups/$(date -u +%Y%m%dT%H%M%SZ)-pre-marketing-$release_short
  mkdir -p "$backup"
  printf '%s\n' "$backup" > "$release/BACKUP_PATH"
  protected_snapshot > "$backup/production-test-before.txt"
  legacy_counts > "$backup/business-counts-before.tsv"
  migration_count > "$backup/migration-count-before.txt"
  docker inspect kivisense-crm-uat-backend-1 --format '{{.Config.Image}}' > "$backup/previous-image.txt"
  cp "$app/DEPLOYED_COMMIT" "$backup/previous-commit.txt"
  tar -czf "$backup/application.tgz" --exclude='./storage' -C "$app" .
  tar -czf "$backup/attachments.tgz" -C "$app" storage
  tar -czf "$backup/nginx.tgz" -C /etc nginx
  docker exec sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers kivisense_crm_uat' | gzip > "$backup/database.sql.gz"
  gzip -t "$backup/application.tgz" "$backup/attachments.tgz" "$backup/nginx.tgz" "$backup/database.sql.gz"
  (cd "$backup" && sha256sum application.tgz attachments.tgz nginx.tgz database.sql.gz > SHA256SUMS && sha256sum -c SHA256SUMS)
  nginx -t
  docker build -f "$release/backend/Dockerfile" -t "$image" "$release"
  docker run -d --rm --name "$preflight" --env-file "$app/.env" --network "$network" -p 127.0.0.1:3203:3000 -v "$app/storage:/app/storage:ro" "$image"
  trap 'docker stop "$preflight" >/dev/null 2>&1 || true' EXIT
  healthy=false
  for _attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3203/api/ready > "$release/preflight-health.json"; then healthy=true; break; fi
    sleep 1
  done
  test "$healthy" = true
  grep -q '"database":"ok"' "$release/preflight-health.json"
  curl -fsS http://127.0.0.1:3203/ > "$release/preflight-entry.html"
  grep -q 'assets/app.js' "$release/preflight-entry.html"
  legacy_counts > "$backup/business-counts-preflight.tsv"
  diff -u "$backup/business-counts-before.tsv" "$backup/business-counts-preflight.tsv"
  protected_snapshot > "$backup/production-test-preflight.txt"
  diff -u "$backup/production-test-before.txt" "$backup/production-test-preflight.txt"
  docker stop "$preflight"
  trap - EXIT
  printf '%s\n' "$release_sha" > "$release/PREPARE_PASS"
  printf 'PREPARE_PASS %s backup=%s\n' "$release_sha" "$backup"

elif [[ "$mode" = migrate ]]; then
  test "$(<"$release/PREPARE_PASS")" = "$release_sha"
  backup=$(<"$release/BACKUP_PATH")
  [[ "$backup" = /srv/kivisense-crm-backups/* ]] || exit 2
  (cd "$backup" && sha256sum -c SHA256SUMS)
  before=$(<"$backup/migration-count-before.txt")
  test "$before" -ge 7
  test "$before" -le 8
  docker run --rm --name "kivisense-crm-marketing-migrate-$release_short" --env-file "$app/.env" --network "$network" "$image" npm --workspace backend run prisma:migrate:deploy | tee "$backup/migration-output.txt"
  after=$(migration_count)
  test "$after" -eq 8
  docker exec sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N kivisense_crm_uat -e "SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ('\''20260907010000_marketing_lead_opportunity_conversion'\'', '\''20260907160000_product_model_v4'\'') AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name; SELECT '\''marketing_leads'\'', COUNT(*) FROM marketing_leads UNION ALL SELECT '\''lead_activity_events'\'', COUNT(*) FROM lead_activity_events UNION ALL SELECT '\''lead_score_history'\'', COUNT(*) FROM lead_score_history UNION ALL SELECT '\''lead_status_history'\'', COUNT(*) FROM lead_status_history UNION ALL SELECT '\''assignment_notifications'\'', COUNT(*) FROM assignment_notifications;"' > "$backup/marketing-schema-after.tsv"
  grep -q '^20260907010000_marketing_lead_opportunity_conversion$' "$backup/marketing-schema-after.tsv"
  grep -q '^20260907160000_product_model_v4$' "$backup/marketing-schema-after.tsv"
  legacy_counts > "$backup/business-counts-after-migration.tsv"
  diff -u "$backup/business-counts-before.tsv" "$backup/business-counts-after-migration.tsv"
  protected_snapshot > "$backup/production-test-after-migration.txt"
  diff -u "$backup/production-test-before.txt" "$backup/production-test-after-migration.txt"
  printf '%s\n' "$release_sha" > "$release/MIGRATION_PASS"
  printf 'MIGRATION_PASS %s backup=%s\n' "$release_sha" "$backup"

elif [[ "$mode" = activate ]]; then
  test "$(<"$release/PREPARE_PASS")" = "$release_sha"
  test "$(<"$release/MIGRATION_PASS")" = "$release_sha"
  backup=$(<"$release/BACKUP_PATH")
  [[ "$backup" = /srv/kivisense-crm-backups/* ]] || exit 2
  (cd "$backup" && sha256sum -c SHA256SUMS)
  tar -xzf "$archive" -C "$app"
  sed -i "s|image: kivisense-crm-uat:.*|image: $image|" "$app/docker-compose.uat.yml"
  cd "$app"
  docker compose -f docker-compose.uat.yml up -d --no-deps --force-recreate backend
  healthy=false
  for _attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3202/api/ready > "$release/deployed-health.json"; then healthy=true; break; fi
    sleep 1
  done
  if [[ "$healthy" != true ]] || ! grep -q '"database":"ok"' "$release/deployed-health.json"; then
    tar -xzf "$backup/application.tgz" -C "$app"
    docker compose -f docker-compose.uat.yml up -d --no-deps --force-recreate backend
    echo 'UAT_HEALTH_FAILED_APPLICATION_ROLLED_BACK' >&2
    exit 1
  fi
  printf '%s\n' "$release_sha" > "$app/DEPLOYED_COMMIT"
  legacy_counts > "$backup/business-counts-after.tsv"
  diff -u "$backup/business-counts-before.tsv" "$backup/business-counts-after.tsv"
  protected_snapshot > "$backup/production-test-after.txt"
  diff -u "$backup/production-test-before.txt" "$backup/production-test-after.txt"
  nginx -t
  printf 'ACTIVATE_PASS %s backup=%s\n' "$release_sha" "$backup"
else
  exit 2
fi
