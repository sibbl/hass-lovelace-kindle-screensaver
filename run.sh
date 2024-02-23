#!/usr/bin/with-contenv bashio

bashio::log.info "Loading config..."

export HA_BASE_URL="$(bashio::config 'HA_BASE_URL')"
export HA_SCREENSHOT_URL=$(bashio::config 'HA_SCREENSHOT_URL')
export HA_ACCESS_TOKEN="$(bashio::config 'HA_ACCESS_TOKEN')"
export LANGUAGE=$(bashio::config 'LANGUAGE')
export CRON_JOB=$(bashio::config 'CRON_JOB')
export RENDERING_TIMEOUT=$(bashio::config 'RENDERING_TIMEOUT')
export RENDERING_DELAY=$(bashio::config 'RENDERING_DELAY')
export RENDERING_SCREEN_HEIGHT=$(bashio::config 'RENDERING_SCREEN_HEIGHT')
export RENDERING_SCREEN_WIDTH=$(bashio::config 'RENDERING_SCREEN_WIDTH')
export BROWSER_LAUNCH_TIMEOUT=$(bashio::config 'BROWSER_LAUNCH_TIMEOUT')
export ROTATION=$(bashio::config 'ROTATION')
export SCALING=$(bashio::config 'SCALING')
export GRAYSCALE_DEPTH=$(bashio::config 'GRAYSCALE_DEPTH')
export COLOR_MODE=$(bashio::config 'COLOR_MODE')
export REMOVE_GAMMA=$(bashio::config 'REMOVE_GAMMA')
export PREFERS_COLOR_SCHEME=$(bashio::config 'PREFERS_COLOR_SCHEME')
export HA_BATTERY_WEBHOOK=$(bashio::config 'HA_BATTERY_WEBHOOK')

bashio::log.info "Loading additional environment variables..."

# Load custom environment variables
for var in $(bashio::config 'ADDITIONAL_ENV_VARS|keys'); do
    name=$(bashio::config "ADDITIONAL_ENV_VARS[${var}].name")
    value=$(bashio::config "ADDITIONAL_ENV_VARS[${var}].value")
    bashio::log.info "Setting ${name} to ${value}"
    export "${name}=${value}"
done

bashio::log.info "Using HA_BASE_URL: ${HA_BASE_URL}"

bashio::log.info "Starting server..."

cd /app
exec /usr/bin/npm start
