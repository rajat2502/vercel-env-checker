interface EnvVar {
  id?: string;
  key: string;
  value?: string;
  type?: string;
  target: string[];
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  framework?: string;
  updatedAt: string;
}

interface MatchResult {
  project: string;
  matches: EnvVar[];
}

export { EnvVar, Project, MatchResult };
