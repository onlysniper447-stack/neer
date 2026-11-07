// Node built-ins are unavailable to browser bundles. Keep this boundary on shared
// implementations; legacy facades additionally retain React's server-only marker.
import "node:fs";

if (typeof process === "undefined" || !process.versions?.node) {
  throw new Error("This module requires the Node.js server runtime.");
}
