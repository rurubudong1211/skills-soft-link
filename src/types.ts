export type SourceSummary = {
  id: string;
  name: string;
  path: string;
  available: boolean;
};

export type TargetSummary = {
  id: string;
  name: string;
  path: string;
  available: boolean;
};

export type Connection = {
  id: string;
  name: string;
  path: string;
  linkPath: string;
  available: boolean;
};

export type SourceEntry = {
  id: string;
  name: string;
  path: string;
  kind: "directory" | "file";
  connections: Connection[];
};

export type SourceScan = {
  source: SourceSummary;
  entries: SourceEntry[];
};

export type Filter = "all" | "unconnected" | "connected";
export type PreflightStatus = "create" | "connected" | "conflict";
export type LinkStatus = PreflightStatus | "success" | "failed";

export type PreflightItem = {
  sourcePath: string;
  name: string;
  targetPath: string;
  linkPath: string;
  status: PreflightStatus;
  reason?: string | null;
};

export type LinkResult = Omit<PreflightItem, "status"> & {
  status: LinkStatus;
};
