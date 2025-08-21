import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SandboxModule } from './sandbox/sandbox.module';
// import { CodeGenerationModule } from './code-generation/code-generation.module';
import { GenAiCodeGenerationModule } from './gen-ai-code-generation/gen-ai-code-generation.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SandboxModule,
    // CodeGenerationModule,
    GenAiCodeGenerationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
