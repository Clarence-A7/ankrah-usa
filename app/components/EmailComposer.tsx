"use client";

import React, { useActionState, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  ImagePlus,
  Paperclip,
  X,
} from "lucide-react";
import type { EmailComposeState } from "@/app/lib/email-compose";

const initialState: EmailComposeState = { success: false };

type ServerAction = (
  prev: EmailComposeState,
  formData: FormData,
) => Promise<EmailComposeState>;

export interface GroupOption {
  value: string;
  label: string;
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.25rem",
  zIndex: 1000,
};
const modal: React.CSSProperties = {
  width: "100%",
  maxWidth: 620,
  background: "#fff",
  borderRadius: 16,
  padding: "1.75rem",
  boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
  maxHeight: "92dvh",
  overflowY: "auto",
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
  margin: "0 0 6px",
};
const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "0.95rem",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};
const toolBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
};

export function EmailComposer({
  action,
  title,
  mode,
  targetId,
  targetLabel,
  groups,
  defaultGroup,
  onClose,
  onSent,
}: {
  action: ServerAction;
  title: string;
  mode: "group" | "individual";
  targetId?: string | null;
  /** Recipient display for individual mode (e.g. name + email). */
  targetLabel?: string | null;
  /** Group options for broadcast mode; omit for a single-group broadcast. */
  groups?: GroupOption[];
  defaultGroup?: string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const editorRef = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState("");
  const [group, setGroup] = useState(defaultGroup || groups?.[0]?.value || "all");
  const [pdf, setPdf] = useState<{ name: string; base64: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (state.success && state.message) onSent(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.message]);

  const sync = () => setHtml(editorRef.current?.innerHTML || "");

  const cmd = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("That file isn't an image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFileError("Images must be under 2MB.");
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      editorRef.current?.focus();
      document.execCommand("insertImage", false, String(reader.result));
      editorRef.current?.querySelectorAll("img").forEach((im) => {
        im.style.maxWidth = "100%";
        im.style.height = "auto";
      });
      sync();
    };
    reader.readAsDataURL(file);
  };

  const onPickPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setFileError("Attachment must be a PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("PDF must be under 10MB.");
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      setPdf({ name: file.name, base64 });
    };
    reader.readAsDataURL(file);
  };

  const showGroupPicker = mode === "group" && groups && groups.length > 1;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: "1.2rem", color: "#0f172a" }}>{title}</h2>
        <p style={{ margin: "0 0 1.25rem", color: "#64748b", fontSize: "0.88rem" }}>
          {mode === "individual"
            ? targetLabel
            : "Recipients are BCC'd — they won't see each other's addresses."}
        </p>

        <form action={formAction}>
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="targetId" value={targetId ?? ""} />
          <input type="hidden" name="group" value={group} />
          <input type="hidden" name="html" value={html} />
          <input type="hidden" name="pdfBase64" value={pdf?.base64 ?? ""} />
          <input type="hidden" name="pdfName" value={pdf?.name ?? ""} />

          {showGroupPicker && (
            <div style={{ marginBottom: "1rem" }}>
              <label style={label}>Send to</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                disabled={pending}
                style={field}
              >
                {groups!.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label style={label}>Subject</label>
          <input
            name="subject"
            type="text"
            required
            maxLength={200}
            placeholder="Subject line"
            disabled={pending}
            style={field}
          />

          <label style={{ ...label, marginTop: "1rem" }}>Message</label>
          <div
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: 8,
                borderBottom: "1px solid #eef2f7",
                background: "#f8fafc",
                flexWrap: "wrap",
              }}
            >
              <button type="button" style={toolBtn} title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("bold")}>
                <Bold size={16} />
              </button>
              <button type="button" style={toolBtn} title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("italic")}>
                <Italic size={16} />
              </button>
              <button type="button" style={toolBtn} title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("underline")}>
                <UnderlineIcon size={16} />
              </button>
              <button type="button" style={toolBtn} title="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertUnorderedList")}>
                <List size={16} />
              </button>
              <button type="button" style={toolBtn} title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertOrderedList")}>
                <ListOrdered size={16} />
              </button>
              <button type="button" style={toolBtn} title="Insert image" onMouseDown={(e) => e.preventDefault()} onClick={() => imgInputRef.current?.click()}>
                <ImagePlus size={16} />
              </button>
            </div>
            <div
              ref={editorRef}
              contentEditable={!pending}
              suppressContentEditableWarning
              onInput={sync}
              role="textbox"
              aria-multiline="true"
              style={{
                minHeight: 180,
                maxHeight: 320,
                overflowY: "auto",
                padding: "12px 14px",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "#1e293b",
                outline: "none",
              }}
            />
          </div>

          <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          <input ref={pdfInputRef} type="file" accept="application/pdf" hidden onChange={onPickPdf} />

          <div style={{ marginTop: "0.9rem" }}>
            {pdf ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  color: "#1d4ed8",
                }}
              >
                <Paperclip size={14} />
                {pdf.name}
                <button
                  type="button"
                  onClick={() => setPdf(null)}
                  aria-label="Remove attachment"
                  style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", display: "inline-flex" }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={pending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  color: "#475569",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Paperclip size={15} />
                Attach PDF
              </button>
            )}
          </div>

          {(fileError || state.error) && (
            <p style={{ color: "#dc2626", fontSize: "0.85rem", margin: "0.7rem 0 0" }}>
              {fileError || state.error}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.4rem" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#475569",
                fontWeight: 600,
                cursor: pending ? "default" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              style={{
                padding: "10px 22px",
                borderRadius: 10,
                border: "none",
                background: pending ? "#7f9fd0" : "#2e63af",
                color: "#fff",
                fontWeight: 700,
                cursor: pending ? "default" : "pointer",
              }}
            >
              {pending ? "Sending…" : "Send email"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
