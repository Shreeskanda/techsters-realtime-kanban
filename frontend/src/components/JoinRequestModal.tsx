import React, { useState } from "react";
import { api } from "../lib/api";
import type { PublicWorkspace, JoinRequest } from "../lib/api";

interface Props {
  project: PublicWorkspace;
  onClose: () => void;
  onSubmitted: (req: JoinRequest) => void;
}

export default function JoinRequestModal({ project, onClose, onSubmitted }: Props) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const req = await api.joinRequests.submit(project.id, message.trim() || undefined);
      onSubmitted(req);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit join request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Invitation Required</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Project: <strong style={{ color: "var(--text-primary)" }}>{project.name}</strong>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="alert alert-warn">
              <span>🔒</span>
              <div>
                You haven&apos;t been invited to <strong>{project.name}</strong> yet. Submit a request to notify the project Admin for access approval.
              </div>
            </div>

            <div>
              <label className="field-label">Note for Admin (optional)</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Share your role or why you need access to this project..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? "Sending Request..." : "Send Join Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
