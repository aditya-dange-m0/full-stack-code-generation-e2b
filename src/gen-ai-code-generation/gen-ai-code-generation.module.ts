import { Module } from '@nestjs/common';
import { GenAiCodeGenerationController } from './gen-ai-code-generation.controller';
import { GenAiCodeGenerationService } from './gen-ai-code-generation.service';
import { SandboxModule } from '../sandbox/sandbox.module';

@Module({
  imports: [SandboxModule],
  controllers: [GenAiCodeGenerationController],
  providers: [GenAiCodeGenerationService],
  exports: [GenAiCodeGenerationService],
})
export class GenAiCodeGenerationModule {}
