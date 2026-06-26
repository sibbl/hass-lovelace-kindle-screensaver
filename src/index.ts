import "dotenv/config";
import { startApp } from "./app";
import { loadConfig } from "./config";

void startApp(loadConfig()).catch((error) => {
  console.error("Application startup failed:", error);
});
