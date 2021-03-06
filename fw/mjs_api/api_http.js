// Note: if you want to create RESTful handlers, use RPC API instead.
// With RPC, you'll get a RESTful endpoint for free, plus many other extras
// like ability to call your API via other transports like Websocket, MQTT,
// serial, etc.

load('api_net.js');

let URL = {
  // ## **`URL.parse(url)`**
  // Parse URL string, return and object with `ssl`, `addr`, `uri` keys.
  parse: function(url) {
    let ssl = false, addr, port = '80', uri = '/', app = true;
    if (url.slice(0, 8) === 'https://') {
      port = '443';
      ssl = true;
      url = url.slice(8);
    }
    if (url.slice(0, 7) === 'http://') {
      url = url.slice(7);
    }
    addr = url;
    for (let i = 0; i < url.length; i++) {
      let ch = url[i];
      if (ch === ':') app = false;
      if (ch === '/') {
        addr = url.slice(0, i);
        uri = url.slice(i);
        break;
      }
    }
    if (app) addr += ':' + port;
    return {ssl: ssl, addr: addr, uri: uri};
  },
};

let HTTP = {
  _c: ffi('void *mgos_connect_http(char *, void (*)(void *, int, void *, userdata), userdata)'),
  _cs: ffi('void *mgos_connect_http_ssl(char *, void (*)(void *, int, void *, userdata), userdata, char *, char *)'),
  _pk: ffi('void *mjs_mem_get_ptr(void *, int)'),
  _p: ffi('void *mjs_mem_to_ptr(int)'),
  _getu: ffi('double mjs_mem_get_uint(void *, int, int)'),
  _gets: ffi('double mjs_mem_get_int(void *, int, int)'),

  // Get `struct http_message *` foreign ptr and offset, return JS string.
  _hmf: function(ptr, off) {
    let p = this._p(this._getu(this._pk(ptr, off), 4, 0));
    let len = this._getu(this._pk(ptr, off + 4), 4, 0);
    return len ? fstr(p, len) : '';
  },

  // ## **`HTTP.query(options)`**
  // Send HTTP request. Options object accepts the following fields:
  // `url` - mandatory URL to fetch, `success` - optional callback function 
  // that receives reply body, `error` - optional error callback that receives
  // error string, `data` - optional object with request parameters.
  // By default, `GET` method is used, unless `data` is specified.
  // Example:
  // ```javascript
  // HTTP.query({
  //   url: 'http://httpbin.org/post',
  //   data: {foo: 1, bar: 'baz'},  // Optional. If set, POST is used
  //   success: function(body, full_http_msg) { print(body); },
  //   error: function(err) { print(err); },  // Optional
  // });
  // ```
  query: function(obj) {
    obj.u = URL.parse(obj.url || '');
    let f = function(conn, ev, evd, ud) {
      if (ev === Net.EV_POLL) return;
      if (ev === Net.EV_CONNECT) {
        let body = ud.data ? JSON.stringify(ud.data) : '';
        let meth = body ? 'POST' : 'GET';
        let host = 'Host: ' + ud.u.addr + '\r\n';
        let cl = 'Content-Length: ' + JSON.stringify(body.length) + '\r\n';
        let req = meth + ' ' + ud.u.uri + ' HTTP/1.0\r\n' + host + cl + '\r\n';
        Net.send(conn, req);
        Net.send(conn, body);
      }
      if (ev === 101) {
        if (typeof(ud.success) === 'function') {
          ud.success(HTTP._hmf(evd, 8), HTTP._hmf(evd, 0));
        }
        ud.ok = true;
      }
      if (ev === Net.EV_CLOSE) {
        if (!ud.ok && ud.error) ud.error('', 'Request failed');
        ffi_cb_free(ud.f, ud);
      }
    };
    obj.f = f;
    if (obj.u.ssl) {
      this._cs(obj.u.addr, f, obj, '', '');
    } else {
      this._c(obj.u.addr, f, obj);
    }
  },
};
