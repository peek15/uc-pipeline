"use client";

import { Component } from "react";

/**
 * Real ErrorBoundary — prints the full readable error, component stack,
 * and props to the console + UI. v3.11.1 DEBUG.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("════════════════════════════════════════════════════");
    console.error("ErrorBoundary caught:");
    console.error("Message:",   error?.message);
    console.error("Name:",      error?.name);
    console.error("Full error:", error);
    console.error("Stack:",     error?.stack);
    console.error("Component stack:", info?.componentStack);
    console.error("════════════════════════════════════════════════════");
    this.setState({ info });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        padding: 24, margin: 16, borderRadius: 8,
        background: "rgba(192,102,106,0.1)",
        border: "1px solid rgba(192,102,106,0.5)",
        color: "var(--t1, #1a1917)",
        fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
        fontSize: 12, lineHeight: 1.5,
        whiteSpace: "pre-wrap", overflow: "auto",
        maxHeight: "70vh",
      }}>
        <div style={{ fontWeight: 700, color: "#C0666A", marginBottom: 8 }}>
          {this.state.error?.name || "Error"}: {this.state.error?.message || "Unknown error"}
        </div>
        <div style={{ marginBottom: 12, fontSize: 11, color: "var(--t3, #555)" }}>
          (open browser console for full stack)
        </div>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 6 }}>Stack trace</summary>
          <pre style={{ fontSize: 10, overflow: "auto" }}>{this.state.error?.stack}</pre>
        </details>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 6 }}>Component stack</summary>
          <pre style={{ fontSize: 10, overflow: "auto" }}>{this.state.info?.componentStack}</pre>
        </details>
      </div>
    );
  }
}
