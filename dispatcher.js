"use strict";

const dispatcherSession = requireDispatcherLogin();

if (!dispatcherSession) {
    throw new Error("Dispatcher session required.");
}


const callForm = document.getElementById("call-form");
const clearFormButton = document.getElementById("clear-form-button");
const dispatcherCallList = document.getElementById("dispatcher-call-list");
const activeCallCount = document.getElementById("active-call-count");
const assignedUnitInput = document.getElementById("assigned-unit");
const assignedUnitHint = document.getElementById("assigned-unit-hint");
const knownUnitsList = document.getElementById("known-units");
const dispatcherMessage = document.getElementById("dispatcher-message");
const dispatcherUser = document.getElementById("dispatcher-user");
const dispatcherSignOut = document.getElementById("dispatcher-sign-out");

function populateKnownUnits() {
    knownUnitsList.innerHTML = knownPatrolUnits
        .map(unit => `<option value="${escapeHtml(unit)}"></option>`)
        .join("");
}

function updateAssignedUnitHint() {
    const normalizedUnit = normalizeUnitNumber(assignedUnitInput.value);
    const isKnownUnit = knownPatrolUnits.includes(normalizedUnit);

    assignedUnitHint.textContent = normalizedUnit
        ? isKnownUnit
            ? `Known patrol unit ${normalizedUnit}`
            : "This is a custom patrol unit."
        : "";

    assignedUnitHint.classList.toggle(
        "warning-text",
        Boolean(normalizedUnit && !isKnownUnit)
    );
}

function createCallFromForm() {
    const timestamp = new Date().toISOString();

    return {
        id: createCallId(),
        type: document.getElementById("call-type").value,
        priority: Number(document.getElementById("priority").value),
        address: document.getElementById("address").value.trim(),
        crossStreet: document.getElementById("cross-street").value.trim(),
        assignedUnit: normalizeUnitNumber(assignedUnitInput.value),
        callerName: document.getElementById("caller-name").value.trim(),
        callerPhone: document.getElementById("caller-phone").value.trim(),
        notes: document.getElementById("call-notes").value.trim(),
        status: "Dispatched",
        createdAt: timestamp,
        updatedAt: timestamp,
        history: [
            {
                message: "Call created and dispatched.",
                timestamp
            }
        ]
    };
}

function resetCallForm() {
    callForm.reset();
    document.getElementById("priority").value = "3";
    assignedUnitHint.textContent = "";
    dispatcherMessage.textContent = "";
}

function dispatchCall(event) {
    event.preventDefault();
    dispatcherMessage.textContent = "";

    if (!callForm.reportValidity()) {
        return;
    }

    const calls = getCalls();
    calls.unshift(createCallFromForm());
    saveCalls(calls);

    dispatcherMessage.textContent = "Call dispatched successfully.";
    callForm.reset();
    document.getElementById("priority").value = "3";
    assignedUnitHint.textContent = "";

    renderDispatcherCalls();
}

function completeCall(callId) {
    const timestamp = new Date().toISOString();

    const updatedCalls = getCalls().map(call => {
        if (call.id !== callId) {
            return call;
        }

        return {
            ...call,
            status: "Completed",
            updatedAt: timestamp,
            history: [
                ...(Array.isArray(call.history) ? call.history : []),
                {
                    message: "Call completed by dispatcher.",
                    timestamp
                }
            ]
        };
    });

    saveCalls(updatedCalls);
    renderDispatcherCalls();
}

function deleteCall(callId) {
    const confirmed = window.confirm(
        "Are you sure you want to permanently delete this call?"
    );

    if (!confirmed) {
        return;
    }

    saveCalls(getCalls().filter(call => call.id !== callId));
    renderDispatcherCalls();
}

function renderDispatcherCalls() {
    const activeCalls = getCalls().filter(call => call.status !== "Completed");
    activeCallCount.textContent = String(activeCalls.length);

    if (activeCalls.length === 0) {
        dispatcherCallList.innerHTML = `
            <div class="empty-message">No active calls.</div>
        `;
        return;
    }

    dispatcherCallList.innerHTML = activeCalls
        .map(call => {
            return `
                <article class="call-card priority-${Number(call.priority) || 3}">
                    <div class="call-card-header">
                        <span class="call-card-title">${escapeHtml(call.type)}</span>
                        <span>Priority ${escapeHtml(call.priority)}</span>
                    </div>

                    <div class="call-card-meta">
                        <span>Call: ${escapeHtml(call.id)}</span>
                        <span>Status: ${escapeHtml(call.status)}</span>
                        <span>Unit: ${escapeHtml(call.assignedUnit)}</span>
                        <span>${escapeHtml(formatDateTime(call.createdAt))}</span>
                        <span class="meta-wide">
                            Location: ${escapeHtml(call.address)}
                        </span>
                    </div>

                    <div class="button-row">
                        <button
                            class="button primary-button"
                            type="button"
                            data-action="complete"
                            data-call-id="${escapeHtml(call.id)}"
                        >
                            Complete
                        </button>

                        <button
                            class="button danger-button"
                            type="button"
                            data-action="delete"
                            data-call-id="${escapeHtml(call.id)}"
                        >
                            Delete
                        </button>
                    </div>
                </article>
            `;
        })
        .join("");
}

callForm.addEventListener("submit", dispatchCall);
clearFormButton.addEventListener("click", resetCallForm);
assignedUnitInput.addEventListener("input", updateAssignedUnitHint);

dispatcherCallList.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const callId = button.dataset.callId;

    if (button.dataset.action === "complete") {
        completeCall(callId);
    }

    if (button.dataset.action === "delete") {
        deleteCall(callId);
    }
});

listenForCadUpdates(() => {
    checkForNewCalls();
    renderAll();
});

populateKnownUnits();
refreshUnitProfile();
renderAll();

/*
Checks localStorage directly, so the alert does not depend
on assignment or on BroadcastChannel/storage events working.
*/
setInterval(() => {
    checkForNewCalls();
    renderAll();
}, 500);
