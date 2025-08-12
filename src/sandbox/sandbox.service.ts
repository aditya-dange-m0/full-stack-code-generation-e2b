// src/sandbox/sandbox.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { FASTAPI_HELLO_WORLD, NEXTJS_HELLO_WORLD_PAGE } from './templates';
import { Sandbox } from 'e2b';
import { ConfigService } from '@nestjs/config';

// Define clear interfaces for our return types
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ServiceProcess {
  process: any;
  url: string;
}

@Injectable()
export class SandboxService implements OnModuleDestroy {
  private readonly logger = new Logger(SandboxService.name);
  private sandbox: Sandbox | null = null;
  private readonly templateId: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    const templateId = this.configService.get<string>('E2B_TEMPLATE_ID');
    if (!templateId) {
      throw new Error('E2B_TEMPLATE_ID is not set in the .env file');
    }
    this.templateId = templateId;

    const apiKey = this.configService.get<string>('E2B_API_KEY');
    if (!apiKey) {
      throw new Error('E2B_API_KEY is not set in the .env file');
    }
    this.apiKey = apiKey;
  }

  // This is a robust pattern to ensure a sandbox is ready on-demand.
  private async ensureSandbox(): Promise<Sandbox> {
    if (!this.sandbox) {
      this.logger.log(`Creating new sandbox with template '${this.templateId}'...`);
      this.sandbox = await Sandbox.create(this.templateId, {
        apiKey: this.apiKey,
      });
    }
    return this.sandbox;
  }

  async onModuleDestroy() {
    if (this.sandbox) {
      this.logger.log('Closing sandbox...');
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }

  // --- Original Simple Test Method ---
  async runSimpleTest(): Promise<CommandResult> {
    this.logger.log(`Creating sandbox with custom template: ${this.templateId}`);

    // Use the template ID and API key from the environment variables
    this.sandbox = await Sandbox.create(this.templateId, {
      apiKey: this.apiKey,
    });

    // Test a tool we pre-installed in our Dockerfile
    const result = await this.sandbox.commands.run('pm2 --version');

    await this.sandbox.kill();
    this.sandbox = null;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  // --- Enhanced Core SDK Methods ---

  async runCommand(command: string, workDir = '/home', timeoutMs = 60000): Promise<CommandResult> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Running command: '${command}' in '${workDir}' with timeout: ${timeoutMs}ms`);

    const result = await sandbox.commands.run(command, {
      cwd: workDir,
      timeoutMs: timeoutMs,
    });

    if (result.exitCode !== 0) {
      this.logger.warn(`Command failed with exit code ${result.exitCode}. Stderr: ${result.stderr}`);
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  // Enhanced command runner with background execution for long-running tasks
  async runLongCommand(command: string, workDir = '/home', timeoutMs = 600000): Promise<CommandResult> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Running long command: '${command}' in '${workDir}' with timeout: ${timeoutMs}ms`);

    try {
      const result = await sandbox.commands.run(command, {
        cwd: workDir,
        timeoutMs: timeoutMs,
      });

      this.logger.log(`Long command completed with exit code: ${result.exitCode}`);
      
      if (result.exitCode !== 0) {
        this.logger.warn(`Long command failed. Stderr: ${result.stderr}`);
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (error) {
      this.logger.error(`Long command failed with error: ${error.message}`);
      throw error;
    }
  }

  async startService(command: string, port: number, workDir = '/home'): Promise<ServiceProcess> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Starting service: '${command}' on port ${port} in '${workDir}'`);

    const process = await sandbox.commands.run(command, {
      cwd: workDir,
      background: true,
    });

    // Get the sandbox URL for the port
    const url = `https://${sandbox.getHost(port)}`;

    this.logger.log(`Service started with URL: ${url}`);
    return {
      process,
      url,
    };
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Writing file to '${filePath}'`);
    await sandbox.files.write(filePath, content);
  }

  async readFile(filePath: string): Promise<string> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Reading file from '${filePath}'`);
    return await sandbox.files.read(filePath);
  }

  async createDirectory(dirPath: string): Promise<void> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Creating directory '${dirPath}'`);
    await sandbox.files.makeDir(dirPath);
  }

  async listFiles(dirPath: string = '/home'): Promise<any[]> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Listing files in '${dirPath}'`);
    return await sandbox.files.list(dirPath);
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Getting upload URL for '${remotePath}'`);
    const uploadUrl = await sandbox.uploadUrl(remotePath);
    this.logger.log(`Upload URL obtained: ${uploadUrl}`);
    // Note: You'll need to implement the actual file upload using the URL
    // This would require reading the local file and sending it to the upload URL
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Getting download URL for '${remotePath}'`);
    const downloadUrl = await sandbox.downloadUrl(remotePath);
    this.logger.log(`Download URL obtained: ${downloadUrl}`);
    // Note: You'll need to implement the actual file download using the URL
    // This would require fetching from the download URL and saving to local path
  }

  async close(): Promise<void> {
    return this.onModuleDestroy();
  }

  // --- Utility Methods ---

  async getSandboxInfo(): Promise<any> {
    const sandbox = await this.ensureSandbox();
    return await sandbox.getInfo();
  }

  async getSandboxUrl(port?: number): Promise<string> {
    const sandbox = await this.ensureSandbox();
    if (port) {
      return `https://${sandbox.getHost(port)}`;
    }
    return `https://${sandbox.getHost(80)}`; // Default to port 80
  }

  // Faster alternative using pre-built template approach
  async createNextAppFast(projectName: string = 'frontend', workDir = '/home'): Promise<CommandResult> {
    this.logger.log(`Creating Next.js app quickly using template approach...`);
    
    try {
      // Create project directory
      await this.createDirectory(`${workDir}/${projectName}`);
      
      // Create package.json manually
      const packageJson = {
        "name": projectName,
        "version": "0.1.0",
        "private": true,
        "scripts": {
          "dev": "next dev",
          "build": "next build",
          "start": "next start",
          "lint": "next lint"
        },
        "dependencies": {
          "next": "14.0.4",
          "react": "^18",
          "react-dom": "^18",
          "@types/node": "^20",
          "@types/react": "^18",
          "@types/react-dom": "^18",
          "typescript": "^5"
        }
      };

      await this.writeFile(`${workDir}/${projectName}/package.json`, JSON.stringify(packageJson, null, 2));

      // Create tsconfig.json
      const tsConfig = {
        "compilerOptions": {
          "target": "es5",
          "lib": ["dom", "dom.iterable", "es6"],
          "allowJs": true,
          "skipLibCheck": true,
          "strict": true,
          "noEmit": true,
          "esModuleInterop": true,
          "module": "esnext",
          "moduleResolution": "bundler",
          "resolveJsonModule": true,
          "isolatedModules": true,
          "jsx": "preserve",
          "incremental": true,
          "plugins": [{ "name": "next" }],
          "baseUrl": ".",
          "paths": { "@/*": ["./*"] }
        },
        "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        "exclude": ["node_modules"]
      };

      await this.writeFile(`${workDir}/${projectName}/tsconfig.json`, JSON.stringify(tsConfig, null, 2));

      // Create next.config.js
      const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {}
module.exports = nextConfig`;

      await this.writeFile(`${workDir}/${projectName}/next.config.js`, nextConfig);

      // Create app directory structure
      await this.createDirectory(`${workDir}/${projectName}/app`);
      
      // Create basic layout
      const layout = `export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`;

      await this.writeFile(`${workDir}/${projectName}/app/layout.tsx`, layout);

      // Create basic page
      const page = `export default function Home() {
  return (
    <main>
      <h1>Welcome to Next.js!</h1>
      <p>This app was created using the fast setup method.</p>
    </main>
  )
}`;

      await this.writeFile(`${workDir}/${projectName}/app/page.tsx`, page);

      // Now install dependencies (this is the time-consuming part)
      this.logger.log('Installing dependencies... This may take a few minutes.');
      const installResult = await this.runLongCommand('npm install', `${workDir}/${projectName}`, 300000); // 5 minutes

      return installResult;

    } catch (error) {
      this.logger.error(`Fast Next.js creation failed: ${error.message}`);
      throw error;
    }
  }

  // Original create-next-app method (fixed command) - kept as fallback
  async createNextAppOriginal(projectName: string = 'frontend', workDir = '/home'): Promise<CommandResult> {
    this.logger.log(`Creating Next.js app using original create-next-app command...`);
    
    // Fixed command - run from workDir and specify project name correctly
    const createNextApp = await this.runLongCommand(
      `npx --yes create-next-app@latest ${projectName} --typescript --use-npm --eslint=false --tailwind=false --src-dir=false --app --import-alias="@/*" --verbose`,
      workDir
    );
    
    return createNextApp;
  }

  // Optimized full stack test with faster setup and fallback option
  public async runFullStackTestOptimized(): Promise<{ backendUrl: string; frontendUrl: string }> {
    this.logger.log('--- Starting Optimized Full-Stack Test ---');

    try {
      // 1. Setup Backend (FastAPI) - this is usually fast
      this.logger.log('Step 1: Setting up FastAPI backend...');
      await this.createDirectory('/home/backend');
      await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
      await this.writeFile('/home/backend/requirements.txt', 'fastapi\nuvicorn\npython-multipart');

      // Verify Python and install dependencies
      this.logger.log('Installing Python dependencies...');
      const pipInstall = await this.runCommand('python3 -m pip install -r requirements.txt --verbose', '/home/backend', 180000);
      if (pipInstall.exitCode !== 0) {
        this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
        throw new Error(`Failed to install Python dependencies: ${pipInstall.stderr}`);
      }

      // Start backend service
      const backendService = await this.startService('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000', 8000, '/home/backend');
      this.logger.log(`Backend service started at: ${backendService.url}`);
      
      // Wait for backend to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 2. Setup Frontend (Next.js) - use fast approach first, fallback to original
      this.logger.log('Step 2: Setting up Next.js frontend (optimized approach)...');
      
      let frontendResult: CommandResult;
      try {
        frontendResult = await this.createNextAppFast('frontend', '/home');
      } catch (error) {
        this.logger.warn(`Fast approach failed, falling back to original method: ${error.message}`);
        frontendResult = await this.createNextAppOriginal('frontend', '/home');
      }

      if (frontendResult.exitCode !== 0) {
        throw new Error(`Failed to create Next.js app: ${frontendResult.stderr}`);
      }

      // Configure frontend
      this.logger.log('Configuring frontend environment...');
      await this.writeFile('/home/frontend/.env.local', `NEXT_PUBLIC_API_URL=${backendService.url}`);
      await this.writeFile('/home/frontend/app/page.tsx', NEXTJS_HELLO_WORLD_PAGE);

      // Start frontend service
      const frontendService = await this.startService('npm run dev -- -p 3000', 3000, '/home/frontend');

      this.logger.log('--- Optimized Full-Stack Test Complete ---');
      return {
        backendUrl: backendService.url,
        frontendUrl: frontendService.url,
      };

    } catch (error) {
      this.logger.error(`Full stack test failed: ${error.message}`);
      throw error;
    }
  }
  // Test backend setup only (for debugging)
  public async testBackendOnly(): Promise<{ backendUrl: string; testResult: string }> {
    this.logger.log('--- Testing Backend Only ---');

    try {
      // Setup Backend
      await this.createDirectory('/home/backend');
      await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
      await this.writeFile('/home/backend/requirements.txt', 'fastapi\nuvicorn\npython-multipart');

      // Check Python
      const pythonCheck = await this.runCommand('python3 --version', '/home/backend', 30000);
      this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

      // Install dependencies
      const pipInstall = await this.runCommand('python3 -m pip install -r requirements.txt', '/home/backend', 180000);
      if (pipInstall.exitCode !== 0) {
        throw new Error(`Failed to install dependencies: ${pipInstall.stderr}`);
      }

      // Start backend
      const backendService = await this.startService('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000', 8000, '/home/backend');
      
      // Wait for startup
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Test the backend endpoint
      const testResult = await this.runCommand('curl -f http://localhost:8000/api/hello', '/home', 30000);
      
      return {
        backendUrl: backendService.url,
        testResult: testResult.stdout || testResult.stderr
      };

    } catch (error) {
      this.logger.error(`Backend test failed: ${error.message}`);
      throw error;
    }
  }
  public async runFullStackTest(): Promise<{ backendUrl: string; frontendUrl: string }> {
    this.logger.log('--- Starting Full-Stack Test ---');

    // 1. Setup Backend (FastAPI)
    this.logger.log('Step 1: Setting up FastAPI backend...');
    
    // Ensure backend directory exists
    await this.createDirectory('/home/backend');
    
    // Create backend files
    await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
    await this.writeFile('/home/backend/requirements.txt', 'fastapi\nuvicorn\npython-multipart');

    // Verify Python is available and install dependencies
    this.logger.log('Checking Python installation...');
    const pythonCheck = await this.runCommand('python3 --version', '/home/backend', 30000);
    if (pythonCheck.exitCode !== 0) {
      throw new Error(`Python3 not available: ${pythonCheck.stderr}`);
    }
    this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

    // Install Python dependencies with verbose output
    this.logger.log('Installing Python dependencies...');
    const pipInstall = await this.runCommand('python3 -m pip install -r requirements.txt --verbose', '/home/backend', 180000);
    if (pipInstall.exitCode !== 0) {
      this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
      throw new Error(`Failed to install Python dependencies: ${pipInstall.stderr}`);
    }
    this.logger.log('Python dependencies installed successfully');

    // Start backend service with proper error handling
    this.logger.log('Starting FastAPI backend service...');
    let backendService: ServiceProcess;
    try {
      backendService = await this.startService('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000', 8000, '/home/backend');
      this.logger.log(`Backend service started at: ${backendService.url}`);
      
      // Wait a moment for the service to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Test backend connectivity
      const backendTest = await this.runCommand('curl -f http://localhost:8000/api/hello || echo "Backend not ready"', '/home', 30000);
      this.logger.log(`Backend test result: ${backendTest.stdout}`);
    } catch (error) {
      this.logger.error(`Failed to start backend service: ${error.message}`);
      throw new Error(`Backend service startup failed: ${error.message}`);
    }

    // 2. Setup Frontend (Next.js) - FIXED COMMAND
    this.logger.log('Step 2: Setting up Next.js frontend...');
    
    // Fixed command - removed '/home' at the end, run from correct directory
    const createNextApp = await this.runLongCommand(
      'npx --yes create-next-app@latest frontend --typescript --use-npm --eslint=false --tailwind=false --src-dir=false --app --import-alias="@/*" --verbose',
      '/home'  // This is the working directory, not part of the command
    );
    if (createNextApp.exitCode !== 0) {
      this.logger.error(`Next.js creation failed. Stdout: ${createNextApp.stdout}`);
      throw new Error(`Failed to create Next.js app: ${createNextApp.stderr}`);
    }

    // Configure frontend environment
    this.logger.log('Configuring frontend environment...');
    await this.writeFile('/home/frontend/.env.local', `NEXT_PUBLIC_API_URL=${backendService.url}`);
    this.logger.log(`Frontend configured with backend URL: ${backendService.url}`);

    // Overwrite the default page with our test page
    await this.writeFile('/home/frontend/app/page.tsx', NEXTJS_HELLO_WORLD_PAGE);

    // Start frontend service
    this.logger.log('Starting Next.js frontend service...');
    const frontendService = await this.startService('npm run dev -- -p 3000', 3000, '/home/frontend');

    this.logger.log('--- Full-Stack Test Complete ---');
    this.logger.log(`Backend available at: ${backendService.url}`);
    this.logger.log(`Frontend available at: ${frontendService.url}`);
    return {
      backendUrl: backendService.url,
      frontendUrl: frontendService.url,
    };
  }
}