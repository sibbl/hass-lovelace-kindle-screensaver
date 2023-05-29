# Home Assistant Lovelace Kindle Screensaver

![ci](https://github.com/sibbl/hass-lovelace-kindle-screensaver/workflows/ci/badge.svg)

This tool can be used to display a Lovelace view of your Home Assistant instance on a [jailbroken](https://www.mobileread.com/forums/showthread.php?t=320564) Kindle device. It regularly takes a screenshot which can be polled and used as a screensaver image of the [online screensaver plugin](https://www.mobileread.com/forums/showthread.php?t=236104).

If you're looking for a way to render your own HTML, see my other project [hass-kindle-screensaver](https://github.com/sibbl/hass-kindle-screensaver) which renders a React page and can be adapted to your specific needs.

## Sample image

![Sample image](https://raw.githubusercontent.com/sibbl/hass-lovelace-kindle-screensaver/main/assets/sample.png)

## Features

This tool regularly takes a screenshot of a specific page of your home assistant setup. It converts it into the PNG grayscale format which Kindles can display.

Using my [own Kindle 4 setup guide](https://github.com/sibbl/hass-lovelace-kindle-4) or the [online screensaver extension](https://www.mobileread.com/forums/showthread.php?t=236104) for any jailbroken Kindle, this image can be regularly polled from your device so you can use it as a weather station, a display for next public transport departures etc.

## Usage

You may simple set up the [sibbl/hass-lovelace-kindle-screensaver](https://hub.docker.com/r/sibbl/hass-lovelace-kindle-screensaver) docker container. The container exposes a single port (5000 by default).

Another way is to use Hassio Addons where you have to add this repository or click [here](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fsibbl%2Fhass-lovelace-kindle-screensaver). Then Reload and you should see options to the Lovelace Kindle Screensaver Addon

I recommend simply using the `docker-compose.yml` file inside this repository, configure everything in there and run `docker-compose up -d` within the file's directory. This will pull the docker image, create the container with all environment variables from the file and run it in detached mode (using `-d`, so it continues running even when you exit your shell/bash/ssh connection).
Additionally, you can then later use `docker-compose pull && docker-compose up -d` to update the image in case you want to update it.

You can then access the image by doing a simple GET request to e.g. `http://localhost:5000/` to receive the most recent image (might take up to 60s after the first run).

Home Assistant related stuff:

| Env Var                   | Sample value                          | Required | Array?\* | Description                                                                                                                                             |
| ------------------------- | ------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HA_BASE_URL`             | `https://your-hass-instance.com:8123` | yes      | no       | Base URL of your home assistant instance                                                                                                                |
| `HA_SCREENSHOT_URL`       | `/lovelace/screensaver?kiosk`         | yes      | yes      | Relative URL to take screenshot of (btw, the `?kiosk` parameter hides the nav bar using the [kiosk mode](https://github.com/NemesisRE/kiosk-mode) project) |
| `HA_ACCESS_TOKEN`         | `eyJ0...`                             | yes      | no       | Long-lived access token from Home Assistant, see [official docs](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token)           |
| `HA_BATTERY_WEBHOOK`      | `set_kindle_battery_level`            | no       | yes      | Webhook definied in HA which receives `batteryLevel` (number between 0-100) and `isCharging` (boolean) as JSON                                          |
| `LANGUAGE`                | `en`                                  | no       | no       | Language to set in browser and home assistant                                                                                                           |
| `CRON_JOB`                | `* * * * *`                           | no       | no       | How often to take screenshot                                                                                                                            |
| `RENDERING_TIMEOUT`       | `10000`                               | no       | no       | Timeout of render process, helpful if your HASS instance might be down                                                                                  |
| `RENDERING_DELAY`         | `0`                                   | no       | yes      | how long to wait between navigating to the page and taking the screenshot, in milliseconds                                                              |
| `RENDERING_SCREEN_HEIGHT` | `800`                                 | no       | yes      | Height of your kindle screen resolution                                                                                                                 |
| `RENDERING_SCREEN_WIDTH`  | `600`                                 | no       | yes      | Width of your kindle screen resolution                                                                                                                  |
| `ROTATION`                | `0`                                   | no       | yes      | Rotation of image in degrees, e.g. use 90 or 270 to render in landscape                                                                                 |
| `SCALING`                 | `1`                                   | no       | yes      | Scaling factor, e.g. `1.5` to zoom in or `0.75` to zoom out                                                                                             |
| `GRAYSCALE_DEPTH`         | `8`                                   | no       | yes      | Grayscale bit depth your kindle supports                                                                                                               |
| `COLOR_MODE`              | `GrayScale`                           | no       | yes      | ColorMode to use, ex: `GrayScale`, or `TrueColor`.                                                                                                      |
| `DITHER`                  | `false`                               | no       | yes      | Apply a dither to the images.                                                                                                                           |

**\* Array** means that you can set `HA_SCREENSHOT_URL_2`, `HA_SCREENSHOT_URL_3`, ... `HA_SCREENSHOT_URL_n` to render multiple pages within the same instance.
If you use `HA_SCREENSHOT_URL_2`, you can also set `ROTATION_2=180`. If there is no `ROTATION_n` set, then `ROTATION` will be used as a fallback.
You can access these additional images by making GET Requests `http://localhost:5000/2`, `http://localhost:5000/3` etc.

### How to set up the webhook

The webhook setting is to let HA keep track of the battery level of the Kindle, so it can warn you about charging it. You need to do the following:

1. See below for a patch needed to make the Kindle Online Screensaver plugin send the battery level to this application.
1. Create two new helper entities in Home Assistant:
   1. a new `input_number` entity, e.g. `input_number.kindle_battery_level`
   1. a new `input_boolean` entity, e.g. `input_boolean.kindle_battery_charging`
1. Add an automation to set the values of these entities using a webhook: [![import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fsibbl%2Fhass-lovelace-kindle-screensaver%2Fblob%2Fmain%2Fbattery_sensor_blueprint.yaml)
1. Define this application's environment variable `HA_BATTERY_WEBHOOK` to the name of the webhook defined in the previous step. For multiple devices, `HA_BATTERY_WEBHOOK_2`, ... `HA_BATTERY_WEBHOOK_n` is supported as well.

#### Patch for [Kindle Online Screensaver extension](https://www.mobileread.com/forums/showthread.php?t=236104)

Modify the following lines in the Kindle Online Screensaver extension's `bin/update.sh` (absolute path on device should be `/mnt/us/extensions/onlinescreensaver/bin/update.sh`):

```diff
...
if [ 1 -eq $CONNECTED ]; then
-     if wget -q $IMAGE_URI -O $TMPFILE; then
+     batteryLevel=`/usr/bin/powerd_test -s | awk -F: '/Battery Level/ {print substr($2, 0, length($2)-1) - 0}'`
+     isCharging=`/usr/bin/powerd_test -s | awk -F: '/Charging/ {print substr($2,2,length($2))}'`
+     if wget -q "$IMAGE_URI?batteryLevel=$batteryLevel&isCharging=$isCharging" -O $TMPFILE; then
        mv $TMPFILE $SCREENSAVERFILE
        logger "Screen saver image updated"
...
```

#### Patch for [HASS Lovelace Kindle 4 extension](https://github.com/sibbl/hass-lovelace-kindle-4/)

Modify the following lines in the HASS Lovelace Kindle 4 extension's [`script.sh`](https://github.com/sibbl/hass-lovelace-kindle-4/blob/main/extensions/homeassistant/script.sh#L133) (absolute path on device should be `/mnt/us/extensions/homeassistant/script.sh`):

```diff
...
- DOWNLOADRESULT=$(wget -q "$IMAGE_URI" -O $TMPFILE)
+ DOWNLOADRESULT=$(wget -q "$IMAGE_URI?batteryLevel=$CHECKBATTERY&isCharging=$IS_CHARGING" -O $TMPFILE)
...
```

### Advanced configuration

Some advanced variables for local usage which shouldn't be necessary when using Docker:

- `OUTPUT_PATH=./output.png` (destination of rendered image. `OUTPUT_2`, `OUTPUT_3`, ... is also supported)
- `PORT=5000` (port of server, which returns the last image)
- `USE_IMAGE_MAGICK=false` (use ImageMagick instead of GraphicsMagick)
- `UNSAFE_IGNORE_CERTIFICATE_ERRORS=true` (ignore certificate errors of e.g. self-signed certificates at your own risk)
