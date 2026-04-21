#!/usr/bin/with-contenv bashio

bashio::log.info "Loading config..."

set_config_env() {
    local key="$1"
    export "${key}=$(bashio::config "${key}")"
}

set_config_env "HA_BASE_URL"
set_config_env "HA_SCREENSHOT_URL"
set_config_env "HA_ACCESS_TOKEN"
set_config_env "HA_THEME"
set_config_env "HTTP_AUTH_USER"
set_config_env "HTTP_AUTH_PASSWORD"
set_config_env "LANGUAGE"
set_config_env "CRON_JOB"
set_config_env "RENDERING_TIMEOUT"
set_config_env "RENDERING_DELAY"
set_config_env "RENDERING_SCREEN_HEIGHT"
set_config_env "RENDERING_SCREEN_WIDTH"
set_config_env "BROWSER_LAUNCH_TIMEOUT"
set_config_env "ROTATION"
set_config_env "SCALING"
set_config_env "GRAYSCALE_DEPTH"
set_config_env "IMAGE_FORMAT"
set_config_env "COLOR_MODE"
set_config_env "REMOVE_GAMMA"
set_config_env "DITHER"
set_config_env "BLACK_LEVEL"
set_config_env "WHITE_LEVEL"
set_config_env "PREFERS_COLOR_SCHEME"
set_config_env "HA_BATTERY_WEBHOOK"
set_config_env "DEBUG"
set_config_env "UNSAFE_IGNORE_CERTIFICATE_ERRORS"
set_config_env "SATURATION"
set_config_env "CONTRAST"

bashio::log.info "Loading additional environment variables..."

# Load custom environment variables
for var in $(bashio::config 'ADDITIONAL_ENV_VARS|keys'); do
    name="$(bashio::config "ADDITIONAL_ENV_VARS[${var}].name")"
    value="$(bashio::config "ADDITIONAL_ENV_VARS[${var}].value")"
    bashio::log.info "Setting ${name} to ${value}"
    export "${name}=${value}"
done

bashio::log.info "Using HA_BASE_URL: ${HA_BASE_URL}"

bashio::log.info "Starting server..."

cd /app
exec /usr/bin/node dist/index.js
