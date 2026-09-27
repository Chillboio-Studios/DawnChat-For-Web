const { createServer } = require("node:http");
const sirv = require("sirv");

const serve = sirv("dist_injected", { single: true });

createServer((request, response) => {
  response.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("Access-Control-Allow-Origin", "*");

  serve(request, response, () => {
    response.statusCode = 404;
    response.end("Not found");
  });
}).listen(5000, "0.0.0.0");