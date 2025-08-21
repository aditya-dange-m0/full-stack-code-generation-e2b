export interface ProjectFile {
  purpose: string;
  code: string;
}

export interface ProjectFiles {
  [filePath: string]: ProjectFile;
}

export interface FrontendStructure {
  framework: 'react' | 'next';
  files: ProjectFiles;
  dependencies: ProjectFiles;
}

export interface BackendStructure {
  framework: 'fastapi';
  files: ProjectFiles;
  dependencies: ProjectFiles;
}

export interface DatabaseCollection {
  name: string;
  purpose: string;
  schema: Record<string, any>;
}

export interface DatabaseSchema {
  collections: DatabaseCollection[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  purpose: string;
}

export interface ProjectStructure {
  frontend: string;
  backend: string;
}

export interface FullStackProject {
  projectName: string;
  projectDescription: string;
  template: 'next+fastapi+mongodb' | 'react+fastapi+mongodb';
  code: {
    frontend: FrontendStructure;
    backend: BackendStructure;
  };
  projectStructure: ProjectStructure;
  databaseSchema: DatabaseSchema;
  apiEndpoints: ApiEndpoint[];
}

export interface CodeGenerationRequest {
  prompt: string;
  modelIdentifier: string;
  template?: 'next+fastapi+mongodb' | 'react+fastapi+mongodb';
}

export interface CodeGenerationResponse {
  success: boolean;
  data?: FullStackProject;
  error?: string;
  rawResponse?: string;
}
