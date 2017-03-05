// ==UserScript==
// @name        Random Image
// @namespace   https://github.com/ccd0
// @include     http://boards.4chan.org/*
// @include     https://boards.4chan.org/*
// @version     0.0.1
// @grant       GM_xmlhttpRequest
// ==/UserScript==

/* jshint esversion: 6 */

/*
Copyright (c) 2017 contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

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

let pickURLs = (board, count) =>
  fetchJSON(`//a.4cdn.org/${board}/catalog.json`).then(response => {
    let replies = [];
    response.forEach(p =>
      p.threads.filter(t => t.last_replies).forEach(t =>
        t.last_replies.filter(r => r.tim).forEach(r => {
          replies.push(r);
        })
      )
    );
    urls = [];
    for (let i = 0; i < count; i++) {
      let r = pick(replies);
      let url = `http://i.4cdn.org/${board}/${r.tim}${r.ext}`;
      let thumb = `http://i.4cdn.org/${board}/${r.tim}s.jpg`;
      let name = `${r.filename}${r.ext}`;
      name = name.replace(/&(amp|#039|quot|lt|gt);/g, (c) =>
        ({'&amp;': '&', '&#039;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>'})[c]
      );
      urls.push({url, thumb, name});
    }
    return Promise.resolve(urls);
  });

let loadImage = (file) =>
  new Promise((resolve, reject) => {
    let img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });

let score = (img) => {
  let canvas, ctx, data, len, i, j, av, total, maxdim;
  canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  len = data.length;
  total = 0;
  for (i = 0; i < len; i += 4) {
    av = 0;
    for (j = 0; j < 3; j++) av += data[i+j];
    for (j = 0; j < 3; j++) total += Math.abs(3*data[i+j] - av) * data[i+3];
  }
  maxdim = Math.max(canvas.width, canvas.height);
  return total / (4*255*255*maxdim*maxdim);
};

let pickURL = (board) =>
  pickURLs(board, 5)
    .then(urls =>
      Promise.all(urls.map(d =>
        fetchImage(d.thumb)
          .then(loadImage)
          .then(img => {
            d.score = score(img);
            return Promise.resolve(d);
          })
          .catch(() => Promise.resolve(null))
      ))
    )
    .then(urls => {
      let urls2 = urls.filter(x => x);
      if (urls2.length === 0) {
        return Promise.resolve(urls[0]);
      }
      let best;
      urls2.forEach(d => {
        if (!best || d.score > best.score) {
          best = d;
        }
      });
      return Promise.resolve(best);
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
