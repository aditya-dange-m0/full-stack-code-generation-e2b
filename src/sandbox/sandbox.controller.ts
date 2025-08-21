import { Controller, Get, Post, Body, Param, Logger } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Controller('sandbox')
export class SandboxController {
  private readonly logger = new Logger(SandboxController.name);
  
  constructor(private readonly sandboxService: SandboxService) {}

  // === ESSENTIAL ROUTES ONLY ===

  /**
   * Simple Test Route
   * Basic sandbox functionality test - creates its own sandbox and cleans up
   */
  @Get('test')
  async runSimpleTest() {
    try {
      const result = await this.sandboxService.runSimpleTest();
      return result;
    } catch (error) {
      this.logger.error('Simple test failed:', error);
      return { error: 'Simple test failed', details: error.message };
    }
  }

  /**
   * Test Port Connectivity
   * Test if we can start a simple service and access it
   */
  @Get('test-port')
  async testPortConnectivity() {
    try {
      this.logger.log('Testing port connectivity...');
      
      // Start a simple Python HTTP server on port 8080
      const testResult = await this.sandboxService.startService(
        'python3 -m http.server 8080 --bind 0.0.0.0',
        8080,
        '/tmp'
      );
      
      return {
        success: true,
        message: 'Port test service started successfully',
        url: testResult.url,
        testInstructions: 'Try accessing the URL to see if the port is accessible'
      };
    } catch (error) {
      this.logger.error('Port test failed:', error);
      return { 
        success: false, 
        error: 'Port test failed', 
        details: error.message 
      };
    }
  }

  /**
   * Sandbox Info Route
   * Get sandbox information and metrics
   */
  @Get('info')
  async getSandboxInfo() {
    try {
      const info = await this.sandboxService.getSandboxInfo();
      return {
        success: true,
        sandboxInfo: info
      };
    } catch (error) {
      this.logger.error('Failed to get sandbox info:', error);
      return { error: 'Failed to get sandbox info', details: error.message };
    }
  }

  /**
   * Sandbox Metrics Route
   * Get current sandbox metrics
   */
  @Get('metrics')
  async getSandboxMetrics() {
    try {
      const metrics = await this.sandboxService.getSandboxMetrics();
      await this.sandboxService.logSandboxMetrics();
      return {
        success: true,
        metrics
      };
    } catch (error) {
      this.logger.error('Failed to get sandbox metrics:', error);
      return { error: 'Failed to get sandbox metrics', details: error.message };
    }
  }

  /**
   * Backend Testing Route
   * Tests FastAPI backend setup and deployment
   */
  @Get('test-backend')
  async testBackend() {
    try {
      this.logger.log('Starting backend test...');
      const result = await this.sandboxService.startBackendRobust();
      return {
        success: true,
        message: 'Backend testing completed successfully',
        ...result
      };
    } catch (error) {
      this.logger.error('Backend test failed:', error);
      return { 
        success: false,
        error: 'Backend test failed', 
        details: error.message 
      };
    }
  }

  /**
   * Backend + Database Testing Route
   * Tests FastAPI backend with MongoDB database integration
   */
  @Get('test-backend-database')
  async testBackendDatabase() {
    try {
      this.logger.log('Starting backend + database test...');
      const result = await this.sandboxService.startMongoDBBackendRobust();
      return {
        success: true,
        message: 'Backend + Database testing completed successfully',
        ...result
      };
    } catch (error) {
      this.logger.error('Backend + Database test failed:', error);
      return { 
        success: false,
        error: 'Backend + Database test failed', 
        details: error.message 
      };
    }
  }

  /**
   * Full Stack Template Route
   * Deploys complete full-stack application with FastAPI backend, Next.js frontend, and MongoDB
   */
  @Get('deploy-fullstack')
  async deployFullStack() {
    try {
      this.logger.log('Starting full-stack template deployment...');
      const result = await this.sandboxService.runFullStackTestWithMongoDB();
      return {
        success: true,
        message: 'Full-stack template deployed successfully',
        ...result
      };
    } catch (error) {
      this.logger.error('Full-stack deployment failed:', error);
      // Don't close sandbox here as other services might be using it
      return { 
        success: false,
        error: 'Full-stack deployment failed', 
        details: error.message 
      };
    }
  }

  // === MONGODB ROUTES ===

  @Get('mongodb/start')
  async startMongoDB() {
    try {
      const result = await this.sandboxService.startMongoDB();
      return { 
        success: true, 
        message: 'MongoDB started successfully',
        details: result
      };
    } catch (error) {
      this.logger.error('Failed to start MongoDB:', error);
      return { error: 'Failed to start MongoDB', details: error.message };
    }
  }

  @Get('mongodb/test')
  async testMongoDB() {
    try {
      const result = await this.sandboxService.testMongoDBConnection();
      return {
        success: true,
        ...result
      };
    } catch (error) {
      this.logger.error('MongoDB test failed:', error);
      return { error: 'MongoDB test failed', details: error.message };
    }
  }

  @Get('mongodb/info')
  async getMongoDBInfo() {
    try {
      const connectionInfo = this.sandboxService.getMongoDBConnectionInfo();
      return {
        success: true,
        connectionInfo
      };
    } catch (error) {
      this.logger.error('Failed to get MongoDB info:', error);
      return { error: 'Failed to get MongoDB info', details: error.message };
    }
  }

  // === FILE OPERATIONS ROUTES ===

  @Post('files/read')
  async readFile(@Body('filePath') filePath: string) {
    try {
      if (!filePath) {
        return { error: 'File path is required', details: 'Please provide a filePath in the request body' };
      }
      
      const content = await this.sandboxService.readFile(filePath);
      return {
        success: true,
        filePath,
        content,
        size: content.length
      };
    } catch (error) {
      this.logger.error('Failed to read file:', error);
      return { error: 'Failed to read file', details: error.message, filePath };
    }
  }

  @Post('files/write')
  async writeFile(@Body('filePath') filePath: string, @Body('content') content: string) {
    try {
      if (!filePath || content === undefined) {
        return { error: 'File path and content are required', details: 'Please provide filePath and content in the request body' };
      }
      
      await this.sandboxService.writeFile(filePath, content);
      return {
        success: true,
        message: 'File written successfully',
        filePath,
        size: content.length
      };
    } catch (error) {
      this.logger.error('Failed to write file:', error);
      return { error: 'Failed to write file', details: error.message, filePath };
    }
  }

  @Post('files/list')
  async listFiles(@Body('dirPath') dirPath?: string) {
    try {
      const directory = dirPath || '/home';
      const files = await this.sandboxService.listFiles(directory);
      return {
        success: true,
        directory,
        files,
        count: files.length
      };
    } catch (error) {
      this.logger.error('Failed to list files:', error);
      return { error: 'Failed to list files', details: error.message, directory: dirPath };
    }
  }

  @Post('directory/create')
  async createDirectory(@Body('dirPath') dirPath: string) {
    try {
      if (!dirPath) {
        return { error: 'Directory path is required', details: 'Please provide a dirPath in the request body' };
      }
      
      await this.sandboxService.createDirectory(dirPath);
      return {
        success: true,
        message: 'Directory created successfully',
        dirPath
      };
    } catch (error) {
      this.logger.error('Failed to create directory:', error);
      return { error: 'Failed to create directory', details: error.message, dirPath };
    }
  }

  // === COMMAND EXECUTION ROUTES ===

  @Post('commands/run')
  async runCommand(@Body('command') command: string, @Body('workDir') workDir?: string, @Body('timeoutMs') timeoutMs?: number) {
    try {
      if (!command) {
        return { error: 'Command is required', details: 'Please provide a command in the request body' };
      }
      
      const result = await this.sandboxService.runCommand(command, workDir, timeoutMs);
      return {
        success: result.exitCode === 0,
        command,
        workDir: workDir || '/home',
        timeoutMs: timeoutMs || 60000,
        result: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        }
      };
    } catch (error) {
      this.logger.error('Failed to run command:', error);
      return { error: 'Failed to run command', details: error.message, command };
    }
  }

  @Post('services/start')
  async startService(@Body('command') command: string, @Body('port') port: number, @Body('workDir') workDir?: string) {
    try {
      if (!command || !port) {
        return { error: 'Command and port are required', details: 'Please provide command and port in the request body' };
      }
      
      const service = await this.sandboxService.startService(command, port, workDir);
      return {
        success: true,
        message: 'Service started successfully',
        service: {
          command,
          port,
          workDir: workDir || '/home',
          url: service.url,
          processId: service.process?.pid || 'unknown'
        }
      };
    } catch (error) {
      this.logger.error('Failed to start service:', error);
      return { error: 'Failed to start service', details: error.message, command, port };
    }
  }

  // === SANDBOX MANAGEMENT ROUTES ===

  @Get('close')
  async closeSandbox() {
    try {
      await this.sandboxService.close();
      return {
        success: true,
        message: 'Sandbox closed successfully'
      };
    } catch (error) {
      this.logger.error('Failed to close sandbox:', error);
      return { error: 'Failed to close sandbox', details: error.message };
    }
  }
}
