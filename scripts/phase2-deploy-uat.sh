#!/usr/bin/env bash
# Run on the existing UAT host only, with an exact, already-tested Git SHA.
# prepare: backup + immutable image + loopback preflight; activate: UAT only.
set -euo pipefail
umask 077
mode=${1:?prepare or activate}
release_sha=${2:?full Git SHA}
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
app=/srv/kivisense-crm-uat
release_short=${release_sha:0:12}
release=/srv/kivisense-crm-uat-releases/$release_short
image=kivisense-crm-uat:$release_short
preflight=kivisense-crm-phase2-preflight-$release_short
test -d "$app/storage"
test -f "$release/backend/Dockerfile"
test -f "$release/DEPLOYED_COMMIT"
test "$(<"$release/DEPLOYED_COMMIT")" = "$release_sha"
snapshot() {
  docker inspect sowind-crm-backend-1 sowind-crm-test-backend-1 --format '{{.Name}} {{.Image}} {{.State.StartedAt}}'
}
counts() {
  docker exec sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N kivisense_crm_uat -e "SELECT '\''organizations'\'', COUNT(*) FROM organizations UNION ALL SELECT '\''contacts'\'', COUNT(*) FROM contacts UNION ALL SELECT '\''leads'\'', COUNT(*) FROM crm_leads UNION ALL SELECT '\''contact_followups'\'', COUNT(*) FROM contact_followups UNION ALL SELECT '\''lead_followups'\'', COUNT(*) FROM lead_followups UNION ALL SELECT '\''tasks'\'', COUNT(*) FROM crm_tasks UNION ALL SELECT '\''attachments'\'', COUNT(*) FROM crm_attachments UNION ALL SELECT '\''nurtures'\'', COUNT(*) FROM organization_nurtures UNION ALL SELECT '\''migrations'\'', COUNT(*) FROM _prisma_migrations;"'
}
if [[ "$mode" = prepare ]]; then
  test ! -e "$release/PREFLIGHT_PASS"
  backup=/srv/kivisense-crm-backups/$(date -u +%Y%m%dT%H%M%SZ)-pre-$release_short
  mkdir -p "$backup"
  printf '%s\n' "$backup" > "$release/BACKUP_PATH"
  snapshot > "$backup/production-test-before.txt"
  counts > "$backup/business-counts-before.tsv"
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
  docker run -d --rm --name "$preflight" --env-file "$app/.env" --network sowind-crm-test_default -p 127.0.0.1:3203:3000 -v "$app/storage:/app/storage:ro" "$image"
  trap 'docker stop "$preflight" >/dev/null 2>&1 || true' EXIT
  healthy=false
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3203/api/ready > "$release/preflight-health.json"; then healthy=true; break; fi
    sleep 1
  done
  test "$healthy" = true
  grep -q '"database":"ok"' "$release/preflight-health.json"
  curl -fsS http://127.0.0.1:3203/ > "$release/preflight-entry.html"
  grep -q 'assets/app.js' "$release/preflight-entry.html"
  counts > "$backup/business-counts-preflight.tsv"
  diff -u "$backup/business-counts-before.tsv" "$backup/business-counts-preflight.tsv"
  snapshot > "$backup/production-test-preflight.txt"
  diff -u "$backup/production-test-before.txt" "$backup/production-test-preflight.txt"
  docker stop "$preflight"
  trap - EXIT
  printf '%s\n' "$release_sha" > "$release/PREFLIGHT_PASS"
  printf 'PREPARE_PASS %s backup=%s\n' "$release_sha" "$backup"
elif [[ "$mode" = activate ]]; then
  test "$(<"$release/PREFLIGHT_PASS")" = "$release_sha"
  backup=$(<"$release/BACKUP_PATH")
  [[ "$backup" = /srv/kivisense-crm-backups/* ]] || exit 2
  (cd "$backup" && sha256sum -c SHA256SUMS)
  # The exact Git archive has no secrets or storage; preserve runtime-only files.
  tar -xzf "/srv/kivisense-crm-uat-releases/$release_short.tar.gz" -C "$app"
  sed -i "s|image: kivisense-crm-uat:.*|image: $image|" "$app/docker-compose.uat.yml"
  cd "$app"
  docker compose -f docker-compose.uat.yml up -d --no-deps --force-recreate backend
  healthy=false
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3202/api/ready > "$release/deployed-health.json"; then healthy=true; break; fi
    sleep 1
  done
  if [[ "$healthy" != true ]] || ! grep -q '"database":"ok"' "$release/deployed-health.json"; then
    # Restore only the backed-up UAT app/config and previous image. No DB rollback.
    tar -xzf "$backup/application.tgz" -C "$app"
    docker compose -f docker-compose.uat.yml up -d --no-deps --force-recreate backend
    echo 'UAT_HEALTH_FAILED_ROLLED_BACK' >&2
    exit 1
  fi
  printf '%s\n' "$release_sha" > "$app/DEPLOYED_COMMIT"
  counts > "$backup/business-counts-after.tsv"
  diff -u "$backup/business-counts-before.tsv" "$backup/business-counts-after.tsv"
  snapshot > "$backup/production-test-after.txt"
  diff -u "$backup/production-test-before.txt" "$backup/production-test-after.txt"
  nginx -t
  printf 'ACTIVATE_PASS %s backup=%s\n' "$release_sha" "$backup"
else
  exit 2
fi
