/* =========================================================
   auth.js — Session guard for GP Portal
   Load this at the TOP of every protected page's <head> or
   at the START of its <body> (before any content renders).
   ========================================================= */
(function () {
    'use strict';

    // ---------- Config ----------
    const LOGIN_PAGE = 'index.html';   // the login page is index.html (there is no login.html)
    const SESSION_KEY = 'gp_logged_user';

    // Role -> dashboard page map
    const ROLE_PAGES = {
        admin:    { dashboard: 'gpadmin.html',           manage: ['manage-admin.html', 'manage-user.html', 'manage-workshop.html'] },
        user:     { dashboard: 'gpmain.html',            manage: [] },
        workshop: { dashboard: 'gpwork-shop.html',       manage: [] },
        developer:       { dashboard: 'developer.html',        manage: [] },
        branch_incharge: { dashboard: 'branch_incharge.html',  manage: [] },
        designer:        { dashboard: 'designs.html',          manage: [] },
        cad_designer:    { dashboard: 'designs.html',          manage: [] },
        stone_stock:     { dashboard: 'stone-stock.html',      manage: [] },
        stock_jama_incharge: { dashboard: 'stage-2 process.html', manage: [] },
        plating_polish:      { dashboard: 'stage-2 process.html', manage: [] },
        packing:             { dashboard: 'stage-2 process.html', manage: [] },
        qc_section:          { dashboard: 'stage-2 process.html', manage: [] },
        dispatch_section:    { dashboard: 'stage-2 process.html', manage: [] }
    };

    // ---------- Helpers ----------
    function getSession() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    }

    function currentFileName() {
        const path = window.location.pathname;
        const parts = path.split('/');
        return parts[parts.length - 1] || 'index.html';
    }

    function getRole() {
        const s = getSession();
        return s && s.role ? s.role : null;
    }

    function redirectToLogin(reason) {
        // Clear any half-session
        sessionStorage.removeItem('gp_pending_user');
        // Preserve nothing — force clean login
        window.location.replace(LOGIN_PAGE);
    }

    function enforce() {
        const session = getSession();
        const file = currentFileName();

        // ----- No session -> kick out -----
        if (!session || !session.role) {
            redirectToLogin('no-session');
            return;
        }

        // ----- Session exists: verify this file is allowed for the role -----
        const allowed = ROLE_PAGES[session.role];
        if (!allowed) { redirectToLogin('unknown-role'); return; }

        // Check whether current file is the dashboard or a manage page for this role
        const isDashboard = (file === allowed.dashboard);
        const isManage = allowed.manage.includes(file);

        // Admin-only: also allow gpadmin.html access to manage-* pages
        const isManagePageForAny = ['manage-admin.html', 'manage-user.html', 'manage-workshop.html'].includes(file);
        const isAdmin = session.role === 'admin';

        // Rules:
        //  - Dashboard must match role exactly
        //  - Manage pages can be opened ONLY by admin
        //  - If it's not a protected page (e.g. login.html), let it pass
        const PROTECTED = ['gpadmin.html', 'gpmain.html', 'gpwork-shop.html',
                           'manage-admin.html', 'manage-user.html', 'manage-workshop.html'];

        if (PROTECTED.includes(file)) {
            if (isManagePageForAny) {
                if (!isAdmin) { redirectToLogin('manage-not-admin'); return; }
            } else if (!isDashboard) {
                // e.g. user trying to open gpadmin.html
                // Redirect them to *their own* dashboard instead of the login page
                window.location.replace(allowed.dashboard);
                return;
            }
        }
    }

    // Run immediately when script loads
    enforce();

    // Re-run when page is restored from bfcache (browser Back button)
    window.addEventListener('pageshow', function (event) {
        // event.persisted is true when the page is restored from bfcache
        enforce();
    });

    // Also re-run when the tab becomes visible again (extra safety)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') enforce();
    });

    // Expose a small API for logout & session reads
    window.GPAuth = {
        getUser: function () { return getSession(); },
        logout: function () {
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem('gp_pending_user');
            // Use replace so the current page is removed from history
            window.location.replace(LOGIN_PAGE);
        },
        requireRole: function (role) {
            const s = getSession();
            if (!s || s.role !== role) { redirectToLogin('require-role'); return false; }
            return true;
        }
    };
})();