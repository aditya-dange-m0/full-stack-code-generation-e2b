// src/sandbox/sandbox.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Sandbox } from 'e2b';
import { ConfigService } from '@nestjs/config';
import { FASTAPI_HELLO_WORLD, NEXTJS_HELLO_WORLD_PAGE, FASTAPI_WITH_MONGODB, NEXTJS_WITH_MONGODB_PAGE, MONGODB_REQUIREMENTS_TXT } from './templates';

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
  private sandboxCreationPromise: Promise<Sandbox> | null = null;

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

  // === CORE SANDBOX METHODS ===

  private async ensureSandbox(): Promise<Sandbox> {
    if (this.sandbox) {
      return this.sandbox;
    }

    // Prevent multiple sandbox creation by using a promise
    if (this.sandboxCreationPromise) {
      return this.sandboxCreationPromise;
    }

    this.sandboxCreationPromise = this.createSandbox();
    this.sandbox = await this.sandboxCreationPromise;
    this.sandboxCreationPromise = null;

    return this.sandbox;
  }

  private async createSandbox(): Promise<Sandbox> {
    this.logger.log(`Creating new sandbox with template '${this.templateId}'...`);
    const sandbox = await Sandbox.create(this.templateId, {
      apiKey: this.apiKey,
    });
    this.logger.log(`Sandbox created with ID: ${sandbox.sandboxId}`);
    return sandbox;
  }

  async onModuleDestroy() {
    if (this.sandbox) {
      this.logger.log('Closing sandbox...');
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }

  async close(): Promise<void> {
    return this.onModuleDestroy();
  }

  // === ESSENTIAL COMMAND & FILE OPERATIONS ===

  async runCommand(command: string, workDir = '/home', timeoutMs = 60000): Promise<CommandResult> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Running command: '${command}' in '${workDir}'`);

    const result = await sandbox.commands.run(command, {
      cwd: workDir,
      timeoutMs: timeoutMs,
    });

    if (result.exitCode !== 0) {
      this.logger.warn(`Command failed with exit code ${result.exitCode}`);
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
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

  async startService(command: string, port: number, workDir = '/home'): Promise<ServiceProcess> {
    const sandbox = await this.ensureSandbox();
    this.logger.log(`Starting service: '${command}' on port ${port} in '${workDir}'`);

    const process = await sandbox.commands.run(command, {
      cwd: workDir,
      background: true,
      timeoutMs: 0,
    });

    const url = `https://${sandbox.getHost(port)}`;
    this.logger.log(`Service started with URL: ${url}`);
    
    // Wait for service to be ready with improved health checking
    await this.waitForServiceReady(port, url, 60000); // 60 second timeout
    
    return {
      process,
      url,
    };
  }

  /**
   * Wait for service to be ready on specified port with comprehensive checking
   */
  private async waitForServiceReady(port: number, url: string, timeoutMs: number = 60000): Promise<void> {
    const startTime = Date.now();
    const maxAttempts = Math.ceil(timeoutMs / 2000); // Check every 2 seconds
    
    this.logger.log(`Waiting for service on port ${port} to be ready...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new Error(`Service on port ${port} failed to start within ${timeoutMs}ms`);
      }
      
      try {
        // Check 1: Port is listening
        const portCheck = await this.runCommand(
          `ss -tlnp | grep ":${port} " || netstat -tlnp | grep ":${port} "`,
          '/tmp',
          5000
        );
        
        const isListening = portCheck.stdout.includes(`:${port}`);
        
        if (isListening) {
          this.logger.log(`✅ Port ${port} is listening (attempt ${attempt}/${maxAttempts})`);
          
          // Check 2: Service responds to HTTP requests
          const httpCheck = await this.runCommand(
            `curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:${port}/ || echo "curl_failed"`,
            '/tmp',
            15000
          );
          
          const httpResponse = httpCheck.stdout.trim();
          if (httpResponse && httpResponse !== 'curl_failed' && httpResponse !== '000') {
            this.logger.log(`✅ Service on port ${port} is responding (HTTP ${httpResponse})`);
            this.logger.log(`🌐 Service URL: ${url}`);
            return; // Service is ready!
          } else {
            this.logger.log(`⏳ Port ${port} listening but service not responding yet (attempt ${attempt})`);
          }
        } else {
          this.logger.log(`⏳ Port ${port} not listening yet (attempt ${attempt}/${maxAttempts})`);
        }
        
      } catch (error) {
        this.logger.warn(`Health check attempt ${attempt} failed: ${error.message}`);
      }
      
      // Wait before next attempt
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // If we get here, service didn't become ready in time
    this.logger.error(`❌ Service on port ${port} failed to become ready after ${maxAttempts} attempts`);
    
    // Log diagnostic information
    await this.logServiceDiagnostics(port);
    
    throw new Error(`Service on port ${port} failed to start properly`);
  }

  /**
   * Log diagnostic information for troubleshooting service startup issues
   */
  private async logServiceDiagnostics(port: number): Promise<void> {
    try {
      this.logger.log(`🔍 Diagnostic information for port ${port}:`);
      
      // Check what's listening on all ports
      const allPorts = await this.runCommand('ss -tlnp || netstat -tlnp', '/tmp', 10000);
      this.logger.log(`Active ports:\n${allPorts.stdout}`);
      
      // Check running processes
      const processes = await this.runCommand('ps aux | head -20', '/tmp', 10000);
      this.logger.log(`Running processes:\n${processes.stdout}`);
      
      // Check for any error logs in common locations
      const errorLogs = await this.runCommand('find /tmp -name "*.log" -type f -exec tail -5 {} + 2>/dev/null || echo "No logs found"', '/tmp', 10000);
      if (errorLogs.stdout && !errorLogs.stdout.includes('No logs found')) {
        this.logger.log(`Recent logs:\n${errorLogs.stdout}`);
      }
      
    } catch (diagError) {
      this.logger.warn(`Failed to collect diagnostics: ${diagError.message}`);
    }
  }

  // === ESSENTIAL UTILITY METHODS ===

  async getSandboxInfo(): Promise<any> {
    const sandbox = await this.ensureSandbox();
    return await sandbox.getInfo();
  }

  async getSandboxUrl(port?: number): Promise<string> {
    const sandbox = await this.ensureSandbox();
    if (port) {
      return `https://${sandbox.getHost(port)}`;
    }
    return `https://${sandbox.getHost(80)}`;
  }

  async logSandboxMetrics(): Promise<void> {
    if (!this.sandbox) {
      this.logger.warn('No sandbox available for metrics collection');
      return;
    }

    try {
      const metrics = await this.sandbox.getMetrics();
      if (metrics && metrics.length > 0) {
        const latestMetric = metrics[metrics.length - 1];
        this.logger.log(`📈 Sandbox Metrics - CPU: ${latestMetric.cpuUsedPct.toFixed(2)}%, Memory: ${this.formatBytes(latestMetric.memUsed)}/${this.formatBytes(latestMetric.memTotal)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to collect sandbox metrics: ${error.message}`);
    }
  }

  async getSandboxMetrics(): Promise<any> {
    if (!this.sandbox) {
      throw new Error('No active sandbox to get metrics from');
    }

    try {
      const metrics = await this.sandbox.getMetrics();
      if (metrics && metrics.length > 0) {
        return {
          sandboxId: this.sandbox.sandboxId,
          metricsCount: metrics.length,
          latestMetric: metrics[metrics.length - 1],
        };
      }
      return {
        sandboxId: this.sandbox.sandboxId,
        metricsCount: 0,
        message: 'No metrics available'
      };
    } catch (error) {
      this.logger.error(`Failed to get sandbox metrics: ${error.message}`);
      throw error;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // === MONGODB METHODS (Essential for Full Stack) ===

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
        },
        "devDependencies": {
          "tailwindcss": "^3.3.0",
          "autoprefixer": "^10.4.16",
          "postcss": "^8.4.31"
        }
      };

      await this.writeFile(`${workDir}/${projectName}/package.json`, JSON.stringify(packageJson, null, 2));

      // Create Tailwind configuration
      const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

      await this.writeFile(`${workDir}/${projectName}/tailwind.config.js`, tailwindConfig);

      // Create PostCSS configuration
      const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}`;

      await this.writeFile(`${workDir}/${projectName}/postcss.config.js`, postcssConfig);

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
      
      // Create globals.css with Tailwind directives
      const globalsCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}`;

      await this.writeFile(`${workDir}/${projectName}/app/globals.css`, globalsCss);
      
      // Create basic layout that imports globals.css
      const layout = `import './globals.css'

export const metadata = {
  title: 'Next.js App',
  description: 'Generated with create-next-app',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}`;

      await this.writeFile(`${workDir}/${projectName}/app/layout.tsx`, layout);

      // Create basic page with Tailwind CSS classes
      const page = `export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Welcome to Next.js!</h1>
        <p className="text-gray-600 mb-6">This app was created with Tailwind CSS configured.</p>
        <div className="flex flex-col gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg">
            Get Started
          </button>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-green-100 text-green-800 p-3 rounded-lg text-sm font-medium">
              ✅ Next.js 14
            </div>
            <div className="bg-blue-100 text-blue-800 p-3 rounded-lg text-sm font-medium">
              ✅ TypeScript
            </div>
            <div className="bg-purple-100 text-purple-800 p-3 rounded-lg text-sm font-medium">
              ✅ Tailwind CSS
            </div>
            <div className="bg-orange-100 text-orange-800 p-3 rounded-lg text-sm font-medium">
              ✅ App Router
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}`;

      await this.writeFile(`${workDir}/${projectName}/app/page.tsx`, page);

      // Now install dependencies (this is the time-consuming part)
      this.logger.log('Installing dependencies... This may take a few minutes.');
      const installResult = await this.runCommand('npm install', `${workDir}/${projectName}`, 300000); // 5 minutes

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
    const createNextApp = await this.runCommand(
      `npx --yes create-next-app@latest ${projectName} --typescript --use-npm --eslint=false --tailwind=true --src-dir=false --app --import-alias="@/*" --verbose`,
      workDir
    );
    
    return createNextApp;
  }

  async startMongoDB(): Promise<CommandResult> {
    this.logger.log('Starting MongoDB service...');
    
    try {
      // Check if MongoDB is already running
      const checkResult = await this.runCommand('pgrep mongod', '/tmp', 5000);
      if (checkResult.exitCode === 0) {
        this.logger.log('MongoDB is already running');
        return {
          stdout: 'MongoDB already running',
          stderr: '',
          exitCode: 0
        };
      }

      // Create MongoDB data directory
      await this.runCommand('mkdir -p /tmp/mongodb-data', '/tmp', 10000);
      await this.runCommand('chmod 755 /tmp/mongodb-data', '/tmp', 5000);

      // Install MongoDB if not available
      const mongoCheck = await this.runCommand('which mongod', '/tmp', 5000);
      if (mongoCheck.exitCode !== 0) {
        this.logger.log('Installing MongoDB server...');
        await this.runCommand('apt-get update', '/tmp', 60000);
        await this.runCommand('apt-get install -y curl gnupg lsb-release', '/tmp', 60000);
        await this.runCommand('curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add -', '/tmp', 30000);
        await this.runCommand('echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list', '/tmp', 10000);
        await this.runCommand('apt-get update', '/tmp', 60000);
        await this.runCommand('apt-get install -y mongodb-org-server mongodb-org-tools', '/tmp', 180000);
      }

      // Start MongoDB with E2B background execution
      const sandbox = await this.ensureSandbox();
      const startCommand = 'mongod --dbpath /tmp/mongodb-data --logpath /tmp/mongodb.log --bind_ip 0.0.0.0 --port 27017 --nojournal';
      
      const mongoProcess = await sandbox.commands.run(startCommand, {
        cwd: '/tmp',
        background: true,
        timeoutMs: 0, // Disable timeout for long-running MongoDB service
      });
      
      this.logger.log(`MongoDB process started with PID: ${mongoProcess.pid || 'unknown'}`);

      // Wait for MongoDB to be ready
      let isReady = false;
      for (let i = 0; i < 15; i++) {
        const processCheck = await this.runCommand('pgrep mongod', '/tmp', 3000);
        if (processCheck.exitCode === 0) {
          const portCheck = await this.runCommand('ss -tlnp | grep ":27017 " || netstat -tlnp | grep ":27017 "', '/tmp', 3000);
          if (portCheck.stdout.includes(':27017')) {
            isReady = true;
            this.logger.log('MongoDB is ready and accepting connections');
            break;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!isReady) {
        throw new Error('MongoDB failed to start within timeout period');
      }

      return {
        stdout: 'MongoDB started successfully',
        stderr: '',
        exitCode: 0
      };

    } catch (error) {
      this.logger.error(`MongoDB startup failed: ${error.message}`);
      throw error;
    }
  }

  async testMongoDBConnection(): Promise<{ isConnected: boolean; info: string }> {
    try {
      // Check if MongoDB process is running
      const processCheck = await this.runCommand('pgrep mongod', '/tmp', 5000);
      if (processCheck.exitCode !== 0) {
        await this.startMongoDB();
      }

      // Test basic connection
      const pingResult = await this.runCommand(
        'mongosh --quiet --eval "try { db.adminCommand(\'ping\'); print(\'ping success\') } catch(e) { print(\'ping failed: \' + e) }"',
        '/tmp',
        15000
      );

      const isPingOk = pingResult.exitCode === 0 && pingResult.stdout.includes('ping success');
      
      if (isPingOk) {
        return {
          isConnected: true,
          info: 'MongoDB connection successful'
        };
      } else {
        return {
          isConnected: false,
          info: `Connection failed: ${pingResult.stderr}`
        };
      }

    } catch (error) {
      return {
        isConnected: false,
        info: `Connection test failed: ${error.message}`
      };
    }
  }

  getMongoDBConnectionInfo(): {
    host: string;
    port: number;
    database: string;
    connectionString: string;
  } {
    return {
      host: '0.0.0.0',
      port: 27017,
      database: 'myapp',
      connectionString: 'mongodb://0.0.0.0:27017/myapp'
    };
  }

  // === FULL STACK DEPLOYMENT METHODS ===

  async runFullStackTestWithMongoDB(): Promise<{ 
    backendUrl: string; 
    frontendUrl: string; 
    databaseInfo: any 
  }> {
    this.logger.log('--- Starting Full-Stack Deployment with MongoDB ---');

    try {
      // 1. Start MongoDB
      this.logger.log('Step 1: Starting MongoDB...');
      await this.startMongoDB();
      const dbConnection = await this.testMongoDBConnection();

      // 2. Setup Backend (FastAPI with MongoDB)
      this.logger.log('Step 2: Setting up FastAPI backend...');
      const backendDir = '/home/backend';
      await this.createDirectory(backendDir);
      
      await this.writeFile(`${backendDir}/main.py`, FASTAPI_WITH_MONGODB);
      await this.writeFile(`${backendDir}/requirements.txt`, MONGODB_REQUIREMENTS_TXT);

      // Install Python dependencies with working pattern from sandbox-old
      this.logger.log('Installing Python dependencies...');
      
      // Verify Python is available (leveraging pre-installed Python 3.11)
      const pythonCheck = await this.runCommand('python3 --version', backendDir, 30000);
      if (pythonCheck.exitCode !== 0) {
        throw new Error(`Python3 not available: ${pythonCheck.stderr}`);
      }
      this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

      // Use the working pattern from sandbox-old with --verbose flag
      const pipInstall = await this.runCommand(
        'python3 -m pip install -r requirements.txt --verbose',
        backendDir, 
        180000 // 3 minutes timeout like sandbox-old
      );
      
      if (pipInstall.exitCode !== 0) {
        this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
        throw new Error(`Failed to install Python dependencies: ${pipInstall.stderr}`);
      }

      this.logger.log('✅ Python dependencies installed successfully!');

      // Start backend service using startService method (which has timeoutMs: 0)
      this.logger.log('Starting FastAPI backend service...');
      const backendService = await this.startService('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000', 8000, backendDir);
      
      // Generate URLs for logging
      const sandbox = await this.ensureSandbox();
      const backendUrl = `https://${sandbox.getHost(8000)}`;
      const mongoUrl = `https://${sandbox.getHost(27017)}`;
      
      this.logger.log(`🚀 BACKEND URL: ${backendUrl}`);
      this.logger.log(`🗄️  DATABASE URL: ${mongoUrl}`);
      this.logger.log('Waiting for backend service to be ready...');
      
      await new Promise(resolve => setTimeout(resolve, 8000)); // Wait 8 seconds for backend to be ready

      // 3. Setup Frontend (Next.js) - Using Fast Creation Method
      this.logger.log('Step 3: Setting up Next.js frontend using fast method...');
      
      // Use the faster createNextAppFast method instead of slow npx command
      const createNextApp = await this.createNextAppFast('frontend', '/home');
      
      if (createNextApp.exitCode !== 0) {
        this.logger.error(`Next.js fast creation failed: ${createNextApp.stderr}`);
        throw new Error(`Failed to create Next.js app: ${createNextApp.stderr}`);
      }

      // Configure frontend
      this.logger.log('Configuring frontend environment...');
      await this.writeFile('/home/frontend/.env.local', `NEXT_PUBLIC_API_URL=${backendService.url}`);
      await this.writeFile('/home/frontend/app/page.tsx', NEXTJS_WITH_MONGODB_PAGE);

      // Wait a moment for file system to settle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start frontend service using startService method
      this.logger.log('Starting Next.js frontend service...');
      const frontendService = await this.startService('npm run dev -- --port 3000 --hostname 0.0.0.0', 3000, '/home/frontend');

      this.logger.log('--- Full-Stack Deployment Complete ---');
      return {
        backendUrl: backendService.url,
        frontendUrl: frontendService.url,
        databaseInfo: {
          isConnected: dbConnection.isConnected,
          connectionInfo: this.getMongoDBConnectionInfo(),
          details: dbConnection.info
        }
      };

    } catch (error) {
      this.logger.error(`Full stack deployment failed: ${error.message}`);
      throw error;
    }
  }

  async startBackendRobust(): Promise<{ backendUrl: string; diagnostics: any }> {
    this.logger.log('--- Starting Backend with E2B Best Practices ---');

    try {
      // Setup Backend directory and files
      await this.createDirectory('/home/backend');
      await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
      await this.writeFile('/home/backend/requirements.txt', 'fastapi==0.104.1\nuvicorn[standard]==0.24.0');

      // Try to check if packages are already available
      const checkFastAPI = await this.runCommand('python3 -c "import fastapi; print(fastapi.__version__)"', '/home/backend', 10000);
      const checkUvicorn = await this.runCommand('python3 -c "import uvicorn; print(uvicorn.__version__)"', '/home/backend', 10000);

      if (checkFastAPI.exitCode !== 0 || checkUvicorn.exitCode !== 0) {
        this.logger.log('FastAPI/Uvicorn not found, installing...');
        
        // Verify Python is available (leveraging pre-installed Python 3.11)
        const pythonCheck = await this.runCommand('python3 --version', '/home/backend', 30000);
        if (pythonCheck.exitCode !== 0) {
          throw new Error(`Python3 not available: ${pythonCheck.stderr}`);
        }
        this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

        // Use the working pattern from sandbox-old with --verbose flag
        const pipInstall = await this.runCommand(
          'python3 -m pip install -r requirements.txt --verbose',
          '/home/backend',
          180000 // 3 minutes timeout like sandbox-old
        );
        
        if (pipInstall.exitCode !== 0) {
          this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
          throw new Error(`Failed to install dependencies: ${pipInstall.stderr}`);
        }
        
        this.logger.log('✅ Python dependencies installed successfully!');
      } else {
        this.logger.log('FastAPI and Uvicorn already available, skipping installation');
      }

      // Start service in background
      const sandbox = await this.ensureSandbox();
      const process = await sandbox.commands.run('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info', {
        cwd: '/home/backend',
        background: true,
        timeoutMs: 0 // Disable timeout for long-running backend service
      });

      const backendUrl = `https://${sandbox.getHost(8000)}`;
      this.logger.log(`🚀 BACKEND URL: ${backendUrl}`);
      this.logger.log('Waiting for backend service to start...');
      
      // Wait for service to start and verify
      let isListening = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const portCheck = await this.runCommand('ss -tlnp | grep ":8000 " || netstat -tlnp | grep ":8000 "', '/home', 5000);
        const curlTest = await this.runCommand('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/', '/home', 10000);

        if (portCheck.stdout.includes(':8000') && curlTest.stdout.trim() === '200') {
          isListening = true;
          break;
        }
      }

      if (!isListening) {
        throw new Error('Service failed to start properly after 10 attempts');
      }

      return {
        backendUrl,
        diagnostics: {
          processId: process.pid || 'unknown',
          isListening: true,
          message: 'Backend started successfully'
        }
      };

    } catch (error) {
      this.logger.error(`Backend startup failed: ${error.message}`);
      throw error;
    }
  }

  async startMongoDBBackendRobust(): Promise<{ 
    mongoUrl: string;
    backendUrl: string; 
    diagnostics: any 
  }> {
    this.logger.log('--- Starting MongoDB + FastAPI ---');

    try {
      // 1. Start MongoDB
      const mongoResult = await this.startMongoDB();
      if (mongoResult.exitCode !== 0) {
        throw new Error(`MongoDB startup failed: ${mongoResult.stderr}`);
      }

      // 2. Setup FastAPI backend with MongoDB
      const backendDir = '/home/backend';
      await this.createDirectory(backendDir);
      
      await this.writeFile(`${backendDir}/main.py`, FASTAPI_WITH_MONGODB);
      await this.writeFile(`${backendDir}/requirements.txt`, MONGODB_REQUIREMENTS_TXT);

      // 3. Install Python dependencies with working pattern from sandbox-old
      this.logger.log('Installing Python dependencies...');
      
      // Verify Python is available (leveraging pre-installed Python 3.11)
      const pythonCheck = await this.runCommand('python3 --version', backendDir, 30000);
      if (pythonCheck.exitCode !== 0) {
        throw new Error(`Python3 not available: ${pythonCheck.stderr}`);
      }
      this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

      // Use the working pattern from sandbox-old with --verbose flag
      const pipInstall = await this.runCommand(
        'python3 -m pip install -r requirements.txt --verbose',
        backendDir,
        180000 // 3 minutes timeout like sandbox-old
      );
      
      if (pipInstall.exitCode !== 0) {
        this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
        throw new Error(`Failed to install dependencies: ${pipInstall.stderr}`);
      }

      this.logger.log('✅ Python dependencies installed successfully!');

      // 4. Start FastAPI with E2B background execution
      const sandbox = await this.ensureSandbox();
      const fastapiProcess = await sandbox.commands.run('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info', {
        cwd: backendDir,
        background: true,
        timeoutMs: 0, // Disable timeout for long-running FastAPI service
      });

      const backendUrl = `https://${sandbox.getHost(8000)}`;
      const mongoUrl = `https://${sandbox.getHost(27017)}`;

      this.logger.log(`🚀 BACKEND URL: ${backendUrl}`);
      this.logger.log(`🗄️  DATABASE URL: ${mongoUrl}`);
      this.logger.log('Waiting for services to be ready...');

      // Wait and verify services
      await new Promise(resolve => setTimeout(resolve, 8000));

      return {
        mongoUrl,
        backendUrl,
        diagnostics: {
          mongoProcessId: 'background',
          fastapiProcessId: fastapiProcess.pid || 'unknown',
          services: 'MongoDB + FastAPI started successfully'
        }
      };

    } catch (error) {
      this.logger.error(`MongoDB + FastAPI setup failed: ${error.message}`);
      throw error;
    }
  }

  // === SIMPLE TEST METHOD ===

  async deployFullStack(data: any): Promise<{
    backendUrl: string;
    frontendUrl: string;
    status: string;
    logs: any[];
  }> {
    const logs: any[] = [];

    try {
      this.logger.log('Starting full-stack deployment...');
      logs.push({ type: 'info', message: 'Starting full-stack deployment process' });

      // 1. Setup Backend (FastAPI)
      this.logger.log('Step 1: Setting up FastAPI backend...');
      
      // Create backend directory
      await this.createDirectory('/home/backend');
      
      // Write Python files
      await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
      await this.writeFile('/home/backend/requirements.txt', 'fastapi==0.104.1\nuvicorn[standard]==0.24.0');
      
      logs.push({ type: 'success', message: 'Backend files created successfully' });

      // Verify Python is available (leveraging pre-installed Python 3.11)
      this.logger.log('Checking Python installation...');
      const pythonCheck = await this.runCommand('python3 --version', '/home/backend', 30000);
      if (pythonCheck.exitCode !== 0) {
        throw new Error(`Python3 not available: ${pythonCheck.stderr}`);
      }
      this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

      // Install Python dependencies with working pattern from sandbox-old
      this.logger.log('Installing Python dependencies...');
      const pipInstall = await this.runCommand(
        'python3 -m pip install -r requirements.txt --verbose',
        '/home/backend',
        180000 // 3 minutes timeout like sandbox-old
      );

      if (pipInstall.exitCode !== 0) {
        this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
        throw new Error(`Failed to install Python dependencies: ${pipInstall.stderr}`);
      }
      
      logs.push({ type: 'success', message: 'Python dependencies installed successfully' });

      // Start backend service with proper error handling (using working pattern)
      this.logger.log('Starting FastAPI backend service...');
      const backendService = await this.startService('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000', 8000, '/home/backend');
      logs.push({ type: 'success', message: `Backend service started at ${backendService.url}` });

      // Wait a moment for the service to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 2. Setup Frontend (Next.js) - Using Fast Creation Method
      this.logger.log('Step 2: Setting up Next.js frontend using fast method...');
      
      // Use the faster createNextAppFast method instead of slow npx command
      const createNextApp = await this.createNextAppFast('frontend', '/home');

      if (createNextApp.exitCode !== 0) {
        this.logger.error(`Next.js fast creation failed. Stdout: ${createNextApp.stdout}`);
        throw new Error(`Failed to create Next.js app: ${createNextApp.stderr}`);
      }

      logs.push({ type: 'success', message: 'Next.js app created successfully' });

      // Start frontend service
      this.logger.log('Starting Next.js frontend service...');
      const frontendService = await this.startService('npm run dev -- --port 3000 --hostname 0.0.0.0', 3000, '/home/frontend');
      logs.push({ type: 'success', message: `Frontend service started at ${frontendService.url}` });

      return {
        backendUrl: backendService.url,
        frontendUrl: frontendService.url,
        status: 'success',
        logs,
      };
    } catch (error) {
      this.logger.error(`Full-stack deployment failed: ${error.message}`);
      logs.push({ type: 'error', message: error.message });
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  // === SIMPLE TEST METHOD ===

  async runSimpleTest(): Promise<any> {
    this.logger.log(`Creating sandbox with custom template: ${this.templateId}`);

    try {
      // Create a new sandbox for this test only
      const testSandbox = await Sandbox.create(this.templateId, {
        apiKey: this.apiKey,
      });

      // Test a tool we pre-installed in our Dockerfile
      const result = await testSandbox.commands.run('pm2 --version');

      // Always clean up the test sandbox
      await testSandbox.kill();

      return {
        success: result.exitCode === 0,
        message: result.stdout.trim(),
        sandboxId: testSandbox.sandboxId,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    } catch (error) {
      this.logger.error(`Simple test failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
