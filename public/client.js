function handleAction(state, action) {
  if (action.type == "setUser") {
    localStorage.setItem("userName", action.user);
    return {...state, user: action.user};
  } else if (action.type == "newMeme") {
    fetch("/memes/" + encodeURIComponent(action.title), {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({author: state.user, content: action.content})
    });
  }
  return state;
}

function renderMeme(meme, dispatch) {
  let isImage = meme.content.match(/\.(jpeg|jpg|gif|png|webp)$/) != null;
  return elt("section", {className: "meme"},
    elt("h2", null, meme.title),
    elt("div", null, "by ", elt("strong", null, meme.author)),
    isImage ? elt("img", {src: meme.content, style: "max-width: 100%"}) : elt("p", null, meme.content),
    elt("div", {className: "comments"}, ...meme.comments.map(c => 
      elt("p", null, elt("strong", null, c.author), ": ", c.message)
    ))
  );
}

async function pollMemes(update) {
  let tag = undefined;
  for (;;) {
    try {
      let response = await fetch("/memes", {
        headers: tag ? {"If-None-Match": tag, "Prefer": "wait=90"} : {}
      });
      if (response.status == 304) continue;
      tag = response.headers.get("ETag");
      update(await response.json());
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// Helper for DOM creation
function elt(type, props, ...children) {
  let dom = document.createElement(type);
  if (props) Object.assign(dom, props);
  for (let child of children) {
    if (typeof child != "string") dom.appendChild(child);
    else dom.appendChild(document.createTextNode(child));
  }
  return dom;
}
