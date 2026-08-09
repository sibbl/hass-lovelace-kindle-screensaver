#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${repository_root}/compose.e2e.yml"
project_name="hass-kindle-e2e-$$"
addon_data_dir="$(mktemp -d /tmp/hass-kindle-e2e.XXXXXX)"
http_auth_user="e2e-user"
http_auth_password="e2e-password"
numbered_http_auth_user="e2e-user-2"
numbered_http_auth_password="e2e-password-2"

case "${project_name}" in
  hass-kindle-e2e-[0-9]*) ;;
  *)
    echo "Refusing to use unexpected Compose project name: ${project_name}" >&2
    exit 1
    ;;
esac

case "${addon_data_dir}" in
  /tmp/hass-kindle-e2e.*) ;;
  *)
    echo "Refusing to use unexpected add-on data directory: ${addon_data_dir}" >&2
    exit 1
    ;;
esac

export HA_E2E_ADDON_DATA="${addon_data_dir}"

if [[ -z "${HA_E2E_ADDON_BASE:-}" ]]; then
  docker_architecture="$(docker info --format '{{.Architecture}}')"
  case "${docker_architecture}" in
    amd64 | x86_64)
      HA_E2E_ADDON_BASE="ghcr.io/home-assistant/amd64-base:3.22-2025.11.1"
      ;;
    arm64 | aarch64)
      HA_E2E_ADDON_BASE="ghcr.io/home-assistant/aarch64-base:3.22-2025.11.1"
      ;;
    arm | armv7 | armv7l)
      HA_E2E_ADDON_BASE="ghcr.io/home-assistant/armv7-base:3.22-2025.11.1"
      ;;
    *)
      echo "Unsupported Docker architecture: ${docker_architecture}" >&2
      exit 1
      ;;
  esac
  export HA_E2E_ADDON_BASE
fi

compose() {
  docker compose --project-name "${project_name}" --file "${compose_file}" "$@"
}

assert_http_status() {
  local expected_status="$1"
  local target_url="$2"
  shift 2

  local actual_status
  actual_status="$(
    curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
      "$@" "${target_url}"
  )"
  if [[ "${actual_status}" != "${expected_status}" ]]; then
    echo "Expected HTTP ${expected_status} from ${target_url}, got ${actual_status}" >&2
    exit 1
  fi
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  if [[ -d "${addon_data_dir}" && ! -L "${addon_data_dir}" ]]; then
    rm -rf -- "${addon_data_dir}"
  fi
}
trap cleanup EXIT INT TERM

cd "${repository_root}"

echo "Starting Home Assistant e2e fixture..."
HA_E2E_ACCESS_TOKEN=not-initialized compose up --detach --wait --wait-timeout 240 home-assistant

home_assistant_endpoint="$(compose port home-assistant 8123)"
if [[ ! "${home_assistant_endpoint}" =~ ^(127\.0\.0\.1|0\.0\.0\.0|\[::\]):[0-9]+$ ]]; then
  echo "Unexpected Home Assistant endpoint: ${home_assistant_endpoint}" >&2
  exit 1
fi
home_assistant_url="http://${home_assistant_endpoint}"

echo "Creating an isolated Home Assistant owner and access token..."
access_token="$(
  node tests/e2e/create-home-assistant-token.mjs \
    "${home_assistant_url}" \
    "http://home-assistant:8123/"
)"
if [[ -z "${access_token}" ]]; then
  echo "Home Assistant did not return an access token" >&2
  exit 1
fi

echo "Building and starting the screensaver container..."
HA_E2E_ACCESS_TOKEN="${access_token}" compose up --detach --build app

app_endpoint="$(compose port app 5000)"
if [[ ! "${app_endpoint}" =~ ^(127\.0\.0\.1|0\.0\.0\.0|\[::\]):[0-9]+$ ]]; then
  echo "Unexpected application endpoint: ${app_endpoint}" >&2
  exit 1
fi
app_url="http://${app_endpoint}"

echo "Waiting for both real Lovelace renders..."
rendered=false
for _ in $(seq 1 90); do
  if curl --fail --silent --output /dev/null \
    --user "${http_auth_user}:${http_auth_password}" "${app_url}/" \
    && curl --fail --silent --output /dev/null \
      --user "${numbered_http_auth_user}:${numbered_http_auth_password}" "${app_url}/2"; then
    rendered=true
    break
  fi
  sleep 2
done
if [[ "${rendered}" != "true" ]]; then
  compose logs app home-assistant >&2
  echo "The application did not produce both images within 180 seconds" >&2
  exit 1
fi

echo "Checking page-specific HTTP authentication..."
assert_http_status 401 "${app_url}/"
assert_http_status 200 "${app_url}/" --user "${http_auth_user}:${http_auth_password}"
assert_http_status 401 "${app_url}/2" --user "${http_auth_user}:${http_auth_password}"
assert_http_status 200 "${app_url}/2" \
  --user "${numbered_http_auth_user}:${numbered_http_auth_password}"

echo "Checking rendered image properties and runtime fonts..."
image_properties="$(
  compose exec --no-TTY app \
    identify -format "%m %wx%h %[colorspace] %[type]" /output/cover.png
)"
if [[ ! "${image_properties}" =~ ^PNG\ 600x800\  ]]; then
  echo "Unexpected rendered image properties: ${image_properties}" >&2
  exit 1
fi
numbered_image_properties="$(
  compose exec --no-TTY app \
    identify -format "%m %wx%h %[colorspace] %[type]" /output/cover_2.png
)"
if [[ ! "${numbered_image_properties}" =~ ^PNG\ 600x800\  ]]; then
  echo "Unexpected numbered rendered image properties: ${numbered_image_properties}" >&2
  exit 1
fi

compose exec --no-TTY app fc-match sans:lang=ko | grep --quiet "NotoSansCJK"
compose exec --no-TTY app fc-match emoji | grep --quiet "NotoColorEmoji"

echo "Checking HTTP cache validation..."
etag="$(
  curl --silent --show-error --head \
    --user "${http_auth_user}:${http_auth_password}" "${app_url}/" \
    | tr -d "\r" \
    | sed -n 's/^ETag: //p'
)"
if [[ -z "${etag}" ]]; then
  echo "Rendered image response did not include an ETag" >&2
  exit 1
fi
not_modified_status="$(
  curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
    --user "${http_auth_user}:${http_auth_password}" \
    --header "If-None-Match: ${etag}" \
    "${app_url}/"
)"
if [[ "${not_modified_status}" != "304" ]]; then
  echo "Expected a 304 cache response, got ${not_modified_status}" >&2
  exit 1
fi

echo "Checking on-demand rendering..."
assert_http_status 401 "${app_url}/render/2" --request POST \
  --user "${http_auth_user}:${http_auth_password}"
render_response="$(
  curl --fail --silent --show-error --request POST \
    --user "${http_auth_user}:${http_auth_password}" "${app_url}/render"
)"
if [[ "${render_response}" != '{"status":"ok"}' ]]; then
  echo "Unexpected on-demand render response: ${render_response}" >&2
  exit 1
fi
numbered_render_response="$(
  curl --fail --silent --show-error --request POST \
    --user "${numbered_http_auth_user}:${numbered_http_auth_password}" \
    "${app_url}/render/2"
)"
if [[ "${numbered_render_response}" != '{"status":"ok"}' ]]; then
  echo "Unexpected numbered on-demand render response: ${numbered_render_response}" >&2
  exit 1
fi

curl --fail --silent --show-error --output /dev/null "${app_url}/health"

echo "Building and starting the Home Assistant add-on container..."
node tests/e2e/create-addon-options.mjs \
  "${addon_data_dir}/options.json" \
  "http://home-assistant:8123" \
  "${access_token}" \
  "${http_auth_user}" \
  "${http_auth_password}" \
  "${numbered_http_auth_user}" \
  "${numbered_http_auth_password}"
compose up --detach --build app-addon

addon_endpoint="$(compose port app-addon 5000)"
if [[ ! "${addon_endpoint}" =~ ^(127\.0\.0\.1|0\.0\.0\.0|\[::\]):[0-9]+$ ]]; then
  echo "Unexpected add-on endpoint: ${addon_endpoint}" >&2
  exit 1
fi
addon_url="http://${addon_endpoint}"

echo "Waiting for both of the add-on's real Lovelace renders..."
addon_rendered=false
for _ in $(seq 1 90); do
  if curl --fail --silent --output /dev/null \
    --user "${http_auth_user}:${http_auth_password}" "${addon_url}/" \
    && curl --fail --silent --output /dev/null \
      --user "${numbered_http_auth_user}:${numbered_http_auth_password}" "${addon_url}/2"; then
    addon_rendered=true
    break
  fi
  sleep 2
done
if [[ "${addon_rendered}" != "true" ]]; then
  compose logs app-addon home-assistant >&2
  echo "The add-on did not produce both images within 180 seconds" >&2
  exit 1
fi

echo "Checking add-on page-specific HTTP authentication..."
assert_http_status 401 "${addon_url}/"
assert_http_status 200 "${addon_url}/" --user "${http_auth_user}:${http_auth_password}"
assert_http_status 401 "${addon_url}/2" --user "${http_auth_user}:${http_auth_password}"
assert_http_status 200 "${addon_url}/2" \
  --user "${numbered_http_auth_user}:${numbered_http_auth_password}"

addon_image_properties="$(
  compose exec --no-TTY app-addon \
    identify -format "%m %wx%h %[colorspace] %[type]" /output/cover.png
)"
if [[ ! "${addon_image_properties}" =~ ^PNG\ 600x800\  ]]; then
  echo "Unexpected add-on image properties: ${addon_image_properties}" >&2
  exit 1
fi
addon_numbered_image_properties="$(
  compose exec --no-TTY app-addon \
    identify -format "%m %wx%h %[colorspace] %[type]" /output/cover_2.png
)"
if [[ ! "${addon_numbered_image_properties}" =~ ^PNG\ 600x800\  ]]; then
  echo "Unexpected numbered add-on image properties: ${addon_numbered_image_properties}" >&2
  exit 1
fi

compose exec --no-TTY app-addon fc-match sans:lang=ko | grep --quiet "NotoSansCJK"
compose exec --no-TTY app-addon fc-match emoji | grep --quiet "NotoColorEmoji"
curl --fail --silent --show-error --output /dev/null "${addon_url}/health"

addon_render_response="$(
  curl --fail --silent --show-error --request POST \
    --user "${http_auth_user}:${http_auth_password}" "${addon_url}/render"
)"
if [[ "${addon_render_response}" != '{"status":"ok"}' ]]; then
  echo "Unexpected add-on render response: ${addon_render_response}" >&2
  exit 1
fi
addon_numbered_render_response="$(
  curl --fail --silent --show-error --request POST \
    --user "${numbered_http_auth_user}:${numbered_http_auth_password}" \
    "${addon_url}/render/2"
)"
if [[ "${addon_numbered_render_response}" != '{"status":"ok"}' ]]; then
  echo "Unexpected numbered add-on render response: ${addon_numbered_render_response}" >&2
  exit 1
fi

echo "E2E passed: Home Assistant 2026.7.3, two authenticated standalone and add-on renders"
