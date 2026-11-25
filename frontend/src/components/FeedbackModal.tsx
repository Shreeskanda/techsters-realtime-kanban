import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { PublicWorkspace } from "../lib/api";

interface Props {
  projects: { id: string; name: string }[];
  defaultWorkspaceId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "UX_DESIGN", label: "UX & Design" },
  { value: "COLLABORATION", label: "Collaboration" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "FEATURE_REQUEST", label: "Feature Request" },
];

export default function FeedbackModal({ projects, defaultWorkspaceId, onClose, onSuccess }: Props) {
  const [availableProjects, setAvailableProjects] = useState<{ id: string; name: string }[]>(projects);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId || projects[0]?.id || "");
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState("GENERAL");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (projects.length === 0) {
      api.workspaces
        .listPublic()
        .then((list: PublicWorkspace[]) => {
          setAvailableProjects(list);
          if (list[0]) setWorkspaceId(list[0].id);
        })
        .catch(() => {});
    } else {
      setAvailableProjects(projects);
      if (!workspaceId && projects[0]) setWorkspaceId(projects[0].id);
    }
  }, [projects, workspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) {
      setError("Please select a project.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api.feedback.submit({
        workspaceId,
        rating,
        category,
        message: message.trim(),
      });
      setSubmitted(true);
      onSuccess?.();
      setTimeout(() => onClose(), 1100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Share Project Feedback</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Your feedback is delivered directly to the Admin dashboard.
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close feedback modal">
            ×
          </button>
        </div>

        {submitted ? (
          <div className="modal-body">
            <div className="alert alert-success" style={{ justifyContent: "center", padding: "24px 16px", textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
                <div style={{ fontWeight: 600 }}>Thank you! Feedback submitted to Admin panel.</div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="field-label">Project</label>
                <select
                  className="input"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  required
                >
                  {availableProjects.length === 0 ? (
                    <option value="">No projects available</option>
                  ) : (
                    availableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="field-label">Experience Rating ({rating}/5)</label>
                <div className="stars-row">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`star-btn ${star <= rating ? "lit" : ""}`}
                      aria-label={`Rate ${star} stars`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label">Category</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`btn btn-sm ${category === c.value ? "btn-primary" : "btn-secondary"}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field-label">Feedback Message</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Share thoughts on sprint workflow, blockers, UI, or collaboration..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={3}
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Skip for now
              </button>
              <button type="submit" disabled={submitting || !workspaceId} className="btn btn-primary">
                {submitting ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
