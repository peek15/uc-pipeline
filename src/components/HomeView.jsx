"use client";
import { useState, useEffect, useRef } from "react";
import { IconArrow, IconBolt, IconPipeline, IconCheck } from "@/components/CEIcons";
import { CEMark } from "@/components/CEMark";
import { getActiveProgrammes, getBrandName, getBrandTargetPlatforms } from "@/lib/brandConfig";
import { supabase } from "@/lib/db";
import { getAdaptiveScore } from "@/lib/adaptiveScoring";

function readiness(settings, stories) {
  const activeProgrammes = getActiveProgrammes(settings);
  const hasBrand = Boolean(getBrandName(settings) || settings?.brand?.short_description || settings?.brand?.voice);
  const hasStrategy = Boolean(settings?.strategy?.content_goals || settings?.strategy?.content_pillars?.length || settings?.strategy?.key_messages);
  const hasProgrammes = activeProgrammes.length > 0;
  const hasContent = stories.length > 0;
  const checks = [
    { label: "Brand profile", done: hasBrand },
    { label: "Content strategy", done: hasStrategy },
    { label: "Active programmes", done: hasProgrammes },
    { label: "Content pipeline", done: hasContent },
  ];
  return { checks, done: checks.filter(c => c.done).length, total: checks.length, activeProgrammes };
}

function nextActionFor(s) {
  if (s.quality_gate_status === "blocked") return "Resolve flag";
  if (Number(s.quality_gate_warnings) > 0) return "Review warnings";
  if (s.status === "accepted") return "Review idea";
  if (s.status === "approved") return "Draft content";
  if (s.status === "scripted") return "Review draft";
  if (s.status === "produced") return "Approve & export";
  if (s.status === "published") return "Review signals";
  return "Open";
}

function programmeLabel(s, settings) {
  const progs = getActiveProgrammes(settings);
  const match = progs.find(p => p.key === s.programme || p.key === s.program);
  return (match?.label || s.programme || s.program || s.content_type || "Content").toUpperCase();
}

function dayLabel(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.round((d - now) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7 && diffDays > 0) return d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SecH({ title, meta, action }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ce-text)", letterSpacing: "-0.005em" }}>{title}</div>
      {meta && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-4)" }}>{meta}</span>}
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );
}

function NextCard({ kind, title, why, primary, onClick }) {
  return (
    <div className="ce-hover ce-slide-up" onClick={onClick} style={{
      padding: "18px 18px 16px", borderRadius: "var(--ce-r-lg)",
      background: primary ? "var(--ce-surface-3)" : "var(--ce-surface-2)",
      border: "0.5px solid " + (primary ? "var(--ce-line-2)" : "var(--ce-line)"),
      cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, minHeight: 152
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ce-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{kind}</span>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ce-text)", letterSpacing: "-0.005em", lineHeight: 1.4, flex: 1 }}>{title}</div>
      {why && <div style={{ fontSize: 11.5, color: "var(--ce-text-3)", lineHeight: 1.55 }}>{why}</div>}
      <button style={{
        alignSelf: "flex-start", padding: "5px 11px", borderRadius: "var(--ce-r-sm)",
        background: primary ? "var(--ce-text)" : "transparent",
        color: primary ? "var(--ce-bg)" : "var(--ce-text-2)",
        border: primary ? "none" : "0.5px solid var(--ce-line-2)",
        fontFamily: "inherit", fontSize: 11.5, fontWeight: 550, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 5
      }}>
        {primary ? <><IconArrow size={11} /> Continue</> : "Open"}
      </button>
    </div>
  );
}

function WorkflowRow({ name, stage, eta, live }) {
  return (
    <div className="ce-hover" style={{
      padding: "12px 16px", display: "grid",
      gridTemplateColumns: "14px 1fr 130px 80px",
      gap: 14, alignItems: "center", cursor: "pointer"
    }}>
      {live
        ? <CEMark size={11} strokeWidth={1.2} color="var(--ce-live)" breathe />
        : <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--ce-text-4)", marginLeft: 4 }} />}
      <span style={{ fontSize: 12.5, color: "var(--ce-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span style={{ fontSize: 11.5, color: "var(--ce-text-3)" }}>{stage}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-4)", textAlign: "right" }}>{eta}</span>
    </div>
  );
}

function QueueRow({ title, programme, stage, due, owner, onClick }) {
  return (
    <div className="ce-hover" onClick={onClick} style={{
      padding: "12px 16px", display: "grid",
      gridTemplateColumns: "1fr 130px 90px 90px",
      gap: 14, alignItems: "center", cursor: "pointer"
    }}>
      <div>
        <div style={{ fontSize: 12.5, color: "var(--ce-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ce-text-4)", marginTop: 3, letterSpacing: "0.04em" }}>{programme}</div>
      </div>
      <span style={{ fontSize: 11.5, color: "var(--ce-text-3)" }}>{stage}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-4)" }}>{due}</span>
      {owner === "you" ? (
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--ce-text)", color: "var(--ce-bg)", fontWeight: 600, justifySelf: "end" }}>Your move</span>
      ) : owner === "engine" ? (
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 999,
          background: "var(--ce-live-3)", color: "var(--ce-live)", fontWeight: 550,
          border: "0.5px solid rgba(138,164,184,0.24)",
          display: "inline-flex", alignItems: "center", gap: 4, justifySelf: "end"
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--ce-live)" }} />Engine
        </span>
      ) : <span style={{ justifySelf: "end" }} />}
    </div>
  );
}

const SEP = <div style={{ height: 0.5, background: "var(--ce-line)" }} />;

export default function HomeView({ stories = [], settings = null, tenant = null, onNavigate, onOpenSettings, onRunOnboarding, onUpdateStory }) {
  const [memoryCount, setMemoryCount] = useState(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || !tenant?.workspace_id) return;
    fetchedRef.current = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) return;
      const qs = new URLSearchParams({ workspace_id: tenant.workspace_id, limit: "1" });
      if (tenant.brand_profile_id) qs.set("brand_profile_id", tenant.brand_profile_id);
      fetch(`/api/workspace-memory?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.memory_context?.count != null) setMemoryCount(json.memory_context.count); })
        .catch(() => {});
    });
  }, [tenant?.workspace_id, tenant?.brand_profile_id]);

  const r             = readiness(settings, stories);
  const brandName     = getBrandName(settings);
  const active        = stories.filter(s => !["rejected", "archived"].includes(s.status));
  const needsApproval = active.filter(s => s.status === "accepted");
  const inMotion      = active.filter(s => ["approved", "scripted"].includes(s.status)).slice(0, 4);
  const readyItems    = active.filter(s => s.status === "produced");
  const flagged       = active.filter(s => s.quality_gate_status === "blocked" || Number(s.quality_gate_warnings) > 0).slice(0, 2);
  const todayQueue    = [...needsApproval, ...inMotion, ...readyItems]
    .slice(0, 6)
    .map(s => ({
      s,
      owner: s.status === "accepted" || s.status === "produced" ? "you"
           : s.status === "approved" || s.status === "scripted" ? "engine"
           : "you",
      stage: nextActionFor(s),
    }));

  // Build next-moves cards
  const nextCards = [];
  if (!r.checks[0].done) {
    nextCards.push({ kind: "Setup", title: "Finish brand setup", why: "Create a brand profile before generating content.", primary: true, action: () => onRunOnboarding?.(false) });
  } else if (readyItems.length) {
    nextCards.push({ kind: "Approve", title: `${readyItems.length} item${readyItems.length > 1 ? "s" : ""} ready to approve`, why: "Production complete. Review and approve before export.", primary: true, action: () => onNavigate?.("pipeline") });
  } else if (needsApproval.length) {
    nextCards.push({ kind: "Review", title: `${needsApproval.length} idea${needsApproval.length > 1 ? "s" : ""} waiting for a decision`, why: "Researched and ready — approve or pass.", primary: true, action: () => onNavigate?.("pipeline") });
  } else if (inMotion.length) {
    nextCards.push({ kind: "Continue", title: `Continue ${inMotion[0].title}`, why: "Pick up where the work is moving.", primary: true, action: () => onNavigate?.("create") });
  } else {
    nextCards.push({ kind: "Start", title: "Generate or add first ideas", why: "Start with source-aware opportunities in Ideas.", primary: true, action: () => onNavigate?.("research") });
  }
  if (flagged.length) {
    nextCards.push({ kind: "Flag", title: `Quality gate flagged ${flagged.length} item${flagged.length > 1 ? "s" : ""}`, why: "Resolve blockers before drafting.", primary: false, action: () => onNavigate?.("pipeline") });
  }
  if (!r.checks[2].done) {
    nextCards.push({ kind: "Strategy", title: "Review active programmes", why: "Programmes define recurring content lanes.", primary: false, action: () => onNavigate?.("strategy") });
  } else if (r.activeProgrammes.length && nextCards.length < 3) {
    const p = r.activeProgrammes[0];
    nextCards.push({ kind: "Programme", title: p.label, why: p.cadence || p.desc || "Active content lane.", primary: false, action: () => onNavigate?.("strategy") });
  }
  // Always pad to 3
  while (nextCards.length < 3) {
    nextCards.push({ kind: "Analyze", title: "Workspace signals", why: "Operational transparency and learning signals.", primary: false, action: () => onNavigate?.("analyze") });
  }

  const today = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="ce-scroll" style={{ flex: 1, overflowY: "auto", padding: "40px 48px 56px", minWidth: 0 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{today}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ce-text)", marginTop: 6, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {greeting}{brandName ? `, ${brandName}.` : "."}
        </div>
      </div>

      {/* Next moves */}
      <SecH
        title="Next moves"
        meta={`${nextCards.length} proposed`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 40 }}>
        {nextCards.slice(0, 3).map((c, i) => (
          <NextCard key={i} kind={c.kind} title={c.title} why={c.why} primary={c.primary} onClick={c.action} />
        ))}
      </div>

      {/* In motion */}
      {inMotion.length > 0 && (
        <>
          <SecH title="In motion" meta={`${inMotion.length} running`} />
          <div style={{
            borderRadius: "var(--ce-r-lg)", background: "var(--ce-surface-2)",
            border: "0.5px solid var(--ce-line)", overflow: "hidden", marginBottom: 40
          }}>
            {inMotion.map((s, i) => (
              <div key={s.id}>
                {i > 0 && SEP}
                <WorkflowRow
                  live={s.status === "approved"}
                  name={s.title}
                  stage={nextActionFor(s)}
                  eta="—"
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Today queue */}
      {todayQueue.length > 0 && (
        <>
          <SecH
            title="Today"
            meta={`${todayQueue.length} items`}
            action={
              <button onClick={() => onNavigate?.("pipeline")} style={{
                padding: "5px 10px", borderRadius: "var(--ce-r-sm)",
                background: "var(--ce-fill)", border: "0.5px solid var(--ce-line-2)",
                color: "var(--ce-text-2)", fontFamily: "inherit", fontSize: 11.5, cursor: "pointer"
              }}>Open Pipeline →</button>
            }
          />
          <div style={{
            borderRadius: "var(--ce-r-lg)", background: "var(--ce-surface-2)",
            border: "0.5px solid var(--ce-line)", overflow: "hidden"
          }}>
            {todayQueue.map(({ s, owner, stage }, i) => (
              <div key={s.id}>
                {i > 0 && SEP}
                <QueueRow
                  title={s.title}
                  programme={programmeLabel(s, settings)}
                  stage={stage}
                  due={s.scheduled_date ? dayLabel(s.scheduled_date) : "—"}
                  owner={owner}
                  onClick={() => onNavigate?.("pipeline")}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {todayQueue.length === 0 && inMotion.length === 0 && (
        <div style={{
          marginTop: 32, padding: "40px 32px", borderRadius: "var(--ce-r-lg)",
          background: "var(--ce-surface-2)", border: "0.5px solid var(--ce-line)",
          textAlign: "center"
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ce-text)", marginBottom: 8 }}>Pipeline is empty</div>
          <div style={{ fontSize: 12, color: "var(--ce-text-3)", marginBottom: 20 }}>
            Generate ideas in Ideas, then move content through the pipeline.
          </div>
          <button onClick={() => onNavigate?.("research")} style={{
            padding: "7px 16px", borderRadius: "var(--ce-r-sm)",
            background: "var(--ce-text)", color: "var(--ce-bg)",
            border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600
          }}>Open Ideas</button>
        </div>
      )}

      {/* Workspace signals footer */}
      {(memoryCount != null || r.activeProgrammes.length > 0) && (
        <div style={{ marginTop: 40, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {memoryCount != null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-5)" }}>
              {memoryCount} workspace {memoryCount === 1 ? "memory" : "memories"} active
            </span>
          )}
          {r.activeProgrammes.length > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ce-text-5)" }}>
              {r.activeProgrammes.length} active programme{r.activeProgrammes.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
