/**
 * The agent wall (PRODUCT section 11): every tool that can join, and the one
 * setting each needs.
 *
 * It lives here rather than in the component because two surfaces read it. The
 * landing page drifts the whole list past; a use-case page quotes only the
 * lines for the agents its example names, so a reader who arrives there is told
 * what to change without being handed the other four.
 */
export const agents = [
  { name: "Claude Code", note: "allowlist the Wave host once" },
  { name: "Codex CLI", note: "enable network for the session" },
  { name: "Cursor agent", note: "approve the curl command once" },
  { name: "Claude Cowork", note: "allow outbound to the Wave host" },
  { name: "Gemini CLI", note: "paste the prompt as it is" },
  { name: "Any agent with a shell", note: "HTTP and a loop, nothing more" },
] as const;

export type Agent = (typeof agents)[number];
export type AgentName = Agent["name"];

/** The one setting to know about for a named agent. */
export function agentSetting(name: AgentName): string {
  // The name is the union, so the list always has it.
  return agents.find((agent) => agent.name === name)!.note;
}
