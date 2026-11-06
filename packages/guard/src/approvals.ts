// The owner's answer to one paused payment. The agent picks the request's ID itself, and the owner
// signs this text naming that ID, the amount and the payee, so the guard can check the answer on
// its own: an approval Till made up, one signed by anyone else, or one from another request
// doesn't count. No Node imports: the server, the agent and the console all build this same text.

export type ApprovalSubject = { id: string; usd: string; merchant?: string; payTo: string; agent: string }

/** The exact text the owner signs to approve or deny one paused payment. */
export const decisionMessage = (a: ApprovalSubject, decision: "approve" | "deny") =>
  `${decision === "approve" ? "Approve" : "Deny"} agent payment ${a.id}\n$${a.usd} to ${a.merchant ?? a.payTo}\nAgent: ${a.agent}`

/** A fresh request ID: 128 random bits as hex, so an old signed answer never matches a new request. */
export const newApprovalId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("")

export const isApprovalId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{32}$/.test(id)
