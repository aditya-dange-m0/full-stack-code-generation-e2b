// src/sandbox/sandbox.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { FASTAPI_HELLO_WORLD, NEXTJS_HELLO_WORLD_PAGE } from './../templates';
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

    // Always use background: true for long-running services
    const process = await sandbox.commands.run(command, {
      cwd: workDir,
      background: true,  // Critical for E2B long-running processes
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

  // --- MongoDB Database Methods ---

  /**
   * Initialize MongoDB database with pre-configured setup
   */
  private async initializeDatabase(): Promise<void> {
    this.logger.log('--- Initializing MongoDB Database ---');

    // Use the existing startMongoDB method which handles installation and startup properly
    const startResult = await this.startMongoDB();
    
    if (startResult.exitCode !== 0) {
      this.logger.error(`Failed to start MongoDB: ${startResult.stderr}`);
      throw new Error(`MongoDB startup failed: ${startResult.stderr}`);
    }

    this.logger.log('MongoDB is ready and initialized');

    // Create .env file for the application
    this.logger.log('Creating .env file for the application...');
    await this.runCommand('mkdir -p /tmp/project/backend', '/tmp', 10000);
    
    const connectionInfo = this.getMongoDBConnectionInfo();
    const envContent = `DATABASE_URL="${connectionInfo.connectionString}"
MONGO_URL="${connectionInfo.connectionString}"
DB_HOST=${connectionInfo.host}
DB_PORT=${connectionInfo.port}
DB_NAME=${connectionInfo.database}`;

    await this.writeFile('/tmp/project/backend/.env', envContent);
    this.logger.log(`Database .env created at /tmp/project/backend/.env with URL: ${connectionInfo.connectionString}`);
    this.logger.log('--- MongoDB Database Initialized Successfully ---');
  }

  /**
   * Start MongoDB service in the sandbox
   */
  async startMongoDB(): Promise<CommandResult> {
    this.logger.log('Starting MongoDB service...');
    
    try {
      // First, check if MongoDB is already running
      const checkResult = await this.runCommand('pgrep mongod', '/tmp', 5000);
      if (checkResult.exitCode === 0) {
        this.logger.log('MongoDB is already running');
        return {
          stdout: 'MongoDB already running',
          stderr: '',
          exitCode: 0
        };
      }

      // Use /tmp or current working directory instead of /home
      this.logger.log('Creating MongoDB data directory...');
      await this.runCommand('mkdir -p /tmp/mongodb-data', '/tmp', 10000);
      
      // Set proper permissions for MongoDB data directory
      await this.runCommand('chmod 755 /tmp/mongodb-data', '/tmp', 5000);

      // Check and install MongoDB server if not available
      this.logger.log('Checking MongoDB server installation...');
      const mongoCheck = await this.runCommand('which mongod', '/tmp', 5000);
      
      if (mongoCheck.exitCode !== 0) {
        this.logger.log('Installing MongoDB server...');
        
        // Setup MongoDB repository
        await this.runCommand('apt-get update', '/tmp', 60000);
        await this.runCommand('apt-get install -y curl gnupg lsb-release', '/tmp', 60000);
        await this.runCommand('curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add -', '/tmp', 30000);
        await this.runCommand('echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list', '/tmp', 10000);
        await this.runCommand('apt-get update', '/tmp', 60000);
        
        // Install MongoDB server components
        await this.runCommand('apt-get install -y mongodb-org-server mongodb-org-tools', '/tmp', 180000);
        
        this.logger.log('MongoDB server installation completed');
      } else {
        this.logger.log('MongoDB server already installed');
      }

      // Check and install MongoDB shell if not available
      this.logger.log('Checking MongoDB shell installation...');
      const mongoshCheck = await this.runCommand('which mongosh', '/tmp', 5000);
      const mongoShellCheck = await this.runCommand('which mongo', '/tmp', 5000);
      let shellAvailable = false;
      
      if (mongoshCheck.exitCode === 0) {
        this.logger.log('MongoDB shell (mongosh) already installed');
        shellAvailable = true;
      } else if (mongoShellCheck.exitCode === 0) {
        this.logger.log('Legacy MongoDB shell (mongo) already installed');
        shellAvailable = true;
      } else {
        this.logger.log('Installing MongoDB shell...');
        
        // Try installing mongosh first
        const mongoshInstall = await this.runCommand('apt-get install -y mongodb-mongosh', '/tmp', 60000);
        
        if (mongoshInstall.exitCode === 0) {
          const verifyMongosh = await this.runCommand('which mongosh', '/tmp', 5000);
          if (verifyMongosh.exitCode === 0) {
            this.logger.log('MongoDB shell (mongosh) installation completed');
            shellAvailable = true;
          }
        } else {
          // Try alternative installation
          this.logger.log('Trying alternative MongoDB shell installation...');
          const mongoOrgInstall = await this.runCommand('apt-get install -y mongodb-org-shell', '/tmp', 60000);
          
          if (mongoOrgInstall.exitCode === 0) {
            const mongoshCheck2 = await this.runCommand('which mongosh', '/tmp', 5000);
            const mongoCheck2 = await this.runCommand('which mongo', '/tmp', 5000);
            
            if (mongoshCheck2.exitCode === 0 || mongoCheck2.exitCode === 0) {
              this.logger.log('MongoDB shell installation completed');
              shellAvailable = true;
            }
          }
        }
        
        if (!shellAvailable) {
          this.logger.warn('MongoDB shell installation failed, will use alternative connection methods');
        }
      }

      // Start MongoDB daemon with E2B best practices
      this.logger.log('Starting MongoDB daemon with proper E2B configuration...');
      
      // Get sandbox instance for proper background execution
      const sandbox = await this.ensureSandbox();
      
      // Use E2B's background execution instead of nohup
      const startCommand = 'mongod --dbpath /tmp/mongodb-data --logpath /tmp/mongodb.log --bind_ip 0.0.0.0 --port 27017 --nojournal';
      
      const mongoProcess = await sandbox.commands.run(startCommand, {
        cwd: '/tmp',
        background: true, // Critical for E2B long-running processes
      });
      
      this.logger.log(`MongoDB process started with E2B background execution. Process ID: ${mongoProcess.pid || 'unknown'}`);

      // Wait for MongoDB to be ready with improved verification
      this.logger.log('Waiting for MongoDB to be ready...');
      let isReady = false;
      
      for (let i = 0; i < 15; i++) {
        try {
          // Check if process is running
          const processCheck = await this.runCommand('pgrep mongod', '/tmp', 3000);
          if (processCheck.exitCode === 0) {
            // Check if port is listening on 0.0.0.0:27017
            const portCheck = await this.runCommand('ss -tlnp | grep ":27017 " || netstat -tlnp | grep ":27017 "', '/tmp', 3000);
            this.logger.log(`Attempt ${i + 1} - Port check: ${portCheck.stdout}`);
            
            if (portCheck.stdout.includes(':27017')) {
              // If shell is available, try to connect with it
              if (shellAvailable) {
                const healthCheck = await this.runCommand('mongosh --eval "db.adminCommand(\'ping\')" --quiet', '/tmp', 5000);
                if (healthCheck.exitCode === 0) {
                  isReady = true;
                  this.logger.log('MongoDB is ready and accepting connections');
                  break;
                }
              } else {
                // Fallback: Test with timeout command or curl instead of nc
                const portTest = await this.runCommand('timeout 3 bash -c "</dev/tcp/0.0.0.0/27017" 2>/dev/null || timeout 3 bash -c "</dev/tcp/127.0.0.1/27017" 2>/dev/null', '/tmp', 5000);
                if (portTest.exitCode === 0) {
                  isReady = true;
                  this.logger.log('MongoDB is ready (port check - shell not available)');
                  break;
                } else {
                  // Try with python as a last resort
                  const pythonTest = await this.runCommand('python3 -c "import socket; s=socket.socket(); s.settimeout(3); s.connect((\'0.0.0.0\', 27017)); s.close()" 2>/dev/null', '/tmp', 5000);
                  if (pythonTest.exitCode === 0) {
                    isReady = true;
                    this.logger.log('MongoDB is ready (Python socket test)');
                    break;
                  }
                }
              }
            }
          }
        } catch (error) {
          // Health check failed, continue trying
          this.logger.log(`Health check attempt ${i + 1}/15 failed: ${error.message}`);
        }
        
        this.logger.log(`Health check attempt ${i + 1}/15...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!isReady) {
        // Get logs for debugging
        const logResult = await this.runCommand('cat /tmp/mongodb.log', '/tmp', 5000);
        const startLogResult = await this.runCommand('cat /tmp/mongod-start.log', '/tmp', 5000);
        
        this.logger.error(`MongoDB logs: ${logResult.stdout}`);
        this.logger.error(`Start logs: ${startLogResult.stdout}`);
        
        throw new Error('MongoDB failed to start within timeout period');
      }

      // Initialize database without authentication (only if shell is available)
      if (shellAvailable) {
        this.logger.log('Initializing database without authentication...');
        
        try {
          this.logger.log('Creating database and adding sample data...');
          const dbInitResult = await this.runCommand(
            'mongosh --eval "' +
            'use myapp; ' +
            'try { ' +
              'db.users.insertMany([' +
                '{name: \\"John Doe\\", email: \\"john@example.com\\", created: new Date()}, ' +
                '{name: \\"Jane Smith\\", email: \\"jane@example.com\\", created: new Date()}' +
              ']); ' +
              'print(\\"Database initialized with sample data\\"); ' +
            '} catch(e) { ' +
              'print(\\"Database initialization error: \\" + e); ' +
            '}"',
            '/tmp',
            10000
          );
          
          this.logger.log(`Database initialization result: ${dbInitResult.stdout}`);
          
        } catch (error) {
          this.logger.warn(`Database initialization warning: ${error.message}`);
        }
      } else {
        this.logger.log('MongoDB shell not available, skipping database initialization. Database server is running on port 27017.');
      }

      return {
        stdout: 'MongoDB started successfully',
        stderr: '',
        exitCode: 0
      };

    } catch (error) {
      this.logger.error(`MongoDB startup failed: ${error.message}`);
      
      // Try to get more detailed error information
      try {
        const logResult = await this.runCommand('cat /tmp/mongodb.log', '/tmp', 5000);
        this.logger.error(`MongoDB log details: ${logResult.stdout}`);
      } catch (logError) {
        this.logger.error('Could not read MongoDB logs');
      }
      
      throw error;
    }
  }

  /**
   * Stop MongoDB service in the sandbox
   */
  async stopMongoDB(): Promise<CommandResult> {
    this.logger.log('Stopping MongoDB service...');
    
    const stopResult = await this.runCommand('pkill mongod', '/tmp', 30000);
    this.logger.log('MongoDB service stopped');
    return stopResult;
  }

  /**
   * Test MongoDB connection and return database info
   */
  async testMongoDBConnection(): Promise<{ isConnected: boolean; info: string }> {
    this.logger.log('Testing MongoDB connection...');
    
    try {
      // First check if MongoDB process is running
      const processCheck = await this.runCommand('pgrep mongod', '/tmp', 5000);
      if (processCheck.exitCode !== 0) {
        this.logger.warn('MongoDB process not found, attempting to start...');
        await this.startMongoDB();
      }

      // Test basic connection with better error handling
      this.logger.log('Testing basic MongoDB ping...');
      const pingResult = await this.runCommand(
        'mongosh --quiet --eval "try { db.adminCommand(\'ping\'); print(\'ping success\') } catch(e) { print(\'ping failed: \' + e) }"',
        '/tmp',
        15000
      );

      this.logger.log(`Ping result - Exit code: ${pingResult.exitCode}, Output: ${pingResult.stdout}, Error: ${pingResult.stderr}`);

      if (pingResult.exitCode !== 0) {
        // Try to get more specific error information
        const mongoStatus = await this.runCommand('ps aux | grep mongod', '/tmp', 5000);
        const mongoLogs = await this.runCommand('tail -10 /tmp/mongodb.log 2>/dev/null || echo "No logs found"', '/tmp', 5000);
        
        return {
          isConnected: false,
          info: `MongoDB ping failed. Exit code: ${pingResult.exitCode}. Error: ${pingResult.stderr}. Process status: ${mongoStatus.stdout}. Recent logs: ${mongoLogs.stdout}`
        };
      }

      // Test database connection with better credentials handling
      this.logger.log('Testing database connection...');
      const dbTestResult = await this.runCommand(
        'mongosh --quiet --eval "try { use myapp; db.runCommand({ping: 1}); print(\'db connection success\') } catch(e) { print(\'db connection failed: \' + e) }"',
        '/tmp',
        15000
      );

      this.logger.log(`DB test result - Exit code: ${dbTestResult.exitCode}, Output: ${dbTestResult.stdout}, Error: ${dbTestResult.stderr}`);

      // Test with user authentication (with proper authSource)
      this.logger.log('Testing user authentication with authSource...');
      const authTestResult = await this.runCommand(
        'mongosh "mongodb://appuser:apppassword@127.0.0.1:27017/myapp?authSource=admin" --quiet --eval "' +
        'try { ' +
          'db.runCommand({ping: 1}); ' +
          'print(\\"auth_test_success\\"); ' +
        '} catch(e) { ' +
          'print(\\"auth_test_failed: \\" + e.message); ' +
        '}"',
        '/tmp',
        15000
      );

      this.logger.log(`Auth test result - Exit code: ${authTestResult.exitCode}, Output: ${authTestResult.stdout}, Error: ${authTestResult.stderr}`);

      // Test without authentication (admin access)
      this.logger.log('Testing admin access...');
      const adminTestResult = await this.runCommand(
        'mongosh --quiet --eval "' +
        'try { ' +
          'db.adminCommand({listUsers: 1, forDB: \\"myapp\\"}); ' +
          'print(\\"admin_test_success\\"); ' +
        '} catch(e) { ' +
          'print(\\"admin_test_failed: \\" + e.message); ' +
        '}"',
        '/tmp',
        15000
      );

      this.logger.log(`Admin test result - Exit code: ${adminTestResult.exitCode}, Output: ${adminTestResult.stdout}, Error: ${adminTestResult.stderr}`);

      // Evaluate overall connection status
      const isPingOk = pingResult.exitCode === 0 && pingResult.stdout.includes('ping success');
      const isDbOk = dbTestResult.exitCode === 0 && dbTestResult.stdout.includes('db connection success');
      const isAuthOk = authTestResult.exitCode === 0 && authTestResult.stdout.includes('auth_test_success');
      const isAdminOk = adminTestResult.exitCode === 0 && adminTestResult.stdout.includes('admin_test_success');

      if (isPingOk && (isDbOk || isAuthOk)) {
        this.logger.log('MongoDB connection test successful');
        return {
          isConnected: true,
          info: `MongoDB connection successful. Ping: ${isPingOk ? 'OK' : 'FAILED'}, DB: ${isDbOk ? 'OK' : 'FAILED'}, Auth: ${isAuthOk ? 'OK' : 'FAILED'}, Admin: ${isAdminOk ? 'OK' : 'FAILED'}. Auth details: ${authTestResult.stdout}. Admin details: ${adminTestResult.stdout}`
        };
      } else {
        return {
          isConnected: false,
          info: `Connection tests failed. Ping: ${isPingOk ? 'OK' : 'FAILED'}, DB: ${isDbOk ? 'OK' : 'FAILED'}, Auth: ${isAuthOk ? 'OK' : 'FAILED'}, Admin: ${isAdminOk ? 'OK' : 'FAILED'}. Auth error: ${authTestResult.stdout}, Admin error: ${adminTestResult.stdout}`
        };
      }

    } catch (error) {
      this.logger.error(`MongoDB connection test failed: ${error.message}`);
      return {
        isConnected: false,
        info: `Connection test failed: ${error.message}`
      };
    }
  }

  /**
   * Execute a MongoDB command
   */
  async executeMongoCommand(command: string): Promise<CommandResult> {
    this.logger.log(`Executing MongoDB command: ${command.substring(0, 100)}...`);
    
    // Ensure MongoDB is running
    await this.startMongoDB();
    
    // Execute the command in /tmp directory for consistency
    const result = await this.runCommand(
      `mongosh --quiet --eval "${command}"`,
      '/tmp',
      30000
    );
    
    if (result.exitCode === 0) {
      this.logger.log('MongoDB command executed successfully');
    } else {
      this.logger.error(`MongoDB command failed: ${result.stderr}`);
    }
    
    return result;
  }

  /**
   * Get MongoDB connection details for applications
   */
  getMongoDBConnectionInfo(): {
    host: string;
    port: number;
    database: string;
    connectionString: string;
    dataPath: string;
    logPath: string;
  } {
    return {
      host: '0.0.0.0', // Updated to reflect proper E2B binding
      port: 27017,
      database: 'myapp',
      connectionString: 'mongodb://0.0.0.0:27017/myapp', // Updated for E2B compatibility
      dataPath: '/tmp/mongodb-data',
      logPath: '/tmp/mongodb.log'
    };
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

      // Wait a moment for file system to settle
      await new Promise(resolve => setTimeout(resolve, 1000));

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
  public async testBackendOnly(): Promise<{ backendUrl: string; testResult: string; diagnostics: any }> {
    this.logger.log('--- Testing Backend Only ---');

    try {
      // Setup Backend
      await this.createDirectory('/home/backend');
      await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
      await this.writeFile('/home/backend/requirements.txt', 'fastapi\nuvicorn\npython-multipart');

      // Check Python
      const pythonCheck = await this.runCommand('python3 --version', '/home/backend', 30000);
      this.logger.log(`Python version: ${pythonCheck.stdout.trim()}`);

      // Check pip
      const pipCheck = await this.runCommand('python3 -m pip --version', '/home/backend', 30000);
      this.logger.log(`Pip version: ${pipCheck.stdout.trim()}`);

      // Install dependencies with verbose output
      this.logger.log('Installing dependencies...');
      const pipInstall = await this.runCommand('python3 -m pip install -r requirements.txt --verbose', '/home/backend', 180000);
      if (pipInstall.exitCode !== 0) {
        throw new Error(`Failed to install dependencies: ${pipInstall.stderr}`);
      }

      // Verify installation
      const verifyFastapi = await this.runCommand('python3 -c "import fastapi; print(f\'FastAPI version: {fastapi.__version__}\')"', '/home/backend', 30000);
      const verifyUvicorn = await this.runCommand('python3 -c "import uvicorn; print(f\'Uvicorn version: {uvicorn.__version__}\')"', '/home/backend', 30000);
      
      this.logger.log(`FastAPI check: ${verifyFastapi.stdout}`);
      this.logger.log(`Uvicorn check: ${verifyUvicorn.stdout}`);

      // Test Python syntax
      const syntaxCheck = await this.runCommand('python3 -m py_compile main.py', '/home/backend', 30000);
      this.logger.log(`Syntax check: ${syntaxCheck.exitCode === 0 ? 'PASSED' : 'FAILED'}`);

      // Try to start uvicorn with more verbose output
      this.logger.log('Starting FastAPI with uvicorn...');
      const backendService = await this.startService('python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level debug', 8000, '/home/backend');
      
      // Wait for startup and check process
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Check if uvicorn process is running
      const processCheck = await this.runCommand('ps aux | grep uvicorn', '/home', 10000);
      this.logger.log(`Process check: ${processCheck.stdout}`);

      // Check if port is listening
      const portCheck = await this.runCommand('netstat -tlnp | grep 8000 || ss -tlnp | grep 8000', '/home', 10000);
      this.logger.log(`Port check: ${portCheck.stdout}`);

      // Test local connection first
      const localTest = await this.runCommand('curl -v http://127.0.0.1:8000/ 2>&1', '/home', 30000);
      this.logger.log(`Local test: ${localTest.stdout}`);

      // Test the hello endpoint
      const helloTest = await this.runCommand('curl -v http://127.0.0.1:8000/api/hello 2>&1', '/home', 30000);
      this.logger.log(`Hello endpoint test: ${helloTest.stdout}`);

      // Get any logs from the FastAPI app
      const logsCheck = await this.runCommand('journalctl --no-pager -n 20', '/home', 10000);
      
      return {
        backendUrl: backendService.url,
        testResult: helloTest.stdout || helloTest.stderr,
        diagnostics: {
          pythonVersion: pythonCheck.stdout.trim(),
          pipVersion: pipCheck.stdout.trim(),
          fastapiVerify: verifyFastapi.stdout,
          uvicornVerify: verifyUvicorn.stdout,
          syntaxCheck: syntaxCheck.exitCode === 0,
          processRunning: processCheck.stdout,
          portListening: portCheck.stdout,
          localConnection: localTest.stdout,
          logs: logsCheck.stdout
        }
      };

    } catch (error) {
      this.logger.error(`Backend test failed: ${error.message}`);
      throw error;
    }
  }
  // Enhanced backend startup following E2B best practices
  public async startBackendRobust(): Promise<{ backendUrl: string; diagnostics: any }> {
    this.logger.log('--- Starting Backend with E2B Best Practices ---');

    try {
      // 1. Setup Backend directory and files
      await this.createDirectory('/home/backend');
      await this.writeFile('/home/backend/main.py', FASTAPI_HELLO_WORLD);
      await this.writeFile('/home/backend/requirements.txt', 'fastapi==0.104.1\nuvicorn[standard]==0.24.0');

      // 2. Install dependencies
      this.logger.log('Installing Python dependencies...');
      const pipInstall = await this.runCommand('python3 -m pip install -r requirements.txt', '/home/backend', 180000);
      if (pipInstall.exitCode !== 0) {
        throw new Error(`Failed to install dependencies: ${pipInstall.stderr}`);
      }

      // 3. Start service explicitly in background with proper binding
      this.logger.log('Starting FastAPI service in background...');
      const startCommand = 'python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info';
      
      // Get sandbox instance first
      const sandbox = await this.ensureSandbox();
      
      // Use background: true as recommended by E2B
      const process = await sandbox.commands.run(startCommand, {
        cwd: '/home/backend',
        background: true,
      });

      // 4. Get the proper E2B URL using getHost
      const backendUrl = `https://${sandbox.getHost(8000)}`;
      this.logger.log(`Backend URL: ${backendUrl}`);

      // 5. Wait for service to start and verify it's listening
      this.logger.log('Waiting for service to start...');
      let isListening = false;
      let diagnostics = {};

      for (let attempt = 1; attempt <= 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // Check if port is listening on 0.0.0.0:8000
        const portCheck = await this.runCommand('ss -tlnp | grep ":8000 " || netstat -tlnp | grep ":8000 "', '/home', 5000);
        this.logger.log(`Attempt ${attempt} - Port check: ${portCheck.stdout}`);

        // Check if process is running
        const processCheck = await this.runCommand('ps aux | grep "[u]vicorn"', '/home', 5000);
        this.logger.log(`Attempt ${attempt} - Process check: ${processCheck.stdout}`);

        // Test local connectivity
        const curlTest = await this.runCommand('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/', '/home', 10000);
        this.logger.log(`Attempt ${attempt} - Curl test: ${curlTest.stdout}`);

        if (portCheck.stdout.includes(':8000') && curlTest.stdout.trim() === '200') {
          isListening = true;
          diagnostics = {
            attempt,
            portListening: true,
            processRunning: processCheck.stdout.includes('uvicorn'),
            curlResponse: curlTest.stdout,
            portDetails: portCheck.stdout
          };
          break;
        }

        diagnostics = {
          attempt,
          portListening: false,
          processRunning: processCheck.stdout.includes('uvicorn'),
          curlResponse: curlTest.stdout,
          portDetails: portCheck.stdout,
          processDetails: processCheck.stdout
        };
      }

      if (!isListening) {
        // Try to get logs for debugging
        const logs = await this.runCommand('journalctl --no-pager -n 20 2>/dev/null || dmesg | tail -20', '/home', 10000);
        throw new Error(`Service failed to start properly after 10 attempts. Diagnostics: ${JSON.stringify(diagnostics)}. Logs: ${logs.stdout}`);
      }

      // 6. Final verification with the actual endpoint
      this.logger.log('Verifying /api/hello endpoint...');
      const endpointTest = await this.runCommand('curl -s http://127.0.0.1:8000/api/hello', '/home', 15000);
      
      this.logger.log('--- Backend Started Successfully ---');
      return {
        backendUrl,
        diagnostics: {
          ...diagnostics,
          endpointTest: endpointTest.stdout,
          endpointWorking: endpointTest.exitCode === 0,
          processId: process.pid || 'unknown'
        }
      };

    } catch (error) {
      this.logger.error(`Backend startup failed: ${error.message}`);
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

  // Full-stack test with MongoDB integration
  public async runFullStackTestWithMongoDB(): Promise<{ 
    backendUrl: string; 
    frontendUrl: string; 
    databaseInfo: any 
  }> {
    this.logger.log('--- Starting Full-Stack Test with MongoDB ---');

    try {
      // 1. Initialize MongoDB database
      this.logger.log('Step 1: Setting up MongoDB database...');
      await this.initializeDatabase();
      
      // Test MongoDB connection before proceeding
      const dbTest = await this.testMongoDBConnection();
      if (!dbTest.isConnected) {
        this.logger.warn(`MongoDB connection issue: ${dbTest.info}`);
        // Continue anyway as MongoDB might still work
      }
      this.logger.log('MongoDB setup completed');

      // 2. Setup Backend (FastAPI with MongoDB) 
      this.logger.log('Step 2: Setting up FastAPI backend with MongoDB...');
      const backendDir = '/home/backend'; // Use consistent path
      
      // Ensure backend directory exists
      await this.createDirectory(backendDir);
      
      // Import the MongoDB-enabled template
      const { FASTAPI_WITH_MONGODB, MONGODB_REQUIREMENTS_TXT } = await import('./../templates');
      
      await this.writeFile(`${backendDir}/main.py`, FASTAPI_WITH_MONGODB);
      await this.writeFile(`${backendDir}/requirements.txt`, MONGODB_REQUIREMENTS_TXT);

      // Install Python dependencies including pymongo
      this.logger.log('Installing Python dependencies with MongoDB support...');
      const pipInstall = await this.runCommand(
        'python3 -m pip install -r requirements.txt', 
        backendDir, // Run from the backend directory
        180000
      );
      if (pipInstall.exitCode !== 0) {
        this.logger.error(`Pip install failed. Stdout: ${pipInstall.stdout}`);
        throw new Error(`Failed to install Python dependencies: ${pipInstall.stderr}`);
      }
      this.logger.log('Python dependencies with MongoDB support installed successfully');

      // Start backend service with MongoDB integration using robust method
      this.logger.log('Starting FastAPI backend with MongoDB...');
      
      // Get sandbox instance for proper background execution
      const sandbox = await this.ensureSandbox();
      
      // Start service in background
      const startCommand = 'python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info';
      const process = await sandbox.commands.run(startCommand, {
        cwd: backendDir,
        background: true, // Critical for long-running services
      });
      
      // Get the proper E2B URL
      const backendUrl = `https://${sandbox.getHost(8000)}`;
      this.logger.log(`Backend service with MongoDB started at: ${backendUrl}`);
      
      // Wait for backend to initialize and verify it's working
      this.logger.log('Waiting for backend to be ready...');
      let backendReady = false;
      for (let attempt = 1; attempt <= 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if process is running
        const processCheck = await this.runCommand('ps aux | grep "[u]vicorn"', '/home', 5000);
        
        // Check if port is listening
        const portCheck = await this.runCommand('ss -tlnp | grep ":8000" || netstat -tlnp | grep ":8000"', '/home', 5000);
        
        // Test basic connectivity
        const curlTest = await this.runCommand('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/', '/home', 10000);
        
        this.logger.log(`Attempt ${attempt} - Process: ${processCheck.stdout.includes('uvicorn') ? 'RUNNING' : 'NOT FOUND'}, Port: ${portCheck.stdout.includes(':8000') ? 'LISTENING' : 'NOT OPEN'}, HTTP: ${curlTest.stdout.trim()}`);
        
        if (processCheck.stdout.includes('uvicorn') && portCheck.stdout.includes(':8000') && curlTest.stdout.trim() === '200') {
          backendReady = true;
          break;
        }
      }
      
      if (!backendReady) {
        throw new Error('Backend failed to start properly after 30 seconds');
      }
      
      // Test backend endpoints
      const healthTest = await this.runCommand('curl -s http://127.0.0.1:8000/health', '/home', 30000);
      this.logger.log(`Backend health test: ${healthTest.stdout}`);

      const dbStatusTest = await this.runCommand('curl -s http://127.0.0.1:8000/api/db-status', '/home', 30000);
      this.logger.log(`Database status test: ${dbStatusTest.stdout}`);

      // 3. Setup Frontend (Next.js with MongoDB interface)
      this.logger.log('Step 3: Setting up Next.js frontend with MongoDB interface...');
      
      // Use fast approach for Next.js creation
      try {
        const nextResult = await this.createNextAppFast('frontend');
        this.logger.log('Frontend created using fast approach');
      } catch (error) {
        this.logger.warn('Fast approach failed, using original create-next-app...');
        const createNextApp = await this.runLongCommand(
          'npx --yes create-next-app@latest frontend --typescript --use-npm --eslint=false --tailwind=false --src-dir=false --app --import-alias="@/*" --verbose',
          '/home'
        );
        if (createNextApp.exitCode !== 0) {
          throw new Error(`Failed to create Next.js app: ${createNextApp.stderr}`);
        }
      }

      // Configure frontend environment
      this.logger.log('Configuring frontend environment for MongoDB demo...');
      await this.writeFile('/home/frontend/.env.local', `NEXT_PUBLIC_API_URL=${backendUrl}`);
      
      // Import the MongoDB-enabled frontend template
      const { NEXTJS_WITH_MONGODB_PAGE } = await import('./../templates');
      
      // Overwrite the default page with MongoDB demo page
      await this.writeFile('/home/frontend/app/page.tsx', NEXTJS_WITH_MONGODB_PAGE);

      // Wait a moment for file system to settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start frontend service
      this.logger.log('Starting Next.js frontend with MongoDB interface...');
      const frontendService = await this.startService('npm run dev -- -p 3000', 3000, '/home/frontend');

      // Get database connection info
      const connectionInfo = this.getMongoDBConnectionInfo();

      this.logger.log('--- Full-Stack Test with MongoDB Complete ---');
      this.logger.log(`Backend available at: ${backendUrl}`);
      this.logger.log(`Frontend available at: ${frontendService.url}`);
      this.logger.log(`Database: MongoDB running on 127.0.0.1:27017`);
      
      return {
        backendUrl: backendUrl,
        frontendUrl: frontendService.url,
        databaseInfo: {
          ...connectionInfo,
          status: 'connected',
          testResult: dbTest
        }
      };
    } catch (error) {
      this.logger.error(`Full-stack MongoDB test failed: ${error.message}`);
      throw error;
    }
  }

  // Enhanced MongoDB + FastAPI startup following E2B best practices
  public async startMongoDBBackendRobust(): Promise<{ 
    mongoUrl: string;
    backendUrl: string; 
    diagnostics: any 
  }> {
    this.logger.log('--- Starting MongoDB + FastAPI with E2B Best Practices ---');

    try {
      // 1. Start MongoDB with proper E2B configuration
      this.logger.log('Step 1: Starting MongoDB with 0.0.0.0 binding...');
      const mongoResult = await this.startMongoDB();
      if (mongoResult.exitCode !== 0) {
        throw new Error(`MongoDB startup failed: ${mongoResult.stderr}`);
      }

      // 2. Setup FastAPI backend directory and files
      this.logger.log('Step 2: Setting up FastAPI backend with MongoDB...');
      const backendDir = '/home/backend';
      await this.createDirectory(backendDir);
      
      // Import MongoDB templates
      const { FASTAPI_WITH_MONGODB, MONGODB_REQUIREMENTS_TXT } = await import('./../templates');
      
      await this.writeFile(`${backendDir}/main.py`, FASTAPI_WITH_MONGODB);
      await this.writeFile(`${backendDir}/requirements.txt`, MONGODB_REQUIREMENTS_TXT);

      // 3. Install Python dependencies
      this.logger.log('Step 3: Installing Python dependencies...');
      const pipInstall = await this.runCommand('python3 -m pip install -r requirements.txt', backendDir, 180000);
      if (pipInstall.exitCode !== 0) {
        throw new Error(`Failed to install dependencies: ${pipInstall.stderr}`);
      }

      // 4. Start FastAPI with proper E2B background execution
      this.logger.log('Step 4: Starting FastAPI with E2B background execution...');
      const sandbox = await this.ensureSandbox();
      
      // Start FastAPI with proper binding
      const fastapiCommand = 'python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info';
      const fastapiProcess = await sandbox.commands.run(fastapiCommand, {
        cwd: backendDir,
        background: true, // Critical for E2B long-running processes
      });

      // Get proper E2B URLs
      const backendUrl = `https://${sandbox.getHost(8000)}`;
      const mongoUrl = `mongodb://0.0.0.0:27017/myapp`;

      this.logger.log(`FastAPI Backend URL: ${backendUrl}`);
      this.logger.log(`MongoDB URL: ${mongoUrl}`);

      // 5. Comprehensive service verification
      this.logger.log('Step 5: Verifying both services are ready...');
      let servicesReady = false;
      let diagnostics = {};

      for (let attempt = 1; attempt <= 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check MongoDB
        const mongoProcess = await this.runCommand('pgrep mongod', '/tmp', 5000);
        const mongoPort = await this.runCommand('ss -tlnp | grep ":27017" || netstat -tlnp | grep ":27017"', '/tmp', 5000);
        
        // Check FastAPI
        const fastapiProcessCheck = await this.runCommand('ps aux | grep "[u]vicorn"', '/home', 5000);
        const fastapiPort = await this.runCommand('ss -tlnp | grep ":8000" || netstat -tlnp | grep ":8000"', '/home', 5000);
        
        // Test HTTP connectivity
        const httpTest = await this.runCommand('curl -s -o /dev/null -w "%{http_code}" http://0.0.0.0:8000/', '/home', 10000);
        
        // Test MongoDB connectivity using our helper method
        const mongoConnectable = await this.testPortConnectivity('0.0.0.0', 27017);

        const mongoRunning = mongoProcess.exitCode === 0;
        const mongoListening = mongoPort.stdout.includes(':27017');
        const fastapiRunning = fastapiProcessCheck.stdout.includes('uvicorn');
        const fastapiListening = fastapiPort.stdout.includes(':8000');
        const httpWorking = httpTest.stdout.trim() === '200';

        this.logger.log(`Attempt ${attempt}/20 - MongoDB: ${mongoRunning ? 'RUNNING' : 'NOT FOUND'}/${mongoListening ? 'LISTENING' : 'NOT OPEN'}/${mongoConnectable ? 'CONNECTABLE' : 'NOT CONNECTABLE'}, FastAPI: ${fastapiRunning ? 'RUNNING' : 'NOT FOUND'}/${fastapiListening ? 'LISTENING' : 'NOT OPEN'}/${httpWorking ? 'HTTP_OK' : 'HTTP_FAIL'}`);

        if (mongoRunning && mongoListening && fastapiRunning && fastapiListening && httpWorking) {
          servicesReady = true;
          diagnostics = {
            attempt,
            mongoProcess: 'RUNNING',
            mongoPort: 'LISTENING',
            mongoConnectable: mongoConnectable,
            fastapiProcess: 'RUNNING', 
            fastapiPort: 'LISTENING',
            httpResponse: httpTest.stdout,
            mongoPortDetails: mongoPort.stdout,
            fastapiPortDetails: fastapiPort.stdout
          };
          break;
        }

        diagnostics = {
          attempt,
          mongoProcess: mongoRunning ? 'RUNNING' : 'NOT FOUND',
          mongoPort: mongoListening ? 'LISTENING' : 'NOT OPEN',
          mongoConnectable,
          fastapiProcess: fastapiRunning ? 'RUNNING' : 'NOT FOUND',
          fastapiPort: fastapiListening ? 'LISTENING' : 'NOT OPEN', 
          httpResponse: httpTest.stdout,
          mongoPortDetails: mongoPort.stdout,
          fastapiPortDetails: fastapiPort.stdout,
          fastapiProcessDetails: fastapiProcessCheck.stdout
        };
      }

      if (!servicesReady) {
        throw new Error(`Services failed to start properly after 40 seconds. Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
      }

      // 6. Test actual endpoints
      this.logger.log('Step 6: Testing FastAPI endpoints...');
      const healthTest = await this.runCommand('curl -s http://0.0.0.0:8000/health', '/home', 15000);
      const dbStatusTest = await this.runCommand('curl -s http://0.0.0.0:8000/api/db-status', '/home', 15000);
      const helloTest = await this.runCommand('curl -s http://0.0.0.0:8000/api/hello', '/home', 15000);

      this.logger.log('--- MongoDB + FastAPI Started Successfully ---');
      return {
        mongoUrl,
        backendUrl,
        diagnostics: {
          ...diagnostics,
          healthEndpoint: healthTest.stdout,
          dbStatusEndpoint: dbStatusTest.stdout,
          helloEndpoint: helloTest.stdout,
          mongoProcessId: 'background',
          fastapiProcessId: fastapiProcess.pid || 'unknown'
        }
      };

    } catch (error) {
      this.logger.error(`MongoDB + FastAPI startup failed: ${error.message}`);
      throw error;
    }
  }

  // Simple port connectivity test without external dependencies
  private async testPortConnectivity(host: string, port: number): Promise<boolean> {
    try {
      // Method 1: Try bash TCP redirection (usually available)
      const bashTest = await this.runCommand(`timeout 3 bash -c "</dev/tcp/${host}/${port}" 2>/dev/null`, '/tmp', 5000);
      if (bashTest.exitCode === 0) {
        return true;
      }
    } catch (error) {
      // Continue to next method
    }

    try {
      // Method 2: Python socket test (Python should be available)
      const pythonTest = await this.runCommand(`python3 -c "import socket; s=socket.socket(); s.settimeout(3); s.connect(('${host}', ${port})); s.close()" 2>/dev/null`, '/tmp', 5000);
      if (pythonTest.exitCode === 0) {
        return true;
      }
    } catch (error) {
      // Continue to next methodcontroller
    }

    try {
      // Method 3: Check with curl if it's an HTTP service
      if (port === 8000) {
        const curlTest = await this.runCommand(`curl -s -o /dev/null -w "%{http_code}" http://${host}:${port}/`, '/tmp', 5000);
        return curlTest.stdout.trim() === '200';
      }
    } catch (error) {
      // Final fallback
    }

    return false;
  }

    async restartBackendService(): Promise<void> {
    this.logger.log('Attempting to restart FastAPI backend service...');
    
    try {
      // Kill any existing uvicorn processes (ignore errors if none exist)
      await this.runCommand('pkill -f uvicorn || true', '/tmp', 5000);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Also try to kill any python processes on port 8000
      await this.runCommand('fuser -k 8000/tcp || true', '/tmp', 5000);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Restart the service
      const backendDir = '/home/backend';
      
      // Check if the backend directory and files still exist
      const checkDir = await this.runCommand('ls -la /home/backend/', '/tmp', 5000);
      this.logger.log(`Backend directory check: ${checkDir.stdout}`);
      
      // Use the same startService method with proper timeout handling
      const sandbox = await this.ensureSandbox();
      const restartProcess = await sandbox.commands.run(
        'python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info --access-log', 
        {
          cwd: backendDir,
          background: true,
          timeoutMs: 0, // Disable timeout for long-running service
        }
      );
      
      this.logger.log(`Service restarted with PID: ${restartProcess.pid}`);
      
      // Wait for service to start
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Verify the restart worked
      const processCheck = await this.runCommand('ps aux | grep uvicorn | grep -v grep || echo "no_process"', '/tmp', 5000);
      const portCheck = await this.runCommand('ss -tlnp | grep :8000 || echo "port_not_found"', '/tmp', 5000);
      
      this.logger.log(`After restart - Process: ${processCheck.stdout}`);
      this.logger.log(`After restart - Port: ${portCheck.stdout}`);
      
      this.logger.log('Backend service restart completed');
    } catch (error) {
      this.logger.error(`Failed to restart backend service: ${error.message}`);
    }
  }
  
}

// npm install e2b   
// npm i -g @e2b/cli 
// e2b auth login            
// e2b template build --name nest-next-generator-sandbox .