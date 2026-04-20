interface UrgencyBadgeProps {
  urgency: "low" | "medium" | "high";
}

const config = {
  high: {
    bg: "#FCEBEB",
    color: "#A32D2D",
    label: "HIGH URGENCY",
  },
  medium: {
    bg: "#FAEEDA",
    color: "#854F0B",
    label: "MEDIUM",
  },
  low: {
    bg: "#EAF3DE",
    color: "#3B6D11",
    label: "LOW",
  },
};

export default function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  const { bg, color, label } = config[urgency] || config.low;

  return (
    <span
      className="urgency-badge"
      style={{ backgroundColor: bg, color }}
      id={`urgency-badge-${urgency}`}
    >
      {label}
    </span>
  );
}
