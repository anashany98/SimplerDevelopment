#!/usr/bin/env bash
set -Eeuo pipefail

deployment_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_dir="${deployment_root}/backups"
minio_backup_dir="${backup_dir}/minio"

mkdir -p "${backup_dir}" "${minio_backup_dir}"
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_file="${backup_dir}/.crm-agents-${timestamp}.sql.gz.tmp"
final_file="${backup_dir}/crm-agents-${timestamp}.sql.gz"
temporary_minio_dir="${minio_backup_dir}/.crm-agents-${timestamp}.tmp"
final_minio_dir="${minio_backup_dir}/crm-agents-${timestamp}"

cd "${deployment_root}"
docker compose -f deploy/vps/docker-compose.yml exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "${temporary_file}"
mv "${temporary_file}" "${final_file}"
docker compose -f deploy/vps/docker-compose.yml run --rm --no-deps \
  --entrypoint /bin/sh -e BACKUP_TIMESTAMP="${timestamp}" minio-init -ec '
    umask 077
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite --remove "local/$S3_BUCKET_NAME" "/backup/.crm-agents-${BACKUP_TIMESTAMP}.tmp"
  '
mv "${temporary_minio_dir}" "${final_minio_dir}"
find "${backup_dir}" -type f -name 'crm-agents-*.sql.gz' -mtime +7 -delete
find "${minio_backup_dir}" -mindepth 1 -maxdepth 1 -type d -name 'crm-agents-*' -mtime +7 -exec rm -rf -- {} +
