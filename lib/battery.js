const http = require("http");
const https = require("https");

function sendBatteryLevelToHomeAssistant(
  pageIndex,
  batteryStore,
  batteryWebHook,
  baseUrl,
  ignoreCertificateErrors
) {
  const batteryStatus = JSON.stringify(batteryStore);
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(batteryStatus),
    },
    rejectUnauthorized: !ignoreCertificateErrors,
  };
  const url = `${baseUrl}/api/webhook/${batteryWebHook}`;
  const httpLib = url.toLowerCase().startsWith("https") ? https : http;
  const req = httpLib.request(url, options, (res) => {
    if (res.statusCode !== 200) {
      console.error(
        `Update device ${pageIndex} at ${url} status ${res.statusCode}: ${res.statusMessage}`
      );
    }
  });
  req.on("error", (e) => {
    console.error(`Update ${pageIndex} at ${url} error: ${e.message}`);
  });
  req.write(batteryStatus);
  req.end();
}

module.exports = { sendBatteryLevelToHomeAssistant };
