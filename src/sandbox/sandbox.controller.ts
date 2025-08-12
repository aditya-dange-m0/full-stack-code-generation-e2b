import { Controller, Get } from '@nestjs/common';
import { SandboxService } from './sandbox.service';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Get('test')
  async runSimpleTest() {
    return await this.sandboxService.runSimpleTest();
  }

  @Get('full-stack-test')
  async runFullStackTest() {
    try {
      const result = await this.sandboxService.runFullStackTest();
      // In a real user-facing app, you would keep the sandbox alive.
      // For this test, we can close it after completion or leave it for inspection.
      // await this.sandboxService.close(); 
      return result;
    } catch (error) {
      console.error('Full stack test failed:', error);
      // Ensure we clean up the sandbox if the test fails catastrophically
      await this.sandboxService.close();
      return { error: 'Test failed', details: error.message };
    }
  }

  @Get('full-stack-test-optimized')
  async runFullStackTestOptimized() {
    try {
      const result = await this.sandboxService.runFullStackTestOptimized();
      return result;
    } catch (error) {
      console.error('Optimized full stack test failed:', error);
      await this.sandboxService.close();
      return { error: 'Optimized test failed', details: error.message };
    }
  }

  @Get('create-nextjs-fast')
  async createNextJsFast() {
    try {
      const result = await this.sandboxService.createNextAppFast();
      return result;
    } catch (error) {
      console.error('Fast Next.js creation failed:', error);
      return { error: 'Fast creation failed', details: error.message };
    }
  }

  @Get('test-backend-only')
  async testBackendOnly() {
    try {
      const result = await this.sandboxService.testBackendOnly();
      return result;
    } catch (error) {
      console.error('Backend test failed:', error);
      return { error: 'Backend test failed', details: error.message };
    }
  }

  @Get('create-nextjs-original')
  async createNextJsOriginal() {
    try {
      const result = await this.sandboxService.createNextAppOriginal();
      return result;
    } catch (error) {
      console.error('Original Next.js creation failed:', error);
      return { error: 'Original creation failed', details: error.message };
    }
  }
}
