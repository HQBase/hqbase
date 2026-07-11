export type ProJob = {
  id: string;
  kind: "integrity-scan" | "maintenance";
  requestedAt: string;
};

export function isProJob(value: unknown): value is ProJob {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProJob>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.requestedAt === "string" &&
    (candidate.kind === "integrity-scan" || candidate.kind === "maintenance")
  );
}
