import {createServer} from "node:http";
import serveStatic from "serve-static";
import {json as readJSON} from "node:stream/consumers";
import {Router} from "./router.mjs";

const router = new Router();
const defaultHeaders = {"Content-Type": "text/plain"};

class MemeServer {
  constructor(memes) {
    this.memes = memes;
    this.version = 0;
    this.waiting = [];

    let fileServer = serveStatic("./public");
    this.server = createServer((request, response) => {
      serveFromRouter(this, request, response, () => {
        fileServer(request, response, () => {
          response.writeHead(404);
          response.end("Not Found");
        });
      });
    });
  }
  
  updated() {
    this.version++;
    let response = this.memeResponse();
    this.waiting.forEach(resolve => resolve(response));
    this.waiting = [];
  }

  memeResponse() {
    let list = Object.values(this.memes);
    return {
      body: JSON.stringify(list),
      headers: {
        "Content-Type": "application/json",
        "ETag": `"${this.version}"`,
        "Cache-Control": "no-store"
      }
    };
  }

  start(port) { this.server.listen(port); }
}

// Routes
router.add("GET", /^\/memes$/, async (server, request) => {
  let tag = /"(.*)"/.exec(request.headers["if-none-match"]);
  let wait = /\bwait=(\d+)/.exec(request.headers["prefer"]);
  if (!tag || tag[1] != server.version) {
    return server.memeResponse();
  } else if (!wait) {
    return {status: 304};
  } else {
    return new Promise(resolve => {
      server.waiting.push(resolve);
      setTimeout(() => {
        if (!server.waiting.includes(resolve)) return;
        server.waiting = server.waiting.filter(r => r != resolve);
        resolve({status: 304});
      }, wait[1] * 1000);
    });
  }
});

router.add("PUT", /^\/memes\/([^\/]+)$/, async (server, title, request) => {
  let meme = await readJSON(request);
  if (!meme || typeof meme.author != "string" || typeof meme.content != "string") {
    return {status: 400, body: "Bad data"};
  }
  server.memes[title] = {title, author: meme.author, content: meme.content, comments: []};
  server.updated();
  return {status: 204};
});

async function serveFromRouter(server, request, response, next) {
  let resolved = await router.resolve(request, server).catch(err => ({status: 500, body: String(err)}));
  if (!resolved) return next();
  let {body, status = 200, headers = defaultHeaders} = await resolved;
  response.writeHead(status, headers);
  response.end(body);
}

new MemeServer({}).start(8000);
