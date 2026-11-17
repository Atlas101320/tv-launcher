// ES5 only: older Tizen TVs run an old WebKit/Chromium.
(function () {
    'use strict';

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, BACKSPACE: 8 };
    var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];

    var hasTizen = typeof tizen !== 'undefined';
    // TizenBrew serves modules from 127.0.0.1:8081 without the tizen object;
    // there we launch apps through the TV's own REST API instead.
    var onTv = location.hostname === '127.0.0.1';
    var TV_API = 'http://127.0.0.1:8001/api/v2/applications/';
    var grid = [];        // grid[row][col] -> tile element
    var pos = { row: 0, col: 0 };
    var toastTimer = null;

    function pad(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function updateClock() {
        var d = new Date();
        document.getElementById('clock').innerHTML =
            pad(d.getHours()) + '<span class="sep">:</span>' + pad(d.getMinutes());
        document.getElementById('date').innerHTML =
            DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    }

    function showToast(text) {
        var el = document.getElementById('toast');
        el.innerHTML = text;
        el.className = 'show';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = ''; }, 2500);
    }

    function build() {
        var container = document.getElementById('rows');
        for (var r = 0; r < LAUNCHER_ROWS.length; r++) {
            var rowData = LAUNCHER_ROWS[r];
            var rowEl = document.createElement('div');
            rowEl.className = 'row';

            var title = document.createElement('div');
            title.className = 'row-title';
            title.innerHTML = rowData.title;
            rowEl.appendChild(title);

            var rowTiles = [];
            for (var c = 0; c < rowData.tiles.length; c++) {
                var t = rowData.tiles[c];
                var tile = document.createElement('div');
                tile.className = 'tile';
                var brand = t.color || '#8a8f9c';
                var bar = document.createElement('div');
                bar.className = 'tile-bar';
                bar.style.backgroundColor = brand;
                tile.appendChild(bar);
                var initial = document.createElement('div');
                initial.className = 'tile-initial';
                initial.style.color = brand;
                initial.innerHTML = t.name.charAt(0);
                tile.appendChild(initial);
                if (t.url !== undefined) {
                    tile.setAttribute('data-url', t.url);
                } else {
                    tile.setAttribute('data-app', t.id);
                }
                tile.setAttribute('data-name', t.name);

                var name = document.createElement('div');
                name.className = 'tile-name';
                name.innerHTML = t.name;
                tile.appendChild(name);

                rowEl.appendChild(tile);
                rowTiles.push(tile);
            }
            container.appendChild(rowEl);
            grid.push(rowTiles);
        }
    }

    function focus(row, col) {
        if (!grid.length) { return; }
        row = Math.max(0, Math.min(grid.length - 1, row));
        col = Math.max(0, Math.min(grid[row].length - 1, col));
        grid[pos.row][pos.col].className = 'tile';
        pos.row = row;
        pos.col = col;
        grid[row][col].className = 'tile focused';
    }

    // ---- Launching apps -------------------------------------------------
    // Inside TizenBrew there are three possible routes to open an app, and
    // which ones work depends on the TV's Tizen version. All are fired at
    // once (opening an app twice is harmless) and each reports its result
    // in the small status line at the bottom-left of the screen.
    var BUILD = 4;
    var report = {};

    function note(route, text) {
        report[route] = text;
        var parts = ['build ' + BUILD, 'host ' + location.host, 'tizen ' + (hasTizen ? 'yes' : 'no')];
        for (var k in report) {
            if (report.hasOwnProperty(k)) { parts.push(k + ': ' + report[k]); }
        }
        document.getElementById('status').innerHTML = parts.join('  |  ');
    }

    // Plain POST with no custom headers is a "simple" CORS request, so the
    // TV runs the app even if this page isn't allowed to read the reply.
    function restPost(base, appId, route) {
        var xhr = new XMLHttpRequest();
        try {
            xhr.open('POST', base + encodeURIComponent(appId), true);
            xhr.timeout = 5000;
            xhr.onload = function () { note(route, 'HTTP ' + xhr.status); };
            xhr.onerror = function () { note(route, 'request failed'); };
            xhr.ontimeout = function () { note(route, 'timeout'); };
            xhr.send();
            note(route, 'sent');
        } catch (e) {
            note(route, 'blocked ' + e.message);
        }
    }

    function launchViaRest(appId) {
        // Route 1: the TV's REST API on loopback.
        restPost('http://127.0.0.1:8001/api/v2/applications/', appId, 'local');
        // Route 2: the same API on the TV's network address. TizenBrew's
        // service answers any non-module URL with that address.
        var q = new XMLHttpRequest();
        try {
            q.open('GET', location.protocol + '//' + location.host + '/tv-ip', true);
            q.timeout = 4000;
            q.onload = function () {
                var ip = (q.responseText || '').replace(/\s/g, '');
                if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                    restPost('http://' + ip + ':8001/api/v2/applications/', appId, 'lan');
                } else {
                    note('lan', 'no address');
                }
            };
            q.onerror = function () { note('lan', 'lookup failed'); };
            q.ontimeout = function () { note('lan', 'lookup timeout'); };
            q.send();
        } catch (e) {
            note('lan', 'blocked ' + e.message);
        }
    }

    // Route 3: the tizen API. It wants the app's full ID, which for store
    // apps is not always the numeric ID, so look it up in the installed list.
    function launchViaTizen(appId, appName) {
        if (!hasTizen || !tizen.application) {
            note('tizen-launch', 'n/a');
            return;
        }
        function go(realId) {
            try {
                tizen.application.launch(realId, function () {
                    note('tizen-launch', 'ok ' + realId);
                }, function (err) {
                    note('tizen-launch', realId + ' ' + (err && err.name));
                });
            } catch (e) {
                note('tizen-launch', 'threw ' + e.message);
            }
        }
        try {
            tizen.application.getAppsInfo(function (apps) {
                var match = null;
                var wanted = appName.toLowerCase();
                for (var i = 0; i < apps.length && !match; i++) {
                    var a = apps[i];
                    if (a.id === appId || a.packageId === appId || a.id.indexOf(appId + '.') === 0) {
                        match = a.id;
                    }
                }
                for (var j = 0; j < apps.length && !match; j++) {
                    if ((apps[j].name || '').toLowerCase() === wanted) { match = apps[j].id; }
                }
                go(match || appId);
            }, function () { go(appId); });
        } catch (e) {
            go(appId);
        }
    }

    function openUrl(url, appName) {
        if (!url) {
            showToast('No URL set for ' + appName + ' yet (edit js/apps.js)');
            return;
        }
        if (!hasTizen) {
            if (onTv) {
                location.href = url;
            } else {
                showToast('(browser preview) would open ' + url);
            }
            return;
        }
        try {
            var control = new tizen.ApplicationControl(
                'http://tizen.org/appcontrol/operation/view', url);
            tizen.application.launchAppControl(control, null, null, function (err) {
                showToast('Could not open ' + appName + ' (' + err.name + ')');
            });
        } catch (e) {
            showToast('Could not open ' + appName + ': ' + e.message);
        }
    }

    function launch(tile) {
        var appId = tile.getAttribute('data-app');
        var appName = tile.getAttribute('data-name');
        if (tile.hasAttribute('data-url')) {
            openUrl(tile.getAttribute('data-url'), appName);
            return;
        }
        if (!onTv && !hasTizen) {
            showToast('(browser preview) would launch ' + appId);
            return;
        }
        showToast('Opening ' + appName + '...');
        report = {};
        launchViaRest(appId);
        launchViaTizen(appId, appName);
    }

    // Called when the remote's Back key is pressed on the launcher.
    // Available helpers: focus(row, col), showToast(text), pos.row / pos.col,
    // e.preventDefault() (stops TizenBrew/the TV handling Back itself).
    // First press only shows a hint; a second press within 3s leaves the
    // launcher. That keeps a way out while stopping accidental exits.
    var backArmedUntil = 0;
    function onBack(e) {
        e.preventDefault();
        var now = new Date().getTime();
        if (now >= backArmedUntil) {
            backArmedUntil = now + 3000;
            showToast('Press Back again to leave Home');
            return;
        }
        leave();
    }

    // TizenBrew opens this page by navigating its own window here, so going
    // back one step in history returns to the TizenBrew module list. If there
    // is no history to go back to, close the app instead.
    function leave() {
        showToast('Leaving Home...');
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        try {
            tizen.application.getCurrentApplication().exit();
        } catch (err) {
            showToast('Hold Back for 2 seconds, or press the Home button');
        }
    }

    function onKey(e) {
        note('key', e.keyCode);
        switch (e.keyCode) {
            case KEY.LEFT:  focus(pos.row, pos.col - 1); break;
            case KEY.RIGHT: focus(pos.row, pos.col + 1); break;
            // Keep roughly the same column when moving between rows of different length.
            case KEY.UP:    focus(pos.row - 1, pos.col); break;
            case KEY.DOWN:  focus(pos.row + 1, pos.col); break;
            case KEY.ENTER: launch(grid[pos.row][pos.col]); break;
            case KEY.BACK:
            case 461:
            case KEY.BACKSPACE:
                onBack(e);
                return;
            default:
                return;
        }
        e.preventDefault();
    }

    function init() {
        build();
        note('ready', 'yes');
        focus(0, 0);
        updateClock();
        setInterval(updateClock, 10000);
        document.addEventListener('keydown', onKey);

        // Mouse/pointer support (Smart Control remote and browser preview).
        for (var r = 0; r < grid.length; r++) {
            for (var c = 0; c < grid[r].length; c++) {
                (function (row, col) {
                    var tile = grid[row][col];
                    tile.addEventListener('mouseover', function () { focus(row, col); });
                    tile.addEventListener('click', function () { launch(tile); });
                })(r, c);
            }
        }
    }

    window.onload = init;
})();
