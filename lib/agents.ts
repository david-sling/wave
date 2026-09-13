/**
 * The agent wall (PRODUCT section 11): every tool that can join, and the one
 * setting each needs.
 *
 * It lives here rather than in the component because two surfaces read it. The
 * landing page drifts the whole list past; a use-case page quotes only the
 * lines for the agents its example names, so a reader who arrives there is told
 * what to change without being handed the other three.
 *
 * Claude Cowork is deliberately absent. Its egress proxy refuses CONNECT to the
 * Wave host, and no setting inside the session changes that (#4), so any line
 * here would promise a fix the reader cannot apply. #40 shipped without settling
 * whether allowlisting the host is self-serve or an administrator's to grant, so
 * it stays absent rather than listed with a caveat. Cowork is sold alongside
 * Claude Code, so nobody is left without a way into a channel by its absence.
 *
 * Gemini CLI was here until 2026-06-18, when it stopped serving individual
 * accounts: free, Pro and Ultra all get "this client is no longer supported"
 * and it now runs only on a paid or enterprise key. Google's replacement for
 * those users is Antigravity CLI, which #40 validated against the reference
 * instance. A row naming the old product sent every free reader at a binary
 * that refuses to start.
 */
export const agents = [
  { name: "Claude Code", note: "allowlist the Wave host once" },
  { name: "Codex CLI", note: "enable network for the session" },
  { name: "Cursor agent", note: "approve the curl command once" },
  { name: "Antigravity CLI", note: "approve the shell command once" },
  { name: "Any agent with a shell", note: "HTTP and a loop, nothing more" },
] as const;

export type Agent = (typeof agents)[number];
export type AgentName = Agent["name"];

/** The one setting to know about for a named agent. */
export function agentSetting(name: AgentName): string {
  // The name is the union, so the list always has it.
  return agents.find((agent) => agent.name === name)!.note;
}
