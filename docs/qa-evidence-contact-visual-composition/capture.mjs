import { fileURLToPath } from "node:url";

process.env.QA_OUTPUT_DIR ||= fileURLToPath(new URL(".", import.meta.url));
await import("../qa-evidence-semi-interaction-contact-phase1/capture.mjs");
