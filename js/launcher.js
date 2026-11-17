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
    // On this TV the page has no tizen object and the TV's REST API answers
    // 401 to requests from the TV itself, so apps are opened by the module's
    // background service (service/service.js), which TizenBrew runs with
    // tizen access. The small status line bottom-left shows what happened.
    var BUILD = 6;
    var SERVICE = 'http://127.0.0.1:8086';
    var report = {};

    function note(route, text) {
        report[route] = text;
        var parts = ['build ' + BUILD + ' (' + (window.HOME_VERSION || '?') + ')'];
        for (var k in report) {
            if (report.hasOwnProperty(k)) { parts.push(k + ': ' + report[k]); }
        }
        document.getElementById('status').innerHTML = parts.join('  |  ');
    }

    // TizenBrew starts the service when the module opens, so the first
    // requests can arrive before it is listening: retry a few times.
    function launchViaService(appId, appName, attempt) {
        var xhr = new XMLHttpRequest();
        function retry(why) {
            if (attempt < 6) {
                note('service', why + ', retry ' + (attempt + 1));
                setTimeout(function () { launchViaService(appId, appName, attempt + 1); }, 1500);
            } else {
                note('service', why + ' - restart the TV to start it');
                showToast('Could not open ' + appName + ' (launch service not running)');
            }
        }
        xhr.open('GET', SERVICE + '/launch?id=' + encodeURIComponent(appId) +
            '&name=' + encodeURIComponent(appName), true);
        xhr.timeout = 20000;
        xhr.onload = function () {
            var r = null;
            try { r = JSON.parse(xhr.responseText); } catch (e) { /* handled below */ }
            if (r && r.ok) {
                note('service', 'opened ' + r.id);
            } else {
                note('service', (r && r.error) || ('HTTP ' + xhr.status));
                showToast('Could not open ' + appName);
            }
        };
        xhr.onerror = function () { retry('not reachable'); };
        xhr.ontimeout = function () { retry('timeout'); };
        xhr.send();
    }

    function checkService() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', SERVICE + '/status', true);
        xhr.timeout = 4000;
        xhr.onload = function () { note('service', 'ready'); };
        xhr.onerror = function () { note('service', 'starting'); };
        xhr.send();
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
        if (!onTv) {
            showToast('(browser preview) would launch ' + appId);
            return;
        }
        showToast('Opening ' + appName + '...');
        report = {};
        note('service', 'asked for ' + appName);
        launchViaService(appId, appName, 0);
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
        note('service', 'checking');
        if (onTv) { setTimeout(checkService, 2500); }
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

    // The bootstrap in index.html adds this script dynamically, so the page's
    // load event may already have fired.
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
