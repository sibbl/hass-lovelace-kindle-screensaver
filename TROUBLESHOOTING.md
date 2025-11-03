# Troubleshooting Guide

## ERR_NAME_NOT_RESOLVED Error

### What is this error?

When you see an error like:
```
Error: net::ERR_NAME_NOT_RESOLVED at https://your-path-to-home-assistant:8123
```

This means the application cannot resolve the hostname in your `HA_BASE_URL` configuration to an IP address.

### Why does this happen?

This error typically occurs in the following scenarios:

1. **Using the default placeholder URL**: The addon's default configuration uses `https://your-path-to-home-assistant:8123` as a placeholder value. This is not a real domain name and cannot be resolved by DNS.

2. **Typo in the hostname**: You may have misspelled your Home Assistant hostname or domain name.

3. **Network/DNS issues**: Your network or DNS server cannot resolve the hostname you've configured.

4. **Home Assistant not accessible**: Your Home Assistant instance might not be reachable from where this addon is running.

### How to fix it

#### Step 1: Configure HA_BASE_URL correctly

Replace the placeholder URL with your actual Home Assistant instance URL. Here are some examples:

**For local network access:**
```yaml
HA_BASE_URL: "http://homeassistant.local:8123"
```
or
```yaml
HA_BASE_URL: "http://192.168.1.100:8123"
```

**For remote access (with SSL):**
```yaml
HA_BASE_URL: "https://my-home.duckdns.org:8123"
```

**For Home Assistant supervised installations:**
- If running as an addon, you can use: `http://supervisor/core`
- This uses Home Assistant's internal networking

#### Step 2: Verify your Home Assistant is accessible

Test your Home Assistant URL by opening it in a web browser. If you can't access it in a browser, this addon won't be able to access it either.

#### Step 3: Configure HA_ACCESS_TOKEN

You also need a long-lived access token:

1. Log in to your Home Assistant instance
2. Click on your username in the lower left corner
3. Scroll down to "Long-Lived Access Tokens"
4. Click "Create Token"
5. Give it a name (e.g., "Kindle Screensaver")
6. Copy the token and set it as `HA_ACCESS_TOKEN` in your configuration

#### Step 4: Restart the addon

After updating your configuration, restart the addon for the changes to take effect.

### Common Configuration Examples

#### Running as Home Assistant Addon

When running as a Home Assistant addon, use the internal URL:
```yaml
HA_BASE_URL: "http://supervisor/core"
HA_SCREENSHOT_URL: "/lovelace/0"
HA_ACCESS_TOKEN: "your-long-lived-access-token-here"
```

#### Running in Docker on same machine as Home Assistant

```yaml
HA_BASE_URL: "http://homeassistant.local:8123"
HA_SCREENSHOT_URL: "/lovelace/0"
HA_ACCESS_TOKEN: "your-long-lived-access-token-here"
```

#### Running in Docker on different machine

```yaml
HA_BASE_URL: "http://192.168.1.100:8123"
HA_SCREENSHOT_URL: "/lovelace/0"
HA_ACCESS_TOKEN: "your-long-lived-access-token-here"
```

### Still having issues?

If you continue to experience issues after following these steps:

1. Check the addon logs for more specific error messages
2. Verify network connectivity between the addon and Home Assistant
3. Ensure your Home Assistant instance is running and accessible
4. Check if you're using HTTPS with self-signed certificates (you may need to set `UNSAFE_IGNORE_CERTIFICATE_ERRORS: true`)

### Validation Messages

The application now includes validation to detect common configuration issues before attempting to connect. You may see these helpful messages:

- **"ERROR: HA_BASE_URL is not configured"**: You need to set the HA_BASE_URL environment variable
- **"ERROR: HA_BASE_URL contains placeholder text"**: You're still using the default example URL
- **"ERROR: HA_ACCESS_TOKEN is not configured"**: You need to create and configure a long-lived access token

These validation checks help catch configuration problems early, preventing the ERR_NAME_NOT_RESOLVED error from occurring.
