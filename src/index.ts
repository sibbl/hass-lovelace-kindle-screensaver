import dotenv from "dotenv";
import { startApplication } from "./app";
import { loadConfig } from "./config/load-config";

dotenv.config();
startApplication(loadConfig());
