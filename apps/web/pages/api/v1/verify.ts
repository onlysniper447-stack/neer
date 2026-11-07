import { handleVerifyNodeRequest } from "@/lib/server/verify-node";

// Preserve streaming bounds in the shared reader; never let Next pre-parse a body.
export const config = { api: { bodyParser: false } };
export default handleVerifyNodeRequest;
