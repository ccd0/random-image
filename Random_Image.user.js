// ==UserScript==
// @name        Random Image
// @namespace   https://github.com/ccd0
// @include     http://boards.4chan.org/*
// @include     https://boards.4chan.org/*
// @version     0.0.1
// @grant       GM_xmlhttpRequest
// ==/UserScript==

/* jshint esversion: 6 */

let pick = (arr) =>
  arr[Math.floor(Math.random() * arr.length)];

let fetchJSON = (url) =>
  new Promise((resolve, reject) => {
    let req = new XMLHttpRequest();
    req.open('GET', url);
    req.responseType = 'json';
    req.onload = () => resolve(req.response);
    req.onerror = req.onabort = reject;
    req.send();
  });

let fetchImage = (url) =>
  new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      onload: (r) => resolve(r.response),
      onerror: reject,
      onabort: reject
    });
  });

let pickBoard = () =>
  fetchJSON('//a.4cdn.org/boards.json').then(response => {
    let boards = response.boards.filter(x =>
      x.ws_board &&
      !x.text_only &&
      x.board !== location.pathname.split(/\/+/)[1] &&
      x.board !== 'mlp'
    );
    let board = pick(boards).board;
    return Promise.resolve(board);
  });

let pickURL = (board) =>
  fetchJSON(`//a.4cdn.org/${board}/catalog.json`).then(response => {
    let replies = [];
    response.forEach(p =>
      p.threads.filter(t => t.last_replies).forEach(t =>
        t.last_replies.filter(r => r.tim).forEach(r => {
          replies.push(r);
        })
      )
    );
    let r = pick(replies);
    let url = `http://i.4cdn.org/${board}/${r.tim}${r.ext}`;
    let name = `${r.filename}${r.ext}`;
    return Promise.resolve({url, name});
  });

let pickImage = (maxTries = 5) => {
  let name;
  return pickBoard()
    .then(pickURL)
    .then(d => {
      name = d.name;
      return Promise.resolve(d.url);
    })
    .then(fetchImage)
    .then((file) => {
      if (/^(image|video)\//.test(file.type)) {
        return Promise.resolve({file, name});
      } else if (maxTries > 0) {
        return Promise.resolve(pickImage(maxTries - 1));
      } else {
        return Promise.reject(new Error('could not download image'));
      }
    });
};

let setFile = (detail) => {
  if (typeof cloneInto === 'function') {
    detail = cloneInto(detail, document.defaultView);
  }
  let event = new CustomEvent('QRSetFile', {bubbles: true, detail});
  document.dispatchEvent(event);
  document.getElementById('qr').classList.add('dump');
};

let setRandomImage = () =>
  pickImage().then(setFile);

let onQRExist = () =>
  new Promise((resolve, reject) => {
    let qr = document.getElementById('qr');
    if (qr) {
      resolve(qr);
    } else {
      document.addEventListener('QRDialogCreation', (e) => {
        resolve(e.target);
      }, false);
    }
  });

let onQROpen = (cb) => {
  onQRExist().then(qr => {
    new MutationObserver(() => {
      if (!qr.hidden) cb();
    }).observe(qr, {
      attributes: true,
      attributeFilter: ['hidden']
    });
    if (!qr.hidden) cb();
  });
};

let insertButton = () => {
  let a = document.createElement('a');
  a.className = 'qr-new-image fa fa-refresh';
  a.style.opacity = '0.8';
  a.addEventListener('click', setRandomImage, false);
  let pos = document.getElementById('qr-spoiler-label');
  pos.parentNode.insertBefore(a, pos.nextSibling);
};

onQRExist().then(insertButton);
onQROpen(setRandomImage);
