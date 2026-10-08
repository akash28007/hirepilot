// Single source of truth for what each action costs.
// The browser never sends an amount; services charge by action name.
export const PRICES = {
    "resume-analysis": 10,
    "start-interview": 50,
    "roadmap": 20,
    "download-pdf": 10,
};

// Actions the browser may charge for itself via /use-coins.
// Only actions that never reach a backend service belong here (the PDF is
// printed in the browser). Everything else is charged by the service doing
// the work, through the internal /internal/charge endpoint.
export const CLIENT_CHARGEABLE_ACTIONS = new Set(["download-pdf"]);
