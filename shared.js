"use strict";

const CAD_STORAGE_KEY = "smartCadCalls";
const CAD_DISPATCHER_SESSION_KEY = "smartCadDispatcherSession";
const CAD_UNIT_STATUS_KEY = "smartCadUnitStatuses";
const CAD_PATROL_UNIT_KEY = "smartCadPatrolUnit";

const dispatcherAccounts = [
    {
        username: "KimSeoul",
        password: "11162009",
        displayName: "Kim Seoul"
    },
    {
        username: "AidenMcdoogle",
        password: "772006",
        displayName: "Aiden Mcdoogle"
    }
];

const knownPatrolUnits = ["100", "215", "319"];

const cadChannel = "BroadcastChannel" in window
    ? new BroadcastChannel("smart-cad-updates")
    : null;

function normalizeUnitNumber(value) {
    return String(value ?? "").trim().toUpperCase();
}

function authenticateDispatcher(username, password) {
    const normalizedUsername = String(username ?? "").trim().toLowerCase();

    return dispatcherAccounts.find(account => {
        return (
            account.username.toLowerCase() === normalizedUsername &&
            account.password === String(password ?? "")
        );
    }) || null;
}

function createDispatcherSession(account) {
    const session = {
        username: account.username,
        displayName: account.displayName,
        signedInAt: new Date().toISOString()
    };

    sessionStorage.setItem(
        CAD_DISPATCHER_SESSION_KEY,
        JSON.stringify(session)
    );

    return session;
}

function getDispatcherSession() {
    const savedSession = sessionStorage.getItem(
        CAD_DISPATCHER_SESSION_KEY
    );

    if (!savedSession) {
        return null;
    }

    try {
        const session = JSON.parse(savedSession);
        const account = dispatcherAccounts.find(item => {
            return item.username === session.username;
        });

        if (!account) {
            sessionStorage.removeItem(CAD_DISPATCHER_SESSION_KEY);
            return null;
        }

        return {
            username: account.username,
            displayName: account.displayName,
            signedInAt: session.signedInAt || null
        };
    } catch (error) {
        console.error("Could not read dispatcher session:", error);
        sessionStorage.removeItem(CAD_DISPATCHER_SESSION_KEY);
        return null;
    }
}

function requireDispatcherLogin() {
    const session = getDispatcherSession();

    if (!session) {
        window.location.replace("dispatcher-login.html");
        return null;
    }

    return session;
}

function signOutDispatcher() {
    sessionStorage.removeItem(CAD_DISPATCHER_SESSION_KEY);
    window.location.replace("dispatcher-login.html");
}

function getCalls() {
    const savedCalls = localStorage.getItem(CAD_STORAGE_KEY);

    if (!savedCalls) {
        return [];
    }

    try {
        const parsedCalls = JSON.parse(savedCalls);
        return Array.isArray(parsedCalls) ? parsedCalls : [];
    } catch (error) {
        console.error("Could not read saved CAD calls:", error);
        return [];
    }
}

function saveCalls(calls) {
    const safeCalls = Array.isArray(calls) ? calls : [];
    localStorage.setItem(CAD_STORAGE_KEY, JSON.stringify(safeCalls));
    broadcastCadUpdate("calls-updated");
}

function getUnitStatuses() {
    const savedStatuses = localStorage.getItem(CAD_UNIT_STATUS_KEY);

    if (!savedStatuses) {
        return {};
    }

    try {
        const parsedStatuses = JSON.parse(savedStatuses);
        return parsedStatuses && typeof parsedStatuses === "object"
            ? parsedStatuses
            : {};
    } catch (error) {
        console.error("Could not read unit statuses:", error);
        return {};
    }
}

function getUnitStatus(unitNumber) {
    const statuses = getUnitStatuses();
    return statuses[normalizeUnitNumber(unitNumber)] || "Available";
}

function saveUnitStatus(unitNumber, status) {
    const normalizedUnit = normalizeUnitNumber(unitNumber);

    if (!normalizedUnit) {
        return;
    }

    const statuses = getUnitStatuses();
    statuses[normalizedUnit] = String(status);
    localStorage.setItem(CAD_UNIT_STATUS_KEY, JSON.stringify(statuses));
    broadcastCadUpdate("unit-status-updated");
}

function getSavedPatrolUnit() {
    return normalizeUnitNumber(
        localStorage.getItem(CAD_PATROL_UNIT_KEY) || "319"
    );
}

function savePatrolUnit(unitNumber) {
    const normalizedUnit = normalizeUnitNumber(unitNumber);

    if (normalizedUnit) {
        localStorage.setItem(CAD_PATROL_UNIT_KEY, normalizedUnit);
    }
}

function broadcastCadUpdate(type) {
    if (!cadChannel) {
        return;
    }

    cadChannel.postMessage({
        type,
        updatedAt: new Date().toISOString()
    });
}

function listenForCadUpdates(callback) {
    if (typeof callback !== "function") {
        return;
    }

    if (cadChannel) {
        cadChannel.addEventListener("message", event => {
            if (
                event.data?.type === "calls-updated" ||
                event.data?.type === "unit-status-updated"
            ) {
                callback(event.data.type);
            }
        });
    }

    window.addEventListener("storage", event => {
        if (
            event.key === CAD_STORAGE_KEY ||
            event.key === CAD_UNIT_STATUS_KEY
        ) {
            callback(
                event.key === CAD_STORAGE_KEY
                    ? "calls-updated"
                    : "unit-status-updated"
            );
        }
    });
}

function createCallId() {
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `CALL-${Date.now()}-${randomPart}`;
}

function formatDateTime(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return date.toLocaleString();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
