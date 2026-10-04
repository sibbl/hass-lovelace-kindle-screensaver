import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const options = JSON.parse(await readFile("/data/options.json", "utf8"));

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/addons/self/options/config") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result: "ok", data: options }));
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200);
    response.end("ok");
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ result: "error", message: "Not found" }));
});

server.listen(80, "0.0.0.0");
