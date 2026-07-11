"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** If set, the destructive button stays disabled until this exact string is
   * typed (case-sensitive, trimmed) — reserved for higher-blast-radius
   * deletes (a prod-named environment, or a project that contains one). */
  confirmationText?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmationText,
  confirmLabel = "Delete",
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);

  const locked = !!confirmationText && typed.trim() !== confirmationText;

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) setTyped("");
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm();
      handleOpenChange(false);
    } catch (err) {
      // Stays open on failure so the user isn't left wondering whether a
      // destructive action silently succeeded.
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {confirmationText ? (
          <div className="grid gap-2">
            <Label htmlFor="confirm-delete-input">
              Type <span className="font-medium text-foreground">{confirmationText}</span>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-delete-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={saving || locked}
            onClick={handleConfirm}
          >
            {saving ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
