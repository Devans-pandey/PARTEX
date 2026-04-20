interface UrgencyBadgeProps {
  urgency: "low" | "medium" | "high";
}

const config = {
  high: {
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#FCA5A5",
    border: "rgba(239, 68, 68, 0.3)",
    label: "⚡ HIGH URGENCY",
  },
  medium: {
    bg: "rgba(245, 158, 11, 0.12)",
    color: "#FCD34D",
    border: "rgba(245, 158, 11, 0.3)",
    label: "● MEDIUM",
  },
  low: {
    bg: "rgba(34, 197, 94, 0.12)",
    color: "#86EFAC",
    border: "rgba(34, 197, 94, 0.3)",
    label: "✓ LOW",
  },
};

export default function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  const { bg, color, border, label } = config[urgency] || config.low;

  return (
    <span
      className="urgency-badge"
      style={{ backgroundColor: bg, color, border: `1px solid ${border}` }}
      id={`urgency-badge-${urgency}`}
    >
      {label}
    </span>
  );
}
