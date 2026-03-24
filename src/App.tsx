import { AskPanel } from "./components/dashboard/AskPanel";
import { EvidencePanel } from "./components/dashboard/EvidencePanel";
import { PanelWorkspace } from "./components/dashboard/PanelWorkspace";
import { SessionPanel } from "./components/dashboard/SessionPanel";
import { SourcePanel } from "./components/dashboard/SourcePanel";
import { SummaryPanel } from "./components/dashboard/SummaryPanel";
import { shell } from "./components/dashboard/styles";
import { sampleDashboardContent } from "./content/sampleDashboardContent";

function App() {
  const { brand, session, summary, feeds, ask, evidence } = sampleDashboardContent;
  const sessionLabel = `${session.sessionDate} / ${session.window}`;
  const workspaceItems = [
    {
      id: "session",
      node: (
        <SessionPanel
          title={`${brand.name} / ${session.title}`}
          sessionId={session.sessionId}
          sessionDate={session.sessionDate}
          window={session.window}
          reloadRule={session.reloadRule}
          metrics={session.metrics}
          runtime={session.runtime}
          rules={session.rules}
        />
      ),
      defaultRowSpan: 4,
      defaultColSpan: 1,
    },
    {
      id: "summary",
      node: (
        <SummaryPanel
          title={summary.title}
          headline={summary.headline}
          digests={summary.digests}
          sessionLabel={sessionLabel}
        />
      ),
      defaultRowSpan: 4,
      defaultColSpan: 1,
    },
    {
      id: "ask",
      node: (
        <AskPanel
          title={ask.title}
          description={ask.description}
          prompts={ask.prompts}
          references={ask.references}
          sessionLabel={sessionLabel}
        />
      ),
      defaultRowSpan: 4,
      defaultColSpan: 1,
    },
    ...feeds.map((feed) => ({
      id: feed.id,
      node: <SourcePanel panelData={feed} sessionLabel={sessionLabel} />,
      defaultRowSpan: 4,
      defaultColSpan: 1,
    })),
    {
      id: "evidence",
      node: (
        <EvidencePanel
          title={evidence.title}
          description={evidence.description}
          steps={evidence.steps}
          references={evidence.references}
          sessionLabel={sessionLabel}
        />
      ),
      defaultRowSpan: 4,
      defaultColSpan: 1,
    },
  ];

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-orbit-bg font-body text-orbit-text">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 bg-[linear-gradient(rgba(124,255,155,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(124,255,155,0.06)_1px,transparent_1px)] bg-size-[32px_32px] opacity-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(124,255,155,0.04)_0,transparent_28%,rgba(85,243,204,0.03)_100%)] opacity-70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-10 -z-10 aspect-square w-112 rounded-full bg-[radial-gradient(circle,rgba(124,255,155,0.16),rgba(124,255,155,0))] opacity-70 blur-[48px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 bottom-16 -z-10 aspect-square w-120 rounded-full bg-[radial-gradient(circle,rgba(85,243,204,0.14),rgba(85,243,204,0))] opacity-70 blur-[52px]"
      />

      <main className={`${shell} h-full overflow-hidden`}>
        <PanelWorkspace items={workspaceItems} />
      </main>
    </div>
  );
}

export default App;
