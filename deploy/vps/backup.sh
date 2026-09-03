#!/usr/bin/env bash
set -Eeuo pipefail

deployment_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_dir="${deployment_root}/backups"

mkdir -p "${backup_dir}"
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_file="${backup_dir}/.crm-agents-${timestamp}.sql.gz.tmp"
final_file="${backup_dir}/crm-agents-${timestamp}.sql.gz"

cd "${deployment_root}"
docker compose -f deploy/vps/docker-compose.yml exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "${temporary_file}"
mv "${temporary_file}" "${final_file}"
find "${backup_dir}" -type f -name 'crm-agents-*.sql.gz' -mtime +7 -delete
