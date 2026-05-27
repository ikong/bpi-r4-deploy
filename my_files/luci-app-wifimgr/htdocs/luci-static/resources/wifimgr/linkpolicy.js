'use strict';
'require baseclass';
'require wifimgr/layer3 as layer3';

// Link Policy tab — MLO link steering daemon control + status.
// Renders standalone; receives (steerdData, mainData, onRefresh) from index.js.
// All daemon actions go through layer3; no direct shell calls here.

// ── DOM HELPERS (local, mirrors index.js conventions) ────────────────────────

function el(tag, attrs) {
    var e = E(tag, attrs || {});
    for (var i = 2; i < arguments.length; i++) {
        var c = arguments[i];
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
}

function sp(text, style) {
    return el('span', { style: style || '' }, text);
}

function row(children, style) {
    var d = el('div', { style: style || 'display:flex;align-items:center;gap:8px' });
    (children || []).forEach(function(c) { if (c) d.appendChild(c); });
    return d;
}

function badge(text, color) {
    return el('span', {
        style: 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:11px;' +
               'font-weight:bold;background:' + (color || '#1a3a5a') + ';color:#ddd'
    }, text);
}

// ── RENDER ───────────────────────────────────────────────────────────────────

function render(sd, data, onRefresh) {
    var wrap = el('div', { style: 'padding:4px 0' });

    // Header
    wrap.appendChild(el('div', { style: 'margin-bottom:16px' },
        sp('Link Policy', 'color:#5b9bd5;font-weight:bold;font-size:13px'),
        sp(' — dynamic MLO link steering + Neg-TTLM', 'color:#444;font-size:12px')
    ));

    // ── Daemon control ────────────────────────────────────────────────────────
    wrap.appendChild(renderDaemonRow(sd, onRefresh));

    // ── MLO clients table ─────────────────────────────────────────────────────
    var mloClients = ((data && data.clients) || []).filter(function(c) { return c.is_mld; });
    wrap.appendChild(renderClientsTable(mloClients));

    // ── Log ───────────────────────────────────────────────────────────────────
    wrap.appendChild(renderLog(sd));

    return wrap;
}

function renderDaemonRow(sd, onRefresh) {
    var d = el('div', {
        style: 'display:flex;align-items:center;gap:8px;padding:10px 12px;' +
               'background:#0d1b2a;border:1px solid #1a2a3a;border-radius:4px;margin-bottom:16px'
    });

    if (!sd) {
        d.appendChild(sp('Loading…', 'color:#555;font-size:13px'));
        return d;
    }

    if (!sd.script_present) {
        d.appendChild(el('span', {
            style: 'display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;background:#444'
        }));
        d.appendChild(sp('mlo-steerd: ', 'color:#aaa;font-size:13px'));
        d.appendChild(sp('not installed on this device', 'color:#555;font-size:13px'));
        d.appendChild(sp(' — deploy /root/mlo-steerd.sh on the AP router', 'color:#333;font-size:11px;margin-left:4px'));
        return d;
    }

    var running = sd.running;

    // Status dot
    d.appendChild(el('span', {
        style: 'display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;' +
               'background:' + (running ? '#4caf50' : '#444')
    }));

    d.appendChild(sp('mlo-steerd: ', 'color:#aaa;font-size:13px'));
    d.appendChild(sp(
        running ? ('running — PID ' + sd.pid) : 'stopped',
        'font-size:13px;color:' + (running ? '#4caf50' : '#555')
    ));

    // Start / Stop button
    var btn = el('button', {
        style: 'margin-left:auto;border:1px solid #1a3a5a;background:none;' +
               'color:#5b9bd5;padding:3px 12px;border-radius:3px;cursor:pointer;font-size:12px'
    }, running ? 'Stop' : 'Start');
    btn.onclick = function() {
        btn.disabled = true;
        btn.textContent = running ? 'Stopping…' : 'Starting…';
        (running ? layer3.steerd_stop() : layer3.steerd_start()).then(function() {
            if (onRefresh) onRefresh();
        });
    };
    d.appendChild(btn);

    return d;
}

function renderClientsTable(clients) {
    var wrap = el('div', { style: 'margin-bottom:16px' });

    wrap.appendChild(sp('MLO Clients',
        'color:#aaa;font-size:12px;font-weight:bold;display:block;margin-bottom:6px'));

    if (!clients.length) {
        wrap.appendChild(sp('No MLO clients connected.', 'color:#444;font-size:12px'));
        return wrap;
    }

    var tbl = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' });

    // Header
    tbl.appendChild(el('tr', { style: 'border-bottom:1px solid #1a2a3a' },
        el('td', { style: 'color:#555;padding:3px 8px;font-size:11px' }, 'MAC'),
        el('td', { style: 'color:#555;padding:3px 8px;font-size:11px' }, 'Type'),
        el('td', { style: 'color:#555;padding:3px 8px;font-size:11px' }, 'Sim. links'),
        el('td', { style: 'color:#555;padding:3px 8px;font-size:11px' }, 'Active / Total links'),
        el('td', { style: 'color:#555;padding:3px 8px;font-size:11px' }, 'Signal')
    ));

    clients.forEach(function(c) {
        var msl = c.max_simul_links;
        var isMLMR = msl != null && msl > 1;
        var type  = msl == null ? '?' : (isMLMR ? 'MLMR' : 'EMLSR');
        var typeColor = isMLMR ? '#4caf50' : '#888';
        var activeLinks = (c.links || []).filter(function(l) {
            return l.signal != null && l.signal !== 0;
        }).length;
        var totalLinks = (c.links || []).length;
        var sig = c.signal != null ? (String(c.signal) + ' dBm') : '—';

        tbl.appendChild(el('tr', { style: 'border-bottom:1px solid #0a1520' },
            el('td', { style: 'padding:5px 8px;color:#ccc;font-family:monospace;font-size:11px' }, c.mac),
            el('td', { style: 'padding:5px 8px;font-weight:bold;color:' + typeColor }, type),
            el('td', { style: 'padding:5px 8px;color:#aaa' }, msl != null ? String(msl) : '—'),
            el('td', { style: 'padding:5px 8px;color:#aaa' }, activeLinks + ' / ' + totalLinks),
            el('td', { style: 'padding:5px 8px;color:#aaa' }, sig)
        ));

        // Per-link detail row
        if (totalLinks > 0) {
            var linkDetail = el('tr', { style: 'border-bottom:1px solid #0a1520' },
                el('td', { colspan: '5', style: 'padding:2px 8px 6px 24px' },
                    renderLinkDetail(c.links)
                )
            );
            tbl.appendChild(linkDetail);
        }
    });

    wrap.appendChild(tbl);
    return wrap;
}

function renderLinkDetail(links) {
    var BAND = { 0: '2.4G', 1: '5G', 2: '6G' };
    var wrap = el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' });
    links.forEach(function(l) {
        var sig = l.signal && l.signal !== 0 ? (String(l.signal) + ' dBm') : 'idle';
        var color = l.signal && l.signal !== 0 ? '#7a9db5' : '#333';
        wrap.appendChild(el('span', { style: 'font-size:11px;color:' + color },
            (BAND[l.link_id] || ('L' + l.link_id)) + ': ' + sig
        ));
    });
    return wrap;
}

function renderLog(sd) {
    var wrap = el('div', {});
    wrap.appendChild(sp('Daemon log',
        'color:#aaa;font-size:12px;font-weight:bold;display:block;margin-bottom:6px'));

    if (!sd) {
        wrap.appendChild(sp('Loading…', 'color:#444;font-size:12px'));
        return wrap;
    }

    if (!sd.log || !sd.log.length) {
        wrap.appendChild(sp(
            'No log — start the daemon or check /tmp/steerd.log on the router.',
            'color:#444;font-size:12px'
        ));
        return wrap;
    }

    var box = el('div', {
        style: 'background:#060e18;border:1px solid #1a2a3a;border-radius:3px;' +
               'padding:8px 10px;font-family:monospace;font-size:11px;color:#7a9db5;' +
               'max-height:320px;overflow-y:auto;line-height:1.5'
    });
    sd.log.forEach(function(line) { box.appendChild(el('div', {}, line)); });

    // Auto-scroll to bottom
    setTimeout(function() { box.scrollTop = box.scrollHeight; }, 0);

    wrap.appendChild(box);
    return wrap;
}

// ── MODULE EXPORT ─────────────────────────────────────────────────────────────

return baseclass.extend({ render: render });
