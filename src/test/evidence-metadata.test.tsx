import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceMetadataDisplay } from "@/components/EvidenceMetadataDisplay";
import type { EvidenceMetadata, Chatbot } from "@/data/chatbots";

describe("EvidenceMetadata type compatibility", () => {
  it("existing records without evidenceMetadata still have valid shape", () => {
    const bot: Chatbot = {
      name: "Test",
      slug: "test",
      type: "Local",
      nsfwPolicy: "Full uncensored",
      contentLevel: 5,
      description: "Test",
      category: "local",
      url: "https://example.com",
      docsAvailable: false,
      lastVerified: "2026-08",
    };
    expect(bot.evidenceMetadata).toBeUndefined();
  });

  it("records with all optional metadata fields render safely", () => {
    const metadata: EvidenceMetadata = {
      lastVerified: "2026-08",
      sourceUrl: "https://example.com",
      reviewStatus: "documented",
    };
    expect(metadata.lastVerified).toBe("2026-08");
    expect(metadata.sourceUrl).toBe("https://example.com");
    expect(metadata.reviewStatus).toBe("documented");
  });

  it("records with partial metadata render safely", () => {
    const m1: EvidenceMetadata = { lastVerified: "2026-01" };
    const m2: EvidenceMetadata = { sourceUrl: "https://example.com" };
    const m3: EvidenceMetadata = { reviewStatus: "needs-review" };
    expect(m1.lastVerified).toBeDefined();
    expect(m1.sourceUrl).toBeUndefined();
    expect(m2.sourceUrl).toBeDefined();
    expect(m2.lastVerified).toBeUndefined();
    expect(m3.reviewStatus).toBeDefined();
    expect(m3.lastVerified).toBeUndefined();
  });

  it("empty metadata object renders nothing", () => {
    const metadata: EvidenceMetadata = {};
    expect(metadata.lastVerified).toBeUndefined();
    expect(metadata.sourceUrl).toBeUndefined();
    expect(metadata.reviewStatus).toBeUndefined();
  });
});

describe("EvidenceMetadataDisplay", () => {
  it("renders null for empty metadata", () => {
    const empty: EvidenceMetadata = {};
    const { container } = render(<EvidenceMetadataDisplay metadata={empty} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows lastVerified only when present", () => {
    render(<EvidenceMetadataDisplay metadata={{ lastVerified: "2026-08" }} />);
    expect(screen.getByText("2026-08")).toBeInTheDocument();
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
  });

  it("shows source link only when sourceUrl is present", () => {
    render(<EvidenceMetadataDisplay metadata={{ sourceUrl: "https://example.com" }} />);
    const link = screen.getByRole("link", { name: /example\.com/ });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/Last verified/)).not.toBeInTheDocument();
  });

  it("maps reviewStatus to neutral visible wording", () => {
    const { rerender } = render(<EvidenceMetadataDisplay metadata={{ reviewStatus: "documented" }} />);
    expect(screen.getByText("Documentation recorded")).toBeInTheDocument();

    rerender(<EvidenceMetadataDisplay metadata={{ reviewStatus: "needs-review" }} />);
    expect(screen.getByText("Review needed")).toBeInTheDocument();

    rerender(<EvidenceMetadataDisplay metadata={{ reviewStatus: "unverified" }} />);
    expect(screen.getByText("Not yet reviewed")).toBeInTheDocument();
  });

  it("does not render metadata block when all fields are absent", () => {
    const empty: EvidenceMetadata = {};
    const { container } = render(<EvidenceMetadataDisplay metadata={empty} />);
    expect(container.querySelector("[class*='rounded-lg']")).toBeNull();
  });

  it("shows transparency copy when metadata is present", () => {
    render(<EvidenceMetadataDisplay metadata={{ lastVerified: "2026-08" }} />);
    expect(screen.getByText(/verify important requirements with the platform directly/)).toBeInTheDocument();
  });

  it("compact mode renders inline without card", () => {
    const { container } = render(
      <EvidenceMetadataDisplay metadata={{ lastVerified: "2026-08", reviewStatus: "documented" }} compact />
    );
    expect(screen.getByText("2026-08")).toBeInTheDocument();
    expect(screen.getByText("Documentation recorded")).toBeInTheDocument();
    expect(container.querySelector("[class*='rounded-lg'][class*='border']")).toBeNull();
  });

  it("does not display fake placeholders", () => {
    render(<EvidenceMetadataDisplay metadata={{ lastVerified: "2026-08" }} />);
    expect(screen.queryByText("N/A")).not.toBeInTheDocument();
    expect(screen.queryByText("TBD")).not.toBeInTheDocument();
    expect(screen.queryByText("None")).not.toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });
});
