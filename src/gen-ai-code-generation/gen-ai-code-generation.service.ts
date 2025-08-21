import { Injectable, Logger } from '@nestjs/common';
import { generateFullStackCode, GenAiCode, chatSession } from './utils/model-router';
import { SandboxService } from '../sandbox/sandbox.service';
import { 
  CodeGenerationRequest, 
  CodeGenerationResponse, 
  FullStackProject 
} from './interfaces/project.interface';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GenAiCodeGenerationService {
  private readonly logger = new Logger(GenAiCodeGenerationService.name);

  constructor(private readonly sandboxService: SandboxService) {}

  /**
   * Save JSON response for debugging
   */
  private saveJsonForDebug(data: any, filename: string): void {
    try {
      const generatedCodeDir = path.join(process.cwd(), 'generated-code');
      if (!fs.existsSync(generatedCodeDir)) {
        fs.mkdirSync(generatedCodeDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fullFilename = `${timestamp}-${filename}.json`;
      const filePath = path.join(generatedCodeDir, fullFilename);
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.log(`Debug JSON saved: ${fullFilename}`);
    } catch (error) {
      this.logger.warn(`Failed to save debug JSON: ${error.message}`);
    }
  }

  /**
   * Aggressively remove trailing commas from AI-generated content
   */
  private removeTrailingCommas(jsonString: string): string {
    // Remove trailing commas in JSON object properties
    jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix trailing commas at the end of code strings - this is the main issue
    jsonString = jsonString.replace(/"code":\s*"([^"]*)},"(\s*)/g, '"code": "$1}"$2');
    jsonString = jsonString.replace(/"code":\s*"([^"]*)],"(\s*)/g, '"code": "$1]"$2');
    jsonString = jsonString.replace(/"code":\s*"([^"]*);,"(\s*)/g, '"code": "$1;"$2');
    
    // Fix trailing commas in API paths
    jsonString = jsonString.replace(/"path":\s*"([^"]*),"/g, '"path": "$1"');
    
    // Fix trailing commas in purpose fields
    jsonString = jsonString.replace(/"purpose":\s*"([^"]*),"/g, '"purpose": "$1"');
    
    // Fix specific patterns we saw in the debug file
    jsonString = jsonString.replace(/},"/g, '}"');
    jsonString = jsonString.replace(/];,"/g, '];"');
    jsonString = jsonString.replace(/;,"/g, ';"');
    
    // More aggressive trailing comma removal in nested objects
    jsonString = jsonString.replace(/,(\s*\n\s*})/g, '$1');
    jsonString = jsonString.replace(/,(\s*\n\s*])/g, '$1');
    
    return jsonString;
  }

  /**
   * Generate full-stack code with frontend, backend, and database structure
   */
  async generateFullStackApplication(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    try {
      this.logger.log(`Generating full-stack application: ${request.prompt}`);
      
      const result = await generateFullStackCode({
        prompt: request.prompt,
        modelIdentifier: request.modelIdentifier,
        template: request.template
      });

      // Save raw AI response for debugging
      this.saveJsonForDebug({
        prompt: request.prompt,
        modelIdentifier: request.modelIdentifier,
        template: request.template,
        rawResponse: result.text,
        usage: result.usage
      }, 'ai-raw-response');

      // Try to parse the JSON response with enhanced error handling
      let parsedProject: FullStackProject;
      try {
        // Remove any markdown code blocks if present
        let cleanedText = result.text.replace(/```json\n?|\n?```/g, '').trim();
        
        // Remove any leading/trailing non-JSON content
        const jsonStart = cleanedText.indexOf('{');
        const jsonEnd = cleanedText.lastIndexOf('}') + 1;
        
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          cleanedText = cleanedText.substring(jsonStart, jsonEnd);
        }
        
        // Pre-validation check for common trailing comma patterns
        const trailingCommaPatterns = [
          /},\s*"/g,           // }, followed by a property
          /],\s*"/g,           // ], followed by a property  
          /;,\s*"/g,           // ;, in code strings
          /"[^"]*,"/g          // strings ending with comma
        ];
        
        let hasTrailingCommas = false;
        trailingCommaPatterns.forEach(pattern => {
          if (pattern.test(cleanedText)) {
            hasTrailingCommas = true;
          }
        });
        
        if (hasTrailingCommas) {
          this.logger.warn('Detected trailing commas in AI response, applying aggressive cleaning...');
        }
        
        // Try to fix common JSON issues
        cleanedText = this.fixCommonJsonIssues(cleanedText);
        
        parsedProject = JSON.parse(cleanedText);
      } catch (parseError) {
        this.logger.error('Failed to parse AI response as JSON', parseError);
        
        // Try to extract a simpler structure
        try {
          const simplifiedProject = this.createFallbackProject(result.text, request);
          return {
            success: true,
            data: simplifiedProject
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: `Failed to parse AI response as valid JSON: ${parseError.message}`,
            rawResponse: result.text
          };
        }
      }

      // Validate the structure (basic validation)
      if (!parsedProject.projectName || !parsedProject.code) {
        return {
          success: false,
          error: 'Invalid project structure generated',
          rawResponse: result.text
        };
      }

      this.logger.log(`Successfully generated project: ${parsedProject.projectName}`);
      
      // Clean up any remaining trailing commas in the parsed project
      parsedProject = this.cleanParsedProject(parsedProject);
      
      // Save parsed project for debugging
      this.saveJsonForDebug(parsedProject, 'parsed-project');
      
      return {
        success: true,
        data: parsedProject
      };

    } catch (error) {
      this.logger.error('Error generating full-stack application', error);
      return {
        success: false,
        error: `Generation failed: ${error.message}`
      };
    }
  }

  /**
   * Fix common syntax errors in generated code
   */
  private fixCommonJsonIssues(jsonString: string): string {
    // First apply aggressive trailing comma removal
    jsonString = this.removeTrailingCommas(jsonString);
    
    // Fix unescaped quotes in strings (basic fix)
    jsonString = jsonString.replace(/: "([^"]*)"([^",}\]]*)"([^",}\]]*)",/g, ': "$1\\"$2\\"$3",');
    
    // Fix missing commas between properties (basic pattern)
    jsonString = jsonString.replace(/}(\s*)"/g, '},$1"');
    jsonString = jsonString.replace(/](\s*)"/g, '],$1"');
    
    // Final cleanup of any remaining trailing commas
    jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
    
    return jsonString;
  }

  /**
   * Clean up trailing commas and syntax issues in parsed project structure
   */
  private cleanParsedProject(project: FullStackProject): FullStackProject {
    try {
      // Clean frontend files
      if (project.code?.frontend?.files) {
        for (const [filePath, fileData] of Object.entries(project.code.frontend.files)) {
          if (fileData.code) {
            // Remove trailing commas from code strings
            fileData.code = fileData.code.replace(/},\s*$/, '}');
            fileData.code = fileData.code.replace(/],\s*$/, ']');
            fileData.code = fileData.code.replace(/;,\s*$/, ';');
            fileData.code = fileData.code.replace(/,\s*$/, '');
          }
        }
      }

      // Clean frontend dependencies  
      if (project.code?.frontend?.dependencies) {
        for (const [filePath, fileData] of Object.entries(project.code.frontend.dependencies)) {
          if (fileData.code) {
            fileData.code = fileData.code.replace(/},\s*$/, '}');
            fileData.code = fileData.code.replace(/],\s*$/, ']');
            fileData.code = fileData.code.replace(/;,\s*$/, ';');
            fileData.code = fileData.code.replace(/,\s*$/, '');
          }
        }
      }

      // Clean backend files
      if (project.code?.backend?.files) {
        for (const [filePath, fileData] of Object.entries(project.code.backend.files)) {
          if (fileData.code) {
            fileData.code = fileData.code.replace(/},\s*$/, '}');
            fileData.code = fileData.code.replace(/],\s*$/, ']');
            fileData.code = fileData.code.replace(/;,\s*$/, ';');
            fileData.code = fileData.code.replace(/,\s*$/, '');
          }
        }
      }

      // Clean backend dependencies
      if (project.code?.backend?.dependencies) {
        for (const [filePath, fileData] of Object.entries(project.code.backend.dependencies)) {
          if (fileData.code) {
            fileData.code = fileData.code.replace(/},\s*$/, '}');
            fileData.code = fileData.code.replace(/],\s*$/, ']');
            fileData.code = fileData.code.replace(/;,\s*$/, ';');
            fileData.code = fileData.code.replace(/,\s*$/, '');
          }
        }
      }

      // Clean API endpoints - remove trailing commas from paths
      if (project.apiEndpoints) {
        project.apiEndpoints.forEach(endpoint => {
          if (endpoint.path) {
            endpoint.path = endpoint.path.replace(/,\s*$/, '');
          }
        });
      }

      return project;
    } catch (error) {
      this.logger.warn(`Failed to clean parsed project: ${error.message}`);
      return project;
    }
  }

  /**
   * Create a fallback project structure when JSON parsing fails
   */
  private createFallbackProject(rawText: string, request: CodeGenerationRequest): FullStackProject {
    return {
      projectName: "Generated Project",
      projectDescription: "A full-stack application generated by AI",
      template: request.template || "react+fastapi+mongodb",
      code: {
        frontend: {
          framework: request.template?.includes('next') ? 'next' : 'react',
          files: {
            "/App.js": {
              purpose: "Main application component",
              code: "// Generated application code\n// Original response had parsing errors\n// Raw content available in logs"
            }
          },
          dependencies: {
            "package.json": {
              purpose: "Package configuration",
              code: JSON.stringify({
                name: "generated-app",
                version: "1.0.0",
                dependencies: {
                  "react": "^18.0.0",
                  "@tailwindcss/base": "^3.0.0"
                }
              }, null, 2)
            }
          }
        },
        backend: {
          framework: "fastapi",
          files: {
            "/main.py": {
              purpose: "FastAPI main application",
              code: "# Generated FastAPI application\n# Original response had parsing errors\n# Raw content available in logs"
            }
          },
          dependencies: {
            "requirements.txt": {
              purpose: "Python dependencies",
              code: "fastapi==0.104.1\nuvicorn==0.24.0\npymongo==4.6.0"
            }
          }
        }
      },
      projectStructure: {
        frontend: "frontend/\n├── src/\n│   └── App.js\n└── package.json",
        backend: "backend/\n├── main.py\n└── requirements.txt"
      },
      databaseSchema: {
        collections: []
      },
      apiEndpoints: []
    };
  }

  /**
   * Generate frontend-only code (legacy support)
   */
  async generateFrontendCode(prompt: string, modelIdentifier: string): Promise<any> {
    try {
      this.logger.log(`Generating frontend code: ${prompt}`);
      
      const result = await GenAiCode({ prompt, modelIdentifier });
      
      // Try to parse JSON
      try {
        const cleanedText = result.text.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleanedText);
      } catch (parseError) {
        return { error: 'Failed to parse response', rawResponse: result.text };
      }
    } catch (error) {
      this.logger.error('Error generating frontend code', error);
      throw error;
    }
  }

  /**
   * Chat with AI for general queries
   */
  async chatWithAI(prompt: string, modelIdentifier: string): Promise<any> {
    try {
      this.logger.log(`Chat session: ${prompt.substring(0, 50)}...`);
      
      const result = await chatSession({ prompt, modelIdentifier });
      
      return {
        response: result.text,
        usage: result.usage
      };
    } catch (error) {
      this.logger.error('Error in chat session', error);
      throw error;
    }
  }

  /**
   * Get supported templates
   */
  getSupportedTemplates(): string[] {
    return ['next+fastapi+mongodb', 'react+fastapi+mongodb'];
  }

  /**
   * Generate and deploy full-stack code to E2B sandbox
   */
  async generateAndDeployFullStack(request: CodeGenerationRequest): Promise<{
    success: boolean;
    project?: FullStackProject;
    deployment?: {
      frontendUrl: string;
      backendUrl: string;
      status: string;
      logs: any[];
    };
    error?: string;
  }> {
    try {
      console.log("Inside generateAndDeployFullStack");
      this.logger.log(`Generating and deploying full-stack application: ${request.prompt}`);
      
      // Step 1: Generate the code using AI
      const codeResult = await this.generateFullStackApplication(request);
      
      if (!codeResult.success || !codeResult.data) {
        return {
          success: false,
          error: codeResult.error || 'Failed to generate code'
        };
      }

      // Step 2: Deploy the generated code to sandbox
      const deploymentResult = await this.deployGeneratedCodeToSandbox(codeResult.data);
      
      return {
        success: true,
        project: codeResult.data,
        deployment: deploymentResult
      };

    } catch (error) {
      this.logger.error('Error in generate and deploy process', error);
      return {
        success: false,
        error: `Generation and deployment failed: ${error.message}`
      };
    }
  }

  /**
   * Deploy generated code to E2B sandbox
   */
  async deployGeneratedCodeToSandbox(project: FullStackProject): Promise<{
    frontendUrl: string;
    backendUrl: string;
    status: string;
    logs: any[];
  }> {
    const logs: any[] = [];
    
    try {
      this.logger.log(`Deploying project: ${project.projectName}`);
      logs.push({ type: 'info', message: `Starting deployment of ${project.projectName}` });

      // Step 1: Setup MongoDB if template includes it
      if (project.template.includes('mongodb')) {
        this.logger.log('Setting up MongoDB...');
        logs.push({ type: 'info', message: 'Starting MongoDB service...' });
        
        try {
          await this.sandboxService.startMongoDB();
          logs.push({ type: 'success', message: 'MongoDB started successfully' });
        } catch (error) {
          this.logger.warn(`MongoDB setup failed: ${error.message}`);
          logs.push({ type: 'warning', message: `MongoDB setup failed: ${error.message}` });
        }
      }

      // Step 2: Deploy Backend
      this.logger.log('Deploying backend...');
      const backendUrl = await this.deployBackend(project, logs);

      // Step 3: Deploy Frontend
      this.logger.log('Deploying frontend...');
      const frontendUrl = await this.deployFrontend(project, backendUrl, logs);

      logs.push({ type: 'success', message: 'Full-stack deployment completed successfully!' });

      return {
        frontendUrl,
        backendUrl,
        status: 'success',
        logs
      };

    } catch (error) {
      this.logger.error(`Deployment failed: ${error.message}`);
      logs.push({ type: 'error', message: `Deployment failed: ${error.message}` });
      throw error;
    }
  }

  /**
   * Deploy backend code to sandbox
   */
  private async deployBackend(project: FullStackProject, logs: any[]): Promise<string> {
    const backendDir = '/home/backend';
    
    try {
      // Create backend directory
      await this.sandboxService.createDirectory(backendDir);
      logs.push({ type: 'info', message: 'Created backend directory' });

      // Write all backend files with enhanced error handling
      for (const [filePath, fileData] of Object.entries(project.code.backend.files)) {
        const fullPath = `${backendDir}${filePath}`;
        
        // Create subdirectories if needed
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (dirPath !== backendDir) {
          await this.sandboxService.createDirectory(dirPath);
        }
        
        let backendCode = fileData.code;
        
        // Enhance main.py with better error handling and logging
        if (filePath.includes('main.py')) {
          // Add startup event and better MongoDB error handling
          if (!backendCode.includes('@app.on_event("startup")')) {
            const startupHandler = `
@app.on_event("startup")
async def startup_event():
    try:
        # Test MongoDB connection
        client.admin.command('ping')
        print("MongoDB connection successful!")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        print("Continuing without MongoDB - some features may not work")

@app.get("/health")
def health_check():
    try:
        client.admin.command('ping')
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}
`;
            
            // Insert after the MongoDB client setup
            const clientSetupIndex = backendCode.indexOf('todos_collection = db.todos');
            if (clientSetupIndex !== -1) {
              const insertPoint = backendCode.indexOf('\n', clientSetupIndex) + 1;
              backendCode = backendCode.slice(0, insertPoint) + startupHandler + backendCode.slice(insertPoint);
            }
          }
        }
        
        await this.sandboxService.writeFile(fullPath, backendCode);
        logs.push({ type: 'info', message: `Created file: ${filePath}` });
      }

      // Write dependencies files
      for (const [filePath, fileData] of Object.entries(project.code.backend.dependencies)) {
        const fullPath = `${backendDir}/${filePath}`;
        await this.sandboxService.writeFile(fullPath, fileData.code);
        logs.push({ type: 'info', message: `Created dependency file: ${filePath}` });
      }

      // Install Python dependencies
      logs.push({ type: 'info', message: 'Installing Python dependencies...' });
      const pipInstall = await this.sandboxService.runCommand(
        'python3 -m pip install -r requirements.txt --verbose',
        backendDir,
        180000
      );

      if (pipInstall.exitCode !== 0) {
        throw new Error(`Failed to install Python dependencies: ${pipInstall.stderr}`);
      }
      logs.push({ type: 'success', message: 'Python dependencies installed successfully' });

      // Start backend service
      logs.push({ type: 'info', message: 'Starting backend service...' });
      const backendService = await this.sandboxService.startService(
        'python3 -m uvicorn main:app --host 0.0.0.0 --port 8000',
        8000,
        backendDir
      );

      logs.push({ type: 'success', message: `Backend service started at ${backendService.url}` });
      
      // Wait for service to be ready and test the connection
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Test backend health
      try {
        const healthCheck = await this.sandboxService.runCommand(
          `curl -f ${backendService.url}/api/todos || echo "Backend not responding"`,
          backendDir,
          10000
        );
        if (healthCheck.stdout.includes('Backend not responding')) {
          logs.push({ type: 'warning', message: 'Backend health check failed - may need more time to start' });
        } else {
          logs.push({ type: 'success', message: 'Backend health check passed' });
        }
      } catch (healthError) {
        logs.push({ type: 'warning', message: `Backend health check error: ${healthError.message}` });
      }
      
      return backendService.url;

    } catch (error) {
      logs.push({ type: 'error', message: `Backend deployment failed: ${error.message}` });
      throw error;
    }
  }

  /**
   * Clean common syntax errors in generated code
   */
  private cleanCodeSyntax(code: string, fileExtension: string): string {
    let cleanedCode = code;
    
    // For JavaScript/TypeScript files, fix common issues
    if (['.js', '.tsx', '.ts', '.jsx'].includes(fileExtension)) {
      // Check if this is a Next.js component that needs "use client"
      const needsUseClient = (
        cleanedCode.includes('useState') ||
        cleanedCode.includes('useEffect') ||
        cleanedCode.includes('useCallback') ||
        cleanedCode.includes('useMemo') ||
        cleanedCode.includes('useRef') ||
        cleanedCode.includes('useContext') ||
        cleanedCode.includes('onClick') ||
        cleanedCode.includes('onChange') ||
        cleanedCode.includes('onSubmit') ||
        cleanedCode.includes('addEventListener') ||
        cleanedCode.includes('fetch(')
      );
      
      // Add "use client" if needed and not already present
      if (needsUseClient && !cleanedCode.includes('"use client"') && !cleanedCode.includes("'use client'")) {
        cleanedCode = '"use client";\n\n' + cleanedCode;
      }
      
      // Remove trailing commas after function declarations
      cleanedCode = cleanedCode.replace(/}\s*,\s*$/gm, '}');
      
      // Remove trailing commas after export default functions
      cleanedCode = cleanedCode.replace(/}\s*,\s*\n\s*export\s+default/g, '}\n\nexport default');
      
      // Fix trailing commas in object literals at end of file
      cleanedCode = cleanedCode.replace(/,(\s*}\s*)$/gm, '$1');
      
      // Remove extra trailing commas in general
      cleanedCode = cleanedCode.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix missing commas in object literals - specifically between properties
      // Match cases like: } \n someProperty: where there should be a comma
      cleanedCode = cleanedCode.replace(/}\s*\n\s*([a-zA-Z_$][a-zA-Z0-9_$]*\s*:)/g, '},\n        $1');
      
      // Fix missing commas between fetch options (headers and body)
      cleanedCode = cleanedCode.replace(/}\s*\n(\s*body\s*:)/g, '},\n$1');
      
      // Fix missing commas after array/object literals before next property
      cleanedCode = cleanedCode.replace(/]\s*\n(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:)/g, '],\n$1');
    }
    
    return cleanedCode;
  }

  /**
   * Deploy frontend code to sandbox
   */
  private async deployFrontend(project: FullStackProject, backendUrl: string, logs: any[]): Promise<string> {
    const frontendDir = '/home/frontend';
    
    try {
      // Create frontend directory
      await this.sandboxService.createDirectory(frontendDir);
      logs.push({ type: 'info', message: 'Created frontend directory' });

      // Determine if this should be a Next.js or React app
      const isNextJs = project.template?.includes('next') || project.code.frontend.framework === 'next';
      
      // If it's Next.js, use the proven createNextAppFast approach first
      if (isNextJs) {
        this.logger.log('Using Next.js fast creation approach...');
        logs.push({ type: 'info', message: 'Creating Next.js app structure...' });
        
        try {
          const createResult = await this.sandboxService.createNextAppFast('frontend', '/home');
          if (createResult.exitCode === 0) {
            logs.push({ type: 'success', message: 'Next.js app structure created successfully' });
            
            // Write ALL AI-generated frontend files, converting .js to .tsx for Next.js compatibility
            for (const [filePath, fileData] of Object.entries(project.code.frontend.files)) {
              let targetPath = filePath;
              
              // Convert .js files to .tsx for Next.js in app directory
              if (filePath.startsWith('/app/') && filePath.endsWith('.js')) {
                targetPath = filePath.replace('.js', '.tsx');
                this.logger.log(`Converting ${filePath} to ${targetPath} for Next.js compatibility`);
              }
              
              const fullPath = `${frontendDir}${targetPath}`;
              
              // Create subdirectories if needed
              const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
              if (dirPath !== frontendDir) {
                await this.sandboxService.createDirectory(dirPath);
              }
              
              // Clean the code syntax before writing
              const fileExtension = targetPath.substring(targetPath.lastIndexOf('.'));
              let cleanedCode = this.cleanCodeSyntax(fileData.code, fileExtension);
              
              await this.sandboxService.writeFile(fullPath, cleanedCode);
              logs.push({ type: 'info', message: `Updated file with AI content: ${targetPath}` });
            }
            
            // Also write any additional dependencies if provided
            for (const [filePath, fileData] of Object.entries(project.code.frontend.dependencies || {})) {
              if (filePath !== 'package.json') { // Don't override the working package.json
                const fullPath = `${frontendDir}/${filePath}`;
                await this.sandboxService.writeFile(fullPath, fileData.code);
                logs.push({ type: 'info', message: `Added dependency file: ${filePath}` });
              }
            }
            
            // Create environment file with backend URL
            const envContent = `NEXT_PUBLIC_BACKEND_URL=${backendUrl}\nNEXT_PUBLIC_API_URL=${backendUrl}`;
            await this.sandboxService.writeFile(`${frontendDir}/.env.local`, envContent);
            logs.push({ type: 'info', message: 'Created environment configuration' });
            
            // Create next.config.js with API rewrites as fallback
            const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '${backendUrl}/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;`;
            
            await this.sandboxService.writeFile(`${frontendDir}/next.config.js`, nextConfig);
            logs.push({ type: 'info', message: 'Created Next.js configuration with API proxy' });
            
            // Start the Next.js service directly
            logs.push({ type: 'info', message: 'Starting Next.js service...' });
            const frontendService = await this.sandboxService.startService(
              'npm run dev -- --port 3000 --hostname 0.0.0.0',
              3000,
              frontendDir
            );
            
            logs.push({ type: 'success', message: `Next.js service started at ${frontendService.url}` });
            return frontendService.url;
          } else {
            this.logger.warn('Next.js fast creation failed, falling back to manual approach');
            logs.push({ type: 'warning', message: 'Next.js fast creation failed, using manual approach' });
          }
        } catch (fastCreateError) {
          this.logger.warn(`Next.js fast creation error: ${fastCreateError.message}`);
          logs.push({ type: 'warning', message: 'Next.js fast creation failed, using manual approach' });
        }
      }

      // Manual approach (fallback or for React apps)
      this.logger.log('Using manual file creation approach...');
      logs.push({ type: 'info', message: 'Creating frontend files manually...' });

      // Write all frontend files
      for (const [filePath, fileData] of Object.entries(project.code.frontend.files)) {
        const fullPath = `${frontendDir}${filePath}`;
        
        // Create subdirectories if needed
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (dirPath !== frontendDir) {
          await this.sandboxService.createDirectory(dirPath);
        }
        
        // Clean the code syntax before writing
        const fileExtension = filePath.substring(filePath.lastIndexOf('.'));
        const cleanedCode = this.cleanCodeSyntax(fileData.code, fileExtension);
        
        await this.sandboxService.writeFile(fullPath, cleanedCode);
        logs.push({ type: 'info', message: `Created file: ${filePath}` });
      }

      // Handle dependencies files with JSON validation
      for (const [filePath, fileData] of Object.entries(project.code.frontend.dependencies)) {
        const fullPath = `${frontendDir}/${filePath}`;
        
        let content = fileData.code;
        
        // Special handling for package.json - validate and fix JSON
        if (filePath === 'package.json') {
          try {
            // Try to parse the JSON to validate it
            const parsed = JSON.parse(content);
            
            // Ensure Next.js apps have correct scripts
            if (isNextJs && parsed.scripts) {
              parsed.scripts.dev = "next dev";
              parsed.scripts.build = "next build";
              parsed.scripts.start = "next start";
              if (!parsed.dependencies?.next) {
                parsed.dependencies = parsed.dependencies || {};
                parsed.dependencies.next = "14.0.4";
              }
            }
            
            // Re-stringify to ensure clean JSON
            content = JSON.stringify(parsed, null, 2);
            logs.push({ type: 'success', message: 'Validated and cleaned package.json' });
          } catch (jsonError) {
            this.logger.warn(`Invalid package.json detected, creating fallback: ${jsonError.message}`);
            logs.push({ type: 'warning', message: 'Generated package.json was invalid, creating fallback' });
            
            // Create a fallback package.json
            const fallbackPackage = this.createFallbackPackageJson(project.code.frontend.framework, project.template);
            content = JSON.stringify(fallbackPackage, null, 2);
          }
        }
        
        // Skip config files that create-next-app already generates properly
        if (filePath === 'postcss.config.js' || filePath === 'tailwind.config.js' || filePath === 'next.config.js') {
          logs.push({ type: 'info', message: `Skipping ${filePath} - already generated by create-next-app` });
          continue;
        }
        
        await this.sandboxService.writeFile(fullPath, content);
        logs.push({ type: 'info', message: `Created dependency file: ${filePath}` });
      }

      // Ensure we have a valid package.json
      const packageJsonPath = `${frontendDir}/package.json`;
      try {
        await this.sandboxService.readFile(packageJsonPath);
      } catch (error) {
        // If package.json doesn't exist, create one
        this.logger.warn('No package.json found, creating fallback');
        logs.push({ type: 'warning', message: 'Creating fallback package.json' });
        
        const fallbackPackage = this.createFallbackPackageJson(project.code.frontend.framework, project.template);
        await this.sandboxService.writeFile(packageJsonPath, JSON.stringify(fallbackPackage, null, 2));
      }

      // Create environment file with backend URL
      const envContent = `NEXT_PUBLIC_BACKEND_URL=${backendUrl}\nNEXT_PUBLIC_API_URL=${backendUrl}`;
      await this.sandboxService.writeFile(`${frontendDir}/.env.local`, envContent);
      logs.push({ type: 'info', message: 'Created environment configuration' });

      // Install Node.js dependencies with better error handling
      logs.push({ type: 'info', message: 'Installing Node.js dependencies...' });
      
      try {
        const npmInstall = await this.sandboxService.runCommand(
          'npm install --verbose',
          frontendDir,
          300000 // 5 minutes
        );

        if (npmInstall.exitCode !== 0) {
          this.logger.error(`NPM install failed. Stderr: ${npmInstall.stderr}`);
          logs.push({ type: 'error', message: `NPM install failed: ${npmInstall.stderr}` });
          
          // Try alternative installation approach
          logs.push({ type: 'info', message: 'Trying alternative installation approach...' });
          
          const npmInstallAlt = await this.sandboxService.runCommand(
            'npm install --legacy-peer-deps --verbose',
            frontendDir,
            300000
          );
          
          if (npmInstallAlt.exitCode !== 0) {
            throw new Error(`Failed to install Node.js dependencies: ${npmInstallAlt.stderr}`);
          }
        }
        
        logs.push({ type: 'success', message: 'Node.js dependencies installed successfully' });
      } catch (installError) {
        this.logger.error(`Installation error: ${installError.message}`);
        logs.push({ type: 'error', message: `Installation failed: ${installError.message}` });
        throw installError;
      }

      // Start frontend service
      logs.push({ type: 'info', message: 'Starting frontend service...' });
      
      // Use the correct start command based on framework
      const startCommand = isNextJs
        ? 'npm run dev -- --port 3000 --hostname 0.0.0.0'
        : 'npm start -- --port 3000 --host 0.0.0.0';
        
      this.logger.log(`Using ${isNextJs ? 'Next.js' : 'React'} start command: ${startCommand}`);
        
      const frontendService = await this.sandboxService.startService(
        startCommand,
        3000,
        frontendDir
      );

      logs.push({ type: 'success', message: `Frontend service started at ${frontendService.url}` });
      
      return frontendService.url;

    } catch (error) {
      logs.push({ type: 'error', message: `Frontend deployment failed: ${error.message}` });
      throw error;
    }
  }

  /**
   * Create fallback package.json for frontend
   */
  private createFallbackPackageJson(framework: string, template?: string) {
    const basePackage = {
      name: "generated-frontend",
      version: "0.1.0",
      private: true,
      scripts: {},
      dependencies: {},
      devDependencies: {}
    };

    // Use Next.js if template includes 'next' or framework is 'next'
    const isNextJs = template?.includes('next') || framework === 'next';
    
    if (isNextJs) {
      basePackage.scripts = {
        dev: "next dev",
        build: "next build", 
        start: "next start",
        lint: "next lint"
      };
      basePackage.dependencies = {
        "next": "14.0.4",
        "react": "^18.0.0",
        "react-dom": "^18.0.0"
      };
      basePackage.devDependencies = {
        "@types/node": "^20.0.0",
        "@types/react": "^18.0.0",
        "@types/react-dom": "^18.0.0",
        "typescript": "^5.0.0",
        "tailwindcss": "^3.3.0",
        "autoprefixer": "^10.4.16",
        "postcss": "^8.4.31"
      };
    } else {
      // React
      basePackage.scripts = {
        start: "react-scripts start",
        build: "react-scripts build",
        test: "react-scripts test",
        eject: "react-scripts eject"
      };
      basePackage.dependencies = {
        "react": "^18.0.0",
        "react-dom": "^18.0.0",
        "react-scripts": "5.0.1"
      };
    }

    return basePackage;
  }

  /**
   * Debug AI response for troubleshooting
   */
  async debugAIResponse(prompt: string, modelIdentifier: string, template?: string): Promise<any> {
    try {
      this.logger.log(`Debug generation: ${prompt.substring(0, 50)}...`);
      
      const result = await generateFullStackCode({
        prompt,
        modelIdentifier,
        template
      });

      // Return raw response with analysis
      const rawText = result.text;
      const cleanedText = rawText.replace(/```json\n?|\n?```/g, '').trim();
      
      // Find JSON boundaries
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}') + 1;
      
      let extractedJson = '';
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        extractedJson = cleanedText.substring(jsonStart, jsonEnd);
      }

      return {
        rawResponse: rawText,
        cleanedResponse: cleanedText,
        extractedJson: extractedJson,
        jsonStartIndex: jsonStart,
        jsonEndIndex: jsonEnd,
        responseLength: rawText.length,
        usage: result.usage || null
      };
    } catch (error) {
      this.logger.error('Debug generation failed', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  getHealth(): any {
    return {
      status: 'healthy',
      service: 'gen-ai-code-generation',
      timestamp: new Date().toISOString(),
      supportedTemplates: this.getSupportedTemplates()
    };
  }
}
