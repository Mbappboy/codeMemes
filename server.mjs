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
    this.server = createServer((req, res) => {
      serveFromRouter(this, req, res, () => {
        fileServer(req, res, () => {
          res.writeHead(404); res.end("Not Found");
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
    return {
      body: JSON.stringify(Object.values(this.memes)),
      headers: {
        "Content-Type": "application/json", 
        "ETag": `"${this.version}"`,
        "Cache-Control": "no-store"
      }
    };
  }
  start(port) { this.server.listen(port); }
}

router.add("GET", /^\/memes$/, async (s, req) => {
  let tag = /"(.*)"/.exec(req.headers["if-none-match"]);
  let wait = /\bwait=(\d+)/.exec(req.headers["prefer"]);
  if (!tag || tag[1] != s.version) return s.memeResponse();
  if (!wait) return {status: 304};
  return new Promise(resolve => {
    s.waiting.push(resolve);
    setTimeout(() => {
      if (!s.waiting.includes(resolve)) return;
      s.waiting = s.waiting.filter(r => r != resolve);
      resolve({status: 304});
    }, wait[1] * 1000);
  });
});

router.add("PUT", /^\/memes\/([^\/]+)$/, async (s, title, req) => {
  let m = await readJSON(req);
  s.memes[title] = {title, author: m.author, content: m.content, comments: []};
  s.updated();
  return {status: 204};
});

async function serveFromRouter(s, req, res, next) {
  let resolved = await router.resolve(req, s).catch(err => ({status: 500, body: String(err)}));
  if (!resolved) return next();
  let {body, status = 200, headers = defaultHeaders} = await resolved;
  res.writeHead(status, headers); res.end(body);
}

new MemeServer({}).start(8000);
console.log("Meme Server running at http://localhost:8000");
