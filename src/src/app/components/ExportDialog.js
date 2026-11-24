"use client";

import { useEffect, useRef, useState } from "react";
import { accountsText, accountsHtml } from "../../lib/export";

// Fenêtre d'export du tableau des comptes : aperçu, copie et envoi par mail.
export default function ExportDialog({ data, open, onClose }) {
  const dialog = useRef(null);
  const [copied, setCopied] = useState(false);
  const text = accountsText(data);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { setCopied(false); element.showModal(); }
    if (!open && element.open) element.close();
  }, [open]);

  const copy = async () => {
    try {
      // HTML pour un vrai tableau dans Gmail / Outlook, texte brut pour le reste.
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([accountsHtml(data)], { type: "text/html" })
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
    } catch {
      alert("Copie impossible : sélectionne le tableau et copie-le à la main.");
    }
  };

  const mailto = "mailto:?subject=" + encodeURIComponent("Café des sports — les comptes") + "&body=" + encodeURIComponent(text);

  return (
    <dialog ref={dialog} className="export-dialog" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <div className="export-body">
        <p className="eyebrow">EXPORT</p>
        <h2>Tableau des comptes</h2>
        <pre className="export-preview">{text}</pre>
        <div className="export-actions">
          <button type="button" className="primary" onClick={copy}>{copied ? "✓ Copié" : "📋 Copier le tableau"}</button>
          <a className="share-button" href={mailto}>✉️ Envoyer par mail</a>
          <button type="button" className="text-button" onClick={onClose}>Fermer</button>
        </div>
        <p className="tiny">« Copier » colle un vrai tableau dans Gmail ou Outlook. « Envoyer par mail » ouvre ta messagerie avec le tableau en texte.</p>
      </div>
    </dialog>
  );
}
