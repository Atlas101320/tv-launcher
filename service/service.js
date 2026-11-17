/*
 * Home launcher background service.
 *
 * TizenBrew runs this file with Node.js inside a vm sandbox on the TV and
 * gives it the `tizen` object. The launcher page does not get `tizen` on
 * newer TVs, and the TV's REST API answers 401 to requests coming from the TV
 * itself, so opening apps has to go through here.
 *
 * Only Node built-ins can be required. Plain ES5: the TV's Node can be old.
 *
 * Listens on port 8086:
 *   GET /status              { ok, build, tizen, apps }
 *   GET /launch?id=&name=    open an app; falls back to matching by name
 *   GET /apps?q=             installed apps whose id or name contains q
 */
(function () {
    'use strict';

    var http = require('http');
    var urlLib = require('url');

    var PORT = 8086;
    var BUILD = 1;
    var hasTizen = typeof tizen !== 'undefined' && !!tizen && !!tizen.application;

    // getAppsInfo is slow on a TV (hundreds of entries), so it runs once and
    // the result is kept.
    var apps = null;
    var loading = false;
    var waiters = [];

    function norm(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function flush(list) {
        loading = false;
        var w = waiters;
        waiters = [];
        for (var i = 0; i < w.length; i++) { w[i](list); }
    }

    function loadApps(cb) {
        if (apps) { cb(apps); return; }
        waiters.push(cb);
        if (loading) { return; }
        loading = true;
        try {
            tizen.application.getAppsInfo(function (infos) {
                var list = [];
                for (var i = 0; i < infos.length; i++) {
                    list.push({ id: infos[i].id, name: infos[i].name, pkg: infos[i].packageId });
                }
                apps = list;
                flush(list);
            }, function () { flush([]); });
        } catch (e) {
            flush([]);
        }
    }

    function findApp(list, id, name) {
        var i;
        var wanted = norm(name);
        for (i = 0; i < list.length; i++) {
            if (list[i].id === id || list[i].pkg === id) { return list[i]; }
        }
        for (i = 0; i < list.length; i++) {
            if (String(list[i].id).indexOf(id + '.') === 0) { return list[i]; }
        }
        if (!wanted) { return null; }
        for (i = 0; i < list.length; i++) {
            if (norm(list[i].name) === wanted) { return list[i]; }
        }
        if (wanted.length < 4) { return null; }
        for (i = 0; i < list.length; i++) {
            if (norm(list[i].name).indexOf(wanted) >= 0 || norm(list[i].id).indexOf(wanted) >= 0) {
                return list[i];
            }
        }
        return null;
    }

    function tryLaunch(id, cb) {
        try {
            tizen.application.launch(id, function () { cb(null); }, function (e) {
                cb((e && e.name) || 'error');
            });
        } catch (e) {
            cb(e.message || 'threw');
        }
    }

    function launch(id, name, cb) {
        if (!hasTizen) {
            cb({ ok: false, error: 'tizen API not available in service' });
            return;
        }
        tryLaunch(id, function (err) {
            if (!err) { cb({ ok: true, id: id }); return; }
            loadApps(function (list) {
                var m = findApp(list, id, name);
                if (!m) {
                    cb({ ok: false, error: 'no installed app matches ' + name + ' (' + err + ')', apps: list.length });
                    return;
                }
                tryLaunch(m.id, function (err2) {
                    if (err2) {
                        cb({ ok: false, error: m.id + ': ' + err2 });
                    } else {
                        cb({ ok: true, id: m.id });
                    }
                });
            });
        });
    }

    function send(res, obj) {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify(obj));
    }

    var server = http.createServer(function (req, res) {
        var parsed = urlLib.parse(req.url, true);
        var q = parsed.query || {};
        if (parsed.pathname === '/launch') {
            launch(String(q.id || ''), String(q.name || ''), function (result) { send(res, result); });
            return;
        }
        if (parsed.pathname === '/apps') {
            if (!hasTizen) { send(res, { ok: false, error: 'tizen API not available in service' }); return; }
            loadApps(function (list) {
                var needle = norm(q.q);
                var out = [];
                for (var i = 0; i < list.length && out.length < 60; i++) {
                    if (!needle || norm(list[i].name).indexOf(needle) >= 0 || norm(list[i].id).indexOf(needle) >= 0) {
                        out.push(list[i]);
                    }
                }
                send(res, { ok: true, total: list.length, apps: out });
            });
            return;
        }
        send(res, { ok: true, build: BUILD, tizen: hasTizen, apps: apps ? apps.length : null });
    });

    // If the port is taken the service is already running; nothing to do.
    server.on('error', function () {});
    server.listen(PORT, '0.0.0.0');

    if (hasTizen) { loadApps(function () {}); }
})();
