import { DialogProvider } from "@/components/Dialogs";
import Editor from "@/components/Editor";
import { TooltipProvider } from "@/components/Tooltip";

export default function Page() {
  return (
    <TooltipProvider>
      <DialogProvider>
        <Editor />
      </DialogProvider>
    </TooltipProvider>
  );
}
