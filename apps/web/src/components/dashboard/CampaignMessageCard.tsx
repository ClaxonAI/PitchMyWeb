"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { ApiError, campaignsApi } from "@/lib/api-client";
import { DEFAULT_MESSAGE_TEMPLATE, messageTemplateProblem } from "@/lib/message-template";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { MessageTemplateEditor } from "./MessageTemplateEditor";

/**
 * The campaign's WhatsApp message, editable after launch: the text is read at
 * send time, so a change reaches every pitch not yet handed to WhatsApp.
 */
export function CampaignMessageCard({ campaignId, messageTemplate }: { campaignId: string; messageTemplate: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(messageTemplate ?? DEFAULT_MESSAGE_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const problem = messageTemplateProblem(value);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await campaignsApi.updateMessage(campaignId, value.trim());
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-dash-muted-foreground" /> WhatsApp message
        </CardTitle>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => { setEditing(true); setSaved(false); }}>
            Edit message
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editing ? (
          <>
            <MessageTemplateEditor value={value} onChange={setValue} label="Message sent with both videos" />
            {error && <p className="text-sm text-dash-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save message"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditing(false); setValue(messageTemplate ?? DEFAULT_MESSAGE_TEMPLATE); setError(null); }}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-dash-muted-foreground">Pitches not yet sent use the new text. Ones already sent keep what they sent.</p>
          </>
        ) : (
          <>
            <p className="rounded-dash-md bg-dash-muted p-3 text-sm whitespace-pre-wrap text-dash-foreground">
              {messageTemplate ?? "Each lead's own generated pitch."}
            </p>
            {saved && <p className="text-xs text-dash-success">Saved. Pitches not yet sent will use it.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
