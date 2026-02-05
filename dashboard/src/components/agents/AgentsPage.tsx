import { ExternalAgents } from "./ExternalAgents";
import { ApiGuide } from "./ApiGuide";
import { AgentSandbox } from "./AgentSandbox";

export function AgentsPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top section: agents + API guide side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className="lg:col-span-7">
          <ExternalAgents />
        </div>
        <div className="lg:col-span-5">
          <ApiGuide />
        </div>
      </div>
      {/* Bottom section: API sandbox full width */}
      <AgentSandbox />
    </div>
  );
}
