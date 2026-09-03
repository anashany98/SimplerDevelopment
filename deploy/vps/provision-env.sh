#!/usr/bin/env bash
set -Eeuo pipefail

origin="${1:?Usage: provision-env.sh http://public-host}"

if [[ -e .env.production ]]; then
  echo '.env.production already exists; refusing to overwrite it.' >&2
  exit 1
fi

random_hex() {
  openssl rand -hex "${1:-32}"
}

umask 077

auth_secret="$(random_hex 32)"
minio_secret="$(random_hex 32)"
admin_password="$(random_hex 16)"

{
  printf '%s\n' "POSTGRES_USER=crm_agents"
  printf '%s\n' "POSTGRES_PASSWORD=$(random_hex 32)"
  printf '%s\n' "POSTGRES_DB=crm_agents"
  printf '%s\n' "AUTH_SECRET=${auth_secret}"
  printf '%s\n' "NEXTAUTH_SECRET=${auth_secret}"
  printf '%s\n' "NEXTAUTH_URL=${origin}"
  printf '%s\n' "NEXT_PUBLIC_APP_URL=${origin}"
  printf '%s\n' "NEXT_PUBLIC_SITE_URL=${origin}"
  printf '%s\n' 'NEXT_PUBLIC_SIGNUP_DISABLED=true'
  printf '%s\n' 'AUTH_TRUST_HOST=true'
  printf '%s\n' "CRON_SECRET=$(random_hex 32)"
  printf '%s\n' "PORTAL_KMS_KEY=$(openssl rand -base64 32 | tr -d '\n')"
  printf '%s\n' "WORKSPACE_TENANT_SECRETS_KEY=$(random_hex 32)"
  printf '%s\n' "ENCRYPTION_KEY=$(random_hex 32)"
  printf '%s\n' "CHAT_TOKEN_SECRET=$(random_hex 32)"
  printf '%s\n' "META_OAUTH_STATE_SECRET=$(random_hex 32)"
  printf '%s\n' 'EMAIL_TRANSPORT=mailpit'
  printf '%s\n' 'MAILPIT_SMTP_HOST=mailpit'
  printf '%s\n' 'MAILPIT_SMTP_PORT=1025'
  printf '%s\n' 'MINIO_ROOT_USER=crmagents'
  printf '%s\n' "MINIO_ROOT_PASSWORD=${minio_secret}"
  printf '%s\n' 'S3_REGION=us-east-1'
  printf '%s\n' 'S3_BUCKET_NAME=crm-agents-media'
  printf '%s\n' "S3_PUBLIC_ENDPOINT=${origin}:9000"
  printf '%s\n' 'ADMIN_EMAIL=admin@crm-agents.local'
  printf '%s\n' "ADMIN_PASSWORD=${admin_password}"
} > .env.production

chmod 600 .env.production
echo 'Created .env.production with fresh credentials.'
