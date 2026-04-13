import { createServer } from "node:http";
import serveStatic from "serve-static";
import { json as readJSON } from "node:stream/consumers";
import { Router } from "./router.mjs";

const router = new Router();
const defaultHeaders = { "Content-Type": "text/plain" };

/**
 * THE BRIDGE: This function resolves requests using the router.
 * If the router doesn't match (e.g., someone visits the homepage),
 * it calls next(), which triggers the static file server.
 */
async function serveFromRouter(server, request, response, next) {
  let resolved = await router.resolve(request, server).catch(error => {
    if (error.status != null) return error;
    return { body: String(error), status: 500 };
  });

  if (!resolved) return next();

  let { body, status = 200, headers = defaultHeaders } = await resolved;
  response.writeHead(status, headers);
  response.end(body);
}

class MemeServer {
  constructor(memes) {
    this.memes = memes;
    this.version = 0;
    this.waiting = [];

    // This tells Node to look for your index.html and client.js in the /public folder
    let fileServer = serveStatic("./public");

    this.server = createServer((request, response) => {
      serveFromRouter(this, request, response, () => {
        fileServer(request, response, () => {
          response.writeHead(404, "Not found");
          response.end("<h1>404: File Not Found in /public folder</h1>");
        });
      });
    });
  }

  // Notifies waiting long-polling requests about changes
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

  start(port) {
    this.server.listen(port);
    console.log(`Meme Server is live at http://localhost:${port}`);
  }
}

// --- API ROUTES ---

// GET: Fetch all memes (Handles Long Polling)
router.add("GET", /^\/memes$/, async (server, request) => {
  let tag = /"(.*)"/.exec(request.headers["if-none-match"]);
  let wait = /\bwait=(\d+)/.exec(request.headers["prefer"]);

  if (!tag || tag[1] != server.version) {
    return server.memeResponse();
  } else if (!wait) {
    return { status: 304 };
  } else {
    return new Promise(resolve => {
      server.waiting.push(resolve);
      setTimeout(() => {
        if (!server.waiting.includes(resolve)) return;
        server.waiting = server.waiting.filter(r => r != resolve);
        resolve({ status: 304 });
      }, wait[1] * 1000);
    });
  }
});

// PUT: Create or update a meme
router.add("PUT", /^\/memes\/([^\/]+)$/, async (server, title, request) => {
  let meme = await readJSON(request);
  if (!meme || typeof meme.author != "string" || typeof meme.content != "string") {
    return { status: 400, body: "Bad meme data" };
  }
  server.memes[title] = {
    title,
    author: meme.author,
    content: meme.content, // This can be text or an image URL
    comments: []
  };
  server.updated();
  return { status: 204 };
});

// DELETE: Remove a meme
router.add("DELETE", /^\/memes\/([^\/]+)$/, async (server, title) => {
  if (Object.hasOwn(server.memes, title)) {
    delete server.memes[title];
    server.updated();
  }
  return { status: 204 };
});

// POST: Add a comment
router.add("POST", /^\/memes\/([^\/]+)\/comments$/, async (server, title, request) => {
  let comment = await readJSON(request);
  if (!comment || typeof comment.author != "string" || typeof comment.message != "string") {
    return { status: 400, body: "Bad comment data" };
  } else if (Object.hasOwn(server.memes, title)) {
    server.memes[title].comments.push(comment);
    server.updated();
    return { status: 204 };
  } else {
    return { status: 404, body: `Meme '${title}' not found` };
  }
});

// Instantiate and start the server
new MemeServer({}).start(8000);
