import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export const AgeGate = ({ onVerified }: { onVerified: () => void }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const verified = localStorage.getItem("age_verified");
    if (verified) {
      onVerified();
    } else {
      setVisible(true);
    }
  }, [onVerified]);

  const handleVerify = () => {
    localStorage.setItem("age_verified", Date.now().toString());
    setVisible(false);
    onVerified();
  };

  const handleUnder18 = () => {
    window.location.href = "https://www.google.com";
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="mx-4 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldAlert className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-3 font-display text-2xl font-bold text-foreground">
          Age Verification Required
        </h2>
        <p className="mb-8 text-muted-foreground">
          This website contains adult content. You must be 18 years or older to
          access this site.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={handleVerify} size="lg" className="w-full text-base font-semibold">
            I am 18 or older — Enter
          </Button>
          <Button
            onClick={handleUnder18}
            variant="outline"
            size="lg"
            className="w-full text-base text-muted-foreground"
          >
            I am under 18 — Leave
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          By entering, you confirm you are of legal age in your jurisdiction.
        </p>
      </div>
    </div>
  );
};
