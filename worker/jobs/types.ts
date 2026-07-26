export type Job = {
  id: string;
  kind: "integrity-scan" | "maintenance";
  requestedAt: string;
};

export function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Job>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.requestedAt === "string" &&
    (candidate.kind === "integrity-scan" || candidate.kind === "maintenance")
  );
}
