"use strict";

/* -------------------------------------------------------
   ELEMENTS
------------------------------------------------------- */

const patrolUnitNumber = document.getElementById("patrol-unit-number");
const patrolKnownUnits = document.getElementById("patrol-known-units");
const unitStatus = document.getElementById("unit-status");

const patrolCallList = document.getElementById("patrol-call-list");
const patrolCallCount = document.getElementById("patrol-call-count");
const callDetails = document.getElementById("call-details");

const activeCallList = document.getElementById("active-call-list");
const activeCallCount = document.getElementById("active-call-count");

const completedCallList =
    document.getElementById("completed-call-list");

const completedCallCount =
    document.getElementById("completed-call-count");

const panicButton = document.getElementById("panic-button");

const profileButton = document.getElementById("profile-button");
const profileMenu = document.getElementById("profile-menu");
const profileAvatar = document.getElementById("profile-avatar");
const menuAvatar = document.getElementById("menu-avatar");
const profileName = document.getElementById("profile-name");
const profileUnit = document.getElementById("profile-unit");

const incomingCallSound = document.getElementById("incoming-call-sound");
const panicSound = document.getElementById("panic-sound");

/* -------------------------------------------------------
   STATE
------------------------------------------------------- */

let selectedCallId = null;
let previousActiveCallIds = new Set();
let cadPollSignature = "";

let panicButtonLocked = false;

const unlockedAudioElements = new WeakSet();
const pendingAudioElements = new Set();

/* -------------------------------------------------------
   UNIT HELPERS
------------------------------------------------------- */

function getCurrentUnit() {
    return normalizeUnitNumber(patrolUnitNumber.value);
}

function getCallUnits(call) {
    return String(call.assignedUnit || "")
        .split(",")
        .map(unit => normalizeUnitNumber(unit))
        .filter(Boolean);
}

function isUnitAttached(call, unit = getCurrentUnit()) {
    const normalizedUnit = normalizeUnitNumber(unit);

    if (!normalizedUnit) {
        return false;
    }

    const assignedUnits = getCallUnits(call);

    return (
        assignedUnits.includes("000") ||
        assignedUnits.includes(normalizedUnit)
    );
}

function getAssignedCalls() {
    const currentUnit = getCurrentUnit();

    if (!currentUnit) {
        return [];
    }

    return getCalls().filter(call => {
        return (
            call.status !== "Completed" &&
            isUnitAttached(call, currentUnit)
        );
    });
}
function getActiveCalls() {
    return getCalls()
        .filter(call => {
            return (
                String(call.status || "").toLowerCase() !==
                "completed"
            );
        })
        .sort((firstCall, secondCall) => {
            const firstPriority =
                Number(firstCall.priority) || 3;

            const secondPriority =
                Number(secondCall.priority) || 3;

            if (firstPriority !== secondPriority) {
                return firstPriority - secondPriority;
            }

            const firstTime = new Date(
                firstCall.createdAt ||
                firstCall.updatedAt ||
                0
            ).getTime();

            const secondTime = new Date(
                secondCall.createdAt ||
                secondCall.updatedAt ||
                0
            ).getTime();

            return secondTime - firstTime;
        });
}

function getCompletedCalls() {
    const currentUnit = getCurrentUnit();

    if (!currentUnit) {
        return [];
    }

    return getCalls()
        .filter(call => {
            const isCompleted =
                String(call.status).toLowerCase() === "completed";

            const belongsToUnit =
                isUnitAttached(call, currentUnit) ||
                normalizeUnitNumber(call.completedBy) === currentUnit;

            return isCompleted && belongsToUnit;
        })
        .sort((firstCall, secondCall) => {
            const firstTime = new Date(
                firstCall.completedAt ||
                firstCall.updatedAt ||
                firstCall.createdAt
            );

            const secondTime = new Date(
                secondCall.completedAt ||
                secondCall.updatedAt ||
                secondCall.createdAt
            );

            return secondTime - firstTime;
        })
        .slice(0, 25);
}

function isPanicCall(call) {
    return (
        call.isPanic === true ||
        String(call.type || "").toLowerCase() ===
            "officer needs assistance"
    );
}

/* -------------------------------------------------------
   AUDIO
------------------------------------------------------- */

function playCadSound(audioElement, soundName) {
    if (!audioElement) {
        console.error(`Missing audio element for ${soundName}.`);
        return;
    }

    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.volume = 1;

    const playAttempt = audioElement.play();

    if (!playAttempt) {
        pendingAudioElements.delete(audioElement);
        return;
    }

    playAttempt
        .then(() => {
            pendingAudioElements.delete(audioElement);
        })
        .catch(error => {
            pendingAudioElements.add(audioElement);

            console.error(
                `${soundName} could not play until the page is clicked:`,
                error
            );
        });
}

function playIncomingCallSound() {
    playCadSound(incomingCallSound, "Incoming-call sound");
}

function playPanicSound() {
    playCadSound(panicSound, "Panic sound");
}

function unlockAudioElement(audioElement) {
    if (!audioElement) {
        return;
    }

    if (pendingAudioElements.has(audioElement)) {
        playCadSound(
            audioElement,
            audioElement === panicSound
                ? "Panic sound"
                : "Incoming-call sound"
        );

        return;
    }

    if (unlockedAudioElements.has(audioElement)) {
        return;
    }

    const previousVolume = audioElement.volume;

    audioElement.volume = 0;
    audioElement.currentTime = 0;

    const playAttempt = audioElement.play();

    if (!playAttempt) {
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement.volume = previousVolume;
        unlockedAudioElements.add(audioElement);
        return;
    }

    playAttempt
        .then(() => {
            audioElement.pause();
            audioElement.currentTime = 0;
            audioElement.volume = previousVolume;
            unlockedAudioElements.add(audioElement);
        })
        .catch(error => {
            audioElement.volume = previousVolume;

            console.log(
                "CAD audio is still locked by the browser:",
                error
            );
        });
}

function unlockCadAudio() {
    unlockAudioElement(incomingCallSound);
    unlockAudioElement(panicSound);
}

/* -------------------------------------------------------
   NEW CALL DETECTION
------------------------------------------------------- */

function shouldNotifyCurrentUnit(call) {
    const assignedUnits = getCallUnits(call);

    return (
        assignedUnits.length === 0 ||
        isUnitAttached(call, getCurrentUnit())
    );
}

function checkForNewCalls({ initialize = false } = {}) {
    const activeCalls = getActiveCalls();

    const currentActiveCallIds = new Set(
        activeCalls.map(call => String(call.id))
    );

    if (initialize) {
        previousActiveCallIds = currentActiveCallIds;
        return;
    }

    const newCalls = activeCalls.filter(call => {
        return (
            !previousActiveCallIds.has(String(call.id)) &&
            shouldNotifyCurrentUnit(call)
        );
    });

    previousActiveCallIds = currentActiveCallIds;

    if (newCalls.length === 0) {
        return;
    }

    const containsPanicCall = newCalls.some(isPanicCall);

    if (containsPanicCall) {
        playPanicSound();
        return;
    }

    playIncomingCallSound();
}

function getCadPollSignature() {
    const calls = getCalls().map(call => ({
        id: String(call.id),
        status: String(call.status),
        assignedUnit: String(call.assignedUnit || ""),
        updatedAt: String(call.updatedAt || "")
    }));

    return JSON.stringify(calls);
}

function pollForCadChanges() {
    const nextSignature = getCadPollSignature();

    if (nextSignature === cadPollSignature) {
        return;
    }

    cadPollSignature = nextSignature;

    checkForNewCalls();
    renderAll();
}

/* -------------------------------------------------------
   PANIC BUTTON
------------------------------------------------------- */

function getPanicLocation() {
    if (selectedCallId) {
        const selectedCall = getCalls().find(call => {
            return (
                String(call.id) === String(selectedCallId) &&
                call.status !== "Completed"
            );
        });

        if (selectedCall?.address) {
            return selectedCall.address;
        }
    }

    const assignedCall = getAssignedCalls()[0];

    if (assignedCall?.address) {
        return assignedCall.address;
    }

    return "Officer location unknown";
}

function hasRecentPanicCall(unitNumber) {
    const currentTime = Date.now();

    return getCalls().some(call => {
        if (
            call.status === "Completed" ||
            !isPanicCall(call)
        ) {
            return false;
        }

        const panicUnit = normalizeUnitNumber(
            call.panicUnit ||
            String(call.notes || "").match(/UNIT\s+([A-Z0-9-]+)/i)?.[1]
        );

        if (panicUnit !== unitNumber) {
            return false;
        }

        const createdTime = new Date(call.createdAt).getTime();

        if (Number.isNaN(createdTime)) {
            return false;
        }

        return currentTime - createdTime < 5000;
    });
}

function temporarilyLockPanicButton() {
    panicButtonLocked = true;

    if (panicButton) {
        panicButton.disabled = true;
        panicButton.textContent = "ACTIVATED";
    }

    window.setTimeout(() => {
        panicButtonLocked = false;

        if (panicButton) {
            panicButton.disabled = false;
            panicButton.textContent = "PANIC";
        }
    }, 3000);
}

function activatePanic() {
    const currentUnit = getCurrentUnit();

    if (!currentUnit) {
        window.alert("Enter your patrol unit number first.");
        patrolUnitNumber.focus();
        return;
    }

    if (panicButtonLocked || hasRecentPanicCall(currentUnit)) {
        return;
    }

    temporarilyLockPanicButton();

    const timestamp = new Date().toISOString();
    const panicCallId = createCallId();
    const panicLocation = getPanicLocation();

    const panicCall = {
        id: panicCallId,
        type: "Officer Needs Assistance",
        priority: 1,
        address: panicLocation,
        crossStreet: "",
        callerName: `Unit ${currentUnit}`,
        callerPhone: "",
        notes: `PANIC BUTTON ACTIVATED BY UNIT ${currentUnit}`,
        assignedUnit: "000",
        status: "Dispatched",
        createdAt: timestamp,
        updatedAt: timestamp,
        isPanic: true,
        panicUnit: currentUnit,
        history: [
            {
                message:
                    `PANIC button activated by Unit ${currentUnit}.`,
                timestamp
            }
        ]
    };

    const updatedCalls = [
        ...getCalls(),
        panicCall
    ];

    /*
     * Add the ID before saving so the patrol console that pressed
     * PANIC does not play the same alert twice during polling.
     */
    previousActiveCallIds.add(String(panicCallId));

    saveCalls(updatedCalls);

    cadPollSignature = getCadPollSignature();
    selectedCallId = String(panicCallId);

    playPanicSound();
    renderAll();
}

/* -------------------------------------------------------
   UNIT PROFILE
------------------------------------------------------- */

function populateKnownUnits() {
    patrolKnownUnits.innerHTML = knownPatrolUnits
        .map(unit => {
            return `<option value="${escapeHtml(unit)}"></option>`;
        })
        .join("");
}

function setAvatarStatusClass(status) {
    const statusClass = String(status)
        .toLowerCase()
        .replaceAll(" ", "-");

    profileAvatar.className =
        `profile-avatar status-${statusClass}`;

    menuAvatar.className =
        `menu-avatar status-${statusClass}`;
}

function refreshUnitProfile() {
    const currentUnit = getCurrentUnit() || "---";
    const avatarText = currentUnit.slice(0, 3);

    profileAvatar.textContent = avatarText;
    menuAvatar.textContent = avatarText;
    profileName.textContent = "Patrol Unit";
    profileUnit.textContent = `Unit ${currentUnit}`;

    const savedStatus = getUnitStatus(currentUnit);

    unitStatus.value = savedStatus;
    setAvatarStatusClass(savedStatus);
}

/* -------------------------------------------------------
   CALL SELECTION
------------------------------------------------------- */

function selectCall(callId) {
    selectedCallId = String(callId);

    renderPatrolCalls();
    renderSelectedCall();
}

/* -------------------------------------------------------
   ATTACH TO CALL
------------------------------------------------------- */

function attachToCall(callId) {
    const currentUnit = getCurrentUnit();

    if (!currentUnit) {
        window.alert("Enter your patrol unit number first.");
        patrolUnitNumber.focus();
        return;
    }

    const timestamp = new Date().toISOString();
    let callWasFound = false;

    const updatedCalls = getCalls().map(call => {
        if (String(call.id) !== String(callId)) {
            return call;
        }

        callWasFound = true;

        if (call.status === "Completed") {
            return call;
        }

        const assignedUnits = getCallUnits(call);

        if (
            assignedUnits.includes(currentUnit) ||
            assignedUnits.includes("000")
        ) {
            return call;
        }

        assignedUnits.push(currentUnit);

        return {
            ...call,
            assignedUnit: assignedUnits.join(", "),
            updatedAt: timestamp,
            history: [
                ...(Array.isArray(call.history)
                    ? call.history
                    : []),
                {
                    message:
                        `Unit ${currentUnit} attached to the call.`,
                    timestamp
                }
            ]
        };
    });

    if (!callWasFound) {
        window.alert("That call could not be found.");
        return;
    }

    saveCalls(updatedCalls);

    selectedCallId = String(callId);

    unitStatus.value = "Dispatched";
    saveUnitStatus(currentUnit, "Dispatched");
    setAvatarStatusClass("Dispatched");

    cadPollSignature = getCadPollSignature();

    renderAll();
}

/* -------------------------------------------------------
   DETACH FROM CALL
------------------------------------------------------- */

function detachFromCall(callId) {
    const currentUnit = getCurrentUnit();

    if (!currentUnit) {
        window.alert("Enter your patrol unit number first.");
        patrolUnitNumber.focus();
        return;
    }

    const call = getCalls().find(item => {
        return String(item.id) === String(callId);
    });

    if (!call) {
        window.alert("That call could not be found.");
        return;
    }

    const assignedUnits = getCallUnits(call);

    if (assignedUnits.includes("000")) {
        window.alert(
            "This call is assigned to all units and cannot be detached."
        );

        return;
    }

    if (!assignedUnits.includes(currentUnit)) {
        return;
    }

    const confirmed = window.confirm(
        `Detach unit ${currentUnit} from call ${call.id}?`
    );

    if (!confirmed) {
        return;
    }

    const timestamp = new Date().toISOString();

    const updatedCalls = getCalls().map(item => {
        if (String(item.id) !== String(callId)) {
            return item;
        }

        const remainingUnits = getCallUnits(item).filter(unit => {
            return unit !== currentUnit;
        });

        return {
            ...item,
            assignedUnit: remainingUnits.join(", "),
            updatedAt: timestamp,
            history: [
                ...(Array.isArray(item.history)
                    ? item.history
                    : []),
                {
                    message:
                        `Unit ${currentUnit} detached from the call.`,
                    timestamp
                }
            ]
        };
    });

    saveCalls(updatedCalls);

    if (String(selectedCallId) === String(callId)) {
        selectedCallId = null;
    }

    const remainingAssignedCalls = updatedCalls.filter(item => {
        return (
            item.status !== "Completed" &&
            isUnitAttached(item, currentUnit)
        );
    });

    if (remainingAssignedCalls.length === 0) {
        unitStatus.value = "Available";
        saveUnitStatus(currentUnit, "Available");
        setAvatarStatusClass("Available");
    }

    cadPollSignature = getCadPollSignature();

    renderAll();
}

/* -------------------------------------------------------
   CALL STATUS
------------------------------------------------------- */

function updateCallStatus(callId, newStatus) {
    const currentUnit = getCurrentUnit();
    const timestamp = new Date().toISOString();

    let callWasUpdated = false;

    const updatedCalls = getCalls().map(call => {
        if (String(call.id) !== String(callId)) {
            return call;
        }

        if (!isUnitAttached(call, currentUnit)) {
            return call;
        }

        callWasUpdated = true;

        return {
            ...call,
            status: newStatus,
            updatedAt: timestamp,

            completedAt:
                newStatus === "Completed"
                    ? timestamp
                    : call.completedAt,

            completedBy:
                newStatus === "Completed"
                    ? currentUnit
                    : call.completedBy,

            history: [
                ...(Array.isArray(call.history)
                    ? call.history
                    : []),
                {
                    message:
                        `Unit ${currentUnit} changed call status to ${newStatus}.`,
                    timestamp
                }
            ]
        };
    });

    if (!callWasUpdated) {
        return;
    }

    saveCalls(updatedCalls);

    if (newStatus === "Completed") {
        selectedCallId = null;

        const remainingCalls = updatedCalls.filter(call => {
            return (
                call.status !== "Completed" &&
                isUnitAttached(call, currentUnit)
            );
        });

        if (remainingCalls.length === 0) {
            unitStatus.value = "Available";

            saveUnitStatus(
                currentUnit,
                "Available"
            );

            setAvatarStatusClass("Available");
        }
    } else {
        unitStatus.value = newStatus;

        saveUnitStatus(
            currentUnit,
            newStatus
        );

        setAvatarStatusClass(newStatus);
    }

    cadPollSignature = getCadPollSignature();

    renderAll();
}

function completeSelectedCall() {
    if (!selectedCallId) {
        return;
    }

    const confirmed = window.confirm(
        "Mark this call as completed for every attached unit?"
    );

    if (confirmed) {
        updateCallStatus(
            selectedCallId,
            "Completed"
        );
    }
}

/* -------------------------------------------------------
   ASSIGNED CALLS
------------------------------------------------------- */

function renderPatrolCalls() {
    const assignedCalls = getAssignedCalls();

    patrolCallCount.textContent =
        String(assignedCalls.length);

    if (assignedCalls.length === 0) {
        patrolCallList.innerHTML = `
            <div class="empty-message">
                No calls assigned to unit
                ${escapeHtml(getCurrentUnit() || "Unknown")}.
            </div>
        `;

        return;
    }

    patrolCallList.innerHTML = assignedCalls
        .map(call => {
            const selectedClass =
                String(call.id) === String(selectedCallId)
                    ? " selected"
                    : "";

            const panicClass = isPanicCall(call)
                ? " panic-call"
                : "";

            return `
                <article
                    class="call-card priority-${Number(call.priority) || 3}${selectedClass}${panicClass}"
                    tabindex="0"
                    role="button"
                    data-call-id="${escapeHtml(String(call.id))}"
                >
                    <div class="call-card-header">
                        <span class="call-card-title">
                            ${escapeHtml(call.type)}
                        </span>

                        <span>
                            Priority ${escapeHtml(String(call.priority))}
                        </span>
                    </div>

                    <div class="call-card-meta">
                        <span>
                            ${escapeHtml(call.address)}
                        </span>

                        <span>
                            ${escapeHtml(call.status)}
                        </span>

                        <span class="meta-wide">
                            ${escapeHtml(formatDateTime(call.createdAt))}
                        </span>
                    </div>
                </article>
            `;
        })
        .join("");
}

/* -------------------------------------------------------
   ACTIVE CALLS
------------------------------------------------------- */

function renderActiveCalls() {
    const activeCalls = getActiveCalls();
    const currentUnit = getCurrentUnit();

    activeCallCount.textContent =
        String(activeCalls.length);

    if (activeCalls.length === 0) {
        activeCallList.innerHTML = `
            <div class="empty-message">
                No active calls available.
            </div>
        `;

        return;
    }

    activeCallList.innerHTML = activeCalls
        .map(call => {
            const attached =
                isUnitAttached(call, currentUnit);

            const assignedUnits =
                getCallUnits(call);

            const assignedToAll =
                assignedUnits.includes("000");

            const assignedText = assignedToAll
                ? "All Units"
                : assignedUnits.length > 0
                    ? assignedUnits.join(", ")
                    : "None";

            let actionButton = "";

            if (assignedToAll) {
                actionButton = `
                    <button
                        class="button compact-button"
                        type="button"
                        disabled
                        title="This call is assigned to all units"
                    >
                        All Units
                    </button>
                `;
            } else if (attached) {
                actionButton = `
                    <button
                        class="button danger-button compact-button"
                        type="button"
                        data-active-action="detach"
                        data-call-id="${escapeHtml(String(call.id))}"
                    >
                        Detach
                    </button>
                `;
            } else {
                actionButton = `
                    <button
                        class="button primary-button compact-button"
                        type="button"
                        data-active-action="attach"
                        data-call-id="${escapeHtml(String(call.id))}"
                    >
                        Attach
                    </button>
                `;
            }

            const panicClass = isPanicCall(call)
                ? " panic-call"
                : "";

            return `
                <article
                    class="active-call-row priority-${Number(call.priority) || 3}${panicClass}"
                >
                    <div class="active-call-main">
                        <div class="active-call-heading">
                            <strong>
                                ${escapeHtml(call.type)}
                            </strong>

                            <span class="active-priority">
                                Priority ${escapeHtml(String(call.priority))}
                            </span>
                        </div>

                        <div class="active-call-meta">
                            <span>
                                <strong>Call:</strong>
                                ${escapeHtml(String(call.id))}
                            </span>

                            <span>
                                <strong>Location:</strong>
                                ${escapeHtml(call.address)}
                            </span>

                            <span>
                                <strong>Units:</strong>
                                ${escapeHtml(assignedText)}
                            </span>

                            <span>
                                <strong>Status:</strong>
                                ${escapeHtml(call.status)}
                            </span>

                            <span>
                                <strong>Started:</strong>
                                ${escapeHtml(formatDateTime(call.createdAt))}
                            </span>
                        </div>
                    </div>

                    <div class="active-call-actions">
                        ${actionButton}
                    </div>
                </article>
            `;
        })
        .join("");
}

/* -------------------------------------------------------
   COMPLETED CALLS
------------------------------------------------------- */

function renderCompletedCalls() {
    if (!completedCallList || !completedCallCount) {
        return;
    }

    const completedCalls = getCompletedCalls();

    completedCallCount.textContent =
        String(completedCalls.length);

    if (completedCalls.length === 0) {
        completedCallList.innerHTML = `
            <div class="empty-message">
                No completed calls.
            </div>
        `;

        return;
    }

    completedCallList.innerHTML = completedCalls
        .map(call => {
            const completedTime =
                call.completedAt ||
                call.updatedAt ||
                call.createdAt;

            return `
                <article class="completed-call-row">
                    <div class="completed-call-main">
                        <div class="completed-call-heading">
                            <span class="completed-call-title">
                                ${escapeHtml(
                                    call.type || "Unknown Call"
                                )}
                            </span>

                            <span class="completed-badge">
                                COMPLETED
                            </span>
                        </div>

                        <div class="completed-call-meta">
                            <span>
                                <strong>Call:</strong>
                                ${escapeHtml(String(call.id))}
                            </span>

                            <span>
                                <strong>Priority:</strong>
                                ${escapeHtml(
                                    String(call.priority || "—")
                                )}
                            </span>

                            <span>
                                <strong>Location:</strong>
                                ${escapeHtml(
                                    call.address ||
                                    "Unknown location"
                                )}
                            </span>

                            <span>
                                <strong>Completed:</strong>
                                ${escapeHtml(
                                    formatDateTime(completedTime)
                                )}
                            </span>
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");
}

/* -------------------------------------------------------
   CALL INFORMATION
------------------------------------------------------- */

function renderSelectedCall() {
    if (!selectedCallId) {
        callDetails.innerHTML = `
            <div class="empty-message">
                Select an assigned call to view its information.
            </div>
        `;

        return;
    }

    const call = getCalls().find(item => {
        return String(item.id) === String(selectedCallId);
    });

    if (
        !call ||
        call.status === "Completed" ||
        !isUnitAttached(call)
    ) {
        selectedCallId = null;

        callDetails.innerHTML = `
            <div class="empty-message">
                This call is no longer active or assigned to your unit.
            </div>
        `;

        return;
    }

    const assignedUnits = getCallUnits(call);

    const assignedText =
        assignedUnits.includes("000")
            ? "All Units"
            : assignedUnits.join(", ") || "None";

    const detachButton =
        assignedUnits.includes("000")
            ? ""
            : `
                <button
                    class="button danger-button"
                    type="button"
                    data-call-action="Detach"
                >
                    Detach
                </button>
            `;

    callDetails.innerHTML = `
        <div class="details-grid">
            <div class="detail-box">
                <span class="detail-label">
                    Call Number
                </span>

                ${escapeHtml(String(call.id))}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Priority
                </span>

                Priority ${escapeHtml(String(call.priority))}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Call Type
                </span>

                ${escapeHtml(call.type)}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Status
                </span>

                ${escapeHtml(call.status)}
            </div>

            <div class="detail-box detail-box-wide">
                <span class="detail-label">
                    Address
                </span>

                ${escapeHtml(call.address)}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Cross Street
                </span>

                ${escapeHtml(
                    call.crossStreet || "Not provided"
                )}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Assigned Units
                </span>

                ${escapeHtml(assignedText)}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Caller
                </span>

                ${escapeHtml(
                    call.callerName || "Not provided"
                )}
            </div>

            <div class="detail-box">
                <span class="detail-label">
                    Caller Phone
                </span>

                ${escapeHtml(
                    call.callerPhone || "Not provided"
                )}
            </div>

            <div class="detail-box detail-box-wide">
                <span class="detail-label">
                    Dispatch Notes
                </span>

                <div class="preserve-lines">
                    ${escapeHtml(
                        call.notes || "No notes provided"
                    )}
                </div>
            </div>
        </div>

        <div class="button-row">
            <button
                class="button info-button"
                type="button"
                data-call-action="En Route"
            >
                En Route
            </button>

            <button
                class="button warning-button"
                type="button"
                data-call-action="On Scene"
            >
                On Scene
            </button>

            <button
                class="button primary-button"
                type="button"
                data-call-action="Completed"
            >
                Complete
            </button>

            ${detachButton}
        </div>
    `;
}

/* -------------------------------------------------------
   RENDER EVERYTHING
------------------------------------------------------- */

function renderAll() {
    const assignedCalls = getAssignedCalls();

    if (
        selectedCallId &&
        !assignedCalls.some(call => {
            return String(call.id) === String(selectedCallId);
        })
    ) {
        selectedCallId = null;
    }

    renderPatrolCalls();
    renderActiveCalls();
    renderCompletedCalls();
    renderSelectedCall();
}
/* -------------------------------------------------------
   PROFILE MENU
------------------------------------------------------- */

function closeProfileMenu() {
    profileMenu.classList.add("hidden");
    profileButton.setAttribute("aria-expanded", "false");
}

/* -------------------------------------------------------
   EVENT LISTENERS
------------------------------------------------------- */

patrolUnitNumber.value = getSavedPatrolUnit();

patrolUnitNumber.addEventListener("input", () => {
    selectedCallId = null;

    savePatrolUnit(getCurrentUnit());
    refreshUnitProfile();
    renderAll();
});

unitStatus.addEventListener("change", () => {
    const currentUnit = getCurrentUnit();

    if (!currentUnit) {
        return;
    }

    saveUnitStatus(currentUnit, unitStatus.value);
    setAvatarStatusClass(unitStatus.value);
});

profileButton.addEventListener("click", event => {
    event.stopPropagation();

    const willOpen = profileMenu.classList.contains("hidden");

    profileMenu.classList.toggle("hidden");
    profileButton.setAttribute(
        "aria-expanded",
        String(willOpen)
    );
});

document.addEventListener("click", event => {
    if (!event.target.closest(".profile-wrapper")) {
        closeProfileMenu();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeProfileMenu();
    }
});

patrolCallList.addEventListener("click", event => {
    const card = event.target.closest("[data-call-id]");

    if (card) {
        selectCall(card.dataset.callId);
    }
});

patrolCallList.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const card = event.target.closest("[data-call-id]");

    if (card) {
        event.preventDefault();
        selectCall(card.dataset.callId);
    }
});

activeCallList.addEventListener("click", event => {
    const button = event.target.closest(
        "[data-active-action]"
    );

    if (!button) {
        return;
    }

    const callId = button.dataset.callId;
    const action = button.dataset.activeAction;

    if (action === "attach") {
        attachToCall(callId);
        return;
    }

    if (action === "detach") {
        detachFromCall(callId);
    }
});

callDetails.addEventListener("click", event => {
    const button = event.target.closest(
        "[data-call-action]"
    );

    if (!button || !selectedCallId) {
        return;
    }

    const action = button.dataset.callAction;

    if (action === "Completed") {
        completeSelectedCall();
        return;
    }

    if (action === "Detach") {
        detachFromCall(selectedCallId);
        return;
    }

    updateCallStatus(selectedCallId, action);
});

profileMenu.addEventListener("click", event => {
    if (event.target.closest("[data-menu-action]")) {
        window.alert(
            "This menu item is ready for a future feature."
        );

        closeProfileMenu();
    }
});

if (panicButton) {
    panicButton.addEventListener("click", activatePanic);
} else {
    console.error(
        'Missing <button id="panic-button"> in patrol.html.'
    );
}

document.addEventListener("pointerdown", unlockCadAudio);
document.addEventListener("keydown", unlockCadAudio);

/* -------------------------------------------------------
   CAD UPDATES
------------------------------------------------------- */

function handleCadUpdate() {
    checkForNewCalls();
    cadPollSignature = getCadPollSignature();
    refreshUnitProfile();
    renderAll();
}

/* -------------------------------------------------------
   STARTUP
------------------------------------------------------- */

populateKnownUnits();
refreshUnitProfile();

/*
 * Record existing calls so opening or refreshing the page
 * does not play an alert for calls already on screen.
 */
checkForNewCalls({ initialize: true });

cadPollSignature = getCadPollSignature();

listenForCadUpdates(handleCadUpdate);

window.setInterval(pollForCadChanges, 500);

renderAll();