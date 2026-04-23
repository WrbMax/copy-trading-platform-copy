/**
 * AgreementModal — Full-text agreement reader dialog
 * Used on the registration page to display the complete Terms of Service & Risk Disclosure.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { USER_AGREEMENT } from "@/lib/agreements";
import { FileText } from "lucide-react";

interface AgreementModalProps {
  open: boolean;
  onClose: () => void;
  lang: "zh" | "en";
}

export function AgreementModal({ open, onClose, lang }: AgreementModalProps) {
  const t = USER_AGREEMENT[lang];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-2xl w-[95vw] p-0 gap-0" style={{maxHeight: 'min(90vh, 700px)', display: 'flex', flexDirection: 'column'}}>
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            {t.title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">{t.effectiveDate}</p>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{WebkitOverflowScrolling: 'touch'}}>
          <div className="px-6 py-5 space-y-6">
            {t.sections.map((section) => (
              <div key={section.heading} className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">{section.heading}</h3>
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {/* Render bold markdown **text** */}
                  {renderBold(section.body)}
                </div>
              </div>
            ))}

            {/* Bottom notice */}
            <div className="p-4 rounded-xl bg-primary/8 border border-primary/20 text-xs text-primary leading-relaxed">
              {lang === "zh"
                ? "请您在注册前仔细阅读以上全部条款。点击【我已阅读并同意】即表示您已充分理解并自愿接受本协议的全部内容。"
                : "Please read all of the above terms carefully before registering. Clicking \"I Have Read and Agree\" indicates that you have fully understood and voluntarily accepted all contents of this Agreement."}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0 flex justify-end">
          <Button onClick={onClose} className="min-w-[120px]">
            {t.agree}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Render **bold** markdown syntax as <strong> elements.
 */
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
