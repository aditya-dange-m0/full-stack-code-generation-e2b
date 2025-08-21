import { Controller, Post, Body, Get, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { GenAiCodeGenerationService } from './gen-ai-code-generation.service';
import { CodeGenerationRequest, FullStackProject } from './interfaces/project.interface';

@ApiTags('AI Code Generation')
@Controller('gen-ai-code')
export class GenAiCodeGenerationController {
  constructor(private readonly genAiCodeService: GenAiCodeGenerationService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check for AI code generation module' })
  @ApiResponse({ status: 200, description: 'Module is healthy' })
  getHealth() {
    return this.genAiCodeService.getHealth();
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get supported project templates' })
  @ApiResponse({ status: 200, description: 'List of supported templates' })
  getSupportedTemplates() {
    return {
      templates: this.genAiCodeService.getSupportedTemplates(),
      description: 'Available project templates for full-stack generation'
    };
  }

  @Post('generate-fullstack')
  @ApiOperation({ summary: 'Generate full-stack application with frontend, backend, and database' })
  @ApiResponse({ status: 200, description: 'Full-stack application generated successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the application to generate' },
        modelIdentifier: { type: 'string', description: 'AI model to use (e.g., "google:gemini-2.0-flash")' },
        template: { 
          type: 'string', 
          enum: ['next+fastapi+mongodb', 'react+fastapi+mongodb'],
          description: 'Project template to use'
        }
      },
      required: ['prompt', 'modelIdentifier']
    }
  })
  async generateFullStackApp(@Body() request: CodeGenerationRequest) {
    const result = await this.genAiCodeService.generateFullStackApplication(request);
    
    if (!result.success) {
      throw new HttpException(
        {
          message: result.error,
          rawResponse: result.rawResponse
        },
        HttpStatus.BAD_REQUEST
      );
    }
    
    return {
      success: true,
      project: result.data,
      generatedAt: new Date().toISOString()
    };
  }

  @Post('generate-frontend')
  @ApiOperation({ summary: 'Generate frontend-only code (legacy support)' })
  @ApiResponse({ status: 200, description: 'Frontend code generated successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the frontend to generate' },
        modelIdentifier: { type: 'string', description: 'AI model to use' }
      },
      required: ['prompt', 'modelIdentifier']
    }
  })
  async generateFrontendCode(
    @Body() body: { prompt: string; modelIdentifier: string }
  ) {
    try {
      const result = await this.genAiCodeService.generateFrontendCode(
        body.prompt, 
        body.modelIdentifier
      );
      
      return {
        success: true,
        result,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Failed to generate frontend code',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('generate-and-deploy')
  @ApiOperation({ summary: 'Generate full-stack code and deploy to E2B sandbox for live preview' })
  @ApiResponse({ status: 200, description: 'Full-stack application generated and deployed successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the application to generate' },
        modelIdentifier: { type: 'string', description: 'AI model to use (e.g., "google:gemini-1.5-flash-latest")' },
        template: { 
          type: 'string', 
          enum: ['next+fastapi+mongodb', 'react+fastapi+mongodb'],
          description: 'Project template to use'
        }
      },
      required: ['prompt', 'modelIdentifier']
    }
  })
  async generateAndDeployFullStack(@Body() request: CodeGenerationRequest) {
    try {
      const result = await this.genAiCodeService.generateAndDeployFullStack(request);
      
      if (!result.success) {
        throw new HttpException(
          {
            message: result.error,
            stage: result.project ? 'deployment' : 'generation'
          },
          HttpStatus.BAD_REQUEST
        );
      }
      
      return {
        success: true,
        message: 'Full-stack application generated and deployed successfully!',
        project: result.project ? {
          name: result.project.projectName,
          description: result.project.projectDescription,
          template: result.project.template
        } : null,
        deployment: result.deployment,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Failed to generate and deploy application',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('deploy-existing')
  @ApiOperation({ summary: 'Deploy existing project structure to E2B sandbox' })
  @ApiResponse({ status: 200, description: 'Project deployed successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        project: { 
          type: 'object',
          description: 'Full project structure with frontend, backend, and configuration'
        }
      },
      required: ['project']
    }
  })
  async deployExistingProject(@Body() body: { project: FullStackProject }) {
    try {
      const result = await this.genAiCodeService.deployGeneratedCodeToSandbox(body.project);
      
      return {
        success: true,
        message: 'Project deployed successfully',
        deployment: result,
        deployedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Failed to deploy project',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('examples')
  @ApiOperation({ summary: 'Get example prompts for code generation' })
  @ApiResponse({ status: 200, description: 'List of example prompts' })
  getExamplePrompts() {
    return {
      success: true,
      examples: [
        {
          name: "Todo App",
          prompt: "Create a simple todo app with add, delete, and mark complete functionality",
          template: "react+fastapi+mongodb",
          description: "A basic todo application with CRUD operations"
        },
        {
          name: "Blog Platform",
          prompt: "Create a blog platform where users can create, edit, and delete posts with comments",
          template: "next+fastapi+mongodb",
          description: "A full-featured blog with posts and comments system"
        },
        {
          name: "E-commerce Store", 
          prompt: "Create an e-commerce store with products, shopping cart, and user authentication",
          template: "next+fastapi+mongodb",
          description: "An online store with product catalog and shopping features"
        },
        {
          name: "Task Manager",
          prompt: "Create a task management app with projects, tasks, and team collaboration",
          template: "react+fastapi+mongodb", 
          description: "A project management tool for teams"
        },
        {
          name: "Recipe App",
          prompt: "Create a recipe sharing app where users can add, search, and rate recipes",
          template: "react+fastapi+mongodb",
          description: "A social recipe sharing platform"
        }
      ],
      usage: {
        endpoint: "/gen-ai-code/generate-and-deploy",
        method: "POST",
        requiredFields: ["prompt", "modelIdentifier"],
        optionalFields: ["template"]
      }
    };
  }

  @Post('validate-generated-code')
  @ApiOperation({ summary: 'Validate generated code structure for debugging' })
  @ApiResponse({ status: 200, description: 'Code validation results' })
  async validateGeneratedCode(@Body() body: { project: FullStackProject }) {
    try {
      const validation = {
        projectValid: !!body.project?.projectName,
        frontendValid: !!body.project?.code?.frontend,
        backendValid: !!body.project?.code?.backend,
        packageJsonValid: false,
        requirementsValid: false,
        issues: [] as string[]
      };

      // Validate package.json
      if (body.project?.code?.frontend?.dependencies?.['package.json']) {
        try {
          const packageContent = body.project.code.frontend.dependencies['package.json'].code;
          JSON.parse(packageContent);
          validation.packageJsonValid = true;
        } catch (error) {
          validation.issues.push(`Invalid package.json: ${error.message}`);
          validation.packageJsonValid = false;
        }
      }

      // Validate requirements.txt
      if (body.project?.code?.backend?.dependencies?.['requirements.txt']) {
        const reqContent = body.project.code.backend.dependencies['requirements.txt'].code;
        validation.requirementsValid = reqContent.length > 0;
        if (!validation.requirementsValid) {
          validation.issues.push('Empty requirements.txt');
        }
      }

      return {
        success: true,
        validation,
        suggestions: validation.issues.length > 0 ? [
          'Consider using the fallback package.json generation',
          'Ensure proper JSON escaping in AI responses',
          'Test with simpler prompts first'
        ] : ['Code structure looks valid!']
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post('debug-generation')
  @ApiOperation({ summary: 'Debug AI response for troubleshooting' })
  @ApiResponse({ status: 200, description: 'Raw AI response for debugging' })
  async debugGeneration(
    @Body() body: { prompt: string; modelIdentifier: string; template?: string }
  ) {
    try {
      const result = await this.genAiCodeService.debugAIResponse(
        body.prompt,
        body.modelIdentifier,
        body.template
      );
      
      return {
        success: true,
        debug: result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI for general queries' })
  @ApiResponse({ status: 200, description: 'AI response received' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Question or message for the AI' },
        modelIdentifier: { type: 'string', description: 'AI model to use' }
      },
      required: ['prompt', 'modelIdentifier']
    }
  })
  async chatWithAI(
    @Body() body: { prompt: string; modelIdentifier: string }
  ) {
    try {
      const result = await this.genAiCodeService.chatWithAI(
        body.prompt, 
        body.modelIdentifier
      );
      
      return {
        success: true,
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Chat session failed',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
